import { randomUUID } from "crypto";
import { callGptJson } from "@/lib/azure/openai";
import { checkQuizOutput } from "@/lib/safety/checkQuizOutput";
import { getChildById } from "@/lib/supabase/profiles";
import { createSession } from "@/lib/supabase/sessions";
import {
  getChildMemory,
  mergeSessionIntoMemory,
  upsertChildMemory,
} from "@/lib/supabase/memory";
import { deriveMemoryFromSessions } from "@/lib/rag/deriveMemory";
import { updateChildProfileIndex } from "@/lib/rag/updateChildProfile";
import type {
  QuizAnswer,
  QuizQuestion,
  QuestionScore,
  QuizScore,
} from "@/types/Quiz";
import type { Story } from "@/types/Story";
import type {
  QuizRequest,
  QuizScoreRequest,
  QuizGenerateResponse,
  QuizScoreResponse,
  QuizQuestionPublic,
} from "@/types/Api";
import type { ChildProfile, SessionMemoryEntry } from "@/types/Child";

const QUIZ_GENERATION_SYSTEM_PROMPT = `You are the Quiz Agent for Talewind, a first-grade-safe adaptive learning app for children ages 5 to 7.

Generate exactly 2 to 3 quiz questions based on the story the child just heard.

Rules for questions:
- Questions must be answerable from the story only — no outside knowledge needed
- First-grade appropriate — short, simple, clear words
- Include at least 1 recall question and optionally 1 inference or vocabulary question
- Every question must reference a specific scene number (0-based)
- Every question must have a gentle hint that does not give away the answer
- Never use trick questions or ambiguous wording

Output ONLY valid JSON in this format:
{
  "questions": [
    {
      "id": "string",
      "question": "string",
      "questionType": "recall" | "inference" | "vocabulary",
      "expectedAnswer": "string",
      "hint": "string",
      "sceneReference": number,
      "index": number
    }
  ]
}`;

const QUIZ_SCORING_SYSTEM_PROMPT = `You are the Quiz Agent scorer for Talewind.

Score a child's answers generously. Partial understanding counts as correct.
Never penalize spelling or grammar. "I don't know" = 0 for that question.

Return ONLY valid JSON:
{
  "questionScores": [
    { "questionId": "string", "correct": boolean, "score": number }
  ],
  "struggledWith": ["string"],
  "workedWell": ["string"]
}`;

/**
 * Sanitizes raw input before use in prompts.
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
 * Sanitizes an array of strings, dropping empties.
 *
 * @param values - Raw string array.
 * @param maxLen - Maximum length per item.
 * @returns Sanitized string array.
 */
function sanitizeStringArray(values: unknown, maxLen: number): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((item) => sanitizeInput(typeof item === "string" ? item : "", maxLen))
    .filter(Boolean);
}

/**
 * Validates story payload shape minimally.
 *
 * @param story - Story object.
 * @returns True if the story is structurally valid.
 */
function isValidStory(story: Story | null | undefined): story is Story {
  if (!story) return false;
  if (!Array.isArray(story.scenes) || story.scenes.length === 0) return false;
  return typeof story.subject === "string" && typeof story.title === "string";
}

/**
 * Validates raw quiz generation output.
 *
 * @param output - Raw GPT output.
 * @returns True if output matches expected shape.
 */
function isValidQuizOutput(output: {
  questions?: QuizQuestion[];
} | null): output is { questions: QuizQuestion[] } {
  if (!output || !Array.isArray(output.questions)) return false;
  if (output.questions.length < 2 || output.questions.length > 3) return false;
  return output.questions.every((q, index) => {
    return (
      typeof q.id === "string" &&
      typeof q.question === "string" &&
      (q.questionType === "recall" ||
        q.questionType === "inference" ||
        q.questionType === "vocabulary") &&
      typeof q.expectedAnswer === "string" &&
      typeof q.hint === "string" &&
      typeof q.sceneReference === "number" &&
      typeof q.index === "number" &&
      q.index === index
    );
  });
}

/**
 * Validates question type value.
 *
 * @param value - Input value.
 * @returns True if value is a supported question type.
 */
function isValidQuestionType(
  value: unknown
): value is QuizQuestion["questionType"] {
  return value === "recall" || value === "inference" || value === "vocabulary";
}

/**
 * Validates public quiz questions from the client.
 *
 * @param questions - Public questions array.
 * @returns True if questions are structurally valid.
 */
function isValidPublicQuestions(
  questions: QuizQuestionPublic[]
): boolean {
  if (questions.length < 2 || questions.length > 3) return false;
  return questions.every((question) => {
    return (
      Boolean(question.id) &&
      Boolean(question.question) &&
      isValidQuestionType(question.questionType) &&
      Number.isFinite(question.sceneReference) &&
      Number.isFinite(question.index)
    );
  });
}

