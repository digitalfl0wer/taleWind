"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Spriggle } from "@/app/components/Spriggle";
import { SpeechBubble } from "@/app/components/SpeechBubble";
import { SceneCard } from "@/app/components/SceneCard";
import { CaptionBar } from "@/app/components/CaptionBar";
import {
  VoiceCommandPanel,
  type VoiceCommandKey,
} from "@/app/components/VoiceCommandPanel";
import { Button } from "@/app/components/ui/Button";
import { colors, typography } from "@/styles/tokens";
import { useAccessibility } from "@/app/components/AccessibilityProvider";
import { hexToRgba } from "@/app/components/ui/colorUtils";
import type { Story, StoryScene } from "@/types/Story";
import type {
  StoryRequest,
  StoryResponse,
  ImageRequest,
  ImageResponse,
  TtsRequest,
  TtsResponse,
  StoryExtendRequest,
  StoryExtendResponse,
} from "@/types/Api";
import type { Subject } from "@/types/Child";
import type { WordTiming } from "@/lib/azure/speech";
import { useVoiceCommands } from "./hooks/useVoiceCommands";

const DISABLED_COMMANDS: VoiceCommandKey[] = ["quiz_answer"];

/**
 * Maps narration speed preference to SSML rate.
 *
 * @param speed - Narration speed preference.
 * @returns SSML rate string.
 */
function mapNarrationRate(speed: "slower" | "normal" | "faster"): string {
  if (speed === "slower") return "-10%";
  if (speed === "faster") return "+10%";
  return "0%";
}

/**
 * Validates a subject query param.
 *
 * @param value - Raw subject value.
 * @returns Subject or null.
 */
function normalizeSubject(value: string | null): Subject | null {
  if (value === "animals" || value === "space" || value === "math") return value;
  return null;
}

/**
 * Validates a session number query param.
 *
 * @param value - Raw session value.
 * @returns Valid session number or null.
 */
function normalizeSessionNumber(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return null;
  return parsed;
}

/**
 * Builds a locally generated extra scene when the backend is unavailable.
 *
 * @param story - Current story.
 * @param sceneIndex - Active scene index for context.
 * @returns Mock story scene.
 */
function buildMockScene(story: Story, sceneIndex: number): StoryScene {
  const baseScene =
    story.scenes[sceneIndex] ?? story.scenes[story.scenes.length - 1];
  const subjectHint =
    story.subject === "animals"
      ? "a friendly animal friend"
      : story.subject === "space"
        ? "a new shimmering star"
        : "a bright pattern";
  return {
    index: story.scenes.length,
    title: "One More Wonder",
    narration: `Spriggle spots ${subjectHint} and smiles. The friends take one more gentle step together. It feels calm, brave, and bright.`,
    imagePrompt: `${baseScene.imagePrompt} Add a gentle extra moment with Spriggle cheering.`,
    imageUrl: null,
  };
}

/**
 * Builds a scene image alt description.
 *
 * @param scene - Story scene.
 * @returns Alt text string.
 */
function buildImageAlt(scene: StoryScene): string {
  return `Illustration for ${scene.title}`;
}

/**
 * Story reader with narration, captions, and voice commands.
 */
