/**
 * /src/lib/supabase/memory.ts
 *
 * Read and write the `child_memory` table — the three-layer memory record
 * (stable profile, session history, derived memory).
 *
 * Memory update flow (call in this order):
 *   1. getChildMemory()       — load current state
 *   2. mergeSessionIntoMemory() — build the updated record
 *   3. upsertChildMemory()    — write back to Supabase
 *   4. (caller) re-index in Azure AI Search via updateChildProfile.ts
 */

import { getSupabaseServiceClient } from "./client";
import type { ChildMemory, SessionMemoryEntry } from "@/types/Child";

// ── Internal row shape ────────────────────────────────────────────────────────

interface ChildMemoryRow {
  id: string;
  child_id: string;
  stable_profile: Record<string, unknown>;
  session_history: SessionMemoryEntry[];
  derived_memory: string[];
  current_adaptation: string;
  updated_at: string;
}

/**
 * Maps a raw Supabase child_memory row to a typed ChildMemory object.
 *
 * @param row - Raw row from the `child_memory` table.
 * @returns Typed ChildMemory.
 */
function rowToChildMemory(row: ChildMemoryRow): ChildMemory {
  return {
    id: row.id,
    childId: row.child_id,
    stableProfile: row.stable_profile as ChildMemory["stableProfile"],
    sessionHistory: row.session_history,
    derivedMemory: row.derived_memory,
    currentAdaptation:
      row.current_adaptation as ChildMemory["currentAdaptation"],
    updatedAt: row.updated_at,
  };
}

// ── Read ──────────────────────────────────────────────────────────────────────

/**
 * Fetches the full memory record for a child.
 * Returns null if no memory record exists yet (first session).
 *
 * @param childId - The UUID of the child.
 * @returns Typed ChildMemory, or null if the row does not exist yet.
 * @throws On Supabase error (other than not-found).
 */
export async function getChildMemory(
  childId: string
): Promise<ChildMemory | null> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("child_memory")
    .select("*")
    .eq("child_id", childId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // not found
    throw new Error(`[memory/getChildMemory] ${error.message}`);
  }

  return rowToChildMemory(data as ChildMemoryRow);
}

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Upserts the full child_memory record.
 * Creates the row if it does not exist, or replaces it if it does.
 * This is an atomic write — use mergeSessionIntoMemory() to build the input.
 *
 * After calling this, the caller MUST re-index the child profile doc in
 * Azure AI Search via /src/lib/rag/updateChildProfile.ts.
 *
 * @param memory - The full updated ChildMemory object.
 * @returns The saved ChildMemory with updated `updatedAt` timestamp.
 * @throws On Supabase error.
 */
export async function upsertChildMemory(
  memory: Omit<ChildMemory, "id" | "updatedAt">
): Promise<ChildMemory> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("child_memory")
    .upsert(
      {
        child_id: memory.childId,
        stable_profile: memory.stableProfile,
        session_history: memory.sessionHistory,
        derived_memory: memory.derivedMemory,
        current_adaptation: memory.currentAdaptation,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "child_id" }
    )
    .select("*")
    .single();

  if (error) {
    throw new Error(`[memory/upsertChildMemory] ${error.message}`);
  }

  return rowToChildMemory(data as ChildMemoryRow);
}

// ── Merge Helper ──────────────────────────────────────────────────────────────

/**
 * Merges a completed session entry into an existing (or empty) ChildMemory record.
 * Appends the session to session_history and applies the new adaptation result.
 * Does NOT write to Supabase — call upsertChildMemory() with the result.
 *
 * @param existing - The current ChildMemory, or null if this is the first session.
 * @param childId - The UUID of the child (needed when existing is null).
 * @param newSession - The SessionMemoryEntry from the completed session.
 * @param updatedStableProfile - Fresh stable profile snapshot from the children table.
 * @returns The merged ChildMemory ready to upsert.
 */
export function mergeSessionIntoMemory(
  existing: ChildMemory | null,
  childId: string,
  newSession: SessionMemoryEntry,
  updatedStableProfile: ChildMemory["stableProfile"]
): Omit<ChildMemory, "id" | "updatedAt"> {
  const previousHistory = existing?.sessionHistory ?? [];
  const previousDerived = existing?.derivedMemory ?? [];

  // Append the new session entry (keep full history — summarisation happens in Phase 9)
  const updatedHistory: SessionMemoryEntry[] = [...previousHistory, newSession];

  // Apply the new adaptation result
  const newAdaptation = newSession.adaptationResult;

  return {
    childId,
    stableProfile: updatedStableProfile,
    sessionHistory: updatedHistory,
    // Derived memory is populated by GPT-4o mini after 3+ sessions (Phase 9)
    derivedMemory: previousDerived,
    currentAdaptation: newAdaptation,
  };
}
