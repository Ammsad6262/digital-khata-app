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
 *   - Noto Naskh Arabic: for Urdu text (Arabic script) — the standard,
 *     highly legible face for reading at interface sizes.
 *
 * Anti-FOUC: inline script sets theme + language dir before first paint.
 */

import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Plus_Jakarta_Sans, Noto_Naskh_Arabic } from "next/font/google";
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

// Noto Naskh Arabic — the standard, highly legible Arabic-script face used
// across Urdu/Arabic interfaces. (Nastaliq is calligraphic and hard to read
// at interface sizes, so it is kept only as a last-resort fallback.)
const urduFont = Noto_Naskh_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-urdu",
  display: "swap",
  preload: true,
});

export const metadata: Metadata = {
  metadataBase: new URL("https://dukhata.com"),
  title: {
    default: "Dukhata — digital khata app for Pakistani shops",
    template: "%s · Dukhata",
  },
  description:
    "Record sales, udhaar and payments in seconds. Dukhata is a simple digital khata app for kiryana, wholesale and general stores in Pakistan. Free 14-day trial.",
  applicationName: "Dukhata",
  keywords: [
    "digital khata",
    "khata app",
    "udhaar khata",
    "khata book Pakistan",
    "shop ledger app",
    "customer balance app",
    "kiryana store app",
    "wholesale business management",
    "اردو کھاتہ ایپ",
  ],
  category: "business",
  // Set GOOGLE_SITE_VERIFICATION (and BING_SITE_VERIFICATION) in Vercel to
  // complete Search Console / Bing Webmaster verification without a code change.
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION,
    other: process.env.BING_SITE_VERIFICATION
      ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION }
      : undefined,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Dukhata",
    locale: "en_PK",
    url: "/",
    title: "Dukhata — digital khata app for Pakistani shops",
    description:
      "Record sales, udhaar and payments in seconds, by typing or speaking in Urdu. Free 14-day trial.",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Dukhata — digital khata app for Pakistani shops",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Dukhata — digital khata app for Pakistani shops",
    description:
      "Record sales, udhaar and payments in seconds, by typing or speaking in Urdu. Free 14-day trial.",
    images: ["/opengraph-image.png"],
  },
  manifest: "/manifest.json",
  icons: {
    // Google asks for a favicon that is a multiple of 48px; browsers also look
    // for /favicon.ico directly, so both are declared.
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-48.png", type: "image/png", sizes: "48x48" },
      { url: "/icon-96.png", type: "image/png", sizes: "96x96" },
      { url: "/icon-144.png", type: "image/png", sizes: "144x144" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    shortcut: ["/favicon.ico"],
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
    }
  } catch (e) {}

  // Installed Android app (Trusted Web Activity) offline fallback. Skipped on
  // localhost so a service worker can never serve stale pages during next dev.
  try {
    var host = location.hostname;
    if ('serviceWorker' in navigator && host !== 'localhost' && host !== '127.0.0.1') {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('/sw.js').catch(function () {});
      });
    }
  } catch (e) {}
})();
`;

// Force dynamic rendering — prevents Next.js 16 Turbopack from trying to
// statically prerender pages (which fails on /_global-error due to React
// context not being available during static generation).
export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Read the language cookie on the server so the first paint is already in the
  // owner's language. The client provider writes this cookie on every change.
  const cookieLang = (await cookies()).get("digital-khata-lang")?.value;
  const initialLang: "en" | "ur" = cookieLang === "ur" ? "ur" : "en";

  return (
    <html
      lang={initialLang}
      dir={initialLang === "ur" ? "rtl" : "ltr"}
      translate="no"
      data-theme="ink"
      className={`${jakarta.variable} ${urduFont.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Never let the browser machine-translate the interface. The app
            ships its own Urdu; auto-translation mangles it back into bad
            English (e.g. the brand "دکھاتہ" becomes "Show"). */}
        <meta name="google" content="notranslate" />
        <script dangerouslySetInnerHTML={{ __html: initScript }} />
      </head>
      <body>
        <Providers initialLanguage={initialLang}>{children}</Providers>
        <Analytics />
      </body>
    </html>
  );
}