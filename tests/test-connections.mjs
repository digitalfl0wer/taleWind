import { AzureOpenAI } from "openai";
import { SearchClient, AzureKeyCredential } from "@azure/search-documents";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function testOpenAI() {
  try {
    const client = new AzureOpenAI({
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      apiKey: process.env.AZURE_OPENAI_KEY,
      apiVersion: "2024-10-21",
      deployment: process.env.AZURE_OPENAI_DEPLOYMENT,
    });

    const result = await client.chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT,
      messages: [{ role: "user", content: "Say hello from Talewind!" }],
      max_tokens: 50,
    });

    console.log("✅ Azure OpenAI connected:", result.choices[0].message.content);
  } catch (err) {
    console.error("❌ Azure OpenAI failed:", err.message);
  }
}

async function testSearch() {
  try {
    const client = new SearchClient(
      process.env.AZURE_SEARCH_ENDPOINT,
      "talewind-curriculum",
      new AzureKeyCredential(process.env.AZURE_SEARCH_KEY)
    );

    const count = await client.getDocumentsCount();
    console.log("✅ Azure AI Search connected. Documents in index:", count);
  } catch (err) {
    console.error("❌ Azure AI Search failed:", err.message);
  }
}

async function testSupabase() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    const { data, error } = await supabase.from("children").select("count");
    if (error) throw error;
    console.log("✅ Supabase connected");
  } catch (err) {
    console.error("❌ Supabase failed:", err.message);
  }
}

Promise.all([testOpenAI(), testSearch(), testSupabase()]).then(() => {
  console.log("\n🌀 Talewind connection test complete!");
});