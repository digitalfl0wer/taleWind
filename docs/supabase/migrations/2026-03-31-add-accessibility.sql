-- Add accessibility JSONB column to children table (if missing)
ALTER TABLE children
ADD COLUMN IF NOT EXISTS accessibility JSONB NOT NULL DEFAULT '{
  "reducedMotion": false,
  "dyslexiaFont": false,
  "highContrast": false,
  "largerText": false,
  "captionsEnabled": true,
  "captionFontSize": 18,
  "narrationSpeed": "normal"
}';

-- Backfill nulls if any existing rows predate the column
UPDATE children
SET accessibility = '{
  "reducedMotion": false,
  "dyslexiaFont": false,
  "highContrast": false,
  "largerText": false,
  "captionsEnabled": true,
  "captionFontSize": 18,
  "narrationSpeed": "normal"
}'
WHERE accessibility IS NULL;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
