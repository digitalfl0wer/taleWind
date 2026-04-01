import React, { useMemo } from "react";
import { colors, typography } from "@/styles/tokens";
import type { WordTiming } from "@/lib/azure/speech";

export interface CaptionBarProps {
  narration: string;
  wordTimings: WordTiming[];
  currentTimeMs: number;
  fontSizePx: number;
}

interface CaptionWord {
  text: string;
  index: number;
}

/**
 * Builds caption words from timings or narration text.
 *
 * @param narration - Full narration string.
 * @param timings - Word timing data from TTS.
 * @returns Array of caption words.
 */
function buildCaptionWords(
  narration: string,
  timings: WordTiming[]
): CaptionWord[] {
  if (timings.length > 0) {
    return timings.map((timing, index) => ({ text: timing.word, index }));
  }
  return narration.split(/\s+/).map((word, index) => ({ text: word, index }));
}

/**
 * Finds the active word index based on audio time and word timings.
 *
 * @param timings - Word timing data from TTS.
 * @param currentTimeMs - Current playback time in ms.
 * @returns Active word index.
 */
function getActiveWordIndex(
  timings: WordTiming[],
  currentTimeMs: number
): number {
  if (timings.length === 0) return -1;
  for (let i = timings.length - 1; i >= 0; i -= 1) {
    if (currentTimeMs >= timings[i].offsetMs) return i;
  }
  return -1;
}

/**
 * CaptionBar renders narration captions and highlights the active word.
 */
export function CaptionBar({
  narration,
  wordTimings,
  currentTimeMs,
  fontSizePx,
}: CaptionBarProps) {
  const words = useMemo(
    () => buildCaptionWords(narration, wordTimings),
    [narration, wordTimings]
  );
  const activeIndex = useMemo(
    () => getActiveWordIndex(wordTimings, currentTimeMs),
    [currentTimeMs, wordTimings]
  );

  return (
    <div
      className="captions flex flex-wrap gap-2"
      style={{ fontFamily: typography.narration, fontSize: `${fontSizePx}px` }}
      aria-live="polite"
    >
      {words.map((word) => (
        <span
          key={`${word.text}-${word.index}`}
          style={{
            color:
              word.index === activeIndex
                ? colors.primaryLight
                : colors.textMuted,
          }}
        >
          {word.text}
        </span>
      ))}
    </div>
  );
}
