"use client";

/**
 * AccessibilityProvider
 *
 * Manages all five accessibility modes for Talewind:
 *   1. Reduced motion  — disables all CSS animations
 *   2. Dyslexia font   — switches to OpenDyslexic globally
 *   3. High contrast   — inverts to black/white palette
 *   4. Larger text     — 1.5× base font size
 *   5. Captions        — always on by default; this provider tracks state
 *
 * Priority rules:
 *   - reducedMotion fires if `prefers-reduced-motion` OS setting is on
 *     OR if the child profile's `reducedMotion` flag is true.
 *   - All other modes are toggled exclusively from the child profile.
 *
 * Usage:
 *   Wrap the child-facing root layout with <AccessibilityProvider prefs={...}>
 *   and consume via useAccessibility() in any child component.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  useCallback,
  type ReactNode,
} from "react";
import type { AccessibilityPreferences } from "@/types/Child";

// ── Context shape ────────────────────────────────────────────────────────────

interface AccessibilityContextValue {
  /** True if any reduced-motion source is active — animations must be off. */
  disableAnimations: boolean;
  prefs: AccessibilityPreferences;
  /** Update prefs at runtime (e.g. when parent toggles a setting). */
  updatePrefs: (next: Partial<AccessibilityPreferences>) => void;
}

const AccessibilityContext = createContext<AccessibilityContextValue | null>(
  null
);

// ── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_PREFS: AccessibilityPreferences = {
  reducedMotion: false,
  dyslexiaFont: false,
  highContrast: false,
  largerText: false,
  captionsEnabled: true, // captions ON by default — non-negotiable
  captionFontSize: 18,
  narrationSpeed: "normal",
};

// ── Provider ──────────────────────────────────────────────────────────────────

interface AccessibilityProviderProps {
  /** Initial preferences from the child's profile. Omit for first session. */
  initialPrefs?: Partial<AccessibilityPreferences>;
  children: ReactNode;
}

/**
 * Provides accessibility state to the entire child-facing subtree.
 * Applies CSS classes to `document.documentElement` so global CSS rules fire.
 */
export function AccessibilityProvider({
  initialPrefs,
  children,
}: AccessibilityProviderProps) {
  const [prefs, setPrefs] = useState<AccessibilityPreferences>({
    ...DEFAULT_PREFS,
    ...initialPrefs,
  });

  /** True if OS prefers-reduced-motion OR profile flag is set. */
  const osReducedMotion = useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") {
        return () => {};
      }
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      const handler = () => onStoreChange();
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    },
    () => {
      if (typeof window === "undefined") return false;
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    },
    () => false
  );

  const disableAnimations = osReducedMotion || prefs.reducedMotion;

  // Apply CSS class tokens to <html> so global CSS rules take effect
  useEffect(() => {
    const html = document.documentElement;

    html.classList.toggle("reduced-motion", disableAnimations);
    html.classList.toggle("dyslexia-font", prefs.dyslexiaFont);
    html.classList.toggle("high-contrast", prefs.highContrast);
    html.classList.toggle("larger-text", prefs.largerText);
    html.classList.toggle("captions-hidden", !prefs.captionsEnabled);
  }, [
    disableAnimations,
    prefs.dyslexiaFont,
    prefs.highContrast,
    prefs.largerText,
    prefs.captionsEnabled,
  ]);

  const updatePrefs = useCallback(
    (next: Partial<AccessibilityPreferences>) =>
      setPrefs((prev) => ({ ...prev, ...next })),
    []
  );

  return (
    <AccessibilityContext.Provider
      value={{ disableAnimations, prefs, updatePrefs }}
    >
      {children}
    </AccessibilityContext.Provider>
  );
}

// ── Consumer hook ─────────────────────────────────────────────────────────────

/**
 * Returns the current accessibility state.
 * Must be used inside <AccessibilityProvider>.
 */
export function useAccessibility(): AccessibilityContextValue {
  const ctx = useContext(AccessibilityContext);
  if (!ctx) {
    throw new Error("useAccessibility must be used inside AccessibilityProvider");
  }
  return ctx;
}
