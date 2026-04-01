"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Spriggle } from "@/app/components/Spriggle";
import { SpeechBubble } from "@/app/components/SpeechBubble";
import { Input } from "@/app/components/ui/Input";
import { Button } from "@/app/components/ui/Button";
import { VoiceCommandBar } from "@/app/components/ui/VoiceCommandBar";
import { colors, radii, typography } from "@/styles/tokens";
import { hexToRgba } from "@/app/components/ui/colorUtils";
import {
  useSpeechRecognition,
  type SpeechRecognitionFailure,
} from "@/app/child/intake/hooks/useSpeechRecognition";
import type { Story } from "@/types/Story";
import type { QuizAnswer } from "@/types/Quiz";
import type {
  QuizGenerateRequest,
  QuizGenerateResponse,
  QuizQuestionPublic,
  QuizScoreRequest,
  QuizScoreResponse,
} from "@/types/Api";

const QUIZ_STORAGE_KEY = "talewind-active-story";
const STT_TIMEOUT_MS = 8000;

/**
 * Builds shared panel styling for quiz containers.
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
 * Parses a story payload from a query param or stored string.
 *
 * @param raw - Raw story string.
 * @returns Story object or null.
 */
function parseStoryPayload(raw: string | null): Story | null {
  if (!raw) return null;
  try {
    const decoded = raw.startsWith("{") ? raw : atob(raw);
    const parsed = JSON.parse(decoded) as unknown;
    return isStoryLike(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Checks if a value looks like a Story.
 *
 * @param value - Unknown value to validate.
 * @returns True if the value has the expected Story shape.
 */
function isStoryLike(value: unknown): value is Story {
  if (!value || typeof value !== "object") return false;
  const story = value as Story;
  return (
    typeof story.title === "string" &&
    typeof story.id === "string" &&
    Array.isArray(story.scenes)
  );
}

/**
 * Loads the most recent story from session storage.
 *
 * @returns Story or null.
 */
function loadStoryFromStorage(): Story | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(QUIZ_STORAGE_KEY);
  return parseStoryPayload(raw);
}

/**
 * Quiz UI for a single question at a time.
 */
function QuizPageContent() {
  const searchParams = useSearchParams();
  const childId = searchParams.get("childId") ?? "";
  const storyParam = searchParams.get("story");

  const [story, setStory] = useState<Story | null>(null);
  const [questions, setQuestions] = useState<QuizQuestionPublic[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [answers, setAnswers] = useState<QuizAnswer[]>([]);
  const [inputValue, setInputValue] = useState<string>("");
  const [spriggleText, setSpriggleText] = useState<string>(
    "Ready for a few story questions? 🌟"
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isComplete, setIsComplete] = useState<boolean>(false);
  const onResultRef = useRef<(transcript: string) => void>(() => {});
  const onFailureRef = useRef<(reason: SpeechRecognitionFailure) => void>(() => {});

  const activeQuestion = questions[activeIndex] ?? null;
  const progressLabel = useMemo(() => {
    if (!questions.length) return "";
    return `Question ${activeIndex + 1} of ${questions.length}`;
  }, [activeIndex, questions.length]);

  const { isSupported, isListening, listen, stop } = useSpeechRecognition({
    onResult: useCallback((transcript: string) => onResultRef.current(transcript), []),
    onFailure: useCallback(
      (reason: SpeechRecognitionFailure) => onFailureRef.current(reason),
      []
    ),
  });

  /**
   * Loads story data from query params or session storage.
   */
  const hydrateStory = useCallback(() => {
    const fromQuery = parseStoryPayload(storyParam);
    if (fromQuery) {
      setStory(fromQuery);
      return;
    }
    setStory(loadStoryFromStorage());
  }, [storyParam]);

  /**
   * Fetches quiz questions for the current story.
   *
   * @param quizStory - Story to generate questions from.
   */
  const fetchQuestions = useCallback(
    async (quizStory: Story) => {
      if (!childId) return;
      setIsLoading(true);
      const payload: QuizGenerateRequest = {
        mode: "generate",
        childId,
        story: quizStory,
      };
      try {
        const response = await fetch("/api/quiz", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = (await response.json()) as QuizGenerateResponse;
        if (!response.ok || !data.questions?.length) {
          setSpriggleText("Oops! Let's try again! 🌟");
          return;
        }
        setQuestions(data.questions);
        setActiveIndex(0);
        setSpriggleText("Let's answer them together! 🌟");
      } catch (error) {
        console.error("[quiz] fetch failed", error);
        setSpriggleText("Oops! Let's try again! 🌟");
      } finally {
        setIsLoading(false);
      }
    },
    [childId]
  );

  /**
   * Scores the quiz after the final answer.
   *
   * @param finalAnswers - Collected answers.
   * @param quizQuestions - Quiz questions sent to the API.
   */
  const scoreQuiz = useCallback(
    async (finalAnswers: QuizAnswer[], quizQuestions: QuizQuestionPublic[]) => {
      if (!story || !childId) return;
      const payload: QuizScoreRequest = {
        mode: "score",
        childId,
        story,
        questions: quizQuestions,
        answers: finalAnswers,
      };
      try {
        const response = await fetch("/api/quiz", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = (await response.json()) as QuizScoreResponse;
        if (!response.ok || !data.score) {
          setSpriggleText("Thanks for trying! 🌟");
          return;
        }
        const totalScore = data.score.totalScore ?? 0;
        if (totalScore >= 80) {
          setSpriggleText("Wow! You did amazing! 🌟");
        } else if (totalScore >= 50) {
          setSpriggleText("Great effort! 🌟");
        } else {
          setSpriggleText("Thanks for giving it a try! 🌟");
        }
      } catch (error) {
        console.error("[quiz] scoring failed", error);
        setSpriggleText("Thanks for trying! 🌟");
      }
    },
    [childId, story]
  );

  /**
   * Submits an answer and advances the quiz.
   *
   * @param inputMode - Input mode used by the child.
   * @param valueOverride - Optional value override for voice input.
   */
  const handleSubmitAnswer = useCallback(
    async (inputMode: QuizAnswer["inputMode"], valueOverride?: string) => {
      if (!activeQuestion || isSubmitting) return;
      const answerText = (valueOverride ?? inputValue).trim();
      if (!answerText) {
        setSpriggleText("That's okay. Want to try again? 🌟");
        return;
      }
      stop();
      setIsSubmitting(true);
      const answer: QuizAnswer = {
        questionId: activeQuestion.id,
        answerText,
        inputMode,
      };
      const updatedAnswers = [...answers, answer];
      setAnswers(updatedAnswers);
      setInputValue("");

      const isLast = activeIndex >= questions.length - 1;
      if (isLast) {
        setIsComplete(true);
        await scoreQuiz(updatedAnswers, questions);
      } else {
        setActiveIndex((prev) => prev + 1);
        setSpriggleText("Nice! Let's do the next one. 🌟");
      }
      setIsSubmitting(false);
    },
    [
      activeIndex,
      activeQuestion,
      answers,
      inputValue,
      isSubmitting,
      questions,
      scoreQuiz,
      stop,
    ]
  );

  onResultRef.current = (transcript: string) => {
    setInputValue(transcript);
    void handleSubmitAnswer("voice", transcript);
  };

  onFailureRef.current = (reason: SpeechRecognitionFailure) => {
    if (reason === "silence") {
      setSpriggleText("I'm listening! Take your time. 🌟");
    } else {
      setSpriggleText("Oops! Let's try again! 🌟");
    }
  };

  /**
   * Starts voice input capture.
   */
  const handleVoiceClick = useCallback(() => {
    if (!isSupported || isListening) return;
    listen(STT_TIMEOUT_MS);
  }, [isListening, isSupported, listen]);

  /**
   * Handles typed input submission.
   */
  const handleTypedSubmit = useCallback(() => {
    void handleSubmitAnswer("typed");
  }, [handleSubmitAnswer]);

  /**
   * Handles Enter key in the input field.
   *
   * @param event - Keyboard event.
   */
  const handleInputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void handleSubmitAnswer("typed");
      }
    },
    [handleSubmitAnswer]
  );

  useEffect(() => {
    hydrateStory();
  }, [hydrateStory]);

  useEffect(() => {
    if (!story) return;
    void fetchQuestions(story);
  }, [fetchQuestions, story]);

  if (!childId || !story) {
    return (
      <div className="flex flex-1 flex-col items-center gap-6 px-6 pb-10 pt-10">
        <Spriggle />
        <SpeechBubble text="Oops! I need your story setup. Let's go back and try again. 🌟" />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col items-center gap-6 px-6 pb-10 pt-10">
        <Spriggle />
        <SpeechBubble text="Spriggle is getting your quiz ready..." />
      </div>
    );
  }

  if (!questions.length) {
    return (
      <div className="flex flex-1 flex-col items-center gap-6 px-6 pb-10 pt-10">
        <Spriggle />
        <SpeechBubble text="Oops! Let's try again! 🌟" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center gap-8 px-6 pb-10 pt-10">
      <div className="flex w-full max-w-5xl flex-col items-center gap-6">
        <Spriggle />
        <SpeechBubble text={spriggleText} />
      </div>

      <div className="flex w-full max-w-3xl flex-col gap-6">
        <div className="flex flex-col gap-4 p-6" style={getPanelStyle()}>
          <div className="flex flex-col gap-2">
            <span
              className="text-sm font-semibold uppercase tracking-wide"
              style={{ color: colors.textMuted, fontFamily: typography.ui }}
            >
              {progressLabel}
            </span>
            <h2
              className="text-2xl font-semibold"
              style={{ color: colors.textPrimary, fontFamily: typography.narration }}
            >
              {activeQuestion?.question}
            </h2>
            {activeQuestion?.hint && (
              <p
                className="text-base"
                style={{ color: colors.textMuted, fontFamily: typography.ui }}
              >
                {activeQuestion.hint}
              </p>
            )}
          </div>

          {!isComplete && (
            <div className="flex flex-col gap-4">
              <Input
                label="Your answer"
                placeholder="Type your answer"
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                onKeyDown={handleInputKeyDown}
              />
              <div className="flex flex-col gap-3 md:flex-row">
                <Button
                  label={isListening ? "Listening..." : "Use my voice"}
                  variant="secondary"
                  onClick={handleVoiceClick}
                  disabled={!isSupported || isListening || isSubmitting}
                />
                <Button
                  label={isSubmitting ? "Checking..." : "Submit"}
                  onClick={handleTypedSubmit}
                  disabled={isSubmitting || !inputValue.trim()}
                />
              </div>
              {!isSupported && (
                <p className="text-sm" style={{ color: colors.textMuted }}>
                  Voice input isn&apos;t available here. Use the text box instead.
                </p>
              )}
              <VoiceCommandBar isListening={isListening} mode="quiz" />
            </div>
          )}
          {isComplete && (
            <p
              className="text-lg font-semibold"
              style={{ color: colors.accent, fontFamily: typography.ui }}
            >
              All done! 🌟
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function QuizPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center px-6 py-10">
          <p style={{ color: colors.textMuted, fontFamily: typography.ui }}>
            Loading quiz...
          </p>
        </div>
      }
    >
      <QuizPageContent />
    </React.Suspense>
  );
}
