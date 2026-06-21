import type { Metadata } from "next";
import { Anton, Archivo, JetBrains_Mono } from "next/font/google";

import "./globals.css";
import "./matchday-ui.css";
import { AppChrome } from "@/components/matchday/nav/app-chrome";

// Fonts via next/font. Each exposes a CSS variable the design tokens reference:
// Anton for display and stat numerals, Archivo for all UI and body, JetBrains Mono
// for SQL and code. Anton ships a single weight; Archivo carries the 400 to 900 ramp.
const anton = Anton({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--md-font-display",
});

const archivo = Archivo({
  subsets: ["latin"],
  display: "swap",
  variable: "--md-font-ui",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--md-font-mono",
});

export const metadata: Metadata = {
  title: "MATCHDAY, Football AI Pro",
  description:
    "Ask football anything. Real numbers, pitch maps, and 3D replays, every answer grounded in a real query. No made up stats, ever.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${anton.variable} ${archivo.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}
