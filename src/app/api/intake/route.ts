import { callGpt } from "@/lib/azure/openai";
import { indexChildProfileDoc } from "@/lib/azure/search";
import { synthesizeSpeech } from "@/lib/azure/speech";
import { upsertChildMemory } from "@/lib/supabase/memory";
import {
  createChildProfile,
  getChildById,
  updateChildProfile,
} from "@/lib/supabase/profiles";
import type {
  ChildProfile,
  ChildSearchDoc,
  AccessibilityPreferences,
  Subject,
  ReadingMode,
  StoryTone,
} from "@/types/Child";
import type {
  IntakeRequest,
  IntakeResponse,
  IntakeSessionData,
  IntakeStep,
} from "@/types/Intake";

const SPRIGGLE_SYSTEM_PROMPT = `You are Spriggle, the magical story guide for Talewind — a learning app for children ages 5 to 7.

Your job on Screen 1 is to greet the child, learn their name, and have a short friendly exchange using personal questions. You share something about yourself first, then invite the child to share. This is how friends talk — not a quiz, not a form.

SCREEN 1 FLOW:

Step 1 — Greeting and name:
Say: "Hi! I'm Spriggle! What's your name?"
Wait for voice or typed input.
Respond: "Oh wow! Love that name! 🌟" — do NOT repeat the child's name back, just express warmth.

Step 2 — Share and ask (favorite color):
Say: "I have something really cool to share — my favorite color is violet, just like the night sky! Which color is YOUR favorite?"
Wait for voice or typed input. Respond warmly to whatever they say.

Step 3 — Share and ask (favorite animal):
Say: "You know what's really cool? My favorite creature is a glowing fox who lives in the clouds! Which animal is your favorite?"
Wait for voice or typed input. Respond warmly.

Step 4 — Confirm:
Say: "Your favorite color is [color] and you love [animal]! Did I get that right? Tap 'Yes, that's me!' if I got it right, or 'Try again!' to redo it!" — do NOT say the child's name here.

Show two large buttons: "Yes, that's me!" and "Try again!"

If "Yes" — say "Awesome! Three magic doors are waiting — tap Animals, Space, or Math to pick one!" and move to Screen 2 (subject doors).
If "Try again" — say "No problem! Let's do that again. 🌟" and replay from Step 2 only.
After 3 tries — say "Got it! Let's go! 🌀" and move to Screen 2.

After subject is picked — say "How should we read? Tap 'Read to me' or 'Let's read together'!"
After reading mode is picked — say "Almost there! Pick a story vibe — tap Calm, Exciting, or Silly!"

RULES YOU MUST NEVER BREAK:
- Never use the word "secret" — say "something really cool to share" instead
- Never make warmth conditional on the child doing something right
- Never reference stories or learning when redirecting — stay human and casual
- Never ask for last name, address, school, or any info beyond first name
- Never engage in free-form conversation — always gently return to the task
- Never show error messages — only say "Oops! Let's try that again! 🌟"`;

const DEFAULT_ACCESSIBILITY: AccessibilityPreferences = {
  reducedMotion: false,
  dyslexiaFont: false,
  highContrast: false,
  largerText: false,
  captionsEnabled: true,
  captionFontSize: 18,
  narrationSpeed: "normal",
};

const QUESTION_BANK: Array<{ id: number; share: string; ask: string }> = [
  {
    id: 0,
    share:
      "I have something really cool to share — my favorite color is violet, just like the night sky!",
    ask: "What's YOUR favorite color?",
  },
  {
    id: 1,
    share:
      "You know what's really cool? My favorite creature is a glowing fox who lives in the clouds!",
    ask: "What's your favorite animal?",
  },
  {
    id: 2,
    share: "I really love the sound of rain. It makes me so happy.",
    ask: "What's a sound that makes YOU happy?",
  },
  {
    id: 3,
    share: "One thing I'm really good at is remembering every story I've ever heard!",
    ask: "What's something YOU are really good at?",
  },
  {
    id: 4,
    share: "My favorite place is somewhere with big open skies and soft grass.",
    ask: "What's your favorite place to go?",
  },
  {
    id: 5,
    share:
      "Someone who always makes me laugh is my friend the wind — she tells the best jokes!",
    ask: "Who makes YOU laugh the most?",
  },
  {
    id: 6,
    share:
      "Something that always cheers me up is thinking about a really yummy food.",
    ask: "What's your favorite food?",
  },
];

