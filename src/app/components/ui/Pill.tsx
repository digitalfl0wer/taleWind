import React from "react";
import { colors, radii, typography } from "@/styles/tokens";

export interface PillProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "style"> {
  label: string;
  active?: boolean;
  style?: React.CSSProperties;
}

/**
 * Builds pill styles for voice chips and small option buttons.
 *
 * @param active - Whether the pill is active.
 * @param disabled - Whether the pill is disabled.
 * @returns CSSProperties for the pill.
 */
function getPillStyle(active: boolean, disabled: boolean): React.CSSProperties {
  return {
    borderRadius: radii.pill,
    fontFamily: typography.ui,
    minHeight: "44px",
    minWidth: "44px",
    padding: "8px 16px",
    backgroundColor: active ? colors.primary : "transparent",
    color: active ? colors.textPrimary : colors.textMuted,
    border: `2px solid ${active ? colors.primary : colors.primaryLight}`,
    opacity: disabled ? 0.5 : 1,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

/**
 * Reusable pill-style button for small selections or voice chips.
 */
export function Pill({
  label,
  active = false,
  className,
  type = "button",
  style,
  ...props
}: PillProps) {
  return (
    <button
      {...props}
      type={type}
      aria-label={props["aria-label"] ?? label}
      className={`inline-flex items-center justify-center text-sm font-semibold uppercase tracking-wide ${className ?? ""}`}
      style={{ ...getPillStyle(active, Boolean(props.disabled)), ...style }}
    >
      {label}
    </button>
  );
}
