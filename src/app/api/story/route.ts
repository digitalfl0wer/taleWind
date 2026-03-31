import { randomUUID } from "crypto";
import { callGptJson } from "@/lib/azure/openai";
import {
  retrieveChildProfileDoc,
  retrieveCurriculumChunks,
} from "@/lib/azure/search";
import { checkStoryOutput } from "@/lib/safety/checkStoryOutput";
import type { StoryRequest, StoryResponse } from "@/types/Api";
import type { ChildSearchDoc, Subject, StoryTone } from "@/types/Child";
import type {
  CurriculumSearchDoc,
} from "@/types/Curriculum";
import type { RawStoryAgentOutput, Story } from "@/types/Story";

const STORY_SYSTEM_PROMPT = `You are the Story Agent for Talewind, a first-grade-safe adaptive learning app for children ages 5 to 7.

Your job: generate one personalized, narrated, scene-based story.

Hard rules:
- Output ONLY valid JSON. No prose, no markdown fences.
- Generate exactly 4 to 6 scenes (no fewer, no more).
- Each scene must have 2 to 4 sentences.
- First-grade vocabulary only.
- Every factual statement must come from the provided curriculum chunks.
- Only subjects allowed: Animals, Space, or Math.
- Apply the child's tone preference exactly.
- Personalization priority order:
  1) Latest personal detail (highest priority)
  2) Favorite animal (must appear as a character or story element)
  3) Favorite color (must appear in scene descriptions and image prompts)
  4) Derived memory (themes that worked in prior sessions)
  5) Child's name used naturally

Image prompt rules (for each scene):
- Start with: "Soft illustrated children's book style."
- Include character appearance, setting, mood, and color palette.
- Include the child's favorite color and favorite animal visibly.
- Keep character descriptions consistent across scenes.
- Never include scary elements, violence, or realistic humans.

Output schema:
{
  "title": string,
  "educationalSummary": string,
  "scenes": [
    {
      "index": number, // 0-based
      "title": string,
      "narration": string,
      "imagePrompt": string
    }
  ]
}`;

/**
 * Sanitizes raw input before use in prompts or storage.
 *
 * @param raw - Raw input string.
 * @param maxLen - Maximum allowed length.
 * @returns Sanitized string.
 */
function sanitizeInput(raw: string | undefined, maxLen: number): string {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, maxLen).replace(/[^\x20-\x7E]/g, "");
}

/**
 * Validates the subject value.
 *
 * @param value - Input value.
 * @returns True if the value is a valid Subject.
 */
function isValidSubject(value: unknown): value is Subject {
  return value === "animals" || value === "space" || value === "math";
}

/**
 * Validates the story tone value.
 *
 * @param value - Input value.
 * @returns True if the value is a valid StoryTone.
 */
function isValidStoryTone(value: unknown): value is StoryTone {
  return value === "calm" || value === "exciting" || value === "silly";
}

/**
 * Validates and normalizes the session number.
 *
 * @param value - Input value.
 * @returns Positive integer session number, or null if invalid.
 */
function normalizeSessionNumber(value: unknown): number | null {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return null;
  const int = Math.floor(num);
  return int >= 1 ? int : null;
}

/**
 * Builds a curriculum context string for the story prompt.
 *
 * @param chunks - Curriculum chunks retrieved from Azure Search.
 * @returns Formatted curriculum context string.
 */
function buildCurriculumContext(chunks: CurriculumSearchDoc[]): string {
  return chunks
    .map((chunk) =>
      [
        `ID: ${chunk.id}`,
        `Topic: ${chunk.topic}`,
        `Content: ${chunk.content}`,
      ].join("\n")
    )
    .join("\n\n");
}

/**
 * Determines the story difficulty from the child profile.
 *
 * @param child - Child search document.
 * @returns Difficulty label: "easy" | "medium" | "hard".
 */
