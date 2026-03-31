"use client";

import React from "react";
import { colors, radii, typography } from "@/styles/tokens";
import { hexToRgba } from "./colorUtils";
import { useAccessibility } from "../AccessibilityProvider";

export type ButtonVariant = "primary" | "secondary" | "outline" | "confirm";

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "style"> {
  label: string;
  variant?: ButtonVariant;
  style?: React.CSSProperties;
}

/**
 * Builds the base button style for Talewind UI buttons.
 *
 * @param variant - Visual style variant.
 * @param disabled - Whether the button is disabled.
 * @param disableAnimations - Whether reduced motion is active.
 * @returns CSSProperties for the button.
 */
function getButtonStyle(
  variant: ButtonVariant,
  disabled: boolean,
  disableAnimations: boolean
): React.CSSProperties {
  const base: React.CSSProperties = {
    borderRadius: radii.button,
    fontFamily: typography.ui,
    minHeight: "44px",
    minWidth: "44px",
    transition: disableAnimations
      ? "none"
      : "transform 0.2s ease, box-shadow 0.2s ease",
  };

  if (disabled) {
    return {
      ...base,
      backgroundColor: colors.primaryDark,
      color: colors.textMuted,
      cursor: "not-allowed",
      boxShadow: "none",
    };
  }

  if (variant === "outline") {
    return {
      ...base,
      backgroundColor: "transparent",
      color: colors.textPrimary,
      border: `2px solid ${colors.primaryLight}`,
      boxShadow: "none",
    };
  }

  if (variant === "confirm") {
    return {
      ...base,
      backgroundColor: colors.animals,
      color: colors.background,
      border: `2px solid ${colors.animals}`,
      boxShadow: `0 8px 20px ${hexToRgba(colors.animals, 0.25)}`,
    };
  }

  if (variant === "secondary") {
    return {
      ...base,
      backgroundColor: colors.primaryDark,
      color: colors.textPrimary,
      border: `2px solid ${colors.primaryDark}`,
      boxShadow: `0 6px 18px ${hexToRgba(colors.primaryDark, 0.35)}`,
    };
  }

  return {
    ...base,
    backgroundColor: colors.primary,
    color: colors.textPrimary,
    border: `2px solid ${colors.primary}`,
    boxShadow: `0 8px 20px ${hexToRgba(colors.primary, 0.35)}`,
  };
}

/**
 * Talewind button with locked radii, fonts, and accessible sizing.
 */
export function Button({
  label,
  variant = "primary",
  className,
  disabled = false,
  type = "button",
  style,
  ...props
}: ButtonProps) {
  const { disableAnimations } = useAccessibility();

  return (
    <button
      {...props}
      type={type}
      aria-label={props["aria-label"] ?? label}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 px-6 py-3 text-base font-semibold tracking-wide ${className ?? ""}`}
      style={{ ...getButtonStyle(variant, disabled, disableAnimations), ...style }}
    >
      {label}
    </button>
  );
}
