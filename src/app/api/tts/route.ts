import { randomUUID } from "crypto";
import {
  synthesizeSpeechWithOptions,
  type VoiceRole,
} from "@/lib/azure/speech";
import { checkStoryOutput } from "@/lib/safety/checkStoryOutput";
import type { TtsRequest, TtsResponse } from "@/types/Api";
import type { Story } from "@/types/Story";

/**
 * Sanitizes raw text input.
 *
 * @param raw - Raw input string.
 * @param maxLen - Maximum allowed length.
 * @returns Sanitized string.
 */
function sanitizeText(raw: string | undefined, maxLen: number): string {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, maxLen).replace(/[^\x20-\x7E]/g, "");
}

/**
 * Validates the voice role value.
 *
 * @param value - Input value.
 * @returns VoiceRole if valid, otherwise null.
 */
function normalizeVoiceRole(value: unknown): VoiceRole | null {
  if (value === "spriggle" || value === "narration") return value;
  return null;
}

/**
 * Sanitizes an SSML attribute value to a safe subset.
 *
 * @param value - Raw value.
 * @param maxLen - Maximum length.
 * @returns Sanitized value or undefined.
 */
function sanitizeSsmlValue(
  value: string | undefined,
  maxLen: number
): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().slice(0, maxLen);
  if (!/^[A-Za-z0-9._-]+$/.test(trimmed)) return undefined;
  return trimmed;
}

/**
 * Sanitizes a prosody value (rate/pitch) to percent format.
 *
 * @param value - Raw value.
 * @returns Sanitized percent string or undefined.
 */
function sanitizeProsodyValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!/^[+-]?\d+%$/.test(trimmed)) return undefined;
  return trimmed;
}

/**
 * Builds a minimal Story object for safety checking a single narration string.
 *
 * @param narration - The narration text to check.
 * @returns Story object for safety validation.
 */
function buildSafetyStory(narration: string): Story {
  return {
    id: randomUUID(),
    title: "Safety Check",
    subject: "animals",
    tone: "calm",
    scenes: [
      {
        index: 0,
        title: "Scene",
        narration,
        imagePrompt: "Soft illustrated children's book style.",
        imageUrl: null,
      },
    ],
    educationalSummary: "Safety check for narration text.",
    curriculumChunkIds: [],
    createdAt: new Date().toISOString(),
  };
}

/**
 * POST /api/tts
 * Synthesizes narration text into audio and returns word-level timings.
 */
export async function POST(request: Request): Promise<Response> {
  let payload: TtsRequest;
  try {
    payload = (await request.json()) as TtsRequest;
  } catch {
    return Response.json(
      { audioBase64: "", wordTimings: [], usedText: "", error: "Invalid JSON body." } as TtsResponse,
      { status: 400 }
    );
  }

  const text = sanitizeText(payload.text, 1200);
  const voiceRole = normalizeVoiceRole(payload.voiceRole) ?? "narration";
  const voiceName = sanitizeSsmlValue(payload.voiceName, 64);
  const rate = sanitizeProsodyValue(payload.rate);
  const pitch = sanitizeProsodyValue(payload.pitch);
  const style = sanitizeSsmlValue(payload.style, 32);

  if (!text) {
    return Response.json(
      { audioBase64: "", wordTimings: [], usedText: "", error: "Missing text." } as TtsResponse,
      { status: 400 }
    );
  }

  const safetyStory = buildSafetyStory(text);
  let safeText = text;

  try {
    const safetyResult = await checkStoryOutput(
      safetyStory,
      "tts",
      safetyStory.id
    );
    if (!safetyResult.story) {
      return Response.json(
        {
          audioBase64: "",
          wordTimings: [],
          usedText: "",
          error: "Safety check returned no story.",
        } as TtsResponse,
        { status: 500 }
      );
    }
    safeText = safetyResult.story.scenes[0]?.narration ?? text;
  } catch (err) {
    console.error(
      "[api/tts] Safety check failed.",
      err instanceof Error ? err.message : "Unknown error"
    );
    return Response.json(
      {
        audioBase64: "",
        wordTimings: [],
        usedText: "",
        error: "Safety check failed.",
      } as TtsResponse,
      { status: 500 }
    );
  }

  const ttsResult = await synthesizeSpeechWithOptions({
    text: safeText,
    role: voiceRole,
    voiceName,
    rate,
    pitch,
    style,
  });

  if (!ttsResult.success) {
    return Response.json(
      {
        audioBase64: "",
        wordTimings: [],
        usedText: safeText,
        error: ttsResult.errorMessage ?? "TTS failed.",
      } as TtsResponse,
      { status: 500 }
    );
  }

  return Response.json({
    audioBase64: ttsResult.audioBuffer.toString("base64"),
    wordTimings: ttsResult.wordTimings,
    usedText: safeText,
  } as TtsResponse);
}
