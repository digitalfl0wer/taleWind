/**
 * /src/lib/azure/speech.ts
 *
 * Azure AI Speech helpers for TTS (Text-to-Speech) and STT (Speech-to-Text).
 *
 * TTS:
 *   - Returns an audio buffer and word-level timing array for caption sync
 *   - Applies Spriggle SSML (+5% rate, +10% pitch) for Spriggle voice
 *   - Applies cheerful style for narration voice (en-US-AriaNeural)
 *
 * STT:
 *   - Streams from a provided audio buffer (server-side use)
 *   - 8-second timeout, re-prompt signal on silence
 *   - Bounded command allowlist matching (not regex catch-all)
 *
 * NOTE: The microsoft-cognitiveservices-speech-sdk is designed for browser/Node
 * environments. In Next.js API routes we use the Node SDK via push-stream.
 */

import * as sdk from "microsoft-cognitiveservices-speech-sdk";

// ── Types ─────────────────────────────────────────────────────────────────────

/** A single word with its start time and duration, used for caption sync. */
export interface WordTiming {
  word: string;
  /** Offset in milliseconds from the start of the audio. */
  offsetMs: number;
  /** Duration of the word in milliseconds. */
  durationMs: number;
}

/** Result of a TTS call. */
export interface TtsResult {
  /** Raw PCM/WAV audio buffer. */
  audioBuffer: Buffer;
  /** Word-level timing for synchronized captions. */
  wordTimings: WordTiming[];
  success: boolean;
  errorMessage: string | null;
}

/** Which voice to use for TTS. */
export type VoiceRole = "spriggle" | "narration";

/** Result of an STT call. */
export interface SttResult {
  /** The recognized text. Empty string on silence or timeout. */
  transcript: string;
  /**
   * "recognized"  — STT returned a result
   * "silence"     — 8s timeout elapsed with no speech detected
   * "unrecognized"— speech detected but not understood
   * "error"       — SDK or network error
   */
  status: "recognized" | "silence" | "unrecognized" | "error";
  errorMessage: string | null;
}

// ── SSML builders ─────────────────────────────────────────────────────────────

/**
 * Builds an SSML string for Spriggle's voice.
 * Applies +5% rate and +10% pitch above baseline, per PRD spec.
 *
 * @param text - The text to speak.
 * @param voiceName - The Azure Neural voice name.
 * @returns SSML string ready for the Speech SDK.
 */
function buildSpriggleSsml(text: string, voiceName: string): string {
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
  <voice name="${voiceName}">
    <prosody rate="+5%" pitch="+10%">
      ${escapeXml(text)}
    </prosody>
  </voice>
</speak>`;
}

/**
 * Builds an SSML string for story narration voice with cheerful style.
 *
 * @param text - The scene narration text.
 * @param voiceName - The Azure Neural voice name.
 * @returns SSML string ready for the Speech SDK.
 */
function buildNarrationSsml(text: string, voiceName: string): string {
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="en-US">
  <voice name="${voiceName}">
    <mstts:express-as style="cheerful">
      ${escapeXml(text)}
    </mstts:express-as>
  </voice>
</speak>`;
}

/**
 * Escapes special XML characters in text to prevent SSML injection.
 *
 * @param text - Raw text from story/quiz output (already safety-checked).
 * @returns XML-safe string.
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ── Client factory ────────────────────────────────────────────────────────────

/**
 * Returns a configured SpeechConfig instance.
 * Reads credentials from environment variables.
 *
 * @throws If required environment variables are missing.
 */
function getSpeechConfig(): sdk.SpeechConfig {
  const key = process.env.AZURE_SPEECH_KEY?.trim();
  const region = process.env.AZURE_SPEECH_REGION?.trim() ?? "swedencentral";

  if (!key) {
    throw new Error(
      "[azure/speech] Missing AZURE_SPEECH_KEY environment variable."
    );
  }

  const config = sdk.SpeechConfig.fromSubscription(key, region);
  config.speechSynthesisOutputFormat =
    sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;

  return config;
}

// ── TTS ───────────────────────────────────────────────────────────────────────

/**
 * Converts text to speech using Azure AI Speech.
 * Returns the audio buffer and word-level timing data for caption synchronization.
 *
 * Uses SSML to apply voice-specific prosody:
 *   - spriggle: +5% rate, +10% pitch (en-US-AnaNeural)
 *   - narration: cheerful style (en-US-AriaNeural)
 *
 * @param text - The text to synthesize. Must be safety-checked before calling.
 * @param role - Which voice to use: "spriggle" or "narration".
 * @returns TtsResult with audio buffer and word timings.
 */
