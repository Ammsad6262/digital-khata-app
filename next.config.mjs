/** @type {import('next').NextConfig} */

// ── Force-load .env on startup (server-side only) ───────────────────────────
//
// Background: Prisma's `env("DATABASE_URL")` reads from process.env. If the
// parent shell has `DATABASE_URL=file:/old/sqlite/path` set (e.g. from a
// previous development setup), that value takes precedence over the .env file.
//
// next.config.mjs is loaded by Next.js in Node.js context at build/startup
// time — it's NEVER bundled for the browser or Edge Runtime. So we can
// safely use `fs`/`path` here to parse .env and force-override process.env
// before anything else runs.
//
// In production (Vercel), env vars are set by the platform — the .env file
// may not exist, but the code below is harmless (it just skips missing files).
//
import * as fs from "fs";
import * as path from "path";

try {
  const projectRoot = process.cwd();
  const envPaths = [
    path.join(projectRoot, ".env"),
    path.join(projectRoot, ".env.local"),
  ];
  for (const p of envPaths) {
    if (!fs.existsSync(p)) continue;
    const content = fs.readFileSync(p, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx <= 0) continue;
      const key = trimmed.substring(0, eqIdx).trim();
      let value = trimmed.substring(eqIdx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.substring(1, value.length - 1);
      }
      // NEVER let .env override NODE_ENV. Next.js sets it per command
      // (development for `next dev`, production for `next build`). A
      // NODE_ENV=development line in .env used to leak into `next build`,
      // which made the production prerender fail on /_global-error with
      // "Cannot read properties of null (reading 'useContext')".
      if (key === "NODE_ENV") continue;
      process.env[key] = value;
    }
  }
  console.log("[next.config] .env loaded.");
} catch (e) {
  console.warn("[next.config] Could not load .env:", e?.message);
}

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Keep the dev view clean — the floating indicator covers the app's own
  // bottom navigation while reviewing screens.
  devIndicators: false,

  // Enable gzip + brotli compression for all responses
  // Vercel does this automatically, but for self-hosted/local dev this helps
  compress: true,

  // Optimize: don't generate static pages for API routes (they're all dynamic)
  // and only generate the specific pages we need at build time
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },

  // Security headers applied to every response.
  async headers() {
    const isDev = process.env.NODE_ENV !== "production";
    // Same-origin only. Next.js needs inline scripts/styles; Turbopack needs
    // eval in development. This still blocks third-party script injection,
    // framing and plugin content.
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self' https://va.vercel-scripts.com https://vitals.vercel-insights.com",
      "media-src 'self' blob:",
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; ");

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Voice assistant needs the microphone; nothing else does.
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), payment=(), microphone=(self)" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
};

export default nextConfig;