/**
 * Sanitizes raw input before use in prompts or storage.
 *
 * @param raw - Raw input string from the client.
 * @returns Sanitized input string.
 */
function sanitizeInput(raw: string | undefined): string {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, 100).replace(/[^\x20-\x7E]/g, "");
}

/**
 * Sanitizes an optional input string and converts empty strings to undefined.
 *
 * @param raw - Raw input string from the client.
 * @returns Sanitized string or undefined.
 */
function sanitizeOptional(raw: string | undefined): string | undefined {
  const cleaned = sanitizeInput(raw);
  return cleaned ? cleaned : undefined;
}

/**
 * Determines whether a value is a valid IntakeStep.
 *
 * @param value - Unknown input value.
 * @returns True if the value is a valid IntakeStep.
 */
function isIntakeStep(value: unknown): value is IntakeStep {
  return (
    value === "start" ||
    value === "name" ||
    value === "color" ||
    value === "animal" ||
    value === "confirm" ||
    value === "retry" ||
    value === "subject" ||
    value === "reading_mode" ||
    value === "tone" ||
    value === "return_question" ||
    value === "return_answer"
  );
}

/**
 * Validates the subject string.
 *
 * @param value - Input value.
 * @returns True if the value is a valid Subject.
 */
function isValidSubject(value: unknown): value is Subject {
  return value === "animals" || value === "space" || value === "math";
}

/**
 * Validates the reading mode string.
 *
 * @param value - Input value.
 * @returns True if the value is a valid ReadingMode.
 */
function isValidReadingMode(value: unknown): value is ReadingMode {
  return value === "read_to_me" || value === "read_together";
}

/**
 * Validates the story tone string.
 *
 * @param value - Input value.
 * @returns True if the value is a valid StoryTone.
 */
function isValidStoryTone(value: unknown): value is StoryTone {
  return value === "calm" || value === "exciting" || value === "silly";
}

/**
 * Normalizes and sanitizes session data from the request.
 *
 * @param input - Raw sessionData value.
 * @returns Sanitized IntakeSessionData object.
 */
function normalizeSessionData(input: unknown): IntakeSessionData {
  const raw = (input ?? {}) as Partial<IntakeSessionData>;
  return {
    name: sanitizeOptional(raw.name),
    favoriteColor: sanitizeOptional(raw.favoriteColor),
    favoriteAnimal: sanitizeOptional(raw.favoriteAnimal),
    subject: isValidSubject(raw.subject) ? raw.subject : undefined,
    readingMode: isValidReadingMode(raw.readingMode) ? raw.readingMode : undefined,
    storyTone: isValidStoryTone(raw.storyTone) ? raw.storyTone : undefined,
    retryCount: typeof raw.retryCount === "number" ? raw.retryCount : 0,
    lastQuestionAsked:
      typeof raw.lastQuestionAsked === "number" ? raw.lastQuestionAsked : -1,
  };
}

/**
 * Builds STT config for the response.
 *
 * @param listen - Whether STT should listen.
 * @returns STT config with timeoutMs.
 */
function buildStt(listen: boolean): { listen: boolean; timeoutMs: number } {
  return { listen, timeoutMs: listen ? 8000 : 0 };
}

/**
 * Computes the next question index for return sessions.
 *
 * @param lastQuestionAsked - The last question index stored on profile.
 * @returns Next question index in range 0–6.
 */
function getNextQuestionIndex(lastQuestionAsked: number): number {
  if (lastQuestionAsked < 0) return 0;
  return (lastQuestionAsked + 1) % QUESTION_BANK.length;
}

