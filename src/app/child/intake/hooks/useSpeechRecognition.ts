"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
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
  const isSupported = useSyncExternalStore(
    () => () => {},
    () => {
      if (typeof window === "undefined") return false;
      const win = window as SpeechRecognitionWindow;
      return Boolean(win.SpeechRecognition || win.webkitSpeechRecognition);
    },
    () => false
  );
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const isStartedRef = useRef(false);
  const hasDeliveredResultRef = useRef(false);

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
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;
    recognition.continuous = true;
    recognitionRef.current = recognition;
    return recognition;
  }, []);

  /**
   * Stops recognition and clears timers.
   */
  const stop = useCallback(() => {
    if (timeoutRef.current && typeof window !== "undefined") {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (recognitionRef.current) {
      recognitionRef.current.onresult = null;
      recognitionRef.current.onerror = null;
      recognitionRef.current.onend = null;
      recognitionRef.current.onstart = null;
      recognitionRef.current.abort();
    }
    hasDeliveredResultRef.current = false;
    isStartedRef.current = false;
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

      if (timeoutRef.current && typeof window !== "undefined") {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      const armSilenceTimeout = (): void => {
        if (typeof window === "undefined") return;
        if (timeoutRef.current) {
          window.clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = window.setTimeout(() => {
          onFailure("silence");
          stop();
        }, timeoutMs);
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const lastIndex = Math.max(0, event.results.length - 1);
        const latest = event.results?.[lastIndex];
        const transcript = latest?.[0]?.transcript?.trim() ?? "";
        const confidence = latest?.[0]?.confidence ?? 0;
        const isFinal = latest?.isFinal === true;

        // Keep listening while speech is in progress.
        armSilenceTimeout();

        if (!transcript) {
          return;
        }

        // Ignore interim chunks until finalization.
        if (!isFinal) {
          return;
        }

        // Very low-confidence one-word fragments are treated as unrecognized.
        const wordCount = transcript.split(/\s+/).filter(Boolean).length;
        if (confidence > 0 && confidence < 0.2 && wordCount <= 1) {
          onFailure("unrecognized");
          stop();
          return;
        }

        hasDeliveredResultRef.current = true;
        onResult(transcript);
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
        isStartedRef.current = false;
        setIsListening(false);
        if (!hasDeliveredResultRef.current && timeoutRef.current === null) {
          onFailure("unrecognized");
        }
      };

      recognition.onstart = () => {
        setIsListening(true);
      };

      if (isStartedRef.current) return;
      isStartedRef.current = true;
      hasDeliveredResultRef.current = false;
      recognition.start();

      armSilenceTimeout();
    },
    [getRecognition, onFailure, onResult, stop]
  );

  useEffect(() => {
    return () => stop();
  }, [stop]);

  return { isSupported, isListening, listen, stop };
}
