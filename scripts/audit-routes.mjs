/**
 * Static route-guard audit.
 *
 * Every /api route must either:
 *   - be in the middleware PUBLIC_ROUTES allowlist (and prove identity itself), or
 *   - call requireUserId()/requireActiveAccess()/requireAdmin(), or
 *   - rely on middleware + derive identity from the verified JWT (getCurrentUserId).
 *
 * It also flags any route that reads an identity from client input
 * (searchParams/body `userId`), which would be an IDOR.
 *
 * Usage: node scripts/audit-routes.mjs
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";

const ROOT = "src/app/api";
const GUARD_FILE = existsSync("src/proxy.ts") ? "src/proxy.ts" : "src/middleware.ts";
const MIDDLEWARE = readFileSync(GUARD_FILE, "utf8");

const PUBLIC = [
  "/api/auth/register",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/status",
  "/api/auth/me",
  "/api/auth/unlock",
  "/api/auth/reset-password",
  "/api/health",
  "/api/admin/codes",
  "/api/admin/password-reset",
  "/api/admin/diagnostics",
];

const files = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith(`${sep}route.ts`)) files.push(p);
  }
})(ROOT);

const toPath = (f) =>
  "/" + f.replace(/\\/g, "/").replace(/^src\/app\//, "").replace(/\/route\.ts$/, "");

const GUARDS = [
  ["requireUserId", /requireUserId\s*\(/],
  ["requireActiveAccess", /requireActiveAccess\s*\(/],
  ["requireAdmin", /requireAdmin\s*\(/],
  ["getCurrentUserId", /getCurrentUserId\s*\(/],
];

let problems = 0;
const rows = [];

for (const f of files) {
  const path = toPath(f);
  const src = readFileSync(f, "utf8");
  const isPublic = PUBLIC.some((p) => path === p || path.startsWith(p + "/"));
  const guards = GUARDS.filter(([, re]) => re.test(src)).map(([n]) => n);

  // Identity from client input is an IDOR smell.
  const idor = /searchParams\.get\(\s*["']userId["']\s*\)/.test(src) || /\bbody\.userId\b/.test(src);

  // Admin routes must call requireAdmin.
  const needsAdmin = path.startsWith("/api/admin");

  let status = "ok";
  const notes = [];
  if (idor) {
    status = "IDOR?";
    notes.push("reads userId from client input");
  }
  if (needsAdmin && !guards.includes("requireAdmin")) {
    status = "MISSING ADMIN GUARD";
  }
  if (!isPublic && guards.length === 0) {
    status = "NO GUARD";
    notes.push("relies on middleware only");
  }
  if (isPublic && path.startsWith("/api/auth/") && !path.endsWith("/me") && !path.endsWith("/status")) {
    // login/register/unlock/logout/reset are expected to be public.
  }

  if (status !== "ok") problems++;
  rows.push({ path, isPublic, guards, status, notes });
}

rows.sort((a, b) => a.path.localeCompare(b.path));
const w = Math.max(...rows.map((r) => r.path.length));
for (const r of rows) {
  const flag = r.status === "ok" ? "  " : "!!";
  console.log(
    `${flag} ${r.path.padEnd(w)}  ${r.isPublic ? "public " : "private"}  ${r.guards.join(",") || "—"}` +
      (r.notes.length ? `   ${r.notes.join("; ")}` : ""),
  );
}
console.log(`\nRoutes: ${rows.length}   Problems: ${problems}`);
process.exit(problems ? 1 : 0);