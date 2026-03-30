/**
 * /src/lib/supabase/profiles.ts
 *
 * CRUD helpers for the `children` and `parents` Supabase tables.
 * All operations use the service role client — never expose raw rows to clients.
 */

import { getSupabaseServiceClient } from "./client";
import type {
  ChildProfile,
  AccessibilityPreferences,
  Subject,
  ReadingMode,
  StoryTone,
} from "@/types/Child";

// ── Internal row shape (matches Supabase snake_case columns) ──────────────────

interface ChildRow {
  id: string;
  parent_id: string;
  name: string;
  age: number;
  grade: number;
  interests: string[];
  reading_comfort: string;
  preferred_subject: string | null;
  reading_mode: string | null;
  story_tone: string | null;
  favorite_color: string | null;
  favorite_animal: string | null;
  last_question_asked: number;
  latest_personal_detail: string | null;
  accessibility: AccessibilityPreferences;
  created_at: string;
}

/**
 * Maps a raw Supabase children row to a typed ChildProfile object.
 *
 * @param row - Raw row from the `children` table.
 * @returns Typed ChildProfile.
 */
function rowToChildProfile(row: ChildRow): ChildProfile {
  return {
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
    age: row.age,
    grade: row.grade,
    interests: row.interests,
    readingComfort: row.reading_comfort as ChildProfile["readingComfort"],
    preferredSubject: (row.preferred_subject as Subject) ?? null,
    readingMode: (row.reading_mode as ReadingMode) ?? null,
    storyTone: (row.story_tone as StoryTone) ?? null,
    favoriteColor: row.favorite_color,
    favoriteAnimal: row.favorite_animal,
    lastQuestionAsked: row.last_question_asked,
    latestPersonalDetail: row.latest_personal_detail,
    accessibility: row.accessibility,
    createdAt: row.created_at,
  };
}

// ── Child CRUD ────────────────────────────────────────────────────────────────

/**
 * Fetches a child profile by its UUID.
 *
 * @param childId - The UUID of the child record.
 * @returns The typed ChildProfile, or null if not found.
 * @throws On Supabase error.
 */
export async function getChildById(
  childId: string
): Promise<ChildProfile | null> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("children")
    .select("*")
    .eq("id", childId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // not found
    throw new Error(`[profiles/getChildById] ${error.message}`);
  }

  return rowToChildProfile(data as ChildRow);
}

/**
 * Fetches all child profiles belonging to a parent.
 *
 * @param parentId - The UUID of the parent record.
 * @returns Array of typed ChildProfile objects (may be empty).
 * @throws On Supabase error.
 */
export async function getChildrenByParentId(
  parentId: string
): Promise<ChildProfile[]> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("children")
    .select("*")
    .eq("parent_id", parentId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`[profiles/getChildrenByParentId] ${error.message}`);
  }

  return (data as ChildRow[]).map(rowToChildProfile);
}

/**
 * Creates a new child profile row in Supabase.
 *
 * @param input - All required fields for a new child row (omits id and createdAt).
 * @returns The created ChildProfile with its generated UUID.
 * @throws On Supabase error.
 */
export async function createChildProfile(
  input: Omit<ChildProfile, "id" | "createdAt">
): Promise<ChildProfile> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("children")
    .insert({
      parent_id: input.parentId,
      name: input.name,
      age: input.age,
      grade: input.grade,
      interests: input.interests,
      reading_comfort: input.readingComfort,
      preferred_subject: input.preferredSubject ?? null,
      reading_mode: input.readingMode ?? null,
      story_tone: input.storyTone ?? null,
      favorite_color: input.favoriteColor ?? null,
      favorite_animal: input.favoriteAnimal ?? null,
      last_question_asked: input.lastQuestionAsked,
      latest_personal_detail: input.latestPersonalDetail ?? null,
      accessibility: input.accessibility,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`[profiles/createChildProfile] ${error.message}`);
  }

  return rowToChildProfile(data as ChildRow);
}

/**
 * Updates specific fields on an existing child profile.
 * Only the fields provided in the update object are changed.
 *
 * @param childId - The UUID of the child to update.
 * @param updates - Partial ChildProfile fields to update.
 * @returns The updated ChildProfile.
 * @throws On Supabase error or if the child is not found.
 */
export async function updateChildProfile(
  childId: string,
  updates: Partial<
    Pick<
      ChildProfile,
      | "preferredSubject"
      | "readingMode"
      | "storyTone"
      | "favoriteColor"
      | "favoriteAnimal"
      | "lastQuestionAsked"
      | "latestPersonalDetail"
      | "accessibility"
      | "interests"
      | "readingComfort"
    >
  >
): Promise<ChildProfile> {
  const supabase = getSupabaseServiceClient();

  // Map camelCase TS fields to snake_case Supabase columns
  const dbUpdates: Record<string, unknown> = {};
  if (updates.preferredSubject !== undefined)
    dbUpdates.preferred_subject = updates.preferredSubject;
  if (updates.readingMode !== undefined)
    dbUpdates.reading_mode = updates.readingMode;
  if (updates.storyTone !== undefined) dbUpdates.story_tone = updates.storyTone;
  if (updates.favoriteColor !== undefined)
    dbUpdates.favorite_color = updates.favoriteColor;
  if (updates.favoriteAnimal !== undefined)
    dbUpdates.favorite_animal = updates.favoriteAnimal;
  if (updates.lastQuestionAsked !== undefined)
    dbUpdates.last_question_asked = updates.lastQuestionAsked;
  if (updates.latestPersonalDetail !== undefined)
    dbUpdates.latest_personal_detail = updates.latestPersonalDetail;
  if (updates.accessibility !== undefined)
    dbUpdates.accessibility = updates.accessibility;
  if (updates.interests !== undefined) dbUpdates.interests = updates.interests;
  if (updates.readingComfort !== undefined)
    dbUpdates.reading_comfort = updates.readingComfort;

  const { data, error } = await supabase
    .from("children")
    .update(dbUpdates)
    .eq("id", childId)
    .select("*")
    .single();

  if (error) {
    throw new Error(`[profiles/updateChildProfile] ${error.message}`);
  }

  return rowToChildProfile(data as ChildRow);
}

/**
 * Deletes a child profile and all associated data (CASCADE).
 * Cascades to: sessions, child_memory.
 *
 * @param childId - The UUID of the child to delete.
 * @throws On Supabase error.
 */
export async function deleteChildProfile(childId: string): Promise<void> {
  const supabase = getSupabaseServiceClient();

  const { error } = await supabase
    .from("children")
    .delete()
    .eq("id", childId);

  if (error) {
    throw new Error(`[profiles/deleteChildProfile] ${error.message}`);
  }
}

// ── Parent CRUD ───────────────────────────────────────────────────────────────

/**
 * Fetches a parent record by their Supabase Auth user ID.
 * Used to look up the parent context after authentication.
 *
 * @param authId - The Supabase Auth UUID (from the JWT sub claim).
 * @returns The parent row, or null if not found.
 * @throws On Supabase error.
 */
export async function getParentByAuthId(
  authId: string
): Promise<{ id: string; email: string } | null> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("parents")
    .select("id, email")
    .eq("auth_id", authId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`[profiles/getParentByAuthId] ${error.message}`);
  }

  return data as { id: string; email: string };
}
