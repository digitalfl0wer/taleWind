-- ============================================================
-- Talewind — Schema Reconciliation Migration
-- Safe to run multiple times (IF NOT EXISTS where supported).
-- ============================================================

-- 1) parents
ALTER TABLE public.parents
  ADD COLUMN IF NOT EXISTS auth_id UUID;

-- 2) children
ALTER TABLE public.children
  ADD COLUMN IF NOT EXISTS preferred_subject TEXT
    CHECK (preferred_subject IN ('animals', 'space', 'math')),
  ADD COLUMN IF NOT EXISTS reading_mode TEXT
    CHECK (reading_mode IN ('read_to_me', 'read_together')),
  ADD COLUMN IF NOT EXISTS story_tone TEXT
    CHECK (story_tone IN ('calm', 'exciting', 'silly')),
  ADD COLUMN IF NOT EXISTS favorite_color TEXT,
  ADD COLUMN IF NOT EXISTS favorite_animal TEXT,
  ADD COLUMN IF NOT EXISTS last_question_asked SMALLINT NOT NULL DEFAULT -1,
  ADD COLUMN IF NOT EXISTS latest_personal_detail TEXT,
  ADD COLUMN IF NOT EXISTS accessibility JSONB NOT NULL DEFAULT '{
    "reducedMotion": false,
    "dyslexiaFont": false,
    "highContrast": false,
    "largerText": false,
    "captionsEnabled": true,
    "captionFontSize": 18,
    "narrationSpeed": "normal"
  }'::jsonb;

-- 3) child_memory
ALTER TABLE public.child_memory
  ADD COLUMN IF NOT EXISTS current_adaptation TEXT
    NOT NULL DEFAULT 'hold'
    CHECK (current_adaptation IN ('simplify', 'enrich', 'hold'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'child_memory_child_id_key'
      AND conrelid = 'public.child_memory'::regclass
  ) THEN
    ALTER TABLE public.child_memory
      ADD CONSTRAINT child_memory_child_id_key UNIQUE (child_id);
  END IF;
END $$;

-- 4) sessions
ALTER TABLE public.sessions
  ALTER COLUMN story_metadata SET DEFAULT '{}'::jsonb;

-- 5) curriculum_chunks
ALTER TABLE public.curriculum_chunks
  ADD COLUMN IF NOT EXISTS approved BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS embedding_id TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Align curriculum_chunks column types/constraints with schema.sql
ALTER TABLE public.curriculum_chunks
  ALTER COLUMN grade_level TYPE SMALLINT USING grade_level::smallint,
  ALTER COLUMN grade_level SET NOT NULL,
  ALTER COLUMN grade_level SET DEFAULT 1,
  ALTER COLUMN source_label SET NOT NULL,
  ALTER COLUMN approved SET NOT NULL,
  ALTER COLUMN approved SET DEFAULT FALSE;

-- 6) safety_logs (create if missing)
CREATE TABLE IF NOT EXISTS public.safety_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id          UUID REFERENCES public.children(id) ON DELETE SET NULL,
  session_id        UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
  check_type        TEXT NOT NULL CHECK (check_type IN ('story', 'quiz')),
  flagged_text_hash TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7) indexes
CREATE INDEX IF NOT EXISTS idx_curriculum_subject
  ON public.curriculum_chunks (subject)
  WHERE approved = TRUE;

CREATE INDEX IF NOT EXISTS idx_sessions_child_created
  ON public.sessions (child_id, created_at DESC);
