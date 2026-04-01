import type { Metadata } from "next";
import type { CSSProperties } from "react";
import "./globals.css";

const fontVariables = {
  "--font-ui": "'Comfortaa', sans-serif",
  "--font-narration": "'Playfair Display', serif",
  "--font-display": "'Sacramento', cursive",
} as CSSProperties;

export const metadata: Metadata = {
  title: "Talewind",
  description: "An adaptive story tutor for young readers",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
      style={fontVariables}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
