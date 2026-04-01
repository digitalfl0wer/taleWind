"use client";

import React from "react";
import { colors, radii, typography } from "@/styles/tokens";
import { hexToRgba } from "./ui/colorUtils";
import { useAccessibility } from "./AccessibilityProvider";
import { Pill } from "./ui/Pill";

export type VoiceCommandKey =
  | "say_it_again"
  | "make_it_easier"
  | "tell_me_more"
  | "next"
  | "quiz_answer";

export interface VoiceCommandPanelProps {
  listening: boolean;
  onCommand: (command: VoiceCommandKey) => void;
  disabledCommands?: VoiceCommandKey[];
}

const COMMAND_LABELS: Record<VoiceCommandKey, string> = {
  say_it_again: "Say it again",
  make_it_easier: "Make it easier",
  tell_me_more: "Tell me more",
  next: "Next",
  quiz_answer: "Quiz answer",
};

/**
 * VoiceCommandPanel displays the 5 bounded commands with a listening indicator.
 */
export function VoiceCommandPanel({
  listening,
  onCommand,
  disabledCommands = [],
}: VoiceCommandPanelProps) {
  const { disableAnimations } = useAccessibility();

  return (
    <div
      className="flex w-full flex-col gap-3"
      aria-label="Voice commands"
    >
      <div
        className="flex items-center gap-2"
        style={{ fontFamily: typography.ui, color: colors.textPrimary }}
      >
        <span
          className={`h-3 w-3 rounded-full ${
            disableAnimations || !listening ? "" : "animate-pulse-ring"
          }`}
          style={{ backgroundColor: colors.accent }}
        />
        <span className="text-sm font-semibold">
          {listening ? "Listening" : "Paused"}
        </span>
      </div>
      <div
        className="flex flex-wrap gap-2"
        style={{
          borderRadius: radii.pill,
          backgroundColor: hexToRgba(colors.primary, 0.12),
          border: `2px solid ${hexToRgba(colors.primaryLight, 0.3)}`,
          padding: "10px",
        }}
      >
        {(Object.keys(COMMAND_LABELS) as VoiceCommandKey[]).map((key) => {
          const label = COMMAND_LABELS[key];
          const isDisabled = disabledCommands.includes(key);
          return (
            <Pill
              key={key}
              label={label}
              type="button"
              onClick={() => {
                if (!isDisabled) onCommand(key);
              }}
              aria-label={label}
              disabled={isDisabled}
              active={!isDisabled && listening}
            />
          );
        })}
      </div>
    </div>
  );
}
