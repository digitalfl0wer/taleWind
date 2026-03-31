"use client";

import React from "react";
import { colors, spriggleShadow } from "@/styles/tokens";
import { useAccessibility } from "./AccessibilityProvider";

export interface SpriggleProps {
  size?: number;
  className?: string;
}

/**
 * Spriggle SVG character with float animation and hover wiggle.
 */
export function Spriggle({ size = 180, className }: SpriggleProps) {
  const { disableAnimations } = useAccessibility();

  return (
    <div
      className={`spriggle ${disableAnimations ? "" : "animate-float"} ${
        className ?? ""
      }`}
      style={{ filter: spriggleShadow }}
      role="img"
      aria-label="Spriggle the magical guide"
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g className="spriggle-body">
          <circle cx="100" cy="105" r="70" fill={colors.primaryDark} />
          <circle cx="70" cy="85" r="16" fill={colors.primary} />
          <circle cx="130" cy="85" r="16" fill={colors.primary} />
          <circle cx="70" cy="85" r="8" fill={colors.textPrimary} />
          <circle cx="130" cy="85" r="8" fill={colors.textPrimary} />
          <path
            d="M70 125C80 140 120 140 130 125"
            stroke={colors.accent}
            strokeWidth="8"
            strokeLinecap="round"
          />
          <path
            d="M45 50C60 25 90 15 100 15C110 15 140 25 155 50"
            stroke={colors.primaryLight}
            strokeWidth="10"
            strokeLinecap="round"
          />
        </g>
        <circle cx="30" cy="40" r="8" fill={colors.accent} />
        <circle cx="170" cy="40" r="8" fill={colors.accent} />
      </svg>
    </div>
  );
}
