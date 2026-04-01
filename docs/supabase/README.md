# Supabase Migrations

This folder contains **SQL migrations** that keep the live Supabase schema in sync with
`docs/supabase/schema.sql`.

## How to apply

1. Open Supabase → **SQL Editor**.
2. Paste the migration SQL (from `docs/supabase/migrations/`).
3. Run the query.
4. Go to **Settings → API → Reload schema cache**.

## Recommended workflow

- Treat `docs/supabase/schema.sql` as the **source of truth**.
- Add new migrations in `docs/supabase/migrations/` whenever the schema changes.
- Apply migrations in order to your Supabase project.

## Notes

- Migrations are written to be **safe to re-run** (use `IF NOT EXISTS` where possible).
- If a migration changes column types, ensure existing data can be safely converted.
