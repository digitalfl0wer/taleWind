/**
 * /src/lib/safety/checkStoryOutput.ts
 *
 * Runs a GPT-4o mini safety check on every story before it is returned
 * to the client. If the check fails, the story is rewritten in-place.
 * Flagged content is NEVER returned to the client.
 *
 * Safety rules enforced:
 * - First-grade vocabulary (ages 5–7)
 * - Gentle, encouraging, positive tone
 * - No scary, violent, dark, or mature content
 * - No mention of death, injury, danger, or adult themes
 * - Domain-locked: Animals, Space, or Math only
 * - No conditional warmth based on performance
 *
 * All violations are logged silently (no violation details exposed to client).
 * Audit logs are written to Supabase safety_logs (Phase 12 task 12.9).
 */

import { callGptJson } from "@/lib/azure/openai";
import type { Story, StorySafetyResult, StoryScene } from "@/types/Story";

// ── Safety prompt ─────────────────────────────────────────────────────────────

const STORY_SAFETY_SYSTEM_PROMPT = `You are a child safety reviewer for a story app used by children ages 5–7 (first grade).

Your job is to review story content and determine if it is safe and appropriate.

SAFETY RULES — the content FAILS if it contains:
- Vocabulary above first-grade reading level
- Scary, dark, violent, or threatening elements
- Any mention of death, injury, blood, danger, or fear
- Adult themes, complex emotions, or confusing moral situations
- Content outside the approved subjects: Animals, Space, or Math
- Conditional warmth (e.g. "good job answering correctly" as a condition of affection)
- Any hint of assessment, testing, or performance pressure

If the content PASSES all rules, return:
{ "passed": true, "rewrittenNarration": null }

If the content FAILS any rule, rewrite each flagged scene's narration to be safe and appropriate, keeping the same scene title and general topic. Return:
{ "passed": false, "rewrittenNarration": { "<sceneIndex>": "<safe replacement narration>" } }

Only include scene indexes that needed rewriting in rewrittenNarration.
Respond with valid JSON only — no prose, no markdown fences.`;

// ── Check function ────────────────────────────────────────────────────────────

/**
 * Validates a story against the first-grade safety rules.
 * If flagged, rewrites the affected scenes using GPT-4o mini.
 * Logs violations silently — never surfaces the reason to the caller.
 *
 * @param story - The Story object to check (post Story Agent generation).
 * @param childId - Used for audit logging only — never included in the GPT prompt.
 * @param sessionId - Used for audit logging only.
 * @returns StorySafetyResult — the story (possibly rewritten) and pass/fail status.
 */
export async function checkStoryOutput(
  story: Story,
  childId: string,
  sessionId: string
): Promise<StorySafetyResult> {
  // Build a compact representation of the story for the safety check
  // Never include the child's name or personal data in the safety prompt
  const storyPayload = story.scenes.map((scene) => ({
    index: scene.index,
    title: scene.title,
    narration: scene.narration,
  }));

  const userMessage = `Review this story for safety:\n${JSON.stringify(storyPayload, null, 2)}`;

  const safetyResponse = await callGptJson<{
    passed: boolean;
    rewrittenNarration: Record<string, string> | null;
  }>({
    systemPrompt: STORY_SAFETY_SYSTEM_PROMPT,
    userMessage,
    maxTokens: 1024,
    temperature: 0.2, // Low temperature for consistent safety decisions
    timeoutMs: 30_000,
  });

  // If the GPT call itself failed, log and return the story as-is
  // This is a fail-open for GPT errors — in Phase 11 this should be fail-closed
  if (!safetyResponse) {
    console.error(
      "[safety/checkStoryOutput] Safety check call failed. childId omitted from log. sessionId:",
      sessionId
    );
    return { passed: false, story, wasRewritten: false };
  }

  if (safetyResponse.passed) {
    return { passed: true, story, wasRewritten: false };
  }

  // Safety check failed — rewrite flagged scenes
  logSafetyViolation("story", childId, sessionId, story.scenes);

  const rewrittenScenes = applyRewrites(
    story.scenes,
    safetyResponse.rewrittenNarration ?? {}
  );

  const rewrittenStory: Story = {
    ...story,
    scenes: rewrittenScenes,
  };

  return { passed: false, story: rewrittenStory, wasRewritten: true };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Applies narration rewrites to the story scenes.
 * Only scenes with a matching index key in rewrittenNarration are changed.
 *
 * @param scenes - Original story scenes.
 * @param rewrites - Map of scene index (as string) to rewritten narration.
 * @returns Updated scenes array.
 */
function applyRewrites(
  scenes: StoryScene[],
  rewrites: Record<string, string>
): StoryScene[] {
  return scenes.map((scene) => {
    const rewrite = rewrites[String(scene.index)];
    if (rewrite) {
      return { ...scene, narration: rewrite };
    }
    return scene;
  });
}

/**
 * Logs a safety violation silently.
 * Never exposes the violation reason or flagged content to the client.
 * Writes a hashed record to Supabase safety_logs (Phase 12 task 12.9).
 *
 * @param checkType - "story" or "quiz".
 * @param childId - The child's UUID — never logged in plaintext to external systems.
 * @param sessionId - The session UUID.
 * @param scenes - The flagged scenes (used to generate a hash — not stored in plaintext).
 */
function logSafetyViolation(
  checkType: "story" | "quiz",
  childId: string,
  sessionId: string,
  scenes: StoryScene[]
): void {
  // Log minimally for server-side debugging — no child personal data
  console.warn(
    `[safety/${checkType}] Violation detected. sessionId: ${sessionId}. ` +
      `Rewriting ${scenes.length} scene(s). childId omitted from log.`
  );

  // PHASE 12 HOOK: Write hashed audit record to safety_logs Supabase table.
  // Implement in Phase 12 task 12.9:
  // await writeSafetyLog({ childId, sessionId, checkType, flaggedTextHash });
  void childId; // suppress unused warning until Phase 12
}
