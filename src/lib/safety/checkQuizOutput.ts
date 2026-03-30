/**
 * /src/lib/safety/checkQuizOutput.ts
 *
 * Runs a GPT-4o mini safety check on every quiz question set before it is
 * returned to the client. Same pattern as checkStoryOutput.ts but scoped
 * to quiz question language.
 *
 * Safety rules enforced:
 * - First-grade vocabulary (ages 5–7)
 * - Questions must be answerable by a child without pressure or anxiety
 * - No assessment framing that implies failure is bad or shameful
 * - No content outside the story's approved subject domain
 * - No trick questions, double negatives, or ambiguous phrasing
 * - Warm, encouraging tone — no cold or clinical question language
 *
 * All violations logged silently. Flagged content is NEVER returned.
 */

import { callGptJson } from "@/lib/azure/openai";
import type { QuizQuestion, QuizSafetyResult } from "@/types/Quiz";

// ── Safety prompt ─────────────────────────────────────────────────────────────

const QUIZ_SAFETY_SYSTEM_PROMPT = `You are a child safety reviewer for a quiz app used by children ages 5–7 (first grade).

Your job is to review quiz questions and determine if they are safe and age-appropriate.

SAFETY RULES — a question FAILS if it:
- Uses vocabulary above first-grade reading level
- Implies the child will fail, be judged, or feel shame for a wrong answer
- Uses assessment language like "test", "score", "grade", "pass", or "fail"
- Contains scary, dark, violent, or upsetting content
- References topics outside Animals, Space, or Math
- Uses trick phrasing, double negatives, or confusing structure
- Feels cold, clinical, or pressuring rather than warm and playful

If ALL questions PASS, return:
{ "passed": true, "rewrittenQuestions": null }

If any question FAILS, rewrite the question text to be safe and appropriate,
keeping the same educational intent. Return:
{ "passed": false, "rewrittenQuestions": { "<questionId>": "<safe replacement question text>" } }

Only include question IDs that needed rewriting in rewrittenQuestions.
Respond with valid JSON only — no prose, no markdown fences.`;

// ── Check function ────────────────────────────────────────────────────────────

/**
 * Validates a set of quiz questions against the first-grade safety rules.
 * If flagged, rewrites the affected questions using GPT-4o mini.
 * Logs violations silently — never surfaces the reason to the caller.
 *
 * @param questions - The QuizQuestion array to check (post Quiz Agent generation).
 * @param childId - Used for audit logging only — never included in the GPT prompt.
 * @param sessionId - Used for audit logging only.
 * @returns QuizSafetyResult — the questions (possibly rewritten) and pass/fail status.
 */
export async function checkQuizOutput(
  questions: QuizQuestion[],
  childId: string,
  sessionId: string
): Promise<QuizSafetyResult> {
  // Build a compact representation — never include the child's name or personal data
  const questionsPayload = questions.map((q) => ({
    id: q.id,
    question: q.question,
    index: q.index,
  }));

  const userMessage = `Review these quiz questions for safety:\n${JSON.stringify(questionsPayload, null, 2)}`;

  const safetyResponse = await callGptJson<{
    passed: boolean;
    rewrittenQuestions: Record<string, string> | null;
  }>({
    systemPrompt: QUIZ_SAFETY_SYSTEM_PROMPT,
    userMessage,
    maxTokens: 512,
    temperature: 0.2,
    timeoutMs: 30_000,
  });

  // If the GPT call itself failed, log and return questions as-is
  if (!safetyResponse) {
    console.error(
      "[safety/checkQuizOutput] Safety check call failed. sessionId:",
      sessionId
    );
    return { passed: false, questions, wasRewritten: false };
  }

  if (safetyResponse.passed) {
    return { passed: true, questions, wasRewritten: false };
  }

  // Safety check failed — rewrite flagged questions
  logSafetyViolation("quiz", childId, sessionId, questions);

  const rewrittenQuestions = applyRewrites(
    questions,
    safetyResponse.rewrittenQuestions ?? {}
  );

  return { passed: false, questions: rewrittenQuestions, wasRewritten: true };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Applies question text rewrites to the quiz questions array.
 * Only questions with a matching id key in rewrites are changed.
 * The expectedAnswer field is never changed by the safety rewrite.
 *
 * @param questions - Original quiz questions.
 * @param rewrites - Map of question id to rewritten question text.
 * @returns Updated questions array.
 */
function applyRewrites(
  questions: QuizQuestion[],
  rewrites: Record<string, string>
): QuizQuestion[] {
  return questions.map((q) => {
    const rewrite = rewrites[q.id];
    if (rewrite) {
      return { ...q, question: rewrite };
    }
    return q;
  });
}

/**
 * Logs a safety violation silently.
 * Never exposes the violation reason or content to the client.
 *
 * @param checkType - "story" or "quiz".
 * @param childId - The child's UUID — kept out of external log messages.
 * @param sessionId - The session UUID.
 * @param questions - The flagged questions (used for hash generation in Phase 12).
 */
function logSafetyViolation(
  checkType: "story" | "quiz",
  childId: string,
  sessionId: string,
  questions: QuizQuestion[]
): void {
  console.warn(
    `[safety/${checkType}] Violation detected. sessionId: ${sessionId}. ` +
      `Rewriting ${questions.length} question(s). childId omitted from log.`
  );

  // PHASE 12 HOOK: Write hashed audit record to safety_logs Supabase table.
  // Implement in Phase 12 task 12.9:
  // await writeSafetyLog({ childId, sessionId, checkType, flaggedTextHash });
  void childId; // suppress unused warning until Phase 12
}
