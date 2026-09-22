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
      process.env[key] = value;
    }
  }
  console.log("[next.config] .env loaded. DATABASE_URL starts with:",
    process.env.DATABASE_URL?.substring(0, 15));
} catch (e) {
  console.warn("[next.config] Could not load .env:", e?.message);
}

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Enable gzip + brotli compression for all responses
  // Vercel does this automatically, but for self-hosted/local dev this helps
  compress: true,

  // Optimize: don't generate static pages for API routes (they're all dynamic)
  // and only generate the specific pages we need at build time
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