/**
 * Validates raw scoring output.
 *
 * @param output - Raw GPT scoring output.
 * @returns True if output is valid.
 */
function isValidScoringOutput(output: {
  questionScores?: QuestionScore[];
  struggledWith?: string[];
  workedWell?: string[];
} | null): output is {
  questionScores: QuestionScore[];
  struggledWith: string[];
  workedWell: string[];
} {
  if (!output) return false;
  if (!Array.isArray(output.questionScores)) return false;
  return output.questionScores.every((score) => {
    return (
      typeof score.questionId === "string" &&
      typeof score.correct === "boolean" &&
      typeof score.score === "number"
    );
  });
}

/**
 * Builds the user message for quiz generation.
 *
 * @param story - Completed story.
 * @param child - Child profile.
 * @returns User message string.
 */
function buildQuizGenerationMessage(story: Story, child: ChildProfile): string {
  const storyPayload = story.scenes.map((scene) => ({
    index: scene.index,
    title: sanitizeInput(scene.title, 120),
    narration: sanitizeInput(scene.narration, 800),
  }));

  return [
    `Child reading comfort: ${child.readingComfort}`,
    `Story subject: ${story.subject}`,
    `Story tone: ${story.tone}`,
    `Story title: ${story.title}`,
    "",
    "Story scenes:",
    JSON.stringify(storyPayload, null, 2),
  ].join("\n");
}

/**
 * Builds the user message for quiz scoring.
 *
 * @param story - Completed story.
 * @param questions - Quiz questions.
 * @param answers - Child answers.
 * @returns User message string.
 */
function buildQuizScoringMessage(
  story: Story,
  questions: QuizQuestionPublic[],
  answers: QuizAnswer[]
): string {
  const storyPayload = story.scenes.map((scene) => ({
    index: scene.index,
    title: sanitizeInput(scene.title, 120),
    narration: sanitizeInput(scene.narration, 800),
  }));

  const answerPayload = answers.map((answer) => ({
    questionId: sanitizeInput(answer.questionId, 64),
    answerText: sanitizeInput(answer.answerText, 300),
    inputMode: answer.inputMode,
  }));

  return [
    "Story scenes:",
    JSON.stringify(storyPayload, null, 2),
    "",
    "Questions:",
    JSON.stringify(questions, null, 2),
    "",
    "Child answers:",
    JSON.stringify(answerPayload, null, 2),
  ].join("\n");
}

/**
 * Computes overall quiz score and adaptation result.
 *
 * @param questionScores - Per-question scores.
 * @returns QuizScore result.
 */
function computeQuizScore(questionScores: QuestionScore[]): QuizScore {
  const totalQuestions = questionScores.length;
  const totalScore =
    totalQuestions === 0
      ? 0
      : Math.round(
          questionScores.reduce((sum, q) => sum + q.score, 0) /
            totalQuestions
        );

  let adaptationResult: QuizScore["adaptationResult"] = "hold";
  if (totalScore <= 49) adaptationResult = "simplify";
  if (totalScore >= 80) adaptationResult = "enrich";

  return { totalScore, questionScores, adaptationResult };
}

/**
 * Builds a session memory entry from the scored quiz.
 *
 * @param sessionId - Supabase session UUID.
 * @param story - Completed story.
 * @param quizScore - Quiz score result.
 * @param madeEasierScenes - Scenes the child requested to make easier.
 * @returns SessionMemoryEntry.
 */
