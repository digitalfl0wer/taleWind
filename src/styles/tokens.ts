/**
 * tokens.ts
 * Locked design token file for Talewind.
 *
 * DO NOT hardcode hex values anywhere in the codebase.
 * Always import from here. Changing a value here propagates everywhere.
 *
 * Agents: import { colors, typography, radii, shadows } from "@/styles/tokens"
 */

// ── Color Palette ─────────────────────────────────────────────────────────────

/**
 * Full locked color palette for the Talewind child UI.
 * Jewel tones on a cosmic dark base.
 */
export const colors = {
  /** Cosmic dark — always the base background in child mode. */
  background: "#0d0d2b",

  /** Purple — Spriggle's main color, primary buttons. */
  primary: "#7c3aed",

  /** Light purple — captions, secondary elements, word highlight during TTS. */
  primaryLight: "#a78bfa",

  /** Dark purple — Spriggle body depth, pressed button state. */
  primaryDark: "#5b21b6",

  /** Emerald — Animals subject card border, icon, and glow. */
  animals: "#10b981",

  /** Sapphire — Space subject card border, icon, and glow. */
  space: "#3b82f6",

  /** Amber — Math subject card border, icon, and glow. */
  math: "#f59e0b",

  /** Near-white with purple tint — all primary text in child mode. */
  textPrimary: "#e9d5ff",

  /** Muted purple — story narration text, secondary labels. */
  textMuted: "#c4b5fd",

  /** Gold — scene titles (Sacramento font), Spriggle speech bubble text. */
  accent: "#fbbf24",

  /** Twinkling stars for the child starfield background. */
  starfield: "rgba(255,255,255,0.5)",
} as const;

// ── Subject Glow Shadows ──────────────────────────────────────────────────────

/**
 * Box-shadow values for subject card glow effects.
 * Each matches the jewel tone of the corresponding subject.
 */
export const subjectGlows = {
  animals: "0 0 20px rgba(16,185,129,0.3)",
  space: "0 0 20px rgba(59,130,246,0.3)",
  math: "0 0 20px rgba(245,158,11,0.3)",
} as const;

// ── Spriggle Drop Shadow ──────────────────────────────────────────────────────

/**
 * CSS filter drop-shadow applied to the Spriggle SVG character.
 */
export const spriggleShadow =
  "drop-shadow(0 0 14px rgba(167,139,250,0.7))" as const;

// ── Border Radii ──────────────────────────────────────────────────────────────

/**
 * Locked border radius values. Never use arbitrary values — pick from here.
 */
export const radii = {
  /** Subject cards, story scene cards, parent dashboard cards. */
  card: "22px",
  /** Primary and secondary action buttons. */
  button: "18px",
  /** Voice command chips, pills, tags. */
  pill: "20px",
  /** Text input fields and search bars. */
  input: "18px",
} as const;

// ── Typography ────────────────────────────────────────────────────────────────

/**
 * Font family references. These must be loaded via Google Fonts in the root layout.
 * Use these constants rather than hardcoding font-family strings.
 */
export const typography = {
  /** UI text, Spriggle dialogue, buttons, labels. */
  ui: "'Comfortaa', sans-serif",
  /** Story narration text, body reading content. */
  narration: "'Playfair Display', serif",
  /** Display headings, scene titles in the story reader. */
  display: "'Sacramento', cursive",
  /** Dyslexia-friendly font — toggled on via AccessibilityPreferences.dyslexiaFont. */
  dyslexia: "'OpenDyslexic', sans-serif",
} as const;

// ── Shadows ───────────────────────────────────────────────────────────────────

/**
 * General shadow tokens for elevation / depth.
 */
export const shadows = {
  /** Subtle elevation for cards at rest. */
  cardRest: "0 2px 12px rgba(0,0,0,0.4)",
  /** Elevated state — hovered card or active element. */
  cardHover: "0 8px 32px rgba(0,0,0,0.6)",
  /** Spriggle speech bubble glow border. */
  speechBubble: "0 0 0 2px #7c3aed, 0 4px 20px rgba(124,58,237,0.3)",
} as const;

// ── Re-export all tokens as a single object for convenience ───────────────────

/** All Talewind design tokens in one object. */
const tokens = {
  colors,
  subjectGlows,
  spriggleShadow,
  radii,
  typography,
  shadows,
} as const;

export default tokens;
