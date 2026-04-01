"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { IntakeRequest, IntakeResponse, IntakeSessionData, IntakeStep } from "@/types/Intake";
import type { ReadingMode, StoryTone, Subject } from "@/types/Child";
import { Spriggle } from "@/app/components/Spriggle";
import { SpeechBubble } from "@/app/components/SpeechBubble";
import { SubjectDoor } from "@/app/components/SubjectDoor";
import { Button } from "@/app/components/ui/Button";
import { Pill } from "@/app/components/ui/Pill";
import { colors, radii, typography } from "@/styles/tokens";
import { hexToRgba } from "@/app/components/ui/colorUtils";
import { useAccessibility } from "@/app/components/AccessibilityProvider";
import { useSpeechRecognition } from "./hooks/useSpeechRecognition";

const DEFAULT_SESSION_DATA: IntakeSessionData = {
  retryCount: 0,
  lastQuestionAsked: -1,
};

/**
 * Maps intake step to a 1-based screen index for the progress indicator.
 *
 * @param step - Current intake step.
 * @returns Screen number 1–4.
 */
function getScreenIndex(step: IntakeStep | "complete"): number {
  if (
    step === "start" ||
    step === "name" ||
    step === "color" ||
    step === "animal" ||
    step === "confirm" ||
    step === "retry" ||
    step === "return_question" ||
    step === "return_answer"
  )
    return 1;
  if (step === "subject") return 2;
  if (step === "reading_mode") return 3;
  return 4; // tone, complete
}

// Freeform steps accept any typed or spoken input — no preset matching.
const FREEFORM_STEPS: Set<IntakeStep> = new Set(["name", "color", "animal"]);

// Constrained steps still use preset options (voice must match one of these).
const STEP_OPTIONS: Partial<Record<IntakeStep, string[]>> = {
  return_answer: ["Rain", "Music", "Park", "Mom", "Pizza", "Drawing"],
};

/**
 * Builds shared panel styling for intake screens.
 *
 * @returns CSSProperties for panel containers.
 */
function getPanelStyle(): React.CSSProperties {
  return {
    borderRadius: radii.card,
    backgroundColor: hexToRgba(colors.primaryDark, 0.45),
    border: `2px solid ${hexToRgba(colors.primaryLight, 0.25)}`,
  };
}

/**
 * Builds tone card styling for the vibe screen.
 *
 * @returns CSSProperties for tone cards.
 */
function getToneCardStyle(): React.CSSProperties {
  return {
    borderRadius: radii.card,
    border: `2px solid ${hexToRgba(colors.primaryLight, 0.3)}`,
    backgroundColor: hexToRgba(colors.primaryDark, 0.4),
  };
}

/**
 * Magic Door intake experience across four child-friendly screens.
 */
