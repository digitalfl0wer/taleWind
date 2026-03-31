import type { Subject, ReadingMode, StoryTone, ChildProfile } from "./Child";
import type { WordTiming } from "@/lib/azure/speech";

export type IntakeStep =
  | "start"
  | "name"
  | "color"
  | "animal"
  | "confirm"
  | "retry"
  | "subject"
  | "reading_mode"
  | "tone"
  | "return_question"
  | "return_answer";

export interface IntakeSessionData {
  name?: string;
  favoriteColor?: string;
  favoriteAnimal?: string;
  subject?: Subject;
  readingMode?: ReadingMode;
  storyTone?: StoryTone;
  retryCount: number;
  lastQuestionAsked: number;
}

export interface IntakeRequest {
  step: IntakeStep;
  input?: string;
  sessionData: IntakeSessionData;
  parentId: string;
  childId?: string; // return sessions only
}

export interface IntakeResponse {
  spriggleText: string;
  audioBase64: string;
  wordTimings: WordTiming[];
  nextStep: IntakeStep | "complete";
  stt: { listen: boolean; timeoutMs: number };
  profile?: ChildProfile;
  error?: string;
}
