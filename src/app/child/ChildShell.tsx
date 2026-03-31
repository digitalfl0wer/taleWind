"use client";

import React, { useState } from "react";
import { AccessibilityProvider } from "../components/AccessibilityProvider";
import { StarfieldBackground } from "../components/StarfieldBackground";
import type { AccessibilityPreferences } from "@/types/Child";
import { colors } from "@/styles/tokens";

export interface ChildShellProps {
  children: React.ReactNode;
}

/**
 * Root shell for all child-facing screens.
 */
export function ChildShell({ children }: ChildShellProps) {
  const [initialPrefs] = useState<Partial<AccessibilityPreferences>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem("talewind-accessibility");
      if (!raw) return {};
      return JSON.parse(raw) as Partial<AccessibilityPreferences>;
    } catch (error) {
      console.warn("[child-shell] failed to read accessibility prefs", error);
      return {};
    }
  });

  return (
    <AccessibilityProvider initialPrefs={initialPrefs}>
      <div
        className="relative flex min-h-screen flex-col overflow-hidden"
        style={{ backgroundColor: colors.background }}
      >
        <StarfieldBackground />
        {children}
      </div>
    </AccessibilityProvider>
  );
}