export default function IntakePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const childId = searchParams.get("childId") ?? undefined;
  const parentIdParam = searchParams.get("parentId");
  const demoParentId = process.env.NEXT_PUBLIC_DEMO_PARENT_ID?.trim();
  const parentId =
    parentIdParam?.trim() || demoParentId || "demo-parent";
  const isReturnSession = Boolean(childId);
  const { updatePrefs, disableAnimations } = useAccessibility();

  const [step, setStep] = useState<IntakeStep | "complete">(
    isReturnSession ? "return_question" : "start"
  );
  const [sessionData, setSessionData] = useState<IntakeSessionData>(
    DEFAULT_SESSION_DATA
  );
  const [spriggleText, setSpriggleText] = useState<string>(
    "Hi! I'm Spriggle!"
  );
  const [sttConfig, setSttConfig] = useState<{ listen: boolean; timeoutMs: number }>({
    listen: false,
    timeoutMs: 0,
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [unrecognizedCount, setUnrecognizedCount] = useState<number>(0);
  // Brief "I heard you!" confirmation shown before advancing to the next step.
  // Also used to highlight the matched pill on constrained steps.
  const [capturedValue, setCapturedValue] = useState<string | null>(null);
  // Text input value for freeform steps (name, color, animal)
  const [textInputValue, setTextInputValue] = useState<string>("");
  const [intakeStart] = useState<number>(() => Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [profileId, setProfileId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioResolveRef = useRef<(() => void) | null>(null);
  const initialStepRef = useRef<IntakeStep | "complete">(step);
  const [isAudioPaused, setIsAudioPaused] = useState(false);
  const inFlightStepRef = useRef<IntakeStep | null>(null);
  const requestIdRef = useRef(0);

  // Stable callback refs so useSpeechRecognition can be hoisted before the handlers
  // that reference listen/stop. Updated every render to always call latest logic.
  const onResultRef = useRef<(transcript: string) => void>(() => {});
  const onFailureRef = useRef<(reason: "silence" | "unrecognized" | "error") => void>(() => {});

  // Tracks whether a silence nudge has been sent for the current step.
  // Resets on every step change so each new question gets a fresh grace period.
  const nudgedRef = useRef(false);
  // When true, auto-listening has stopped and the mic button shows "I'm ready!"
  const [waitingForReady, setWaitingForReady] = useState(false);

  const { isSupported, isListening, listen, stop } = useSpeechRecognition({
    onResult: useCallback((t: string) => onResultRef.current(t), []),
    onFailure: useCallback(
      (r: "silence" | "unrecognized" | "error") => onFailureRef.current(r),
      []
    ),
  });

  /**
   * Plays Spriggle's TTS audio and resolves when playback ends.
   *
   * @param audioBase64 - Base64-encoded MP3 audio.
   */
  const playSpriggleAudio = useCallback(async (audioBase64: string) => {
    if (!audioBase64) return;
    // Resolve any pending audio promise so previous handleResponse calls don't leak
    if (audioResolveRef.current) {
      audioResolveRef.current();
      audioResolveRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(`data:audio/mp3;base64,${audioBase64}`);
    audioRef.current = audio;
    setIsAudioPaused(false);
    audio.onpause = () => setIsAudioPaused(true);
    audio.onplay = () => setIsAudioPaused(false);
    try {
      await audio.play();
      return new Promise<void>((resolve) => {
        audioResolveRef.current = resolve;
        audio.onended = () => {
          setIsAudioPaused(false);
          audioResolveRef.current = null;
          resolve();
        };
      });
    } catch (error) {
      console.warn("[intake] audio playback blocked", error);
      return;
    }
  }, []);

  /**
   * Toggles pause/resume on Spriggle's current TTS audio.
   */
  const handleAudioPauseToggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play();
    } else {
      audio.pause();
    }
  }, []);

  /**
   * Applies intake API response state and starts STT when needed.
   *
   * @param response - Intake response payload.
   */
  const handleResponse = useCallback(
    async (response: IntakeResponse) => {
      setSpriggleText(response.spriggleText);
      setStep(response.nextStep);
      setSttConfig(response.stt);
      if (response.profile?.id) {
        setProfileId(response.profile.id);
      }
      if (response.profile?.accessibility) {
        updatePrefs(response.profile.accessibility);
        try {
          window.localStorage.setItem(
            "talewind-accessibility",
            JSON.stringify(response.profile.accessibility)
          );
        } catch (error) {
          console.warn("[intake] failed to persist accessibility prefs", error);
        }
      }

      if (response.audioBase64) {
        await playSpriggleAudio(response.audioBase64);
      }

      if (response.stt.listen) {
        listen(response.stt.timeoutMs);
      } else {
        stop();
      }
    },
    [listen, playSpriggleAudio, stop, updatePrefs]
  );

  /**
   * Updates session data locally based on the current step.
   *
   * @param nextStep - Step being submitted.
   * @param value - Optional input value.
   * @returns Updated session data object.
   */
  const updateSessionData = useCallback(
    (nextStep: IntakeStep, value?: string): IntakeSessionData => {
      const updated: IntakeSessionData = { ...sessionData };
      if (nextStep === "name" && value) updated.name = value;
      if (nextStep === "color" && value) updated.favoriteColor = value;
      if (nextStep === "animal" && value) updated.favoriteAnimal = value;
      if (nextStep === "subject" && value) updated.subject = value as Subject;
      if (nextStep === "reading_mode" && value)
        updated.readingMode = value as ReadingMode;
      if (nextStep === "tone" && value) updated.storyTone = value as StoryTone;
      if (nextStep === "retry") updated.retryCount = updated.retryCount + 1;
      return updated;
    },
    [sessionData]
  );

  /**
   * Sends the current intake step to the backend API.
   *
   * @param nextStep - Step being submitted.
   * @param value - Optional input value.
   */
  const sendStep = useCallback(
    async (nextStep: IntakeStep, value?: string) => {
      console.info("[intake] sendStep", { nextStep, value });
      if (inFlightStepRef.current === nextStep) {
        return;
      }
      inFlightStepRef.current = nextStep;
      const requestId = ++requestIdRef.current;
      setIsLoading(true);
      const nextSession = updateSessionData(nextStep, value);
      setSessionData(nextSession);

      const requestBody: IntakeRequest = {
        step: nextStep,
        input: value,
        sessionData: nextSession,
        parentId,
        childId,
      };

      try {
        const res = await fetch("/api/intake", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });
        const data = (await res.json()) as IntakeResponse;
        console.info("[intake] response", {
          requestId,
          ok: res.ok,
          error: data.error ?? null,
          nextStep: data.nextStep ?? null,
        });
        if (!res.ok || data.error) {
          setSpriggleText("Oops! Let's try that again! 🌟");
          setIsLoading(false);
          return;
        }
        if (requestId === requestIdRef.current) {
          await handleResponse(data);
        }
      } catch (error) {
        console.error("[intake] request failed", error);
        setSpriggleText("Oops! Let's try that again! 🌟");
      } finally {
        setIsLoading(false);
        if (inFlightStepRef.current === nextStep) {
          inFlightStepRef.current = null;
        }
      }
    },
    [childId, handleResponse, parentId, updateSessionData]
  );

  /**
   * Normalizes a phrase for matching against allowed options.
   *
   * @param value - Raw input string.
   * @returns Normalized string for comparison.
   */
  const normalizeOption = useCallback((value: string): string => {
    return value.trim().toLowerCase();
  }, []);

  /**
   * Finds a matching option for a transcript, if any.
   *
   * @param transcript - Speech recognition transcript.
   * @param options - Allowed option list.
   * @returns Matched option or null.
   */
  const matchOption = useCallback(
    (transcript: string, options: string[]): string | null => {
      const normalized = normalizeOption(transcript);
      const match = options.find(
        (option) => normalizeOption(option) === normalized
      );
      return match ?? null;
    },
    [normalizeOption]
  );

  /**
   * Returns a context-aware nudge message based on where the child is in the flow.
   *
   * @param currentStep - The step the child is currently on.
   * @returns A friendly nudge string for Spriggle to say.
   */
  const getNudgeText = useCallback((currentStep: IntakeStep | "complete"): string => {
    if (currentStep === "return_question" || currentStep === "return_answer") {
      return "Still ready for storytime? I'm here whenever you are! 🌟";
    }
    if (
      currentStep === "subject" ||
      currentStep === "reading_mode" ||
      currentStep === "tone"
    ) {
      return "Take your time! Tap any option when you're ready! 🌟";
    }
    return "Are you there? I'm still listening! 🌟";
  }, []);

  /**
   * Handles a recognition failure. On first silence, nudges the child once
   * with a grace-period re-listen. On second silence, rests and shows
   * "I'm ready!" so the child can tap to restart on their own terms.
   *
   * @param reason - Failure reason from the speech recognition hook.
   */
  const handleRecognitionFailure = useCallback(
    (reason: "silence" | "unrecognized" | "error") => {
      // Step is mid-transition — ignore stale recognition events
      if (isLoading) {
        stop();
        return;
      }
      if (reason === "silence") {
        if (!nudgedRef.current) {
          // First silence — nudge once, restart with an 8-second grace window
          nudgedRef.current = true;
          setSpriggleText(getNudgeText(step));
          listen(8000);
        } else {
          // Second silence — stop auto-listening, show "I'm ready!" button
          stop();
          setWaitingForReady(true);
          setSpriggleText("No rush! Tap \"I'm ready!\" when you want to answer. 🌟");
        }
        return;
      }

      // unrecognized or error — allow one retry then rest
      const nextCount = unrecognizedCount + 1;
      setUnrecognizedCount(nextCount);
      setSpriggleText("Oops! I didn't catch that. Try tapping a button! 🌟");

      if (nextCount < 2 && sttConfig.listen) {
        listen(sttConfig.timeoutMs);
      } else {
        stop();
        setWaitingForReady(true);
      }
    },
    [getNudgeText, isLoading, listen, sttConfig.listen, sttConfig.timeoutMs, step, stop, unrecognizedCount]
  );

  // Assign latest handlers to stable refs every render
  onFailureRef.current = handleRecognitionFailure;
  onResultRef.current = (transcript) => {
    const isFreeform = FREEFORM_STEPS.has(step as IntakeStep);
    const allowedOptions = STEP_OPTIONS[step as IntakeStep] ?? [];

    let matched: string | null = null;
    if (isFreeform) {
      // Name, color, animal — accept any non-empty spoken input
      const trimmed = transcript.trim();
      matched = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    } else if (allowedOptions.length) {
      matched = matchOption(transcript, allowedOptions);
    }

    if (!matched) {
      handleRecognitionFailure("unrecognized");
      return;
    }

    // Stop listening immediately
    stop();
    setUnrecognizedCount(0);
    setCapturedValue(matched);

    if (isFreeform) {
      // Populate the text input so the child sees what was captured,
      // then let them confirm with the submit button
      setTextInputValue(matched);
      setSpriggleText(`I heard "${matched}"! Tap "That's it!" to keep going ✨`);
    } else {
      // Constrained steps — advance immediately
      setSpriggleText(`I heard "${matched}"! ✨`);
      void sendStep(step as IntakeStep, matched);
    }
  };

  const activeOptions = useMemo(() => {
    return STEP_OPTIONS[step as IntakeStep] ?? [];
  }, [step]);

  /**
   * Toggles the microphone listening state. When the child has been resting
   * (waitingForReady), tapping restores normal listening.
   */
  const handleMicClick = useCallback(() => {
    if (!isSupported) {
      setSpriggleText("Oops! Let's try that again! 🌟");
      return;
    }
    if (waitingForReady) {
      // Child is back — reset grace period state and start fresh
      nudgedRef.current = false;
      setWaitingForReady(false);
      setSpriggleText(spriggleText); // keep current question visible
      listen(sttConfig.timeoutMs || 8000);
      return;
    }
    if (isListening) {
      stop();
    } else if (sttConfig.listen) {
      listen(sttConfig.timeoutMs);
    }
  }, [isListening, isSupported, listen, sttConfig.listen, sttConfig.timeoutMs, spriggleText, stop, waitingForReady]);

  /**
   * Submits the typed text input value for freeform steps.
   */
  const handleTextSubmit = useCallback(() => {
    const value = textInputValue.trim();
    if (!value || isLoading) return;
    stop();
    setCapturedValue(value);
    setSpriggleText(`Got it! ✨`);
    void sendStep(step as IntakeStep, value);
  }, [isLoading, sendStep, step, stop, textInputValue]);

  /**
   * Confirms the summary and advances the flow.
   */
  const handleConfirm = useCallback(() => {
    if (isLoading) return;
    void sendStep("confirm");
  }, [isLoading, sendStep]);

  /**
   * Triggers the confirm/retry loop.
   */
  const handleRetry = useCallback(() => {
    if (isLoading) return;
    setUnrecognizedCount(0);
    void sendStep("retry");
  }, [isLoading, sendStep]);

  /**
   * Plays a short door chime sound using the Web Audio API.
   */
  const playDoorChime = useCallback(() => {
    if (typeof window === "undefined") return;
    const AudioCtx =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const context = new AudioCtx();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.12, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      context.currentTime + 0.3
    );
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.3);
    oscillator.onended = () => {
      void context.close();
    };
  }, []);

  /**
   * Submits the selected subject.
   *
   * @param subject - Subject selection.
   */
  const handleSubjectSelect = useCallback(
    (subject: Subject) => {
      playDoorChime();
      void sendStep("subject", subject);
    },
    [playDoorChime, sendStep]
  );

  /**
   * Submits the selected reading mode.
   *
   * @param mode - Reading mode selection.
   */
  const handleReadingMode = useCallback(
    (mode: ReadingMode) => {
      void sendStep("reading_mode", mode);
    },
    [sendStep]
  );

  /**
   * Submits the selected story tone.
   *
   * @param tone - Story tone selection.
   */
  const handleTone = useCallback(
    (tone: StoryTone) => {
      void sendStep("tone", tone);
    },
    [sendStep]
  );

  const handleCreateStory = useCallback(() => {
    if (!profileId || !sessionData.subject) return;
    const params = new URLSearchParams({
      childId: profileId,
      subject: sessionData.subject,
      session: "1",
    });
    router.push(`/child/story?${params.toString()}`);
  }, [profileId, router, sessionData.subject]);

  const handleStartOver = useCallback(() => {
    stop();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (audioResolveRef.current) {
      audioResolveRef.current();
      audioResolveRef.current = null;
    }
    setIsAudioPaused(false);
    setIsLoading(false);
    setSpriggleText("Hi! I'm Spriggle!");
    setProfileId(null);
    setSttConfig({ listen: false, timeoutMs: 0 });
    setCapturedValue(null);
    setTextInputValue("");
    setUnrecognizedCount(0);
    setWaitingForReady(false);
    setSessionData(DEFAULT_SESSION_DATA);
    setStep("start");
    inFlightStepRef.current = null;
    requestIdRef.current = 0;
  }, [stop]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    void sendStep(initialStepRef.current as IntakeStep);
  }, []); // intentionally empty — fires once on mount only

  useEffect(() => {
    const interval = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - intakeStart) / 1000));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [intakeStart]);

  useEffect(() => {
    if (elapsedSeconds > 120 && step !== "complete") {
      setSpriggleText("You're doing great! Let's keep going! 🌟");
    }
  }, [elapsedSeconds, step]);

  useEffect(() => {
    setUnrecognizedCount(0);
    nudgedRef.current = false;
    setWaitingForReady(false);
    setCapturedValue(null);
    setTextInputValue("");
  }, [step]);

  const showIntroScreen = step === "name" || step === "color" || step === "animal";
  const showConfirmScreen = step === "confirm" || step === "retry";
  const showSubjectScreen = step === "subject";
  const showReadingScreen = step === "reading_mode";
  const showToneScreen = step === "tone";
  const showReturnScreen = step === "return_question" || step === "return_answer";

  const listeningActive = sttConfig.listen && isListening;
  const micLabel = waitingForReady ? "I'm ready!" : listeningActive ? "Listening..." : "Mic";

  return (
    <div className="flex flex-1 flex-col items-center px-6 pb-10 pt-10 md:px-12">
      <div className="flex w-full max-w-5xl flex-col items-center gap-6">
        <Spriggle />
        <SpeechBubble text={spriggleText} />
        <button
          type="button"
          onClick={handleAudioPauseToggle}
          aria-label={isAudioPaused ? "Resume Spriggle" : "Pause Spriggle"}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 44,
            height: 44,
            borderRadius: "50%",
            border: `2px solid ${hexToRgba(colors.primaryLight, 0.4)}`,
            backgroundColor: hexToRgba(colors.primaryDark, 0.5),
            color: colors.textPrimary,
            cursor: audioRef.current ? "pointer" : "default",
            opacity: audioRef.current ? 1 : 0.35,
            transition: disableAnimations ? "none" : "opacity 0.2s ease",
          }}
        >
          {isAudioPaused ? (
            // Play triangle
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
              <polygon points="3,1 15,8 3,15" />
            </svg>
          ) : (
            // Pause bars
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
              <rect x="2" y="1" width="5" height="14" rx="1" />
              <rect x="9" y="1" width="5" height="14" rx="1" />
            </svg>
          )}
        </button>
        {/* ── Mic Feedback Indicator ────────────────────────────────────── */}
        {(listeningActive || (capturedValue !== null && !listeningActive)) ? (
          <div
            className="flex flex-col items-center gap-2"
            aria-live="polite"
            aria-atomic="true"
            style={{ minHeight: 80 }}
          >
            {listeningActive ? (
              <div className="flex flex-col items-center gap-2">
                <div
                  className={disableAnimations ? "" : "animate-pulse-ring"}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 56,
                    height: 56,
                    borderRadius: "50%",
                    backgroundColor: hexToRgba(colors.primary, 0.25),
                    border: `2px solid ${colors.primaryLight}`,
                  }}
                  aria-hidden="true"
                >
                  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
                    <rect x="9" y="2" width="10" height="14" rx="5" fill={colors.primaryLight} />
                    <path d="M5 14 a9 9 0 0 0 18 0" stroke={colors.primaryLight} strokeWidth="2.2" strokeLinecap="round" fill="none" />
                    <line x1="14" y1="23" x2="14" y2="26" stroke={colors.primaryLight} strokeWidth="2.2" strokeLinecap="round" />
                    <line x1="9" y1="26" x2="19" y2="26" stroke={colors.primaryLight} strokeWidth="2.2" strokeLinecap="round" />
                  </svg>
                </div>
                <span style={{ fontFamily: typography.ui, fontSize: "0.95rem", fontWeight: 600, color: colors.primaryLight }}>
                  I&apos;m listening...
                </span>
              </div>
            ) : (
              <div className={`flex flex-col items-center gap-2 ${disableAnimations ? "" : "animate-bounce-in"}`}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 56,
                    height: 56,
                    borderRadius: "50%",
                    backgroundColor: hexToRgba(colors.animals, 0.2),
                    border: `2px solid ${colors.animals}`,
                  }}
                  aria-hidden="true"
                >
                  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
                    <polyline points="5,15 11,21 23,8" stroke={colors.animals} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <span style={{ fontFamily: typography.ui, fontSize: "0.95rem", fontWeight: 600, color: colors.animals }}>
                  Got it!
                </span>
              </div>
            )}
          </div>
        ) : <div style={{ minHeight: 80 }} />}
        {step !== "start" && step !== "complete" && (
          <div
            className="flex items-center gap-3"
            role="progressbar"
            aria-label="Intake progress"
            aria-valuenow={getScreenIndex(step)}
            aria-valuemin={1}
            aria-valuemax={4}
          >
            {[1, 2, 3, 4].map((screen) => {
              const filled = getScreenIndex(step) >= screen;
              const current = getScreenIndex(step) === screen;
              return (
                <div
                  key={screen}
                  style={{
                    width: current ? 14 : 10,
                    height: current ? 14 : 10,
                    borderRadius: "50%",
                    backgroundColor: filled
                      ? colors.primaryLight
                      : hexToRgba(colors.primaryLight, 0.25),
                    transition: disableAnimations ? "none" : "all 0.3s ease",
                    boxShadow: current
                      ? `0 0 8px ${hexToRgba(colors.primaryLight, 0.7)}`
                      : "none",
                  }}
                />
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-10 flex w-full max-w-5xl flex-1 flex-col gap-6">
        {showIntroScreen && (
          <div className="flex flex-col gap-6 p-6 md:p-10" style={getPanelStyle()}>
            <h2 className="text-2xl font-semibold" style={{ color: colors.textPrimary }}>
              {step === "name"
                ? "What's your name?"
                : step === "color"
                ? "Which color is your favorite?"
                : "Which animal is your favorite?"}
            </h2>
            <form
              onSubmit={(e) => { e.preventDefault(); handleTextSubmit(); }}
              className="flex flex-col gap-4"
            >
              <input
                type="text"
                value={textInputValue}
                onChange={(e) => setTextInputValue(e.target.value)}
                placeholder={
                  step === "name" ? "Type your name…" :
                  step === "color" ? "Type a color…" :
                  "Type an animal…"
                }
                maxLength={40}
                disabled={isLoading}
                autoComplete="off"
                aria-label={
                  step === "name" ? "Your name" :
                  step === "color" ? "Your favorite color" :
                  "Your favorite animal"
                }
                style={{
                  borderRadius: radii.button,
                  border: `2px solid ${hexToRgba(colors.primaryLight, 0.4)}`,
                  backgroundColor: hexToRgba(colors.primaryDark, 0.6),
                  color: colors.textPrimary,
                  fontFamily: typography.ui,
                  fontSize: "1.125rem",
                  padding: "12px 16px",
                  outline: "none",
                  width: "100%",
                }}
              />
              <div className="flex flex-wrap gap-3">
                <Button
                  label={capturedValue ? "Got it! ✨" : "That's it!"}
                  variant="confirm"
                  type="submit"
                  disabled={!textInputValue.trim() || isLoading}
                />
                {isSupported && (
                  <Button
                    label={micLabel}
                    variant="outline"
                    onClick={handleMicClick}
                    disabled={(!sttConfig.listen && !waitingForReady) || isLoading}
                  />
                )}
              </div>
            </form>
          </div>
        )}

        {showReturnScreen && (
          <div className="flex flex-col gap-6 p-6 md:p-10" style={getPanelStyle()}>
            <h2 className="text-2xl font-semibold" style={{ color: colors.textPrimary }}>
              Your turn to answer!
            </h2>
            {step === "return_answer" && (
              <div className="flex flex-col gap-4">
                {activeOptions.length > 0 && (
                  <div className="flex flex-wrap gap-3">
                    {activeOptions.map((option) => (
                      <Pill
                        key={option}
                        label={option}
                        type="button"
                        active={capturedValue === option}
                        onClick={() => void sendStep(step as IntakeStep, option)}
                      />
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-3">
                  <Button
                    label={micLabel}
                    variant="outline"
                    onClick={handleMicClick}
                    disabled={!sttConfig.listen && !waitingForReady}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {showConfirmScreen && (
          <div className="flex flex-col gap-6 p-6 md:p-10" style={getPanelStyle()}>
            <h2 className="text-2xl font-semibold" style={{ color: colors.textPrimary }}>
              Did Spriggle get it right?
            </h2>
            <p className="text-base" style={{ color: colors.textMuted }}>
              {`Your favorite color is ${sessionData.favoriteColor ?? "..."} and you love ${
                sessionData.favoriteAnimal ?? "..."
              }!`}
            </p>
            <div className="flex flex-col gap-4 md:flex-row">
              <Button
                label="Yes, that's me!"
                variant="confirm"
                onClick={handleConfirm}
              />
              <Button label="Try again!" variant="outline" onClick={handleRetry} />
            </div>
            <p className="text-sm" style={{ color: colors.textMuted }}>
              If we try three times, Spriggle will move on.
            </p>
          </div>
        )}

        {showSubjectScreen && (
          <div className="flex flex-col gap-6">
            <h2 className="text-2xl font-semibold" style={{ color: colors.textPrimary }}>
              Choose a magic door
            </h2>
            <div className="grid gap-6 md:grid-cols-3">
              <SubjectDoor
                subject="animals"
                title="Animals"
                description="Meet glowing foxes and forest friends."
                onSelect={handleSubjectSelect}
              />
              <SubjectDoor
                subject="space"
                title="Space"
                description="Blast off to stars and planets."
                onSelect={handleSubjectSelect}
              />
              <SubjectDoor
                subject="math"
                title="Math"
                description="Solve sparkly number riddles."
                onSelect={handleSubjectSelect}
              />
            </div>
          </div>
        )}

        {showReadingScreen && (
          <div className="flex flex-col gap-6 p-6 md:p-10" style={getPanelStyle()}>
            <h2 className="text-2xl font-semibold" style={{ color: colors.textPrimary }}>
              How should we read?
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              <Button
                label="Read to me"
                onClick={() => handleReadingMode("read_to_me")}
              />
              <Button
                label="Let's read together"
                variant="secondary"
                onClick={() => handleReadingMode("read_together")}
              />
            </div>
          </div>
        )}

        {showToneScreen && (
          <div className="flex flex-col gap-6 p-6 md:p-10" style={getPanelStyle()}>
            <h2 className="text-2xl font-semibold" style={{ color: colors.textPrimary }}>
              Pick a story vibe
            </h2>
            <div className="grid gap-4 md:grid-cols-3">
              <ToneCard
                tone="calm"
                label="Calm"
                onClick={() => handleTone("calm")}
              />
              <ToneCard
                tone="exciting"
                label="Exciting"
                onClick={() => handleTone("exciting")}
              />
              <ToneCard
                tone="silly"
                label="Silly"
                onClick={() => handleTone("silly")}
              />
            </div>
          </div>
        )}

        {step === "complete" && (
          <div className="flex flex-col gap-4 p-6 md:p-10" style={getPanelStyle()}>
            {(() => {
              const rawColor = sessionData.favoriteColor?.trim() ?? "";
              const hasColor =
                typeof window !== "undefined" &&
                typeof CSS !== "undefined" &&
                rawColor.length > 0 &&
                CSS.supports("color", rawColor);
              const safeColor = hasColor ? rawColor : "";
              const safeAnimal = sessionData.favoriteAnimal?.trim() || "mystery buddy";
              const canCreateStory = Boolean(profileId && sessionData.subject);
              return (
                <>
            <div className="flex flex-col gap-3">
              <h2 className="text-2xl font-semibold" style={{ color: colors.textPrimary }}>
                All set!
              </h2>
              <div
                style={{
                  fontFamily: typography.display,
                  fontSize: "2.5rem",
                  color: colors.accent,
                  lineHeight: 1,
                }}
              >
                {sessionData.name ? `${sessionData.name}!` : "You did it!"}
              </div>
              <p className="text-base" style={{ color: colors.textMuted }}>
                Spriggle saved your magic door choices.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <div
                className="flex items-center gap-2 px-5 py-3"
                style={{
                  borderRadius: radii.pill,
                  backgroundColor: safeColor
                    ? safeColor
                    : hexToRgba(colors.primaryLight, 0.35),
                  border: `2px solid ${hexToRgba(colors.primaryLight, 0.4)}`,
                  color: colors.background,
                  fontFamily: typography.ui,
                  fontSize: "1rem",
                  fontWeight: 600,
                  boxShadow: `0 10px 24px ${hexToRgba(colors.primaryLight, 0.25)}`,
                }}
              >
                <span>Favorite animal:</span>
                <span style={{ color: colors.background }}>{safeAnimal}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              {canCreateStory && (
                <Button label="Create story" variant="confirm" onClick={handleCreateStory} />
              )}
              <Button label="Start over" variant="outline" onClick={handleStartOver} />
            </div>
                </>
              );
            })()}
            {profileId && (
              <p className="text-sm" style={{ color: colors.textMuted }}>
                Profile ID: {profileId}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface ToneCardProps {
  tone: StoryTone;
  label: string;
  onClick: () => void;
}

/**
 * Renders a 3-second looping animation clip for the Calm tone.
 */
function CalmClip({ disableAnimations }: { disableAnimations: boolean }) {
  return (
    <div className="relative flex h-16 w-16 items-center justify-center">
      {/* Ripple ring */}
      <div
        className={`absolute h-16 w-16 rounded-full ${disableAnimations ? "" : "animate-vibe-calm-ring"}`}
        style={{ backgroundColor: hexToRgba(colors.space, 0.35) }}
      />
      {/* Pulsing orb */}
      <div
        className={`h-10 w-10 rounded-full ${disableAnimations ? "" : "animate-vibe-calm"}`}
        style={{
          background: `radial-gradient(circle at 35% 35%, ${colors.primaryLight}, ${colors.space})`,
        }}
      />
    </div>
  );
}

/**
 * Renders a 3-second looping animation clip for the Exciting tone.
 */
function ExcitingClip({ disableAnimations }: { disableAnimations: boolean }) {
  return (
    <div className="relative flex h-16 w-16 items-center justify-center">
      <div className={disableAnimations ? "" : "animate-vibe-exciting"}>
        <svg width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden>
          <polygon
            points="22,2 26.5,16 40,16 29.5,24.5 33.5,38 22,30 10.5,38 14.5,24.5 4,16 17.5,16"
            fill={colors.accent}
            stroke={colors.math}
            strokeWidth="1.5"
          />
        </svg>
      </div>
      {/* Sparks */}
      <div
        className={`absolute h-2 w-2 rounded-full ${disableAnimations ? "opacity-0" : "animate-vibe-exciting-spark"}`}
        style={{ backgroundColor: colors.accent, top: "4px", right: "6px" }}
      />
      <div
        className={`absolute h-2 w-2 rounded-full ${disableAnimations ? "opacity-0" : "animate-vibe-exciting-spark"}`}
        style={{ backgroundColor: colors.math, top: "10px", left: "4px", animationDelay: "0.9s" }}
      />
    </div>
  );
}

/**
 * Renders a 3-second looping animation clip for the Silly tone.
 */
function SillyClip({ disableAnimations }: { disableAnimations: boolean }) {
  return (
    <div className="relative flex h-16 w-16 items-center justify-center">
      <div className={disableAnimations ? "" : "animate-vibe-silly-body"}>
        <svg width="52" height="52" viewBox="0 0 52 52" fill="none" aria-hidden>
          <circle
            cx="26" cy="26" r="22"
            fill={hexToRgba(colors.animals, 0.25)}
            stroke={colors.animals}
            strokeWidth="2"
          />
          <ellipse
            className={disableAnimations ? "" : "animate-vibe-silly-eye"}
            cx="18" cy="22" rx="3" ry="4"
            fill={colors.textPrimary}
          />
          <ellipse
            className={disableAnimations ? "" : "animate-vibe-silly-eye"}
            cx="34" cy="22" rx="3" ry="4"
            fill={colors.textPrimary}
            style={{ animationDelay: "0.15s" }}
          />
          <path
            d="M14 32 Q19 40 26 38 Q33 40 38 32"
            stroke={colors.accent}
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      </div>
    </div>
  );
}

/**
 * Animated tone card for story vibe selection with a 3-second looping clip per vibe.
 */
function ToneCard({ tone, label, onClick }: ToneCardProps) {
  const { disableAnimations } = useAccessibility();

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[140px] flex-col items-center justify-center gap-3 px-4 py-6 text-center ${
        disableAnimations ? "" : "transition-transform hover:scale-[1.02]"
      }`}
      aria-label={`Choose ${label} tone`}
      style={{ ...getToneCardStyle(), fontFamily: typography.ui, color: colors.textPrimary }}
    >
      {tone === "calm" && <CalmClip disableAnimations={disableAnimations} />}
      {tone === "exciting" && <ExcitingClip disableAnimations={disableAnimations} />}
      {tone === "silly" && <SillyClip disableAnimations={disableAnimations} />}
      <span className="text-lg font-semibold">{label}</span>
    </button>
  );
}
