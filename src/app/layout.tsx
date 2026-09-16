/**
 * Layout root for the app.
 *
 * Wraps every page in:
 *   1. TanStack Query provider (for client-side data fetching)
 *   2. The mobile-first app shell (Screen + BottomNav)
 *
 * Phase 3 only ships the shell. Actual page content (Dashboard, Khata, etc.)
 * are placeholder pages — they'll be replaced in later phases.
 */

import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/providers/query-provider";
import { ToastProvider } from "@/providers/toast-provider";
import { Screen } from "@/components/layout/Screen";
import { BottomNav } from "@/components/layout/BottomNav";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Digital Khata",
  description: "Digital khata & wholesale business management",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#16a34a",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <QueryProvider>
          <ToastProvider>
            <Screen>
              {children}
              <BottomNav />
            </Screen>
          </ToastProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
