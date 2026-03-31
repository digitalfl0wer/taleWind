"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { IntakeRequest, IntakeResponse, IntakeSessionData, IntakeStep } from "@/types/Intake";
import type { ReadingMode, StoryTone, Subject } from "@/types/Child";
import { Spriggle } from "@/app/components/Spriggle";
import { SpeechBubble } from "@/app/components/SpeechBubble";
import { SubjectDoor } from "@/app/components/SubjectDoor";
import { Button } from "@/app/components/ui/Button";
import { Pill } from "@/app/components/ui/Pill";
import { VoiceCommandBar } from "@/app/components/ui/VoiceCommandBar";
import { colors, radii, typography } from "@/styles/tokens";
import { hexToRgba } from "@/app/components/ui/colorUtils";
import { useAccessibility } from "@/app/components/AccessibilityProvider";
import { useSpeechRecognition } from "./hooks/useSpeechRecognition";

const DEFAULT_SESSION_DATA: IntakeSessionData = {
  retryCount: 0,
  lastQuestionAsked: -1,
};

const STEP_OPTIONS: Partial<Record<IntakeStep, string[]>> = {
  name: ["Ava", "Leo", "Mia", "Noah", "Luna", "Owen"],
  color: ["Blue", "Purple", "Pink", "Green", "Yellow", "Orange"],
  animal: ["Fox", "Bunny", "Dog", "Cat", "Dolphin", "Turtle"],
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
  const searchParams = useSearchParams();
  const childId = searchParams.get("childId") ?? undefined;
  const parentIdParam = searchParams.get("parentId");
  const parentId = parentIdParam?.trim() || "demo-parent";
  const isReturnSession = Boolean(childId);
  const { updatePrefs } = useAccessibility();

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
  const [intakeStart] = useState<number>(() => Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [profileId, setProfileId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const initialStepRef = useRef<IntakeStep | "complete">(step);

  /**
   * Plays Spriggle's TTS audio and resolves when playback ends.
   *
   * @param audioBase64 - Base64-encoded MP3 audio.
   */
  const playSpriggleAudio = useCallback(async (audioBase64: string) => {
    if (!audioBase64) return;
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(`data:audio/mp3;base64,${audioBase64}`);
    audioRef.current = audio;
    try {
      await audio.play();
      return new Promise<void>((resolve) => {
        audio.onended = () => resolve();
      });
    } catch (error) {
      console.warn("[intake] audio playback blocked", error);
      return;
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
        if (!res.ok || data.error) {
          setSpriggleText("Oops! Let's try that again! 🌟");
          setIsLoading(false);
          return;
        }
        await handleResponse(data);
      } catch (error) {
        console.error("[intake] request failed", error);
        setSpriggleText("Oops! Let's try that again! 🌟");
      } finally {
        setIsLoading(false);
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
   * Handles a recognition failure and retries as needed.
   *
   * @param reason - Failure reason.
   */
  const handleRecognitionFailure = useCallback(
    (reason: "silence" | "unrecognized" | "error") => {
      const nextCount = unrecognizedCount + 1;
      setUnrecognizedCount(nextCount);
      if (reason === "silence") {
        setSpriggleText("I'm listening! Take your time. 🌟");
      } else {
        setSpriggleText("Oops! Let's try that again! 🌟");
      }

      if (nextCount >= 2) {
        stop();
        return;
      }

      if (sttConfig.listen) {
        listen(sttConfig.timeoutMs);
      }
    },
    [listen, sttConfig.listen, sttConfig.timeoutMs, stop, unrecognizedCount]
  );

  const { isSupported, isListening, listen, stop } = useSpeechRecognition({
    onResult: (transcript) => {
      const allowedOptions = STEP_OPTIONS[step as IntakeStep] ?? [];
      const matched = allowedOptions.length
        ? matchOption(transcript, allowedOptions)
        : null;
      if (!matched) {
        handleRecognitionFailure("unrecognized");
        return;
      }
      setUnrecognizedCount(0);
      void sendStep(step as IntakeStep, matched);
    },
    onFailure: handleRecognitionFailure,
  });

  const activeOptions = useMemo(() => {
    return STEP_OPTIONS[step as IntakeStep] ?? [];
  }, [step]);

  /**
   * Toggles the microphone listening state.
   */
  const handleMicClick = useCallback(() => {
    if (!isSupported) {
      setSpriggleText("Oops! Let's try that again! 🌟");
      return;
    }
    if (isListening) {
      stop();
    } else if (sttConfig.listen) {
      listen(sttConfig.timeoutMs);
    }
  }, [isListening, isSupported, listen, sttConfig.listen, sttConfig.timeoutMs, stop]);

  /**
   * Confirms the summary and advances the flow.
   */
  const handleConfirm = useCallback(() => {
    void sendStep("confirm");
  }, [sendStep]);

  /**
   * Triggers the confirm/retry loop.
   */
  const handleRetry = useCallback(() => {
    setUnrecognizedCount(0);
    void sendStep("retry");
  }, [sendStep]);

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

  useEffect(() => {
    void sendStep(initialStepRef.current as IntakeStep);
  }, [sendStep]);

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
  }, [step]);

  const showIntroScreen = step === "name" || step === "color" || step === "animal";
  const showConfirmScreen = step === "confirm" || step === "retry";
  const showSubjectScreen = step === "subject";
  const showReadingScreen = step === "reading_mode";
  const showToneScreen = step === "tone";
  const showReturnScreen = step === "return_question" || step === "return_answer";

  const listeningActive = sttConfig.listen && isListening;

  return (
    <div className="flex flex-1 flex-col items-center px-6 pb-10 pt-10 md:px-12">
      <div className="flex w-full max-w-5xl flex-col items-center gap-6">
        <Spriggle />
        <SpeechBubble text={spriggleText} />
        <VoiceCommandBar
          isListening={sttConfig.listen}
          mode="intake"
          className="max-w-xl"
        />
      </div>

      <div className="mt-10 flex w-full max-w-5xl flex-1 flex-col gap-6">
        {showIntroScreen && (
          <div className="flex flex-col gap-6 p-6 md:p-10" style={getPanelStyle()}>
            <h2 className="text-2xl font-semibold" style={{ color: colors.textPrimary }}>
              {step === "name"
                ? "What's your name?"
                : step === "color"
                ? "What's your favorite color?"
                : "What's your favorite animal?"}
            </h2>
            <div className="flex flex-col gap-4">
              {activeOptions.length > 0 && (
                <div className="flex flex-wrap gap-3">
                  {activeOptions.map((option) => (
                    <Pill
                      key={option}
                      label={option}
                      type="button"
                      onClick={() => void sendStep(step as IntakeStep, option)}
                    />
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-3">
                <Button
                  label={listeningActive ? "Listening..." : "Mic"}
                  variant="outline"
                  onClick={handleMicClick}
                  disabled={!sttConfig.listen || isLoading}
                />
              </div>
            </div>
            {!isSupported && (
              <p className="text-sm" style={{ color: colors.textMuted }}>
                Voice input isn't available here. Use the choices below.
              </p>
            )}
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
                        onClick={() => void sendStep(step as IntakeStep, option)}
                      />
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-3">
                  <Button
                    label={listeningActive ? "Listening..." : "Mic"}
                    variant="outline"
                    onClick={handleMicClick}
                    disabled={!sttConfig.listen}
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
              {`So you're ${sessionData.name ?? "friend"}, your favorite color is ${
                sessionData.favoriteColor ?? "..."
              }, and you love ${sessionData.favoriteAnimal ?? "..."}!`}
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
                label="Calm"
                onClick={() => handleTone("calm")}
              />
              <ToneCard
                label="Exciting"
                onClick={() => handleTone("exciting")}
              />
              <ToneCard
                label="Silly"
                onClick={() => handleTone("silly")}
              />
            </div>
          </div>
        )}

        {step === "complete" && (
          <div className="flex flex-col gap-4 p-6 md:p-10" style={getPanelStyle()}>
            <h2 className="text-2xl font-semibold" style={{ color: colors.textPrimary }}>
              All set!
            </h2>
            <p className="text-base" style={{ color: colors.textMuted }}>
              Spriggle saved your magic door choices.
            </p>
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
  label: string;
  onClick: () => void;
}

/**
 * Animated tone card for story vibe selection.
 */
function ToneCard({ label, onClick }: ToneCardProps) {
  const { disableAnimations } = useAccessibility();

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[120px] flex-col items-center justify-center gap-3 px-4 py-6 text-center ${
        disableAnimations ? "" : "transition-transform hover:scale-[1.02]"
      }`}
      aria-label={`Choose ${label} tone`}
      style={{ ...getToneCardStyle(), fontFamily: typography.ui, color: colors.textPrimary }}
    >
      <div
        className="h-12 w-12 rounded-full"
        style={{
          background: `linear-gradient(140deg, ${hexToRgba(
            colors.primaryLight,
            0.65
          )}, ${hexToRgba(colors.primaryDark, 0.2)})`,
        }}
      />
      <span className="text-lg font-semibold">{label}</span>
    </button>
  );
}