export default function StoryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const childId = searchParams.get("childId");
  const subject = normalizeSubject(searchParams.get("subject"));
  const sessionParam = searchParams.get("session");
  const sessionNumber = normalizeSessionNumber(sessionParam);
  const { prefs } = useAccessibility();

  const [story, setStory] = useState<Story | null>(null);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [spriggleText, setSpriggleText] = useState<string>(
    "Let's read together! 🌟"
  );
  const [wordTimings, setWordTimings] = useState<WordTiming[]>([]);
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(0);
  const [isNarrating, setIsNarrating] = useState<boolean>(false);
  const [madeEasierScenes, setMadeEasierScenes] = useState<number[]>([]);
  const [isLoadingStory, setIsLoadingStory] = useState<boolean>(false);
  const [isAppendingScene, setIsAppendingScene] = useState<boolean>(false);
  const [hasUserInteracted, setHasUserInteracted] = useState<boolean>(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const pendingPlayRef = useRef<(() => Promise<void>) | null>(null);

  const activeScene = story?.scenes[activeIndex] ?? null;
  const isValidQuery =
    Boolean(childId) && Boolean(subject) && sessionNumber !== null;
  const shouldMockExtend = process.env.NEXT_PUBLIC_MOCK_STORY_EXTEND === "true";
  const missingParamsText =
    "Oops! I need your story setup. Let's head back to the Magic Door. 🌟";

  /**
   * Updates the narration timer for caption sync.
   */
  const syncCaptionTime = useCallback(() => {
    if (!audioRef.current) return;
    setCurrentTimeMs(audioRef.current.currentTime * 1000);
    animationFrameRef.current = requestAnimationFrame(syncCaptionTime);
  }, []);

  /**
   * Stops caption sync loop.
   */
  const stopCaptionSync = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  /**
   * Plays narration audio and starts caption sync.
   *
   * @param audioBase64 - Base64 encoded MP3 audio.
   * @param timings - Word timing data.
   */
  const playNarration = useCallback(
    async (audioBase64: string, timings: WordTiming[]) => {
      if (!audioBase64) return;
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(`data:audio/mp3;base64,${audioBase64}`);
      audioRef.current = audio;
      setWordTimings(timings);
      setCurrentTimeMs(0);
      setIsNarrating(true);

      audio.onended = () => {
        setIsNarrating(false);
        stopCaptionSync();
      };
      audio.onpause = () => {
        setIsNarrating(false);
        stopCaptionSync();
      };

      try {
        await audio.play();
        syncCaptionTime();
      } catch (error) {
        const isNotAllowedError =
          error instanceof DOMException && error.name === "NotAllowedError";
        if (isNotAllowedError) {
          console.warn("[story] audio playback blocked by browser policy");
          // Store the play function to retry when user interacts
          pendingPlayRef.current = () => audio.play().then(() => syncCaptionTime());
          setIsNarrating(false);
          stopCaptionSync();
        } else {
          console.warn("[story] audio playback failed", error);
          setIsNarrating(false);
          stopCaptionSync();
        }
      }
    },
    [stopCaptionSync, syncCaptionTime]
  );

  /**
   * Fetches the story from the API.
   */
  const fetchStory = useCallback(async () => {
    if (!childId || !subject || sessionNumber === null) return;
    setIsLoadingStory(true);
    const payload: StoryRequest = {
      childId,
      subject,
      sessionNumber,
    };
    try {
      const response = await fetch("/api/story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as StoryResponse;
      if (!response.ok || !data.story) {
        setSpriggleText("Oops! Let's try again! 🌟");
        return;
      }
      setStory(data.story);
      setActiveIndex(0);
    } catch (error) {
      console.error("[story] fetch failed", error);
      setSpriggleText("Oops! Let's try again! 🌟");
    } finally {
      setIsLoadingStory(false);
    }
  }, [childId, subject, sessionNumber]);

  /**
   * Ensures a scene image is fetched if missing.
   *
   * @param scene - Story scene.
   */
  const ensureSceneImage = useCallback(
    async (scene: StoryScene) => {
      if (!scene || scene.imageUrl) return;
      const payload: ImageRequest = {
        prompt: scene.imagePrompt,
      };
      try {
        const response = await fetch("/api/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = (await response.json()) as ImageResponse;
        if (!response.ok || !data.imageUrl) return;
        setStory((prev) => {
          if (!prev) return prev;
          const updatedScenes = prev.scenes.map((s) =>
            s.index === scene.index ? { ...s, imageUrl: data.imageUrl } : s
          );
          return { ...prev, scenes: updatedScenes };
        });
      } catch (error) {
        console.error("[story] image fetch failed", error);
      }
    },
    []
  );

  /**
   * Fetches narration audio for the active scene.
   *
   * @param scene - Active scene.
   */
  const fetchNarration = useCallback(
    async (scene: StoryScene) => {
      const payload: TtsRequest = {
        text: scene.narration,
        voiceRole: "narration",
        rate: mapNarrationRate(prefs.narrationSpeed),
      };
      try {
        const response = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = (await response.json()) as TtsResponse;
        if (!response.ok || !data.audioBase64) return;
        await playNarration(data.audioBase64, data.wordTimings);
      } catch (error) {
        console.error("[story] narration fetch failed", error);
      }
    },
    [playNarration, prefs.narrationSpeed]
  );

  /**
   * Replays the current narration from the start.
   */
  const replayNarration = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = 0;
    void audioRef.current.play();
    setIsNarrating(true);
    syncCaptionTime();
  }, [syncCaptionTime]);

  /**
   * Advances to the next scene if available.
   */
  const goToNextScene = useCallback(() => {
    if (!story) return;
    if (activeIndex >= story.scenes.length - 1) return;
    setActiveIndex((prev) => prev + 1);
  }, [activeIndex, story]);

  /**
   * Marks the current scene as needing easier narration.
   */
  const markEasier = useCallback(() => {
    setMadeEasierScenes((prev) =>
      prev.includes(activeIndex) ? prev : [...prev, activeIndex]
    );
    setSpriggleText("Got it! I'll make it easier next time. 🌟");
  }, [activeIndex]);

  /**
   * Applies a newly appended scene to the story.
   *
   * @param scene - Scene to append.
   */
  const applyAppendedScene = useCallback((scene: StoryScene) => {
    setStory((prev) => {
      if (!prev) return prev;
      const nextIndex = prev.scenes.length;
      const appended: StoryScene = { ...scene, index: nextIndex };
      return { ...prev, scenes: [...prev.scenes, appended] };
    });
    setSpriggleText("Here's a little more! 🌟");
  }, []);

  /**
   * Requests an extra scene from the backend.
   */
  const appendExtraScene = useCallback(async () => {
    if (!story || !childId || isAppendingScene) return;
    setIsAppendingScene(true);
    // BACKEND AGENT NEEDED: Add /api/story/extend to return a single new scene.
    const payload: StoryExtendRequest = {
      childId,
      story,
      sceneIndex: activeIndex,
    };
    if (shouldMockExtend) {
      applyAppendedScene(buildMockScene(story, activeIndex));
      setIsAppendingScene(false);
      return;
    }
    try {
      const response = await fetch("/api/story/extend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.status === 404) {
        applyAppendedScene(buildMockScene(story, activeIndex));
        return;
      }
      const data = (await response.json()) as StoryExtendResponse;
      if (!response.ok || !data.scene) {
        setSpriggleText("Oops! Let's try again! 🌟");
        return;
      }
      applyAppendedScene(data.scene);
    } catch (error) {
      console.error("[story] extend failed", error);
      setSpriggleText("Oops! Let's try again! 🌟");
    } finally {
      setIsAppendingScene(false);
    }
  }, [
    activeIndex,
    applyAppendedScene,
    childId,
    isAppendingScene,
    shouldMockExtend,
    story,
  ]);

  /**
   * Handles voice command input from STT or buttons.
   *
   * @param command - Recognized voice command.
   */
  const handleCommand = useCallback(
    (command: VoiceCommandKey) => {
      if (command === "say_it_again") {
        replayNarration();
        return;
      }
      if (command === "next") {
        goToNextScene();
        return;
      }
      if (command === "make_it_easier") {
        markEasier();
        return;
      }
      if (command === "tell_me_more") {
        void appendExtraScene();
        return;
      }
      if (command === "quiz_answer") {
        setSpriggleText("We'll answer questions a little later! 🌟");
      }
    },
    [appendExtraScene, goToNextScene, markEasier, replayNarration]
  );

  const { isSupported, isListening } = useVoiceCommands({
    enabled: false,
    paused: isNarrating,
    onCommand: handleCommand,
    onUnrecognized: () => {
      setSpriggleText("Oops! Let's try again! 🌟");
    },
  });

  useEffect(() => {
    if (!isValidQuery) return;
    void fetchStory();
  }, [fetchStory, isValidQuery]);

  useEffect(() => {
    if (!activeScene) return;
    void ensureSceneImage(activeScene);
    const nextScene = story?.scenes[activeIndex + 1];
    if (nextScene) {
      void ensureSceneImage(nextScene);
    }
    void fetchNarration(activeScene);
  }, [activeIndex, activeScene, ensureSceneImage, fetchNarration, story]);

  useEffect(() => {
    return () => {
      stopCaptionSync();
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, [stopCaptionSync]);

  /**
   * Detects first user interaction and retries pending audio if needed.
   */
  useEffect(() => {
    if (hasUserInteracted) return;

    const handleUserInteraction = async () => {
      setHasUserInteracted(true);
      // Retry any pending audio play
      if (pendingPlayRef.current) {
        try {
          await pendingPlayRef.current();
          pendingPlayRef.current = null;
          setIsNarrating(true);
        } catch (error) {
          console.warn("[story] failed to retry audio playback", error);
          pendingPlayRef.current = null;
        }
      }
      // Remove listeners once user has interacted
      document.removeEventListener("pointerdown", handleUserInteraction);
      document.removeEventListener("keydown", handleUserInteraction);
    };

    document.addEventListener("pointerdown", handleUserInteraction, { once: true });
    document.addEventListener("keydown", handleUserInteraction, { once: true });

    return () => {
      document.removeEventListener("pointerdown", handleUserInteraction);
      document.removeEventListener("keydown", handleUserInteraction);
    };
  }, [hasUserInteracted]);

  const progressLabel = useMemo(() => {
    if (!story) return "";
    return `Scene ${activeIndex + 1} of ${story.scenes.length}`;
  }, [activeIndex, story]);

  /**
   * Sends the child back to the Magic Door flow.
   */
  const handleReturnToIntake = useCallback(() => {
    router.push("/child/intake");
  }, [router]);

  /**
   * Retries the story fetch.
   */
  const handleRetryStory = useCallback(() => {
    void fetchStory();
  }, [fetchStory]);

  if (isLoadingStory) {
    return (
      <div className="flex flex-1 flex-col items-center gap-6 px-6 pb-10 pt-10">
        <Spriggle />
        <SpeechBubble text="Spriggle is gathering your story..." />
      </div>
    );
  }

  if (!isValidQuery) {
    return (
      <div className="flex flex-1 flex-col items-center gap-6 px-6 pb-10 pt-10">
        <Spriggle />
        <SpeechBubble text={missingParamsText} />
        <Button label="Back to Magic Door" onClick={handleReturnToIntake} />
      </div>
    );
  }

  if (!story) {
    return (
      <div className="flex flex-1 flex-col items-center gap-6 px-6 pb-10 pt-10">
        <Spriggle />
        <SpeechBubble text={spriggleText} />
        <Button label="Try again" onClick={handleRetryStory} />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center gap-8 px-6 pb-10 pt-10">
      <div className="flex w-full max-w-5xl flex-col items-center gap-6">
        <Spriggle />
        <SpeechBubble text={spriggleText} />
      </div>

      <div className="flex w-full max-w-5xl flex-col gap-6">
        {activeScene && (
          <SceneCard
            title={activeScene.title}
            imageUrl={activeScene.imageUrl}
            imageAlt={buildImageAlt(activeScene)}
            isMarkedEasy={madeEasierScenes.includes(activeIndex)}
          >
            <CaptionBar
              narration={activeScene.narration}
              wordTimings={wordTimings}
              currentTimeMs={currentTimeMs}
              fontSizePx={prefs.captionFontSize}
            />
          </SceneCard>
        )}

        {story && (
          <div
            className="flex items-center justify-between gap-4"
            style={{ color: colors.textPrimary, fontFamily: typography.ui }}
          >
            <span className="text-sm font-semibold uppercase tracking-wide">
              {progressLabel}
            </span>
            <div className="flex items-center gap-2">
              {story.scenes.map((scene) => (
                <span
                  key={`dot-${scene.index}`}
                  className="h-2 w-2 rounded-full"
                  style={{
                    backgroundColor:
                      scene.index === activeIndex
                        ? colors.accent
                        : hexToRgba(colors.primaryLight, 0.3),
                  }}
                />
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-4 md:flex-row">
          <Button label="Say it again" onClick={replayNarration} />
          <Button
            label="Next"
            variant="secondary"
            onClick={goToNextScene}
            disabled={!story || activeIndex >= (story?.scenes.length ?? 1) - 1}
          />
        </div>

        {!isSupported && (
          <p className="text-sm" style={{ color: colors.textMuted }}>
            Voice commands aren't available here. Use the buttons instead.
          </p>
        )}

        <VoiceCommandPanel
          listening={isListening && !isNarrating}
          onCommand={handleCommand}
          disabledCommands={DISABLED_COMMANDS}
        />
      </div>
    </div>
  );
}
