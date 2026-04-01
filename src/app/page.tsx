"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Spriggle } from "@/app/components/Spriggle";
import { AccessibilityProvider } from "@/app/components/AccessibilityProvider";
import { colors, radii, shadows, typography } from "@/styles/tokens";
import { hexToRgba } from "@/app/components/ui/colorUtils";

export default function Home() {
  const [float, setFloat] = useState({ x: 0, y: 0 });
  const reduceMotion = useRef(false);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduceMotion.current = media.matches;
    const handler = (event: MediaQueryListEvent) => {
      reduceMotion.current = event.matches;
      if (event.matches) {
        setFloat({ x: 0, y: 0 });
      }
    };
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onMove = (event: MouseEvent) => {
      if (reduceMotion.current) return;
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = window.requestAnimationFrame(() => {
        const x = (event.clientX / window.innerWidth - 0.5) * 16;
        const y = (event.clientY / window.innerHeight - 0.5) * 16;
        setFloat({ x, y });
      });
    };
    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const stars = useMemo(() => {
    return Array.from({ length: 32 }, (_, index) => {
      const top = `${Math.round(((index * 37) % 100) + 1)}%`;
      const left = `${Math.round(((index * 61) % 100) + 1)}%`;
      const size = 2 + (index % 3);
      const opacity = 0.25 + (index % 4) * 0.12;
      return { id: index, top, left, size, opacity };
    });
  }, []);

  return (
    <AccessibilityProvider>
    <div
      className="relative flex min-h-screen flex-col overflow-hidden"
      style={{
        background: `radial-gradient(circle at top, ${hexToRgba(
          colors.primaryLight,
          0.25
        )}, transparent 55%), ${colors.background}`,
        color: colors.textPrimary,
      }}
    >
      <div className="absolute inset-0 -z-10">
        {stars.map((star) => (
          <span
            key={star.id}
            className="absolute rounded-full"
            style={{
              top: star.top,
              left: star.left,
              width: `${star.size}px`,
              height: `${star.size}px`,
              backgroundColor: colors.starfield,
              opacity: star.opacity,
            }}
          />
        ))}
      </div>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-12 px-6 py-16 md:flex-row md:items-center md:gap-16 md:px-12">
        <section className="flex flex-1 flex-col gap-6">
          <p
            style={{
              fontFamily: typography.display,
              color: colors.accent,
              fontSize: "2.5rem",
              lineHeight: 1,
            }}
          >
            Welcome to Talewind
          </p>
          <h1
            className="text-3xl md:text-5xl"
            style={{ fontFamily: typography.ui, fontWeight: 700 }}
          >
            Storytime that listens, learns, and sparkles.
          </h1>
          <p
            className="text-lg"
            style={{ color: colors.textMuted, maxWidth: 520 }}
          >
            Talewind helps young readers build confidence with magical stories
            that adapt to their favorite things.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link
              href="/child/intake"
              className="inline-flex items-center justify-center px-6 py-3 text-base font-semibold"
              style={{
                borderRadius: radii.button,
                backgroundColor: colors.primary,
                color: colors.textPrimary,
                boxShadow: shadows.cardHover,
                fontFamily: typography.ui,
              }}
            >
              Start Storytime
            </Link>
            <a
              href="#learn-more"
              className="inline-flex items-center justify-center px-6 py-3 text-base font-semibold"
              style={{
                borderRadius: radii.button,
                border: `2px solid ${colors.primaryLight}`,
                color: colors.textPrimary,
                fontFamily: typography.ui,
              }}
            >
              Learn More
            </a>
          </div>
        </section>

        <section className="flex flex-1 items-center justify-center">
          <div
            className="relative flex flex-col items-center gap-4 rounded-[28px] p-6"
            style={{
              backgroundColor: hexToRgba(colors.primaryDark, 0.35),
              border: `2px solid ${hexToRgba(colors.primaryLight, 0.35)}`,
              boxShadow: shadows.cardRest,
              transform: `translate3d(${float.x}px, ${float.y}px, 0)`,
              transition: reduceMotion.current ? "none" : "transform 0.12s ease-out",
            }}
          >
            <Spriggle />
            <div
              style={{
                fontFamily: typography.ui,
                color: colors.textMuted,
                textAlign: "center",
                maxWidth: 240,
              }}
            >
              I&apos;m Spriggle! I follow your story dreams.
            </div>
          </div>
        </section>
      </main>

      <section
        id="learn-more"
        className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 pb-16 md:px-12"
      >
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              title: "Personalized Stories",
              copy: "Spriggle remembers favorites to craft magical adventures.",
            },
            {
              title: "Gentle Guidance",
              copy: "Encouraging prompts build reading confidence.",
            },
            {
              title: "Safe + Cozy",
              copy: "Kid‑friendly themes designed for calm curiosity.",
            },
          ].map((card) => (
            <div
              key={card.title}
              className="flex flex-col gap-2 p-5"
              style={{
                borderRadius: radii.card,
                backgroundColor: hexToRgba(colors.primaryDark, 0.3),
                border: `1px solid ${hexToRgba(colors.primaryLight, 0.25)}`,
              }}
            >
              <h3 style={{ fontFamily: typography.ui, fontSize: "1.25rem" }}>
                {card.title}
              </h3>
              <p style={{ color: colors.textMuted }}>{card.copy}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
    </AccessibilityProvider>
  );
}
