/**
 * Session.ts
 * TypeScript types for session records stored in the `sessions` Supabase table.
 *
 * Imported by: /src/lib/supabase/sessions.ts, /src/app/api/story/route.ts,
 *              /src/app/api/quiz/route.ts
 */

import type { Subject, StoryTone } from "./Child";

// ── Story Metadata (stored as JSON in the sessions row) ───────────────────────

/**
 * JSON blob stored in sessions.story_metadata.
 * Provides the parent dashboard with a human-readable session summary.
 */
export interface StoryMetadata {
  storyId: string;
  storyTitle: string;
  tone: StoryTone;
  sceneCount: number;
  /** IDs of curriculum chunks used in this story. */
  curriculumChunkIds: string[];
  /** Topics covered — derived from chunk metadata. */
  topicsCovered: string[];
}

// ── Session Record ────────────────────────────────────────────────────────────

/**
 * A full session record as stored in the `sessions` Supabase table.
 * One row is written after every completed quiz session.
 */
export interface SessionRecord {
  id: string;
  childId: string;
  subject: Subject;
  storyMetadata: StoryMetadata;
  /**
   * Aggregated quiz score 0–100. Null if the session ended before the quiz.
   */
  quizScore: number | null;
  /**
   * Adaptation directive derived from the quiz score.
   * Null if no quiz was completed.
   */
  adaptationResult: "simplify" | "enrich" | "hold" | null;
  createdAt: string; // ISO 8601
}

// ── Session Create Input ──────────────────────────────────────────────────────

/**
 * Input shape for supabase/sessions.ts createSession().
 * Omits auto-generated fields (id, createdAt).
 */
export type SessionCreateInput = Omit<SessionRecord, "id" | "createdAt">;