function determineDifficulty(child: ChildSearchDoc): "easy" | "medium" | "hard" {
  const base =
    child.readingComfort === "beginner"
      ? "easy"
      : child.readingComfort === "confident"
        ? "hard"
        : "medium";

  if (child.currentAdaptation === "simplify") return "easy";
  if (child.currentAdaptation === "enrich") return "hard";
  return base;
}

/**
 * Validates the raw story agent output shape.
 *
 * @param output - Raw GPT output.
 * @returns True if the output is structurally valid.
 */
function isValidRawStoryOutput(
  output: RawStoryAgentOutput | null
): output is RawStoryAgentOutput {
  if (!output) return false;
  if (typeof output.title !== "string") return false;
  if (typeof output.educationalSummary !== "string") return false;
  if (!Array.isArray(output.scenes)) return false;
  if (output.scenes.length < 4 || output.scenes.length > 6) return false;
  return output.scenes.every((scene) => {
    return (
      typeof scene.index === "number" &&
      typeof scene.title === "string" &&
      typeof scene.narration === "string" &&
      typeof scene.imagePrompt === "string"
    );
  });
}

/**
 * Ensures required child profile fields are present.
 *
 * @param child - Child search document.
 * @returns Null if ok, otherwise a string error message.
 */
function validateChildProfile(child: ChildSearchDoc): string | null {
  if (!child.name) return "Missing child name";
  if (!child.favoriteColor) return "Missing favorite color";
  if (!child.favoriteAnimal) return "Missing favorite animal";
  if (!child.latestPersonalDetail) return "Missing latest personal detail";
  if (!isValidStoryTone(child.storyTone)) return "Missing story tone";
  return null;
}

/**
 * Builds the user message for the Story Agent prompt.
 *
 * @param child - Child search document.
 * @param subject - Selected subject.
 * @param sessionNumber - Session number.
 * @param chunks - Curriculum chunks.
 * @returns User message string.
 */
function buildStoryUserMessage(
  child: ChildSearchDoc,
  subject: Subject,
  sessionNumber: number,
  chunks: CurriculumSearchDoc[]
): string {
  const difficulty = determineDifficulty(child);
  const curriculumContext = buildCurriculumContext(chunks);

  return [
    `Subject: ${subject}`,
    `Session: ${sessionNumber}`,
    `Tone: ${child.storyTone}`,
    `Difficulty: ${difficulty}`,
    `Child name: ${child.name}`,
    `Favorite color: ${child.favoriteColor}`,
    `Favorite animal: ${child.favoriteAnimal}`,
    `Latest personal detail (highest priority): ${child.latestPersonalDetail}`,
    `Derived memory: ${child.derivedMemoryText || "None"}`,
    `Recent sessions summary: ${child.recentSessionsSummary || "None"}`,
    "",
    "Curriculum chunks (use ONLY these facts):",
    curriculumContext,
  ].join("\n");
}

/**
 * POST /api/story
 * Retrieves child profile and curriculum chunks, generates a story, runs safety checks,
 * and returns the story object.
 */
