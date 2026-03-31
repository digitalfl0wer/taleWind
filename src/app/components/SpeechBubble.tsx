import React from "react";
import { colors, radii, shadows, typography } from "@/styles/tokens";
import { hexToRgba } from "./ui/colorUtils";

export interface SpeechBubbleProps {
  text: string;
  className?: string;
}

/**
 * Speech bubble for Spriggle dialogue.
 */
export function SpeechBubble({ text, className }: SpeechBubbleProps) {
  return (
    <div
      className={`speech-bubble relative max-w-2xl px-6 py-4 text-lg font-semibold ${
        className ?? ""
      }`}
      style={{
        fontFamily: typography.ui,
        borderRadius: radii.card,
        backgroundColor: hexToRgba(colors.primary, 0.18),
        border: `2px solid ${colors.primary}`,
        color: colors.accent,
        boxShadow: shadows.speechBubble,
      }}
      aria-live="polite"
    >
      {text}
      <span
        className="absolute -bottom-3 left-10 h-6 w-6 rotate-45"
        style={{
          backgroundColor: hexToRgba(colors.primary, 0.18),
          borderLeft: `2px solid ${colors.primary}`,
          borderBottom: `2px solid ${colors.primary}`,
        }}
      />
    </div>
  );
}
