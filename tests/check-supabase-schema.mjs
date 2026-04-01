import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing env vars. Require NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const REQUIRED = {
  parents: ["id", "email", "year_of_birth_pin", "created_at", "auth_id"],
  children: [
    "id",
    "parent_id",
    "name",
    "age",
    "grade",
    "interests",
    "reading_comfort",
    "preferred_subject",
    "reading_mode",
    "story_tone",
    "favorite_color",
    "favorite_animal",
    "last_question_asked",
    "latest_personal_detail",
    "accessibility",
    "created_at",
  ],
  child_memory: [
    "id",
    "child_id",
    "stable_profile",
    "session_history",
    "derived_memory",
    "current_adaptation",
    "updated_at",
  ],
  sessions: [
    "id",
    "child_id",
    "subject",
    "story_metadata",
    "quiz_score",
    "adaptation_result",
    "created_at",
  ],
  curriculum_chunks: [
    "id",
    "subject",
    "topic",
    "content",
    "grade_level",
    "source_label",
    "approved",
    "embedding_id",
    "created_at",
  ],
  safety_logs: [
    "id",
    "child_id",
    "session_id",
    "check_type",
    "flagged_text_hash",
    "created_at",
  ],
};

async function checkColumn(table, column) {
  const { error } = await supabase.from(table).select(column, { head: true });
  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true };
}

async function checkTable(table, columns) {
  const missing = [];
  const errors = [];

  for (const column of columns) {
    // eslint-disable-next-line no-await-in-loop
    const result = await checkColumn(table, column);
    if (!result.ok) {
      if (result.message?.includes("does not exist")) {
        missing.push(column);
      } else {
        errors.push(`${column}: ${result.message}`);
      }
    }
  }

  return { missing, errors };
}

async function run() {
  const report = {};

  for (const [table, columns] of Object.entries(REQUIRED)) {
    // eslint-disable-next-line no-await-in-loop
    const result = await checkTable(table, columns);
    report[table] = result;
  }

  console.log("\nSupabase schema audit (read-only)");
  for (const [table, { missing, errors }] of Object.entries(report)) {
    if (missing.length === 0 && errors.length === 0) {
      console.log(`✅ ${table}: OK`);
      continue;
    }
    console.log(`\n❌ ${table}:`);
    if (missing.length) {
      console.log(`  Missing columns: ${missing.join(", ")}`);
    }
    if (errors.length) {
      console.log(`  Other errors:`);
      for (const err of errors) {
        console.log(`    - ${err}`);
      }
    }
  }

  console.log(
    "\nNote: This test cannot verify unique constraints/indexes via PostgREST."
  );
}

run().catch((err) => {
  console.error("Schema audit failed:", err);
  process.exit(1);
});
