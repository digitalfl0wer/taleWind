import dotenv from "dotenv";
dotenv.config({ path: ".env.local" }, { quiet: true });

const SPEECH_KEY = process.env.AZURE_SPEECH_KEY;
const SPEECH_REGION = process.env.AZURE_SPEECH_REGION;

async function testSpeechVoices() {
  console.log("Testing Azure Speech connection...");
  console.log(`Region: ${SPEECH_REGION}`);

  if (!SPEECH_KEY || !SPEECH_REGION) {
    console.error("❌ Missing AZURE_SPEECH_KEY or AZURE_SPEECH_REGION in .env.local");
    return;
  }

  try {
    // Step 1 — Hit the voices list endpoint
    const response = await fetch(
      `https://${SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/voices/list`,
      {
        method: "GET",
        headers: {
          "Ocp-Apim-Subscription-Key": SPEECH_KEY,
        },
      }
    );

    if (!response.ok) {
      console.error(`❌ Azure Speech failed: ${response.status} ${response.statusText}`);
      return;
    }

    const voices = await response.json();
    console.log(`✅ Azure Speech connected — total voices available: ${voices.length}`);

    // Step 2 — Find AnaNeural specifically
    const ana = voices.find((v) => v.ShortName === "en-US-AnaNeural");
    if (ana) {
      console.log(`✅ AnaNeural found:`);
      console.log(`   Name: ${ana.ShortName}`);
      console.log(`   Display: ${ana.DisplayName}`);
      console.log(`   Gender: ${ana.Gender}`);
      console.log(`   Status: ${ana.Status}`);
      console.log(`   Words/min: ${ana.WordsPerMinute}`);
    } else {
      console.warn("⚠️  AnaNeural not found in Sweden Central — may need a different region");
    }

    // Step 3 — Find AriaNeural and confirm cheerful style
    const amber = voices.find((v) => v.ShortName === "en-US-AmberNeural");
    if (amber) {
      console.log(`✅ Amber found:`);
      console.log(`   Name: ${amber.ShortName}`);
      console.log(`   Display: ${amber.DisplayName}`);
    
    } else {
      console.warn("⚠️  AriaNeural not found");
    }

  } catch (err) {
    console.error("❌ Azure Speech error:", err.message);
  }
}

async function testTTSOutput() {
  console.log("\nTesting TTS audio generation (Spriggle voice)...");

  try {
    // Build the SSML for Spriggle's greeting
    const ssml = `
      <speak version='1.0' xml:lang='en-US'>
        <voice name='en-US-AnaNeural'>
          <prosody rate='+5%' pitch='+10%'>
            Hi! I'm Spriggle! What's your name?
          </prosody>
        </voice>
      </speak>
    `;
    // Narration test — Amber
    const narrationSSML = `
      <speak version='1.0'
        xmlns='http://www.w3.org/2001/10/synthesis'
        xml:lang='en-US'>
        <voice name='en-US-AmberNeural'>
          <prosody rate='0%' pitch='0%'>
            Lions live in groups called prides.
            A pride has many lions who work together.
            They hunt at night when it is cool.
          </prosody>
        </voice>
      </speak>
    `;
    const response = await fetch(
      `https://${SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`,
      {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": SPEECH_KEY,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": "audio-16khz-128kbitrate-mono-mp3",
        },
        body: ssml,
      }
    );

    if (!response.ok) {
      console.error(`❌ TTS generation failed: ${response.status} ${response.statusText}`);
      return;
    }

    // Save the audio file so you can actually hear it
    const buffer = await response.arrayBuffer();
    const fs = await import("fs");
    fs.writeFileSync("tests/spriggle-test.mp3", Buffer.from(buffer));

    console.log(`✅ TTS audio generated successfully`);
    console.log(`   File saved: tests/spriggle-test.mp3`);
    console.log(`   Open that file to hear Spriggle's voice!`);

  } catch (err) {
    console.error("❌ TTS generation error:", err.message);
  }
}

// Run both tests
testSpeechVoices().then(() => testTTSOutput());
