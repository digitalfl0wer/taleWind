/**
 * Curriculum.ts
 * TypeScript types for curriculum chunks stored in Supabase and indexed
 * in the Azure AI Search `talewind-curriculum` index.
 *
 * Imported by: /src/lib/azure/search.ts, /src/lib/rag/retrieveCurriculum.ts,
 *              /src/data/indexCurriculum.ts
 */

import type { Subject } from "./Child";

// ── Curriculum Chunk ──────────────────────────────────────────────────────────

/**
 * A single approved curriculum chunk. One concept per chunk, max 150 words.
 * These are authored in JSON files under /src/data/curriculum/ and indexed
 * into both Supabase (for audit/upload) and Azure AI Search (for retrieval).
 */
export interface CurriculumChunk {
  /** UUID assigned on insert to Supabase. Also used as the Azure AI Search doc key. */
  id: string;
  subject: Subject;
  /** Specific topic within the subject, e.g. "photosynthesis", "fractions". */
  topic: string;
  /** The educational content — max 150 words, first-grade reading level. */
  content: string;
  /** Grade level this content targets. For Talewind MVP this is always 1. */
  gradeLevel: number;
  /** Human-readable label for the curriculum source, e.g. "First Grade Science Standards". */
  sourceLabel: string;
  /**
   * Manual approval flag. Only approved: true chunks are indexed and used
   * for story generation. Parent-uploaded chunks start as false until reviewed.
   */
  approved: boolean;
  /**
   * The Azure AI Search document ID for this chunk.
   * Set to the Supabase UUID on index; null before first index run.
   */
  embeddingId: string | null;
}

// ── Raw JSON curriculum file entry ───────────────────────────────────────────

/**
 * The shape of an entry in the raw curriculum JSON files
 * (/src/data/curriculum/animals.json, space.json, math.json).
 * The `id` and `embeddingId` fields are assigned at index time.
 */
export interface RawCurriculumEntry {
  subject: Subject;
  topic: string;
  content: string;
  grade_level: number;
  source_label: string;
  approved: true; // must be true in authored files
}

// ── Azure AI Search curriculum doc ───────────────────────────────────────────

/**
 * The shape of a document stored in the `talewind-curriculum` Azure AI Search index.
 * Matches the field schema defined in /docs/azure/search-indexes.json.
 */
export interface CurriculumSearchDoc {
  /** Primary key — must be the chunk's UUID. */
  id: string;
  subject: string;
  topic: string;
  content: string;
  gradeLevel: number;
  sourceLabel: string;
  approved: boolean;
}
