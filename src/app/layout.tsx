/**
 * Layout root for the app.
 *
 * Wraps every page in:
 *   1. ThemeProvider (manages CSS theme via data-theme attribute on <html>)
 *   2. TanStack Query provider (for client-side data fetching)
 *   3. ToastProvider (for success/error feedback)
 *   4. The mobile-first app shell (Screen + BottomNav)
 *
 * The anti-FOUC script runs BEFORE React hydrates to set the theme
 * from localStorage — prevents flash of the default green theme
 * when the user has chosen Bright Leaf.
 */

import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/providers/query-provider";
import { ToastProvider } from "@/providers/toast-provider";
import { ThemeProvider } from "@/providers/theme-provider";
import { AuthGate } from "@/providers/auth-gate";
import { Screen } from "@/components/layout/Screen";
import { BottomNav } from "@/components/layout/BottomNav";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  // Preload the font to prevent FOIT (Flash of Invisible Text)
  // and reduce CLS from font loading
  preload: true,
  // Use fallback font that's similar to Inter to minimize reflow
  fallback: ["system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
  // Adjust the fallback font metrics to match Inter's metrics
  adjustFontFallback: true,
});

export const metadata: Metadata = {
  title: "Digital Khata",
  description: "Digital khata & wholesale business management",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#16a34a",
};

// Inline script — runs before paint to apply the saved theme.
// Prevents flash of default theme when user has chosen Bright Leaf.
const themeInitScript = `
(function() {
  try {
    var t = localStorage.getItem('digital-khata-theme');
    if (t === 'leaf') {
      document.documentElement.setAttribute('data-theme', 'leaf');
    }
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <ThemeProvider>
          <QueryProvider>
            <ToastProvider>
              <AuthGate>
                <Screen>
                  {children}
                  <BottomNav />
                </Screen>
              </AuthGate>
            </ToastProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
