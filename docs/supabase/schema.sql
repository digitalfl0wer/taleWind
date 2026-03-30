-- ============================================================
-- Talewind — Supabase Schema
-- Run this in the Supabase SQL editor to create all tables.
-- Uses CREATE TABLE IF NOT EXISTS — safe to run against an
-- existing database; already-created tables are skipped.
-- Enable Row Level Security (RLS) for Phase 12 hardening.
-- ============================================================

-- ── Extensions ───────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── 1. parents ────────────────────────────────────────────────────────────────
-- One row per parent account. Auth is handled by Supabase Auth;
-- this table holds additional profile data and the year-of-birth PIN.

CREATE TABLE IF NOT EXISTS parents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Supabase Auth user ID — references auth.users
  auth_id           UUID UNIQUE NOT NULL,
  email             TEXT NOT NULL,
  -- Year-of-birth PIN (bcrypt hashed — see Phase 12 task 12.7)
  year_of_birth_pin TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE parents IS
  'One row per parent account. PIN is bcrypt-hashed before storage.';

-- ── 2. children ───────────────────────────────────────────────────────────────
-- One row per child profile. A parent may have multiple children (Phase 2).

CREATE TABLE IF NOT EXISTS children (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id              UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  name                   TEXT NOT NULL,
  age                    SMALLINT NOT NULL CHECK (age BETWEEN 4 AND 10),
  grade                  SMALLINT NOT NULL CHECK (grade BETWEEN 0 AND 3),
  interests              TEXT[] NOT NULL DEFAULT '{}',
  -- "beginner" | "developing" | "confident"
  reading_comfort        TEXT NOT NULL DEFAULT 'beginner'
                         CHECK (reading_comfort IN ('beginner', 'developing', 'confident')),
  -- "animals" | "space" | "math" | NULL (not yet set)
  preferred_subject      TEXT CHECK (preferred_subject IN ('animals', 'space', 'math')),
  -- "read_to_me" | "read_together" | NULL
  reading_mode           TEXT CHECK (reading_mode IN ('read_to_me', 'read_together')),
  -- "calm" | "exciting" | "silly" | NULL
  story_tone             TEXT CHECK (story_tone IN ('calm', 'exciting', 'silly')),
  favorite_color         TEXT,
  favorite_animal        TEXT,
  -- Index of last rotating RAG question asked (-1 = none asked beyond Q1+Q2)
  last_question_asked    SMALLINT NOT NULL DEFAULT -1,
  latest_personal_detail TEXT,
  -- Accessibility preferences — shape matches AccessibilityPreferences in /src/types/Child.ts
  accessibility          JSONB NOT NULL DEFAULT '{
    "reducedMotion": false,
    "dyslexiaFont": false,
    "highContrast": false,
    "largerText": false,
    "captionsEnabled": true,
    "captionFontSize": 18,
    "narrationSpeed": "normal"
  }',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE children IS
  'Child profiles created during Magic Door intake and managed by parents.';

-- ── 3. curriculum_chunks ──────────────────────────────────────────────────────
-- Stores approved curriculum content chunks. Authored in JSON files under
-- /src/data/curriculum/ and indexed into Azure AI Search talewind-curriculum.
-- Parents can upload additional chunks (Phase 10).

CREATE TABLE IF NOT EXISTS curriculum_chunks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject       TEXT NOT NULL CHECK (subject IN ('animals', 'space', 'math')),
  topic         TEXT NOT NULL,
  -- max 150 words, first-grade reading level
  content       TEXT NOT NULL,
  grade_level   SMALLINT NOT NULL DEFAULT 1,
  source_label  TEXT NOT NULL,
  -- Only approved = true chunks are indexed and served to the Story Agent
  approved      BOOLEAN NOT NULL DEFAULT FALSE,
  -- Azure AI Search document ID — NULL before first index run
  embedding_id  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE curriculum_chunks IS
  'Approved curriculum chunks indexed into Azure AI Search for RAG retrieval.';

CREATE INDEX IF NOT EXISTS idx_curriculum_subject
  ON curriculum_chunks (subject)
  WHERE approved = TRUE;

-- ── 4. sessions ───────────────────────────────────────────────────────────────
-- One row written after every completed quiz session.

CREATE TABLE IF NOT EXISTS sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id          UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  subject           TEXT NOT NULL CHECK (subject IN ('animals', 'space', 'math')),
  -- story_metadata: JSON blob — storyId, title, tone, sceneCount, topicsCovered, chunkIds
  story_metadata    JSONB NOT NULL DEFAULT '{}',
  -- 0–100, NULL if session ended before quiz
  quiz_score        SMALLINT CHECK (quiz_score BETWEEN 0 AND 100),
  -- "simplify" | "enrich" | "hold" | NULL
  adaptation_result TEXT CHECK (adaptation_result IN ('simplify', 'enrich', 'hold')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE sessions IS
  'One row per completed story+quiz session. Used for parent dashboard and memory updates.';

CREATE INDEX IF NOT EXISTS idx_sessions_child_created
  ON sessions (child_id, created_at DESC);

-- ── 5. child_memory ───────────────────────────────────────────────────────────
-- One row per child — the three-layer memory record (stable, session, derived).
-- Updated after every completed session and re-indexed in Azure AI Search.

CREATE TABLE IF NOT EXISTS child_memory (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id           UUID NOT NULL UNIQUE REFERENCES children(id) ON DELETE CASCADE,
  -- Snapshot of key ChildProfile fields — shape matches ChildMemory.stableProfile
  stable_profile     JSONB NOT NULL DEFAULT '{}',
  -- Array of SessionMemoryEntry objects, newest last
  session_history    JSONB NOT NULL DEFAULT '[]',
  -- Array of natural-language inference strings (2–4 entries after 3+ sessions)
  derived_memory     JSONB NOT NULL DEFAULT '[]',
  -- "simplify" | "enrich" | "hold"
  current_adaptation TEXT NOT NULL DEFAULT 'hold'
    CHECK (current_adaptation IN ('simplify', 'enrich', 'hold')),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE child_memory IS
  'Three-layer child memory (stable, session, derived). Synced to Azure AI Search after every session.';

-- ── 6. safety_logs ────────────────────────────────────────────────────────────
-- Audit log for safety check violations (Phase 12 task 12.9).
-- Never exposed to child or parent UI.

CREATE TABLE IF NOT EXISTS safety_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id          UUID REFERENCES children(id) ON DELETE SET NULL,
  session_id        UUID REFERENCES sessions(id) ON DELETE SET NULL,
  check_type        TEXT NOT NULL CHECK (check_type IN ('story', 'quiz')),
  -- SHA-256 hash of the flagged text — never store plaintext
  flagged_text_hash TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE safety_logs IS
  'Audit log for content safety violations. Stores hashed text only, never plaintext.';

-- ── Row Level Security ────────────────────────────────────────────────────────
-- RLS is enabled on all tables now. Policies are written in Phase 12.
-- The Supabase service role key bypasses RLS server-side by default —
-- client-side anon key access is blocked until policies are added.

ALTER TABLE parents           ENABLE ROW LEVEL SECURITY;
ALTER TABLE children          ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE child_memory      ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety_logs       ENABLE ROW LEVEL SECURITY;