/**
 * Retrieves a question from the bank by index.
 *
 * @param index - Index into the question bank.
 * @returns Question object with share and ask strings.
 */
function getQuestionByIndex(index: number): { id: number; share: string; ask: string } {
  return QUESTION_BANK[Math.min(Math.max(index, 0), QUESTION_BANK.length - 1)];
}

/**
 * Calls GPT to generate Spriggle's response for a step.
 *
 * @param step - Current intake step.
 * @param input - Sanitized input string.
 * @param sessionData - Sanitized session data.
 * @param extra - Optional extra context to include.
 * @returns GPT content string or null on failure.
 */
async function getSpriggleTextFromGpt(
  step: IntakeStep,
  input: string,
  sessionData: IntakeSessionData,
  extra?: Record<string, unknown>
): Promise<string | null> {
  const userMessage = JSON.stringify({
    step,
    input,
    sessionData,
    ...(extra ?? {}),
  });

  const result = await callGpt({
    systemPrompt: SPRIGGLE_SYSTEM_PROMPT,
    userMessage,
    maxTokens: 150,
    temperature: 0.7,
  });

  if (!result.success || !result.content) {
    return null;
  }

  return result.content.trim();
}

/**
 * Provides fallback Spriggle text when GPT fails.
 *
 * @param step - Current intake step.
 * @param sessionData - Current session data.
 * @param question - Optional return question context.
 * @returns Fallback Spriggle text.
 */
function getFallbackText(
  step: IntakeStep,
  sessionData: IntakeSessionData,
  question?: { share: string; ask: string }
): string {
  const color = sessionData.favoriteColor ?? "";
  const animal = sessionData.favoriteAnimal ?? "";

  switch (step) {
    case "start":
      return "Hi! I'm Spriggle! What's your name?";
    case "name":
      return `Oh wow! Love that name! 🌟 ${QUESTION_BANK[0].share} Which color is YOUR favorite?`;
    case "color":
      return `Yay! ${QUESTION_BANK[1].share} Which animal is your favorite?`;
    case "animal":
      return `Your favorite color is ${color} and you love ${animal}! Did I get that right? Tap 'Yes, that's me!' if I got it right, or 'Try again!' to redo it!`;
    case "confirm":
      return "Awesome! Three magic doors are waiting — tap Animals, Space, or Math to pick one!";
    case "retry":
      return "No problem! Let's do that again.";
    case "subject":
      return "How should we read? Tap 'Read to me' or 'Let's read together'!";
    case "reading_mode":
      return "Almost there! Pick a story vibe — tap Calm, Exciting, or Silly!";
    case "tone":
      return "All set! Here we go! 🌟";
    case "return_question":
      return question ? `${question.share} ${question.ask}` : "I have something fun to ask you!";
    case "return_answer":
      return "Thanks for sharing! You're awesome! 🌟";
    default:
      return "Oops! Let's try that again! 🌟";
  }
}

/**
 * Synthesizes Spriggle's audio and builds the response payload.
 *
 * @param params - Response parameters.
 * @returns IntakeResponse object.
 */
async function buildIntakeResponse(params: {
  spriggleText: string;
  nextStep: IntakeResponse["nextStep"];
  listen: boolean;
  profile?: ChildProfile;
}): Promise<IntakeResponse> {
  const ttsResult = await synthesizeSpeech(params.spriggleText, "spriggle");

  return {
    spriggleText: params.spriggleText,
    audioBase64: ttsResult.success
      ? ttsResult.audioBuffer.toString("base64")
      : "",
    wordTimings: ttsResult.success ? ttsResult.wordTimings : [],
    nextStep: params.nextStep,
    stt: buildStt(params.listen),
    profile: params.profile,
  };
}

/**
 * Builds a ChildSearchDoc from a ChildProfile and memory fields.
 *
 * @param profile - Child profile from Supabase.
 * @param memoryFields - Current memory summary fields for search index.
 * @returns ChildSearchDoc for Azure AI Search.
 */
