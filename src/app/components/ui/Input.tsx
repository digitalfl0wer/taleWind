import React from "react";
import { colors, radii, typography } from "@/styles/tokens";
import { hexToRgba } from "./colorUtils";

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "style"> {
  label: string;
  style?: React.CSSProperties;
}

/**
 * Builds base input styles for child-friendly inputs.
 *
 * @returns CSSProperties for the input.
 */
function getInputStyle(): React.CSSProperties {
  return {
    borderRadius: radii.input,
    fontFamily: typography.ui,
    backgroundColor: hexToRgba(colors.primary, 0.1),
    border: `2px solid ${colors.primaryDark}`,
    color: colors.textPrimary,
    minHeight: "44px",
  };
}

/**
 * Reusable input field with Talewind locked typography and radii.
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  /**
   * Reusable input field with Talewind locked typography and radii.
   */
  function Input({ label, className, style, ...props }, ref) {
    return (
      <input
        {...props}
        ref={ref}
        aria-label={props["aria-label"] ?? label}
        className={`w-full px-4 py-3 text-base font-semibold tracking-wide placeholder:text-[color:var(--color-text-muted)] ${className ?? ""}`}
        style={{ ...getInputStyle(), ...style }}
      />
    );
  }
);

Input.displayName = "Input";
