"use client";

import React from "react";
import type { Subject } from "@/types/Child";
import { colors, radii, shadows, typography } from "@/styles/tokens";
import { hexToRgba } from "./colorUtils";
import { useAccessibility } from "../AccessibilityProvider";

export interface SubjectCardProps {
  subject: Subject;
  title: string;
  description: string;
  onSelect?: (subject: Subject) => void;
  className?: string;
  mode?: "card" | "door";
}

/**
 * Builds style values for subject cards and doors.
 *
 * @param subject - Subject identifier.
 * @param mode - Visual mode for the card.
 * @returns CSSProperties for the card.
 */
function getSubjectStyle(
  subject: Subject,
  mode: "card" | "door"
): React.CSSProperties {
  const borderColor =
    subject === "animals"
      ? colors.animals
      : subject === "space"
      ? colors.space
      : colors.math;

  return {
    borderRadius: radii.card,
    fontFamily: typography.ui,
    border: `2px solid ${borderColor}`,
    background:
      mode === "door"
        ? `linear-gradient(160deg, ${hexToRgba(borderColor, 0.2)}, ${hexToRgba(
            colors.background,
            0.9
          )})`
        : hexToRgba(colors.primaryDark, 0.35),
    boxShadow: shadows.cardRest,
  };
}

/**
 * Maps subject to glow class.
 *
 * @param subject - Subject identifier.
 * @returns CSS class name for glow.
 */
function getGlowClass(subject: Subject): string {
  if (subject === "animals") return "glow-animals";
  if (subject === "space") return "glow-space";
  return "glow-math";
}

/**
 * Subject card for Animals, Space, and Math.
 */
export function SubjectCard({
  subject,
  title,
  description,
  onSelect,
  className,
  mode = "card",
}: SubjectCardProps) {
  const { disableAnimations } = useAccessibility();
  const glowClass = getGlowClass(subject);

  return (
    <button
      type="button"
      aria-label={`Choose ${title}`}
      onClick={() => onSelect?.(subject)}
      className={`relative flex min-h-[160px] w-full flex-col items-start justify-between gap-3 px-6 py-5 text-left ${
        disableAnimations ? "" : "transition-transform duration-200"
      } ${disableAnimations ? "" : "animate-bounce-in hover:scale-[1.02]"} ${glowClass} ${
        className ?? ""
      }`}
      style={getSubjectStyle(subject, mode)}
    >
      <div className="flex flex-col gap-2">
        <span className="text-xl font-bold" style={{ color: colors.textPrimary }}>
          {title}
        </span>
        <span className="text-sm" style={{ color: colors.textMuted }}>
          {description}
        </span>
      </div>
      <div
        className="h-10 w-full rounded-full"
        style={{
          background: `linear-gradient(90deg, ${hexToRgba(colors.background, 0)}, ${hexToRgba(
            colors.textPrimary,
            0.25
          )})`,
        }}
      />
    </button>
  );
}
