"use client";

import React, { useMemo } from "react";
import { colors } from "@/styles/tokens";
import { useAccessibility } from "./AccessibilityProvider";

export interface StarfieldBackgroundProps {
  starCount?: number;
  className?: string;
}

interface StarSpec {
  id: number;
  top: string;
  left: string;
  size: number;
  delay: string;
  duration: string;
}

/**
 * Generates a deterministic pseudo-random number between 0 and 1.
 *
 * @param seed - Numeric seed.
 * @returns Number between 0 and 1.
 */
function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

/**
 * Starfield background with twinkling stars.
 */
export function StarfieldBackground({
  starCount = 40,
  className,
}: StarfieldBackgroundProps) {
  const { disableAnimations } = useAccessibility();

  const stars = useMemo<StarSpec[]>(() => {
    return Array.from({ length: starCount }, (_, index) => {
      const base = index + 1;
      const size = Math.max(2, Math.round(seededRandom(base) * 4));
      const top = `${Math.round(seededRandom(base * 7) * 100)}%`;
      const left = `${Math.round(seededRandom(base * 13) * 100)}%`;
      const delay = `${(seededRandom(base * 17) * 2).toFixed(2)}s`;
      const duration = `${(2 + seededRandom(base * 19) * 2).toFixed(2)}s`;

      return { id: index, top, left, size, delay, duration };
    });
  }, [starCount]);

  return (
    <div
      className={`pointer-events-none absolute inset-0 -z-10 ${className ?? ""}`}
      aria-hidden
    >
      {stars.map((star) => (
        <span
          key={star.id}
          className={`absolute rounded-full ${
            disableAnimations ? "" : "animate-twinkle"
          }`}
          style={{
            top: star.top,
            left: star.left,
            width: `${star.size}px`,
            height: `${star.size}px`,
            backgroundColor: colors.starfield,
            opacity: 0.6,
            animationDelay: star.delay,
            animationDuration: star.duration,
          }}
        />
      ))}
    </div>
  );
}
