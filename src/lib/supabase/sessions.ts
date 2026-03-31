/**
 * /src/lib/supabase/sessions.ts
 *
 * Create and read session records in the `sessions` Supabase table.
 * One session row is written after every completed story + quiz session.
 */

import { getSupabaseServiceClient } from "./client";
import type { SessionRecord, SessionCreateInput } from "@/types/Session";

// ── Internal row shape (matches Supabase snake_case columns) ──────────────────

interface SessionRow {
  id: string;
  child_id: string;
  subject: string;
  story_metadata: SessionRecord["storyMetadata"];
  quiz_score: number | null;
  adaptation_result: string | null;
  created_at: string;
}

/**
 * Maps a raw Supabase sessions row to a typed SessionRecord.
 *
 * @param row - Raw row from the `sessions` table.
 * @returns Typed SessionRecord.
 */
function rowToSessionRecord(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    childId: row.child_id,
    subject: row.subject as SessionRecord["subject"],
    storyMetadata: row.story_metadata,
    quizScore: row.quiz_score,
    adaptationResult:
      (row.adaptation_result as SessionRecord["adaptationResult"]) ?? null,
    createdAt: row.created_at,
  };
}

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Creates a new session record in Supabase after a completed session.
 * Call this after quiz scoring is complete and before updating child_memory.
 *
 * @param input - Session data excluding auto-generated id and createdAt.
 * @returns The created SessionRecord with its generated UUID.
 * @throws On Supabase error.
 */
export async function createSession(
  input: SessionCreateInput
): Promise<SessionRecord> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("sessions")
    .insert({
      child_id: input.childId,
      subject: input.subject,
      story_metadata: input.storyMetadata,
      quiz_score: input.quizScore ?? null,
      adaptation_result: input.adaptationResult ?? null,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`[sessions/createSession] ${error.message}`);
  }

  return rowToSessionRecord(data as SessionRow);
}

// ── Read ──────────────────────────────────────────────────────────────────────

/**
 * Fetches all session records for a child, newest first.
 * Used by the parent dashboard to display session history.
 *
 * @param childId - The UUID of the child.
 * @param limit - Maximum number of sessions to return (default 50).
 * @returns Array of SessionRecord objects, newest first.
 * @throws On Supabase error.
 */
export async function getSessionsByChildId(
  childId: string,
  limit = 50
): Promise<SessionRecord[]> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("child_id", childId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`[sessions/getSessionsByChildId] ${error.message}`);
  }

  return (data as SessionRow[]).map(rowToSessionRecord);
}

/**
 * Fetches the most recent session for a child.
 * Used to determine the starting adaptation state for a new session.
 *
 * @param childId - The UUID of the child.
 * @returns The most recent SessionRecord, or null if no sessions exist.
 * @throws On Supabase error.
 */
export async function getLatestSessionByChildId(
  childId: string
): Promise<SessionRecord | null> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("child_id", childId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // no rows
    throw new Error(`[sessions/getLatestSessionByChildId] ${error.message}`);
  }

  return rowToSessionRecord(data as SessionRow);
}
