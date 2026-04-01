
/**
 * indexCurriculum.ts
 *
 * Run this script once to upload all curriculum chunks
 * to the talewind-curriculum Azure AI Search index.
 *
 * Run with (ESM project): node --loader ts-node/esm src/data/curriculum/indexCurriculum.ts
 * Why: this repo uses "type": "module", so Node needs the ts-node ESM loader for .ts files.
 * JSON is loaded via createRequire for compatibility with this loader setup.
 */

import * as dotenv from "dotenv";
import { createRequire } from "node:module";
import type {
  CurriculumSearchDoc,
  RawCurriculumEntry,
} from "../../types/Curriculum.ts";
import { indexCurriculumChunks } from "../../lib/azure/search.ts";
import { getSupabaseServiceClient } from "../../lib/supabase/client.ts";

/**
 * Raw curriculum entry as stored in JSON files.
 * grade_level is authored as a string in the JSON files.
 */
interface RawCurriculumFileEntry extends Omit<RawCurriculumEntry, "grade_level"> {
  id: string;
  grade_level: string | number;
}

const require = createRequire(import.meta.url);

const animalsData = require("./animals.json") as RawCurriculumFileEntry[];
const spaceData = require("./space.json") as RawCurriculumFileEntry[];
const mathData = require("./math.json") as RawCurriculumFileEntry[];

// Load environment variables from .env.local
dotenv.config({ path: ".env.local" });

// Combine all curriculum chunks into one array
const allChunks: RawCurriculumFileEntry[] = [
  ...animalsData,
  ...spaceData,
  ...mathData,
];

/**
 * Maps a raw JSON curriculum entry to a Supabase row shape.
 *
 * @param entry - Raw curriculum entry from JSON files.
 * @returns Row object ready for Supabase upsert.
 */
function mapEntryToSupabaseRow(entry: RawCurriculumFileEntry): {
  subject: RawCurriculumEntry["subject"];
  topic: string;
  content: string;
  grade_level: number;
  source_label: string;
  approved: boolean;
  embedding_id: string;
} {
  return {
    subject: entry.subject,
    topic: entry.topic,
    content: entry.content,
    grade_level: Number.parseInt(String(entry.grade_level), 10),
    source_label: entry.source_label,
    approved: entry.approved,
    embedding_id: entry.id,
  };
}

/**
 * Maps a raw JSON curriculum entry to an Azure AI Search document.
 *
 * @param entry - Raw curriculum entry from JSON files.
 * @returns CurriculumSearchDoc for indexing.
 */
function mapEntryToSearchDoc(entry: RawCurriculumFileEntry): CurriculumSearchDoc {
  return {
    id: entry.id,
    subject: entry.subject,
    topic: entry.topic,
    content: entry.content,
    gradeLevel: Number.parseInt(String(entry.grade_level), 10),
    sourceLabel: entry.source_label,
    approved: entry.approved,
  };
}

/**
 * Indexes curriculum chunks to Supabase and Azure AI Search.
 *
 * @returns Promise<void>
 */
async function indexCurriculum(): Promise<void> {
  console.log("Starting curriculum indexing...");
  console.log(`Total chunks to index: ${allChunks.length}`);

  const supabaseRows = allChunks.map(mapEntryToSupabaseRow);
  const searchDocs = allChunks.map(mapEntryToSearchDoc);

  let supabaseUpserts = 0;

  try {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("curriculum_chunks")
      .insert(supabaseRows)
      .select("id");

    if (error) {
      console.error("[indexCurriculum] Supabase upsert failed:", error.message);
    } else {
      supabaseUpserts = data?.length ?? 0;
      console.log(`✅ Supabase upserts: ${supabaseUpserts}`);
    }
  } catch (error) {
    console.error(
      "[indexCurriculum] Supabase upsert error:",
      error instanceof Error ? error.message : "Unknown error"
    );
  }

  try {
    const indexedCount = await indexCurriculumChunks(searchDocs);
    console.log(`✅ Azure docs indexed: ${indexedCount}`);
  } catch (error) {
    console.error(
      "[indexCurriculum] Azure indexing failed:",
      error instanceof Error ? error.message : "Unknown error"
    );
    process.exit(1);
  }
}

// Run the function
indexCurriculum().catch((error) => {
  console.error(
    "[indexCurriculum] Unhandled error:",
    error instanceof Error ? error.message : error
  );
  console.error(error);
  process.exit(1);
});
