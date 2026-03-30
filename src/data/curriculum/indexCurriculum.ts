
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

import { SearchClient, AzureKeyCredential } from "@azure/search-documents";
import * as dotenv from "dotenv";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const animalsData = require("./animals.json");
const spaceData = require("./space.json");
const mathData = require("./math.json");

// Load environment variables from .env.local
dotenv.config({ path: ".env.local" });

// The name of the index we are uploading to
const INDEX_NAME = "talewind-curriculum";

// Combine all curriculum chunks into one array
const allChunks = [...animalsData, ...spaceData, ...mathData];

async function indexCurriculum() {
  console.log("Starting curriculum indexing...");
  console.log(`Total chunks to index: ${allChunks.length}`);

  // Create the search client using our Azure AI Search credentials
  const client = new SearchClient(
    process.env.AZURE_SEARCH_ENDPOINT!,
    INDEX_NAME,
    new AzureKeyCredential(process.env.AZURE_SEARCH_KEY!)
  );

  try {
    // Upload all chunks in one batch
    // Azure AI Search accepts up to 1000 documents per batch
    const result = await client.uploadDocuments(allChunks);

    // Count how many succeeded
    const succeeded = result.results.filter((r) => r.succeeded).length;
    const failed = result.results.filter((r) => !r.succeeded).length;

    console.log(`✅ Indexed ${succeeded} chunks successfully`);

    // Log any failures so we know what to fix
    if (failed > 0) {
      console.error(`❌ Failed to index ${failed} chunks`);
      result.results
        .filter((r) => !r.succeeded)
        .forEach((r) => console.error(`  Failed: ${r.key} — ${r.errorMessage}`));
    }
  } catch (error) {
    console.error("❌ Indexing failed:", error);
    process.exit(1);
  }
}

// Run the function
indexCurriculum();