function buildSessionMemoryEntry(
  sessionId: string,
  story: Story,
  quizScore: QuizScore,
  madeEasierScenes: string[],
  struggledWith: string[],
  workedWell: string[]
): SessionMemoryEntry {
  const topicsCovered = story.scenes.map((scene) => scene.title).slice(0, 6);

  return {
    sessionId,
    subject: story.subject,
    storyTitle: story.title,
    quizScore: quizScore.totalScore,
    adaptationResult: quizScore.adaptationResult,
    madeEasierScenes,
    struggledWith,
    workedWell,
    topicsCovered,
    tone: story.tone,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Writes session and memory updates with a single retry on failure.
 *
 * @param child - Child profile.
 * @param sessionEntry - Session memory entry.
 * @param story - Completed story.
 * @param quizScore - Quiz score result.
 * @param struggledWith - Topics the child struggled with.
 * @param workedWell - Themes that engaged the child.
 * @returns Session ID.
 */
async function writeSessionAndMemory(
  child: ChildProfile,
  sessionEntry: SessionMemoryEntry,
  story: Story,
  quizScore: QuizScore
): Promise<string> {
  const storyMetadata = {
    storyId: story.id,
    storyTitle: story.title,
    tone: story.tone,
    sceneCount: story.scenes.length,
    curriculumChunkIds: story.curriculumChunkIds,
    topicsCovered: sessionEntry.topicsCovered,
  };

  const session = await createSession({
    childId: child.id,
    subject: story.subject,
    storyMetadata,
    quizScore: quizScore.totalScore,
    adaptationResult: quizScore.adaptationResult,
  });

  const attemptMemoryWrite = async (): Promise<void> => {
    const existingMemory = await getChildMemory(child.id);
    const merged = mergeSessionIntoMemory(
      existingMemory,
      child.id,
      {
        ...sessionEntry,
        sessionId: session.id,
      },
      {
        name: child.name,
        age: child.age,
        grade: child.grade,
        interests: child.interests,
        readingComfort: child.readingComfort,
        favoriteColor: child.favoriteColor,
        favoriteAnimal: child.favoriteAnimal,
        latestPersonalDetail: child.latestPersonalDetail,
        preferredSubject: child.preferredSubject,
        readingMode: child.readingMode,
        storyTone: child.storyTone,
      }
    );

    let derivedMemory = merged.derivedMemory;
    if (merged.sessionHistory.length >= 3) {
      const inferred = await deriveMemoryFromSessions(merged.sessionHistory);
      if (inferred.length > 0) derivedMemory = inferred;
    }

    const savedMemory = await upsertChildMemory({
      ...merged,
      derivedMemory,
      currentAdaptation: quizScore.adaptationResult,
    });

    await updateChildProfileIndex(child, savedMemory);
  };

  try {
    await attemptMemoryWrite();
  } catch (err) {
    console.error(
      "[api/quiz] Memory write failed. Retrying once.",
      err instanceof Error ? err.message : "Unknown error"
    );
    await attemptMemoryWrite();
  }

  return session.id;
}

/**
 * POST /api/quiz
 * Handles quiz generation and scoring.
 */
export async function POST(request: Request): Promise<Response> {
  let payload: QuizRequest;
  try {
    payload = (await request.json()) as QuizRequest;
  } catch {
    return Response.json(
      { questions: null, safety: null, error: "Invalid JSON body." } as QuizGenerateResponse,
      { status: 400 }
    );
  }

  const mode = payload?.mode;
  const childId = sanitizeInput(payload?.childId, 64);

  if (!mode || !childId) {
    return Response.json(
      { questions: null, safety: null, error: "Missing required fields." } as QuizGenerateResponse,
      { status: 400 }
    );
  }

  if (!isValidStory((payload as QuizRequest).story)) {
    return Response.json(
      { questions: null, safety: null, error: "Invalid story payload." } as QuizGenerateResponse,
      { status: 400 }
    );
  }

  const story = (payload as QuizRequest).story;

  if (mode === "generate") {
    let child: ChildProfile | null = null;
    try {
      child = await getChildById(childId);
    } catch (err) {
      console.error(
        "[api/quiz] Failed to load child profile.",
        err instanceof Error ? err.message : "Unknown error"
      );
      return Response.json(
        { questions: null, safety: null, error: "Failed to load child profile." } as QuizGenerateResponse,
        { status: 500 }
      );
    }

    if (!child) {
      return Response.json(
        { questions: null, safety: null, error: "Child not found." } as QuizGenerateResponse,
        { status: 404 }
      );
    }

    const userMessage = buildQuizGenerationMessage(story, child);
    let raw = null;
    try {
      raw = await callGptJson<{ questions: QuizQuestion[] }>({
        systemPrompt: QUIZ_GENERATION_SYSTEM_PROMPT,
        userMessage,
        maxTokens: 900,
        temperature: 0.7,
        timeoutMs: 30_000,
      });
    } catch (err) {
      console.error(
        "[api/quiz] Quiz generation failed.",
        err instanceof Error ? err.message : "Unknown error"
      );
      return Response.json(
        { questions: null, safety: null, error: "Quiz generation failed." } as QuizGenerateResponse,
        { status: 502 }
      );
    }

    if (!isValidQuizOutput(raw)) {
      return Response.json(
        { questions: null, safety: null, error: "Invalid quiz output." } as QuizGenerateResponse,
        { status: 502 }
      );
    }

    let safetyResult;
    try {
      safetyResult = await checkQuizOutput(raw.questions, childId, randomUUID());
    } catch (err) {
      console.error(
        "[api/quiz] Safety check failed.",
        err instanceof Error ? err.message : "Unknown error"
      );
      return Response.json(
        { questions: null, safety: null, error: "Safety check failed." } as QuizGenerateResponse,
        { status: 500 }
      );
    }

    const publicQuestions = (safetyResult.questions ?? []).map((question) => ({
      id: question.id,
      question: question.question,
      questionType: question.questionType,
      hint: question.hint,
      sceneReference: question.sceneReference,
      index: question.index,
    }));

    return Response.json({
      questions: publicQuestions.length ? publicQuestions : null,
      safety: {
        passed: safetyResult.passed,
        wasRewritten: safetyResult.wasRewritten,
      },
    } as QuizGenerateResponse);
  }

  if (mode === "score") {
    const scorePayload = payload as QuizScoreRequest;

    const questions: QuizQuestionPublic[] = Array.isArray(scorePayload.questions)
      ? scorePayload.questions.map((question) => ({
          id: sanitizeInput(question.id, 64),
          question: sanitizeInput(question.question, 300),
          questionType: question.questionType,
          hint: sanitizeInput(question.hint, 200),
          sceneReference: Number(question.sceneReference),
          index: Number(question.index),
        }))
      : [];
    const answers = Array.isArray(scorePayload.answers)
      ? scorePayload.answers.map((answer) => ({
          questionId: sanitizeInput(answer.questionId, 64),
          answerText: sanitizeInput(answer.answerText, 300),
          inputMode: (answer.inputMode === "typed" ? "typed" : "voice") as "voice" | "typed",
        }))
      : [];
    const madeEasierScenes = sanitizeStringArray(
      scorePayload.madeEasierScenes,
      64
    );

    if (!isValidPublicQuestions(questions) || answers.length === 0) {
      return Response.json(
        {
          score: null,
          questionScores: null,
          adaptationResult: null,
          sessionId: null,
          error: "Missing questions or answers.",
        } as QuizScoreResponse,
        { status: 400 }
      );
    }

    const userMessage = buildQuizScoringMessage(story, questions, answers);
    let scoringRaw = null;
    try {
      scoringRaw = await callGptJson<{
        questionScores: QuestionScore[];
        struggledWith: string[];
        workedWell: string[];
      }>({
        systemPrompt: QUIZ_SCORING_SYSTEM_PROMPT,
        userMessage,
        maxTokens: 700,
        temperature: 0.3,
        timeoutMs: 30_000,
      });
    } catch (err) {
      console.error(
        "[api/quiz] Quiz scoring failed.",
        err instanceof Error ? err.message : "Unknown error"
      );
      return Response.json(
        {
          score: null,
          questionScores: null,
          adaptationResult: null,
          sessionId: null,
          error: "Quiz scoring failed.",
        } as QuizScoreResponse,
        { status: 502 }
      );
    }

    if (!isValidScoringOutput(scoringRaw)) {
      return Response.json(
        {
          score: null,
          questionScores: null,
          adaptationResult: null,
          sessionId: null,
          error: "Invalid scoring output.",
        } as QuizScoreResponse,
        { status: 502 }
      );
    }

    const questionScores = scoringRaw.questionScores;
    const quizScore = computeQuizScore(questionScores);

    let child: ChildProfile | null = null;
    try {
      child = await getChildById(childId);
    } catch (err) {
      console.error(
        "[api/quiz] Failed to load child profile.",
        err instanceof Error ? err.message : "Unknown error"
      );
    }

    if (!child) {
      return Response.json(
        {
          score: null,
          questionScores: null,
          adaptationResult: null,
          sessionId: null,
          error: "Child not found.",
        } as QuizScoreResponse,
        { status: 404 }
      );
    }

    const sessionEntry = buildSessionMemoryEntry(
      "",
      story,
      quizScore,
      madeEasierScenes,
      sanitizeStringArray(scoringRaw.struggledWith, 80),
      sanitizeStringArray(scoringRaw.workedWell, 80)
    );

    let sessionId = "";
    try {
      sessionId = await writeSessionAndMemory(child, sessionEntry, story, quizScore);
    } catch (err) {
      console.error(
        "[api/quiz] Failed to write session or memory.",
        err instanceof Error ? err.message : "Unknown error"
      );
      return Response.json(
        {
          score: null,
          questionScores: null,
          adaptationResult: null,
          sessionId: null,
          error: "Failed to write session or memory.",
        } as QuizScoreResponse,
        { status: 500 }
      );
    }

    return Response.json({
      score: quizScore,
      questionScores,
      adaptationResult: quizScore.adaptationResult,
      sessionId,
    } as QuizScoreResponse);
  }

  return Response.json(
    { questions: null, safety: null, error: "Invalid mode." } as QuizGenerateResponse,
    { status: 400 }
  );
}
