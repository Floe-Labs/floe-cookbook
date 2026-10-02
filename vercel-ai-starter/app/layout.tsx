import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Floe Vercel AI Starter — a governed agent",
  description:
    "A Vercel AI SDK agent whose spend is hard-capped by floe-guard out of the box. Watch a runaway loop get stopped at $0.10 with no API key.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