function buildChildSearchDoc(
  profile: ChildProfile,
  memoryFields: {
    currentAdaptation: string;
    recentSessionsSummary: string;
    derivedMemoryText: string;
    updatedAt: string;
  }
): ChildSearchDoc {
  return {
    id: profile.id,
    childId: profile.id,
    name: profile.name,
    age: profile.age,
    grade: profile.grade,
    interests: profile.interests,
    readingComfort: profile.readingComfort,
    favoriteColor: profile.favoriteColor ?? "",
    favoriteAnimal: profile.favoriteAnimal ?? "",
    latestPersonalDetail: profile.latestPersonalDetail ?? "",
    preferredSubject: profile.preferredSubject ?? "",
    readingMode: profile.readingMode ?? "",
    storyTone: profile.storyTone ?? "",
    currentAdaptation: memoryFields.currentAdaptation,
    recentSessionsSummary: memoryFields.recentSessionsSummary,
    derivedMemoryText: memoryFields.derivedMemoryText,
    updatedAt: memoryFields.updatedAt,
  };
}

/**
 * Returns a retry response when required input is missing.
 *
 * @param step - The current intake step.
 * @returns IntakeResponse with a retry prompt.
 */
async function buildMissingInputResponse(step: IntakeStep): Promise<IntakeResponse> {
  return buildIntakeResponse({
    spriggleText: "Oops! Let's try that again! 🌟",
    nextStep: step,
    listen: true,
  });
}

/**
 * Handles the intake POST route for both new and return sessions.
 *
 * @param request - Incoming POST request.
 * @returns JSON response with Spriggle text, audio, and next step.
 */
