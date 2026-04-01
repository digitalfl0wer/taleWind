import React from "react";
import { colors, radii, shadows, typography } from "@/styles/tokens";
import { hexToRgba } from "./ui/colorUtils";

export interface SceneCardProps {
  title: string;
  imageUrl: string | null;
  imageAlt: string;
  isMarkedEasy: boolean;
  onImageLoaded?: () => void;
  children: React.ReactNode;
}

/**
 * SceneCard displays the scene image, title, and narration content.
 */
export function SceneCard({
  title,
  imageUrl,
  imageAlt,
  isMarkedEasy,
  onImageLoaded,
  children,
}: SceneCardProps) {
  return (
    <section
      className="flex w-full flex-col gap-6 p-6 md:p-10"
      style={{
        borderRadius: radii.card,
        backgroundColor: hexToRgba(colors.primaryDark, 0.35),
        border: `2px solid ${hexToRgba(colors.primaryLight, 0.25)}`,
        boxShadow: shadows.cardRest,
      }}
      aria-label={`Scene: ${title}`}
    >
      <div className="relative flex flex-col gap-4">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={imageAlt}
            className="w-full max-h-[45vh] object-cover md:max-h-[52vh]"
            style={{ borderRadius: radii.card }}
            onLoad={onImageLoaded}
          />
        ) : (
          <div
            className="flex h-56 w-full items-center justify-center"
            style={{
              borderRadius: radii.card,
              background: `linear-gradient(140deg, ${hexToRgba(
                colors.primary,
                0.2
              )}, ${hexToRgba(colors.background, 0.9)})`,
              color: colors.textMuted,
            }}
          >
            Loading scene art...
          </div>
        )}
        {isMarkedEasy && (
          <span
            className="absolute right-4 top-4 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide"
            style={{
              backgroundColor: hexToRgba(colors.animals, 0.2),
              border: `2px solid ${colors.animals}`,
              color: colors.textPrimary,
            }}
          >
            Marked easier
          </span>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <h2
          className="text-4xl md:text-5xl"
          style={{ fontFamily: typography.display, color: colors.accent }}
        >
          {title}
        </h2>
        {children}
      </div>
    </section>
  );
}
