/**
 * Layout root for the app.
 *
 * Wraps every page in:
 *   1. ThemeProvider (manages CSS theme via data-theme attribute on <html>)
 *   2. LanguageProvider (manages English/Urdu + RTL)
 *   3. TanStack Query provider (for client-side data fetching)
 *   4. ToastProvider (for success/error feedback)
 *   5. The mobile-first app shell (Screen + BottomNav)
 *
 * Fonts:
 *   - Inter: for English text (Latin script)
 *   - Noto Nastaliq Urdu: for Urdu text (Arabic script) — the gold standard
 *     Urdu font, designed specifically for Nastaliq calligraphy
 *
 * Anti-FOUC: inline script sets theme + language dir before first paint
 */

import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Noto_Nastaliq_Urdu } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/providers/query-provider";
import { ToastProvider } from "@/providers/toast-provider";
import { ThemeProvider } from "@/providers/theme-provider";
import { LanguageProvider } from "@/providers/language-provider";
import { AuthGate } from "@/providers/auth-gate";
import { Screen } from "@/components/layout/Screen";
import { BottomNav } from "@/components/layout/BottomNav";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  preload: true,
  fallback: ["system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
  adjustFontFallback: true,
});

// Noto Nastaliq Urdu — the premier Urdu font
// Uses weights 400 (normal) and 700 (bold)
const nastaliq = Noto_Nastaliq_Urdu({
  subsets: ["arabic"],
  weight: ["400", "700"],
  variable: "--font-urdu",
  display: "swap",
  preload: true,
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

// Anti-FOUC: set theme + language dir BEFORE React hydrates
const initScript = `
(function() {
  try {
    // Theme
    var t = localStorage.getItem('digital-khata-theme');
    if (t === 'leaf') {
      document.documentElement.setAttribute('data-theme', 'leaf');
    }
    // Language
    var lang = localStorage.getItem('digital-khata-lang');
    if (lang === 'ur') {
      document.documentElement.setAttribute('dir', 'rtl');
      document.documentElement.setAttribute('lang', 'ur');
      document.documentElement.classList.add('font-urdu');
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
    <html lang="en" className={`${inter.variable} ${nastaliq.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: initScript }} />
      </head>
      <body>
        <ThemeProvider>
          <LanguageProvider>
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
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
