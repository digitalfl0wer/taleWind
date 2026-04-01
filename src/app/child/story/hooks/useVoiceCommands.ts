"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { VoiceCommandKey } from "@/app/components/VoiceCommandPanel";

interface SpeechRecognitionErrorEvent {
  error: string;
}

interface SpeechRecognitionResult {
  transcript: string;
}

interface SpeechRecognitionResultList {
  [index: number]: { [index: number]: SpeechRecognitionResult };
  length: number;
}

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionInstance {
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

interface SpeechRecognitionWindow extends Window {
  SpeechRecognition?: new () => SpeechRecognitionInstance;
  webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
}

export interface UseVoiceCommandsOptions {
  enabled: boolean;
  paused: boolean;
  onCommand: (command: VoiceCommandKey) => void;
  onUnrecognized: (transcript: string) => void;
}

export interface UseVoiceCommandsResult {
  isSupported: boolean;
  isListening: boolean;
}

const COMMAND_PHRASES: Record<VoiceCommandKey, string[]> = {
  say_it_again: ["say it again"],
  make_it_easier: ["make it easier"],
  tell_me_more: ["tell me more"],
  next: ["next"],
  quiz_answer: ["quiz answer"],
};

/**
 * Normalizes a transcript string for command matching.
 *
 * @param transcript - Raw transcript from STT.
 * @returns Normalized string.
 */
function normalizeTranscript(transcript: string): string {
  return transcript
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Matches a transcript to one of the bounded voice commands.
 *
 * @param transcript - Raw transcript string.
 * @returns Matched command or null.
 */
function matchCommand(transcript: string): VoiceCommandKey | null {
  const normalized = normalizeTranscript(transcript);
  const entries = Object.entries(COMMAND_PHRASES) as Array<
    [VoiceCommandKey, string[]]
  >;
  for (const [command, phrases] of entries) {
    if (phrases.some((phrase) => normalized.includes(phrase))) {
      return command;
    }
  }
  return null;
}

/**
 * Voice command hook for always-listening, allowlisted STT.
 */
export function useVoiceCommands({
  enabled,
  paused,
  onCommand,
  onUnrecognized,
}: UseVoiceCommandsOptions): UseVoiceCommandsResult {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const isRunningRef = useRef(false);

  /**
   * Returns a cached SpeechRecognition instance if supported.
   *
   * @returns SpeechRecognition instance or null if unsupported.
   */
  const getRecognition = useCallback((): SpeechRecognitionInstance | null => {
    if (typeof window === "undefined") return null;
    if (recognitionRef.current) return recognitionRef.current;
    const win = window as SpeechRecognitionWindow;
    const RecognitionCtor = win.SpeechRecognition ?? win.webkitSpeechRecognition;
    if (!RecognitionCtor) return null;
    const recognition = new RecognitionCtor();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;
    return recognition;
  }, []);

  /**
   * Stops recognition and clears state.
   */
  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.abort();
    }
    isRunningRef.current = false;
    setIsListening(false);
  }, []);

  /**
   * Starts recognition and restarts on end when enabled.
   */
  const startListening = useCallback(() => {
    if (isRunningRef.current) return; // Guard against double-start
    const recognition = getRecognition();
    if (!recognition) return;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results?.[0]?.[0]?.transcript ?? "";
      const command = matchCommand(transcript);
      if (command) {
        onCommand(command);
      } else {
        onUnrecognized(transcript);
      }
      recognition.stop();
    };

    recognition.onerror = () => {
      onUnrecognized("");
      recognition.stop();
    };

    recognition.onend = () => {
      isRunningRef.current = false;
      setIsListening(false);
    };

    isRunningRef.current = true;
    setIsListening(true);
    recognition.start();
  }, [enabled, getRecognition, onCommand, onUnrecognized, paused]);

  useEffect(() => {
    if (enabled && !paused) {
      startListening();
    } else {
      stopListening();
    }
    return () => stopListening();
  }, [enabled, paused, startListening, stopListening]);

  const isSupported =
    typeof window !== "undefined" &&
    Boolean(
      (window as SpeechRecognitionWindow).SpeechRecognition ||
        (window as SpeechRecognitionWindow).webkitSpeechRecognition
    );

  return { isSupported, isListening };
}