export async function synthesizeSpeech(
  text: string,
  role: VoiceRole
): Promise<TtsResult> {
  const spriggleVoice =
    process.env.AZURE_SPEECH_VOICE_SPRIGGLE ?? "en-US-AnaNeural";
  const narrationVoice =
    process.env.AZURE_SPEECH_VOICE_NARRATION ?? "en-US-AriaNeural";

  const voiceName = role === "spriggle" ? spriggleVoice : narrationVoice;
  const ssml =
    role === "spriggle"
      ? buildSpriggleSsml(text, voiceName)
      : buildNarrationSsml(text, voiceName);

  return new Promise<TtsResult>((resolve) => {
    let config: sdk.SpeechConfig;
    try {
      config = getSpeechConfig();
    } catch (err) {
      resolve({
        audioBuffer: Buffer.alloc(0),
        wordTimings: [],
        success: false,
        errorMessage:
          err instanceof Error ? err.message : "Failed to init SpeechConfig",
      });
      return;
    }

    const wordTimings: WordTiming[] = [];
    const pullStream = sdk.AudioOutputStream.createPullStream();
    const audioConfig = sdk.AudioConfig.fromStreamOutput(pullStream);
    const synthesizer = new sdk.SpeechSynthesizer(config, audioConfig);

    // Capture word-boundary events for caption sync
    synthesizer.wordBoundary = (
      _sender: sdk.SpeechSynthesizer,
      event: sdk.SpeechSynthesisWordBoundaryEventArgs
    ) => {
      wordTimings.push({
        word: event.text,
        offsetMs: event.audioOffset / 10_000, // 100ns ticks → ms
        durationMs: event.duration / 10_000,
      });
    };

    synthesizer.speakSsmlAsync(
      ssml,
      async (result) => {
        synthesizer.close();

        if (
          result.reason === sdk.ResultReason.SynthesizingAudioCompleted
        ) {
          const audioBuffer = Buffer.from(result.audioData);
          resolve({
            audioBuffer,
            wordTimings,
            success: true,
            errorMessage: null,
          });
        } else {
          const detail = sdk.CancellationDetails.fromResult(result as unknown as sdk.SpeechRecognitionResult);
          resolve({
            audioBuffer: Buffer.alloc(0),
            wordTimings: [],
            success: false,
            errorMessage: `TTS failed: ${detail.errorDetails ?? result.reason}`,
          });
        }
      },
      (err) => {
        synthesizer.close();
        console.error("[azure/speech] synthesizeSpeech error:", err);
        resolve({
          audioBuffer: Buffer.alloc(0),
          wordTimings: [],
          success: false,
          errorMessage: typeof err === "string" ? err : "Unknown TTS error",
        });
      }
    );
  });
}

// ── STT ───────────────────────────────────────────────────────────────────────

/**
 * Performs speech-to-text recognition on a provided audio buffer.
 * Used server-side when audio data is POSTed from the client.
 * Applies an 8-second timeout — returns status "silence" if no speech detected.
 *
 * IMPORTANT: The result must be treated as untrusted user input.
 * Always pass through sanitization before using in prompts.
 *
 * @param audioData - Raw audio bytes from the client (WAV/PCM).
 * @returns SttResult with the transcript and a status code.
 */
export async function recognizeSpeech(audioData: Buffer): Promise<SttResult> {
  return new Promise<SttResult>((resolve) => {
    let config: sdk.SpeechConfig;
    try {
      config = getSpeechConfig();
    } catch (err) {
      resolve({
        transcript: "",
        status: "error",
        errorMessage:
          err instanceof Error ? err.message : "Failed to init SpeechConfig",
      });
      return;
    }

    config.speechRecognitionLanguage = "en-US";

    const pushStream = sdk.AudioInputStream.createPushStream();
    pushStream.write(audioData);
    pushStream.close();

    const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
    const recognizer = new sdk.SpeechRecognizer(config, audioConfig);

    // 8-second silence timeout
    const silenceTimeout = setTimeout(() => {
      recognizer.stopContinuousRecognitionAsync(() => {
        recognizer.close();
        resolve({ transcript: "", status: "silence", errorMessage: null });
      });
    }, 8_000);

    recognizer.recognizeOnceAsync(
      (result) => {
        clearTimeout(silenceTimeout);
        recognizer.close();

        if (result.reason === sdk.ResultReason.RecognizedSpeech) {
          resolve({
            transcript: result.text,
            status: "recognized",
            errorMessage: null,
          });
        } else if (result.reason === sdk.ResultReason.NoMatch) {
          resolve({
            transcript: "",
            status: "unrecognized",
            errorMessage: null,
          });
        } else {
          const detail = sdk.CancellationDetails.fromResult(result);
          resolve({
            transcript: "",
            status: "error",
            errorMessage: detail.errorDetails ?? "STT recognition failed",
          });
        }
      },
      (err) => {
        clearTimeout(silenceTimeout);
        recognizer.close();
        console.error("[azure/speech] recognizeSpeech error:", err);
        resolve({
          transcript: "",
          status: "error",
          errorMessage: typeof err === "string" ? err : "Unknown STT error",
        });
      }
    );
  });
}

// ── Bounded command matching ──────────────────────────────────────────────────

/** The 5 allowed voice commands in child mode. */
export const ALLOWED_VOICE_COMMANDS = [
  "say it again",
  "make it easier",
  "tell me more",
  "next",
] as const;

export type AllowedVoiceCommand = (typeof ALLOWED_VOICE_COMMANDS)[number];

/**
 * Matches a sanitized STT transcript to one of the 5 bounded voice commands.
 * Uses an allowlist — never a regex catch-all.
 * Quiz answer input is handled separately and is NOT matched here.
 *
 * @param transcript - Sanitized STT output (lowercase, trimmed).
 * @returns The matched command, or null if no match.
 */
export function matchVoiceCommand(
  transcript: string
): AllowedVoiceCommand | null {
  const normalized = transcript.toLowerCase().trim();

  for (const command of ALLOWED_VOICE_COMMANDS) {
    if (normalized.includes(command)) {
      return command;
    }
  }

  return null;
}
