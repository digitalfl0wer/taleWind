"use client";

import React from "react";
import { colors, radii, typography } from "@/styles/tokens";
import { hexToRgba } from "./colorUtils";
import { useAccessibility } from "../AccessibilityProvider";
import { Pill } from "./Pill";

export type VoiceCommandMode = "intake" | "story" | "quiz";

export interface VoiceCommandBarProps {
  isListening: boolean;
  mode: VoiceCommandMode;
  commands?: string[];
  className?: string;
}

const DEFAULT_STORY_COMMANDS = [
  "Say it again",
  "Make it easier",
  "Tell me more",
  "Next",
];

/**
 * Compact voice command hint bar shown while STT is listening.
 */
export function VoiceCommandBar({
  isListening,
  mode,
  commands = DEFAULT_STORY_COMMANDS,
  className,
}: VoiceCommandBarProps) {
  const { disableAnimations } = useAccessibility();

  if (!isListening) return null;

  return (
    <div
      className={`flex w-full items-center justify-between gap-3 px-4 py-2 ${className ?? ""}`}
      style={{
        borderRadius: radii.pill,
        backgroundColor: hexToRgba(colors.primary, 0.2),
        border: `2px solid ${colors.primaryLight}`,
        fontFamily: typography.ui,
      }}
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        <span
          className={`h-3 w-3 rounded-full ${
            disableAnimations ? "" : "animate-pulse-ring"
          }`}
          style={{ backgroundColor: colors.accent }}
        />
        <span className="text-sm font-semibold" style={{ color: colors.textPrimary }}>
          {mode === "intake"
            ? "Listening for your voice"
            : mode === "story"
              ? "Voice commands"
              : "Listening for your answer"}
        </span>
      </div>
      <div className="hidden flex-wrap gap-2 md:flex">
        {mode === "story"
          ? commands.map((command) => (
              <Pill key={command} label={command} type="button" />
            ))
          : null}
      </div>
    </div>
  );
}