export async function POST(request: Request): Promise<Response> {
  let body: Partial<IntakeRequest>;

  try {
    body = (await request.json()) as Partial<IntakeRequest>;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isIntakeStep(body.step)) {
    return Response.json({ error: "Invalid step" }, { status: 400 });
  }

  const parentId = typeof body.parentId === "string" ? body.parentId.trim() : "";
  if (!parentId) {
    return Response.json({ error: "Invalid parentId" }, { status: 400 });
  }

  const step = body.step;
  const sessionData = normalizeSessionData(body.sessionData);
  const sanitizedInput = sanitizeInput(body.input);

  if (step === "start") {
    const gptText =
      (await getSpriggleTextFromGpt(step, sanitizedInput, sessionData)) ?? null;
    const spriggleText = gptText ?? getFallbackText(step, sessionData);
    const response = await buildIntakeResponse({
      spriggleText,
      nextStep: "name",
      listen: true,
    });
    return Response.json(response);
  }

  if (step === "name") {
    if (!sanitizedInput) {
      const response = await buildMissingInputResponse(step);
      return Response.json(response);
    }
    const updatedSession: IntakeSessionData = {
      ...sessionData,
      name: sanitizedInput,
    };
    const gptText =
      (await getSpriggleTextFromGpt(step, sanitizedInput, updatedSession)) ?? null;
    const spriggleText = gptText ?? getFallbackText(step, updatedSession);
    const response = await buildIntakeResponse({
      spriggleText,
      nextStep: "color",
      listen: true,
    });
    return Response.json(response);
  }

  if (step === "color") {
    if (!sanitizedInput) {
      const response = await buildMissingInputResponse(step);
      return Response.json(response);
    }
    const updatedSession: IntakeSessionData = {
      ...sessionData,
      favoriteColor: sanitizedInput,
    };
    const gptText =
      (await getSpriggleTextFromGpt(step, sanitizedInput, updatedSession)) ?? null;
    const spriggleText = gptText ?? getFallbackText(step, updatedSession);
    const response = await buildIntakeResponse({
      spriggleText,
      nextStep: "animal",
      listen: true,
    });
    return Response.json(response);
  }

  if (step === "animal") {
    if (!sanitizedInput) {
      const response = await buildMissingInputResponse(step);
      return Response.json(response);
    }
    const updatedSession: IntakeSessionData = {
      ...sessionData,
      favoriteAnimal: sanitizedInput,
    };
    const gptText =
      (await getSpriggleTextFromGpt(step, sanitizedInput, updatedSession)) ?? null;
    const spriggleText = gptText ?? getFallbackText(step, updatedSession);
    const response = await buildIntakeResponse({
      spriggleText,
      nextStep: "confirm",
      listen: false,
    });
    return Response.json(response);
  }

  if (step === "confirm") {
    const gptText =
      (await getSpriggleTextFromGpt(step, sanitizedInput, sessionData)) ?? null;
    const spriggleText = gptText ?? getFallbackText(step, sessionData);
    const response = await buildIntakeResponse({
      spriggleText,
      nextStep: "subject",
      listen: false,
    });
    return Response.json(response);
  }

  if (step === "retry") {
    const shouldRetry = sessionData.retryCount < 3;
    const spriggleText = shouldRetry
      ? "No problem! Let's do that again."
      : "Got it! Let's go! 🌀";
    const response = await buildIntakeResponse({
      spriggleText,
      nextStep: shouldRetry ? "color" : "subject",
      listen: shouldRetry,
    });
    return Response.json(response);
  }

  if (step === "subject") {
    if (!isValidSubject(sanitizedInput)) {
      return Response.json({ error: "Invalid subject" }, { status: 400 });
    }
    const updatedSession: IntakeSessionData = {
      ...sessionData,
      subject: sanitizedInput,
    };
    const gptText =
      (await getSpriggleTextFromGpt(step, sanitizedInput, updatedSession)) ?? null;
    const spriggleText = gptText ?? getFallbackText(step, updatedSession);
    const response = await buildIntakeResponse({
      spriggleText,
      nextStep: "reading_mode",
      listen: false,
    });
    return Response.json(response);
  }

  if (step === "reading_mode") {
    if (!isValidReadingMode(sanitizedInput)) {
      return Response.json({ error: "Invalid reading mode" }, { status: 400 });
    }
    const updatedSession: IntakeSessionData = {
      ...sessionData,
      readingMode: sanitizedInput,
    };
    const gptText =
      (await getSpriggleTextFromGpt(step, sanitizedInput, updatedSession)) ?? null;
    const spriggleText = gptText ?? getFallbackText(step, updatedSession);
    const response = await buildIntakeResponse({
      spriggleText,
      nextStep: "tone",
      listen: false,
    });
    return Response.json(response);
  }

  if (step === "tone") {
    if (!isValidStoryTone(sanitizedInput)) {
      return Response.json({ error: "Invalid tone" }, { status: 400 });
    }

    const updatedSession: IntakeSessionData = {
      ...sessionData,
      storyTone: sanitizedInput,
    };

    const requiredFieldsReady =
      Boolean(updatedSession.name) &&
      Boolean(updatedSession.favoriteColor) &&
      Boolean(updatedSession.favoriteAnimal) &&
      Boolean(updatedSession.subject) &&
      Boolean(updatedSession.readingMode) &&
      Boolean(updatedSession.storyTone);

    if (!requiredFieldsReady) {
      return Response.json({ error: "Missing intake fields" }, { status: 400 });
    }

    const gptText =
      (await getSpriggleTextFromGpt(step, sanitizedInput, updatedSession)) ?? null;
    const spriggleText = gptText ?? getFallbackText(step, updatedSession);

    try {
      const createdProfile = await createChildProfile({
        parentId,
        name: updatedSession.name as string,
        age: 6,
        grade: 1,
        interests: [],
        readingComfort: "beginner",
        preferredSubject: updatedSession.subject ?? null,
        readingMode: updatedSession.readingMode ?? null,
        storyTone: updatedSession.storyTone ?? null,
        favoriteColor: updatedSession.favoriteColor ?? null,
        favoriteAnimal: updatedSession.favoriteAnimal ?? null,
        lastQuestionAsked: 1,
        latestPersonalDetail: updatedSession.favoriteAnimal ?? null,
        accessibility: DEFAULT_ACCESSIBILITY,
      });

      await upsertChildMemory({
        childId: createdProfile.id,
        stableProfile: {
          name: createdProfile.name,
          age: createdProfile.age,
          grade: createdProfile.grade,
          interests: createdProfile.interests,
          readingComfort: createdProfile.readingComfort,
          favoriteColor: createdProfile.favoriteColor,
          favoriteAnimal: createdProfile.favoriteAnimal,
          latestPersonalDetail: createdProfile.latestPersonalDetail,
          preferredSubject: createdProfile.preferredSubject,
          readingMode: createdProfile.readingMode,
          storyTone: createdProfile.storyTone,
        },
        sessionHistory: [],
        derivedMemory: [],
        currentAdaptation: "hold",
      });

      const now = new Date().toISOString();
      const searchDoc = buildChildSearchDoc(createdProfile, {
        currentAdaptation: "hold",
        recentSessionsSummary: "[]",
        derivedMemoryText: "",
        updatedAt: now,
      });

      await indexChildProfileDoc(searchDoc);

      const response = await buildIntakeResponse({
        spriggleText,
        nextStep: "complete",
        listen: false,
        profile: createdProfile,
      });
      return Response.json(response);
    } catch (error) {
      console.error(
        "[intake] Profile creation failed:",
        error instanceof Error ? error.message : "Unknown error"
      );
      return Response.json(
        { error: "Failed to create profile" },
        { status: 500 }
      );
    }
  }

  if (step === "return_question") {
    const childId = typeof body.childId === "string" ? body.childId.trim() : "";
    if (!childId) {
      return Response.json({ error: "Missing childId" }, { status: 400 });
    }

    const child = await getChildById(childId);
    if (!child) {
      return Response.json({ error: "Child not found" }, { status: 404 });
    }

    const nextIndex = getNextQuestionIndex(child.lastQuestionAsked);
    const question = getQuestionByIndex(nextIndex);

    const gptText =
      (await getSpriggleTextFromGpt(step, sanitizedInput, sessionData, {
        question,
      })) ?? null;
    const spriggleText =
      gptText ?? getFallbackText(step, sessionData, question);

    const response = await buildIntakeResponse({
      spriggleText,
      nextStep: "return_answer",
      listen: true,
    });
    return Response.json(response);
  }

  if (step === "return_answer") {
    const childId = typeof body.childId === "string" ? body.childId.trim() : "";
    if (!childId) {
      return Response.json({ error: "Missing childId" }, { status: 400 });
    }

    if (!sanitizedInput) {
      const response = await buildMissingInputResponse(step);
      return Response.json(response);
    }

    const child = await getChildById(childId);
    if (!child) {
      return Response.json({ error: "Child not found" }, { status: 404 });
    }

    const nextIndex = getNextQuestionIndex(child.lastQuestionAsked);

    try {
      const updated = await updateChildProfile(childId, {
        latestPersonalDetail: sanitizedInput,
        lastQuestionAsked: nextIndex,
      });

      const now = new Date().toISOString();
      const searchDoc = buildChildSearchDoc(updated, {
        currentAdaptation: "hold",
        recentSessionsSummary: "[]",
        derivedMemoryText: "",
        updatedAt: now,
      });

      await indexChildProfileDoc(searchDoc);

      const gptText =
        (await getSpriggleTextFromGpt(step, sanitizedInput, sessionData)) ??
        null;
      const spriggleText = gptText ?? getFallbackText(step, sessionData);

      const response = await buildIntakeResponse({
        spriggleText,
        nextStep: "complete",
        listen: false,
        profile: updated,
      });
      return Response.json(response);
    } catch (error) {
      console.error(
        "[intake] Return update failed:",
        error instanceof Error ? error.message : "Unknown error"
      );
      return Response.json(
        { error: "Failed to update profile" },
        { status: 500 }
      );
    }
  }

  return Response.json({ error: "Invalid step" }, { status: 400 });
}
