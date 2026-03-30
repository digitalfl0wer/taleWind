import { AzureOpenAI } from "openai";
import { SearchClient, AzureKeyCredential } from "@azure/search-documents";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
  // const OpenAI = require("openai");
async function testOpenAI() {
  try {
  
    
    const client = new AzureOpenAI({
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      apiKey: process.env.AZURE_OPENAI_KEY,
      deployment: process.env.AZURE_OPENAI_DEPLOYMENT,
      apiVersion: "2024-10-21",
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

async function testSpeech() {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION ?? "swedencentral";

  if (!key) {
    console.error("❌ Azure Speech failed: missing AZURE_SPEECH_KEY");
    return;
  }

  try {
    const response = await fetch(
      `https://${region}.tts.speech.microsoft.com/cognitiveservices/voices/list`,
      {
        method: "GET",
        headers: { "Ocp-Apim-Subscription-Key": key },
      }
    );

    if (!response.ok) {
      console.error(`❌ Azure Speech failed: ${response.status} ${response.statusText}`);
      return;
    }

    const voices = await response.json();
    const ana = voices.find((v) => v.ShortName === "en-US-AnaNeural");
    const amber = voices.find((v) => v.ShortName === "en-US-AmberNeural");

    console.log(`✅ Azure Speech connected (${voices.length} voices, region: ${region})`);
    console.log(`   AnaNeural (Spriggle):  ${ana ? "✅ found" : "⚠️  NOT FOUND"}`);
    console.log(`   AmberNeural (narration): ${amber ? "✅ found" : "⚠️  NOT FOUND"}`);
  } catch (err) {
    console.error("❌ Azure Speech failed:", err.message);
  }
}

Promise.all([testOpenAI(), testSearch(), testSupabase(), testSpeech()]).then(() => {
  console.log("\n🌀 Talewind connection test complete!");
});