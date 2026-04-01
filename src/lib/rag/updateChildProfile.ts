/**
 * /src/lib/rag/updateChildProfile.ts
 *
 * Re-indexes the child's profile doc in Azure AI Search after memory updates.
 */

import { indexChildProfileDoc } from "@/lib/azure/search";
import type { ChildProfile, ChildSearchDoc, ChildMemory } from "@/types/Child";

/**
 * Builds a ChildSearchDoc from the Supabase child profile and memory record.
 *
 * @param profile - Child profile from Supabase.
 * @param memory - Child memory record.
 * @returns ChildSearchDoc for Azure AI Search.
 */
function buildChildSearchDoc(
  profile: ChildProfile,
  memory: ChildMemory
): ChildSearchDoc {
  return {
    id: profile.id,
    name: profile.name,
    subject: profile.preferredSubject ?? "",
    readingMode: profile.readingMode ?? "",
    storyTone: profile.storyTone ?? "",
    favoriteColor: profile.favoriteColor ?? "",
    favoriteAnimal: profile.favoriteAnimal ?? "",
    personalDetails: profile.latestPersonalDetail ?? "",
    currentDifficulty: memory.currentAdaptation,
    sessionCount: memory.sessionHistory.length,
    lastQuestionAsked: profile.lastQuestionAsked,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Re-indexes the child profile doc in Azure AI Search.
 *
 * @param profile - Child profile from Supabase.
 * @param memory - Updated child memory record.
 */
export async function updateChildProfileIndex(
  profile: ChildProfile,
  memory: ChildMemory
): Promise<void> {
  const doc = buildChildSearchDoc(profile, memory);
  await indexChildProfileDoc(doc);
}

