/**
 * /src/lib/rag/deriveMemory.ts
 *
 * Uses GPT-4o mini to infer derived memory signals from session history.
 * Called after 3+ sessions to keep personalization fresh.
 */

import { callGptJson } from "@/lib/azure/openai";
import type { SessionMemoryEntry, ChildMemory } from "@/types/Child";

const DERIVED_MEMORY_SYSTEM_PROMPT = `You are a learning coach for a child reading app.

Your job: infer 2 to 4 short derived-memory statements from session history.

Rules:
- Keep each statement short, friendly, and first-grade appropriate.
- Focus on patterns: what themes worked, what topics were hard, tone preference.
- Do NOT mention scores, test language, or performance pressure.
- Do NOT include the child's name or any personal identifiers.

Return ONLY valid JSON:
{ "derivedMemory": ["string", "string"] }`;

/**
 * Infers derived memory strings from session history using GPT-4o mini.
 *
 * @param sessionHistory - Completed session entries (newest last).
 * @returns Array of derived memory strings (2–4) or empty array on failure.
 */
export async function deriveMemoryFromSessions(
  sessionHistory: SessionMemoryEntry[]
): Promise<ChildMemory["derivedMemory"]> {
  if (sessionHistory.length < 3) return [];

  const historyPayload = sessionHistory.slice(-6).map((entry) => ({
    subject: entry.subject,
    quizScore: entry.quizScore,
    adaptationResult: entry.adaptationResult,
    madeEasierScenes: entry.madeEasierScenes,
    topicsCovered: entry.topicsCovered,
    tone: entry.tone,
  }));

  const userMessage = `Session history:\n${JSON.stringify(historyPayload, null, 2)}`;

  try {
    const response = await callGptJson<{ derivedMemory: string[] }>({
      systemPrompt: DERIVED_MEMORY_SYSTEM_PROMPT,
      userMessage,
      maxTokens: 300,
      temperature: 0.4,
      timeoutMs: 30_000,
    });

    if (!response || !Array.isArray(response.derivedMemory)) return [];
    return response.derivedMemory
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
      .slice(0, 4);
  } catch (err) {
    console.error(
      "[rag/deriveMemory] Derived memory inference failed.",
      err instanceof Error ? err.message : "Unknown error"
    );
    return [];
  }
}