export async function POST(request: Request): Promise<Response> {
  let payload: StoryRequest;
  try {
    payload = (await request.json()) as StoryRequest;
  } catch {
    return Response.json(
      { story: null, safety: null, error: "Invalid JSON body." } as StoryResponse,
      { status: 400 }
    );
  }

  const childId = sanitizeInput(payload.childId, 64);
  const subject = isValidSubject(payload.subject) ? payload.subject : null;
  const sessionNumber = normalizeSessionNumber(payload.sessionNumber);

  if (!childId || !subject || !sessionNumber) {
    return Response.json(
      { story: null, safety: null, error: "Missing or invalid fields." } as StoryResponse,
      { status: 400 }
    );
  }

  const searchText = sanitizeInput(payload.searchText, 160);

  let childProfile: ChildSearchDoc | null = null;
  try {
    childProfile = await retrieveChildProfileDoc(childId);
  } catch (err) {
    console.error(
      "[api/story] Failed to retrieve child profile. sessionId omitted.",
      err instanceof Error ? err.message : "Unknown error"
    );
    return Response.json(
      { story: null, safety: null, error: "Failed to retrieve child profile." } as StoryResponse,
      { status: 500 }
    );
  }

  if (!childProfile) {
    return Response.json(
      { story: null, safety: null, error: "Child profile not found." } as StoryResponse,
      { status: 404 }
    );
  }

  const profileError = validateChildProfile(childProfile);
  if (profileError) {
    return Response.json(
      { story: null, safety: null, error: profileError } as StoryResponse,
      { status: 400 }
    );
  }

  let curriculumChunks: CurriculumSearchDoc[] = [];
  try {
    const interests = Array.isArray(childProfile.interests)
      ? childProfile.interests.join(" ")
      : "";
    const combinedSearch = [searchText, interests, childProfile.latestPersonalDetail]
      .map((value) => sanitizeInput(value, 120))
      .filter(Boolean)
      .join(" ");
    curriculumChunks = await retrieveCurriculumChunks(
      subject,
      combinedSearch || "*",
      4
    );
  } catch (err) {
    console.error(
      "[api/story] Failed to retrieve curriculum chunks. sessionId omitted.",
      err instanceof Error ? err.message : "Unknown error"
    );
    return Response.json(
      { story: null, safety: null, error: "Failed to retrieve curriculum." } as StoryResponse,
      { status: 500 }
    );
  }

  if (curriculumChunks.length < 3) {
    return Response.json(
      { story: null, safety: null, error: "Insufficient curriculum chunks." } as StoryResponse,
      { status: 500 }
    );
  }

  const userMessage = buildStoryUserMessage(
    childProfile,
    subject,
    sessionNumber,
    curriculumChunks
  );

  let rawStory: RawStoryAgentOutput | null = null;
  try {
    rawStory = await callGptJson<RawStoryAgentOutput>({
      systemPrompt: STORY_SYSTEM_PROMPT,
      userMessage,
      maxTokens: 1800,
      temperature: 0.7,
      timeoutMs: 30_000,
    });
  } catch (err) {
    console.error(
      "[api/story] Story generation call failed. sessionId omitted.",
      err instanceof Error ? err.message : "Unknown error"
    );
    return Response.json(
      { story: null, safety: null, error: "Story generation failed." } as StoryResponse,
      { status: 502 }
    );
  }

  if (!isValidRawStoryOutput(rawStory)) {
    console.error(
      "[api/story] Invalid story output returned from GPT. sessionId omitted."
    );
    return Response.json(
      { story: null, safety: null, error: "Story generation failed." } as StoryResponse,
      { status: 502 }
    );
  }

  const storyId = randomUUID();
  const createdAt = new Date().toISOString();
  const tone = childProfile.storyTone as StoryTone;

  const story: Story = {
    id: storyId,
    title: rawStory.title,
    subject,
    tone,
    scenes: rawStory.scenes.map((scene, index) => ({
      index,
      title: scene.title,
      narration: scene.narration,
      imagePrompt: scene.imagePrompt,
      imageUrl: null,
    })),
    educationalSummary: rawStory.educationalSummary,
    curriculumChunkIds: curriculumChunks.map((chunk) => chunk.id),
    createdAt,
  };

  let safetyResult: Awaited<ReturnType<typeof checkStoryOutput>>;
  try {
    safetyResult = await checkStoryOutput(story, childId, storyId);
  } catch (err) {
    console.error(
      "[api/story] Safety check failed. sessionId:",
      storyId,
      err instanceof Error ? err.message : "Unknown error"
    );
    return Response.json(
      { story: null, safety: null, error: "Safety check failed." } as StoryResponse,
      { status: 500 }
    );
  }

  if (!safetyResult.story) {
    return Response.json(
      { story: null, safety: null, error: "Safety check returned no story." } as StoryResponse,
      { status: 500 }
    );
  }

  return Response.json({
    story: safetyResult.story,
    safety: { passed: safetyResult.passed, wasRewritten: safetyResult.wasRewritten },
  } as StoryResponse);
}
