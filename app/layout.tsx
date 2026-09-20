import type { Metadata } from "next";

import { AuthGate } from "@/components/auth-gate";

import "./globals.css";

export const metadata: Metadata = {
  title: "PeakAthlete Finance",
  description:
    "PeakAthlete finance dashboard for expenses, sales, inventory, cash flow, and reporting.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
