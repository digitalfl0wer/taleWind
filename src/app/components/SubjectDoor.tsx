"use client";

import React from "react";
import type { Subject } from "@/types/Child";
import { colors } from "@/styles/tokens";
import { SubjectCard } from "./ui/SubjectCard";

export interface SubjectDoorProps {
  subject: Subject;
  title: string;
  description: string;
  onSelect?: (subject: Subject) => void;
}

/**
 * Door-style subject card for Magic Door selection.
 */
export function SubjectDoor({
  subject,
  title,
  description,
  onSelect,
}: SubjectDoorProps) {
  return (
    <div className="relative">
      <SubjectCard
        subject={subject}
        title={title}
        description={description}
        onSelect={onSelect}
        mode="door"
        className="overflow-hidden"
      />
      <span
        className="pointer-events-none absolute right-6 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full"
        style={{ backgroundColor: colors.accent }}
      />
      <span
        className="pointer-events-none absolute right-6 top-1/2 h-8 w-1 -translate-y-1/2 rounded-full"
        style={{ backgroundColor: colors.accent, opacity: 0.4 }}
      />
    </div>
  );
}
