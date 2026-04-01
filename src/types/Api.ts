/**
 * Api.ts
 * Shared request/response types for Talewind API routes.
 *
 * Imported by: /src/app/api/story/route.ts,
 *              /src/app/api/image/route.ts,
 *              /src/app/api/tts/route.ts
 */

import type { Subject } from "./Child";
import type { Story, StoryScene } from "./Story";
import type { WordTiming } from "@/lib/azure/speech";
import type { VoiceRole } from "@/lib/azure/speech";
import type { QuizAnswer, QuizQuestion, QuizScore, QuestionScore } from "./Quiz";

// ── Story API ────────────────────────────────────────────────────────────────

export interface StoryRequest {
  childId: string;
  subject: Subject;
  sessionNumber: number;
  /** Optional keyword query to guide curriculum retrieval. */
  searchText?: string;
}

export interface StoryResponse {
  story: Story | null;
  safety: { passed: boolean; wasRewritten: boolean } | null;
  error?: string;
}

// ── Image API ────────────────────────────────────────────────────────────────

export interface ImageRequest {
  prompt: string;
  /** Child name for logging context only. */
  childName?: string;
}

export interface ImageResponse {
  imageUrl: string | null;
  error?: string;
}

// ── TTS API ──────────────────────────────────────────────────────────────────

export interface TtsRequest {
  text: string;
  /** Optional voice role for default voices. */
  voiceRole?: VoiceRole;
  /** Optional explicit Azure Neural voice name. */
  voiceName?: string;
  /** Optional SSML prosody rate, e.g. "+5%". */
  rate?: string;
  /** Optional SSML prosody pitch, e.g. "+10%". */
  pitch?: string;
  /** Optional expressive style for mstts:express-as. */
  style?: string;
}

export interface TtsResponse {
  audioBase64: string;
  wordTimings: WordTiming[];
  usedText: string;
  error?: string;
}

// ── Story Extend API (frontend stub) ─────────────────────────────────────────

export interface StoryExtendRequest {
  childId: string;
  story: Story;
  sceneIndex: number;
}

export interface StoryExtendResponse {
  scene: StoryScene | null;
  error?: string;
}

// ── Quiz API ─────────────────────────────────────────────────────────────────

export interface QuizGenerateRequest {
  mode: "generate";
  childId: string;
  story: Story;
}

export interface QuizScoreRequest {
  mode: "score";
  childId: string;
  story: Story;
  questions: QuizQuestionPublic[];
  answers: QuizAnswer[];
  madeEasierScenes?: string[];
}

export interface QuizGenerateResponse {
  questions: QuizQuestionPublic[] | null;
  safety: { passed: boolean; wasRewritten: boolean } | null;
  error?: string;
}

export interface QuizScoreResponse {
  score: QuizScore | null;
  questionScores: QuestionScore[] | null;
  adaptationResult: QuizScore["adaptationResult"] | null;
  sessionId: string | null;
  error?: string;
}

export type QuizRequest = QuizGenerateRequest | QuizScoreRequest;
export type QuizResponse = QuizGenerateResponse | QuizScoreResponse;

export type QuizQuestionPublic = Omit<QuizQuestion, "expectedAnswer">;
