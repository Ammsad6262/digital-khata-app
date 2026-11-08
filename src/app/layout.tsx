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
 *   - Plus Jakarta Sans: the interface typeface — geometric, warm and a touch
 *     more characterful than the default system stack.
 *   - Noto Nastaliq Urdu: for Urdu text (Arabic script) — the gold standard
 *     Urdu font, designed specifically for Nastaliq calligraphy.
 *
 * Anti-FOUC: inline script sets theme + language dir before first paint.
 */

import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Noto_Nastaliq_Urdu } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { Providers } from "./providers";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
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
  title: "Dukhata",
  description: "Digital khata & wholesale business management",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon.png", type: "image/png", sizes: "512x512" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/favicon.png", type: "image/png", sizes: "64x64" },
    ],
    apple: [
      { url: "/apple-icon.png", type: "image/png", sizes: "180x180" },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FAF8F4",
};

// Anti-FOUC: set theme + language dir BEFORE React hydrates.
// Default theme is "ink" — warm graphite on ledger paper.
const initScript = `
(function() {
  try {
    var KNOWN = ['ink', 'emerald', 'saffron', 'indigo', 'rose'];
    // Migrate theme ids saved by older builds.
    var LEGACY = { monochrome: 'ink', default: 'emerald', leaf: 'emerald' };
    var t = localStorage.getItem('digital-khata-theme');
    if (LEGACY[t]) {
      t = LEGACY[t];
      try { localStorage.setItem('digital-khata-theme', t); } catch (e) {}
    }
    if (KNOWN.indexOf(t) === -1) {
      // No usable choice stored yet. Show the default for the first paint but
      // do NOT persist it: an absent value means "no preference", which lets
      // the server seed the signed-in user's own theme once settings load.
      t = 'ink';
    }
    document.documentElement.setAttribute('data-theme', t);

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

// Force dynamic rendering — prevents Next.js 16 Turbopack from trying to
// statically prerender pages (which fails on /_global-error due to React
// context not being available during static generation).
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      data-theme="ink"
      className={`${jakarta.variable} ${nastaliq.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: initScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
        <Analytics />
      </body>
    </html>
  );
}