/**
 * Story.ts
 * TypeScript types for story scenes, complete stories, and image prompts.
 *
 * Imported by: /src/app/api/story/route.ts, /src/app/api/image/route.ts,
 *              /src/lib/safety/checkStoryOutput.ts
 */

import type { Subject, StoryTone } from "./Child";

// ── Scene ─────────────────────────────────────────────────────────────────────

/**
 * A single scene within a story. The Story Agent generates 4–6 of these
 * per session. Each scene is narrated, illustrated, and displayed one at a time.
 */
export interface StoryScene {
  /** Zero-based position in the story (0 = first scene). */
  index: number;
  /** Short scene title displayed in Sacramento decorative font. */
  title: string;
  /**
   * 2–4 sentences of first-grade-appropriate narration text.
   * This is also passed to Azure TTS for audio generation.
   */
  narration: string;
  /**
   * Prompt sent to FLUX 1.1 pro for image generation.
   * Must incorporate the child's favorite color and story setting.
   * Must be child-appropriate and illustrated in style.
   */
  imagePrompt: string;
  /** URL of the generated FLUX image. Populated after image generation. */
  imageUrl: string | null;
}

// ── Story ─────────────────────────────────────────────────────────────────────

/**
 * A complete story object returned by the Story Agent.
 * Contains 4–6 scenes and metadata used for quiz generation and memory updates.
 */
export interface Story {
  /** Unique identifier for this story, generated server-side. */
  id: string;
  /** Story title shown at the start of the reader. */
  title: string;
  subject: Subject;
  tone: StoryTone;
  /** The 4–6 scenes that make up this story. */
  scenes: StoryScene[];
  /**
   * Summary of the educational content covered, used by the Quiz Agent
   * to generate relevant questions.
   */
  educationalSummary: string;
  /**
   * The curriculum topic IDs (Azure AI Search doc IDs) used to generate
   * this story. Stored in the session record for audit purposes.
   */
  curriculumChunkIds: string[];
  createdAt: string; // ISO 8601
}

// ── Raw Story Agent Output ────────────────────────────────────────────────────

/**
 * The raw JSON structure returned by GPT-4o mini before safety checking.
 * The Story Agent is prompted to return this exact shape.
 */
export interface RawStoryAgentOutput {
  title: string;
  educationalSummary: string;
  scenes: Array<{
    index: number;
    title: string;
    narration: string;
    imagePrompt: string;
  }>;
}

// ── Story Safety Result ───────────────────────────────────────────────────────

/**
 * Return value from checkStoryOutput.ts.
 * If passed is false, rewritten contains the safe replacement text.
 */
export interface StorySafetyResult {
  passed: boolean;
  /** The validated (or rewritten) story. Undefined only if catastrophic failure. */
  story: Story | undefined;
  /** True if the story required rewriting before being returned. */
  wasRewritten: boolean;
}

// ── Image Generation ──────────────────────────────────────────────────────────

/**
 * Input to the FLUX image generation helper.
 */
export interface ImageGenerationRequest {
  /** The scene image prompt from StoryScene.imagePrompt. */
  prompt: string;
  /** Child's name — for logging context only, never included in the prompt. */
  childName: string;
}

/**
 * Result from the FLUX image generation helper.
 */
export interface ImageGenerationResult {
  /** Public URL of the generated image. */
  url: string;
}
