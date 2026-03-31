import type { ReactNode } from "react";
import { ChildShell } from "./ChildShell";

export interface ChildLayoutProps {
  children: ReactNode;
}

/**
 * Layout wrapper for child-facing routes.
 */
export default function ChildLayout({ children }: ChildLayoutProps) {
  return <ChildShell>{children}</ChildShell>;
}
