/**
 * SpeechRecognition.ts
 * Shared Web Speech API types for client-side speech recognition.
 */

export interface SpeechRecognitionErrorEvent {
  error: string;
}

export interface SpeechRecognitionResult {
  transcript: string;
}

export interface SpeechRecognitionResultList {
  [index: number]: { [index: number]: SpeechRecognitionResult };
  length: number;
}

export interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
}

export interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

export interface SpeechRecognitionWindow extends Window {
  SpeechRecognition?: new () => SpeechRecognitionInstance;
  webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
}
