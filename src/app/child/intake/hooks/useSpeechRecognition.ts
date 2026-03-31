"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  SpeechRecognitionErrorEvent,
  SpeechRecognitionEvent,
  SpeechRecognitionInstance,
  SpeechRecognitionWindow,
} from "@/types/SpeechRecognition";

export type SpeechRecognitionFailure =
  | "silence"
  | "unrecognized"
  | "error";

export interface SpeechRecognitionHandlers {
  onResult: (transcript: string) => void;
  onFailure: (reason: SpeechRecognitionFailure) => void;
}

export interface SpeechRecognitionControls {
  isSupported: boolean;
  isListening: boolean;
  listen: (timeoutMs: number) => void;
  stop: () => void;
}

/**
 * Client-side speech recognition hook using the Web Speech API.
 */
export function useSpeechRecognition({
  onResult,
  onFailure,
}: SpeechRecognitionHandlers): SpeechRecognitionControls {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const timeoutRef = useRef<number | null>(null);

  /**
   * Returns a cached SpeechRecognition instance if supported.
   *
   * @returns SpeechRecognition instance or null if unsupported.
   */
  const getRecognition = useCallback((): SpeechRecognitionInstance | null => {
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
   * Stops recognition and clears timers.
   */
  const stop = useCallback(() => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (recognitionRef.current) {
      recognitionRef.current.abort();
    }
    setIsListening(false);
  }, []);

  /**
   * Starts speech recognition with a timeout.
   *
   * @param timeoutMs - Timeout in milliseconds before silence fallback.
   */
  const listen = useCallback(
    (timeoutMs: number) => {
      const recognition = getRecognition();
      if (!recognition) {
        onFailure("error");
        return;
      }

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const transcript =
          event.results?.[0]?.[0]?.transcript?.trim() ?? "";
        if (!transcript) {
          onFailure("unrecognized");
        } else {
          onResult(transcript);
        }
        stop();
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error === "no-speech") {
          onFailure("silence");
        } else {
          onFailure("unrecognized");
        }
        stop();
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      setIsListening(true);
      recognition.start();

      timeoutRef.current = window.setTimeout(() => {
        onFailure("silence");
        stop();
      }, timeoutMs);
    },
    [getRecognition, onFailure, onResult, stop]
  );

  useEffect(() => {
    return () => stop();
  }, [stop]);

  const isSupported = Boolean(
    (window as SpeechRecognitionWindow).SpeechRecognition ||
      (window as SpeechRecognitionWindow).webkitSpeechRecognition
  );

  return { isSupported, isListening, listen, stop };
}
