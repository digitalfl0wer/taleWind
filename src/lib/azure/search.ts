/**
 * /src/lib/azure/search.ts
 *
 * Azure AI Search retrieval and indexing helpers.
 * Covers both indexes:
 *   - talewind-curriculum  — used by the Story Agent (RAG retrieval)
 *   - talewind-children    — used by the Story Agent (child profile lookup)
 *                           and updated after every session
 *
 * Rules enforced here:
 * - Only queries talewind-curriculum and talewind-children — no external search
 * - All operations wrapped in try/catch with meaningful error messages
 * - Never logs child personal data in error messages
 */

import {
  SearchClient,
  SearchIndexClient,
  AzureKeyCredential,
  type SearchOptions,
} from "@azure/search-documents";
import type { CurriculumSearchDoc } from "@/types/Curriculum";
import type { ChildSearchDoc } from "@/types/Child";
import type { Subject } from "@/types/Child";

// ── Client factories ──────────────────────────────────────────────────────────

/**
 * Returns credentials and endpoint for Azure AI Search.
 * Reads from environment variables.
 *
 * @throws If required environment variables are missing.
 */
function getSearchCredentials(): {
  endpoint: string;
  credential: AzureKeyCredential;
} {
  const endpoint = process.env.AZURE_SEARCH_ENDPOINT?.trim();
  const key = process.env.AZURE_SEARCH_KEY?.trim();

  if (!endpoint || !key) {
    throw new Error(
      "[azure/search] Missing AZURE_SEARCH_ENDPOINT or AZURE_SEARCH_KEY"
    );
  }

  return { endpoint, credential: new AzureKeyCredential(key) };
}

/**
 * Returns a SearchClient for the talewind-curriculum index.
 *
 * @returns Typed SearchClient<CurriculumSearchDoc>.
 */
function getCurriculumSearchClient(): SearchClient<CurriculumSearchDoc> {
  const { endpoint, credential } = getSearchCredentials();
  const indexName =
    process.env.AZURE_SEARCH_CURRICULUM_INDEX?.trim() ?? "talewind-curriculum";
  return new SearchClient<CurriculumSearchDoc>(endpoint, indexName, credential);
}

/**
 * Returns a SearchClient for the talewind-children index.
 *
 * @returns Typed SearchClient<ChildSearchDoc>.
 */
function getChildrenSearchClient(): SearchClient<ChildSearchDoc> {
  const { endpoint, credential } = getSearchCredentials();
  const indexName =
    process.env.AZURE_SEARCH_CHILDREN_INDEX?.trim() ?? "talewind-children";
  return new SearchClient<ChildSearchDoc>(endpoint, indexName, credential);
}

/**
 * Returns a SearchIndexClient for index management operations (upsert/create).
 *
 * @returns SearchIndexClient.
 */
function getIndexManagementClient(): SearchIndexClient {
  const { endpoint, credential } = getSearchCredentials();
  return new SearchIndexClient(endpoint, credential);
}

// ── Curriculum retrieval ──────────────────────────────────────────────────────

/**
 * Retrieves 3–5 approved curriculum chunks for a given subject.
 * Used by the Story Agent before every story generation call.
 *
 * Filters to approved: true and the specified subject, then performs
 * a keyword search over the topic and content fields.
 *
 * @param subject - The subject to filter by ("animals" | "space" | "math").
 * @param searchText - Optional keyword query (e.g. the child's interests). Defaults to "*".
 * @param topK - Number of chunks to return (default 4, range 3–5).
 * @returns Array of CurriculumSearchDoc results.
 * @throws On Azure Search error.
 */
export async function retrieveCurriculumChunks(
  subject: Subject,
  searchText = "*",
  topK = 4
): Promise<CurriculumSearchDoc[]> {
  const client = getCurriculumSearchClient();

  const options: SearchOptions<CurriculumSearchDoc> = {
    filter: `subject eq '${subject}' and approved eq true`,
    top: Math.min(Math.max(topK, 3), 5), // clamp between 3 and 5
    select: ["id", "subject", "topic", "content", "gradeLevel", "sourceLabel", "approved"],
  };

  try {
    const results = await client.search(searchText, options);
    const chunks: CurriculumSearchDoc[] = [];

    for await (const result of results.results) {
      chunks.push(result.document);
    }

    return chunks;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown search error";
    throw new Error(
      `[azure/search] retrieveCurriculumChunks(${subject}) failed: ${message}`
    );
  }
}

// ── Child profile retrieval ───────────────────────────────────────────────────

/**
 * Retrieves the full child profile doc from the talewind-children index by child ID.
 * Always call this BEFORE story generation — never generate without child context.
 *
 * @param childId - The UUID of the child (matches the document key field).
 * @returns The ChildSearchDoc, or null if the document does not exist yet.
 * @throws On Azure Search error (other than not-found).
 */
export async function retrieveChildProfileDoc(
  childId: string
): Promise<ChildSearchDoc | null> {
  const client = getChildrenSearchClient();

  try {
    const result = await client.getDocument(childId);
    return result ?? null;
  } catch (err) {
    // Azure Search throws a 404-like error when the document doesn't exist
    if (err instanceof Error && err.message.includes("404")) {
      return null;
    }
    // Never log child ID in the error message — log session context only
    const message =
      err instanceof Error ? err.message : "Unknown search error";
    throw new Error(
      `[azure/search] retrieveChildProfileDoc failed: ${message}`
    );
  }
}

// ── Child profile indexing ────────────────────────────────────────────────────

/**
 * Upserts a child profile doc into the talewind-children index.
 * Call this after every session memory update.
 * Uses mergeOrUpload so partial updates don't overwrite the full doc.
 *
 * @param doc - The full ChildSearchDoc to index. Must include the child UUID as `id`.
 * @throws On Azure Search error.
 */
export async function indexChildProfileDoc(doc: ChildSearchDoc): Promise<void> {
  const client = getChildrenSearchClient();

  try {
    const result = await client.mergeOrUploadDocuments([doc]);
    const failed = result.results.filter((r) => !r.succeeded);

    if (failed.length > 0) {
      throw new Error(
        `[azure/search] indexChildProfileDoc: ${failed.length} document(s) failed to index.`
      );
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown indexing error";
    throw new Error(
      `[azure/search] indexChildProfileDoc failed: ${message}`
    );
  }
}

// ── Curriculum chunk indexing ─────────────────────────────────────────────────

/**
 * Upserts one or more curriculum chunk docs into the talewind-curriculum index.
 * Used by the indexCurriculum.ts script (Phase 4) and the parent upload flow (Phase 10).
 *
 * @param docs - Array of CurriculumSearchDoc objects to index.
 * @returns Number of successfully indexed documents.
 * @throws On Azure Search error.
 */
export async function indexCurriculumChunks(
  docs: CurriculumSearchDoc[]
): Promise<number> {
  if (docs.length === 0) return 0;

  const client = getCurriculumSearchClient();

  try {
    const result = await client.mergeOrUploadDocuments(docs);
    const succeeded = result.results.filter((r) => r.succeeded).length;
    const failed = result.results.filter((r) => !r.succeeded).length;

    if (failed > 0) {
      console.error(
        `[azure/search] indexCurriculumChunks: ${failed} doc(s) failed to index.`
      );
    }

    return succeeded;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown indexing error";
    throw new Error(
      `[azure/search] indexCurriculumChunks failed: ${message}`
    );
  }
}

// ── Export index management client for index setup scripts ───────────────────

export { getIndexManagementClient };
