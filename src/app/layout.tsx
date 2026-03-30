import type { Metadata } from "next";
import { Comfortaa, Playfair_Display, Sacramento } from "next/font/google";
import "./globals.css";

const comfortaa = Comfortaa({
  variable: "--font-ui",
  subsets: ["latin"],
});

const playfairDisplay = Playfair_Display({
  variable: "--font-narration",
  subsets: ["latin"],
});

const sacramento = Sacramento({
  variable: "--font-display",
  weight: "400",
  subsets: ["latin"],
});

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
      className={`${comfortaa.variable} ${playfairDisplay.variable} ${sacramento.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
