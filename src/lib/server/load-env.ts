/**
 * Server-side env var loader.
 *
 * This file is imported ONLY by src/instrumentation.ts (which Next.js runs
 * exclusively on the server). It force-loads .env values into process.env,
 * overriding any stale parent-shell env vars.
 *
 * Background: Prisma's `env("DATABASE_URL")` reads from process.env. If the
 * parent shell has `DATABASE_URL=file:/old/sqlite/path` set (e.g. from a
 * previous development setup), that value takes precedence over the .env file.
 * This module parses .env manually and force-assigns, ensuring the correct
 * Postgres URL is used.
 *
 * We can't do this in src/lib/db/prisma.ts because that file is imported
 * transitively by client components, and importing `fs`/`path` there breaks
 * the client-side webpack bundle.
 *
 * In production (Vercel), env vars are set by the platform — this is a no-op
 * because the .env file may not exist, but it's harmless.
 */

import * as fs from "fs";
import * as path from "path";

export function loadEnvForcefully() {
  const projectRoot = process.cwd();
  const envPaths = [
    path.join(projectRoot, ".env"),
    path.join(projectRoot, ".env.local"),
    path.join(projectRoot, ".env.development"),
    path.join(projectRoot, ".env.production"),
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
      // Strip surrounding quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.substring(1, value.length - 1);
      }
      // Force-override (don't skip if already set — that's the whole point)
      process.env[key] = value;
    }
  }
}
