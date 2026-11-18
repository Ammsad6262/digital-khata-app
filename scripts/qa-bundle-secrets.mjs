/**
 * Is any secret reachable from the browser?
 *
 * Fetches the real deployed JavaScript for several pages and searches it for
 * (a) known secret-shaped patterns and (b) the ACTUAL values from .env.local.
 * Prints only booleans and chunk names, never a value.
 */
import { readFileSync, existsSync } from "node:fs";

const BASE = "https://dukhata.com";
const PAGES = ["/", "/login", "/register", "/privacy", "/more/settings", "/more/redeem", "/more/subscription"];

// Real secret values, kept only in memory, never printed.
const secrets = {};
if (existsSync(".env.local")) {
  for (const raw of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    // only secrets long enough to be meaningful; skip short non-secrets
    if (value.length >= 20) secrets[key] = value;
  }
}
// A DB password can appear on its own, inside the URL
if (secrets.DATABASE_URL) {
  try {
    const u = new URL(secrets.DATABASE_URL);
    if (u.password) secrets["DATABASE_URL (password only)"] = decodeURIComponent(u.password);
  } catch {}
}

const PATTERNS = {
  "Google API key (AIza...)": /AIza[0-9A-Za-z_-]{35}/,
  "Resend key (re_...)": /re_[A-Za-z0-9]{16,}/,
  "OpenAI-style key (sk-...)": /sk-[A-Za-z0-9]{20,}/,
  "JWT / Supabase key (eyJ...)": /eyJ[A-Za-z0-9_-]{20,}\./,
  "Postgres URL": /postgres(?:ql)?:\/\/[^\s"'`]+/,
  "env name GEMINI_API_KEY": /GEMINI_API_KEY/,
  "env name GEMINI_OWNER_API_KEY": /GEMINI_OWNER_API_KEY/,
  "env name RESEND_API_KEY": /RESEND_API_KEY/,
  "env name SESSION_SECRET": /SESSION_SECRET/,
  "env name ADMIN_SECRET": /ADMIN_SECRET/,
  "env name DATABASE_URL": /DATABASE_URL/,
  "env name DIRECT_URL": /DIRECT_URL/,
  "env name VERCEL_TOKEN": /VERCEL_TOKEN/,
};

const chunks = new Set();
const pagesOk = [];
for (const page of PAGES) {
  const res = await fetch(`${BASE}${page}?cb=${Date.now()}`, { redirect: "manual" });
  if (res.status !== 200) {
    pagesOk.push(`${page}:${res.status}`);
    continue;
  }
  const html = await res.text();
  pagesOk.push(`${page}:200`);
  for (const m of html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+\.js)"/g)) chunks.add(m[1]);
}

console.log("pages :", pagesOk.join("  "));
console.log("chunks:", chunks.size, "(unique, referenced by those pages)");
console.log();

const patternHits = {};
const valueHits = {};
const scan = (body, label) => {
  for (const [name, re] of Object.entries(PATTERNS)) if (re.test(body)) (patternHits[name] ??= []).push(label);
  for (const [name, value] of Object.entries(secrets)) if (body.includes(value)) (valueHits[name] ??= []).push(label);
};

let total = 0;
for (const src of chunks) {
  const res = await fetch(BASE + src);
  if (!res.ok) continue;
  const body = await res.text();
  total += body.length;
  scan(body, src.split("/").pop());
}

// Also scan the HTML itself (inline scripts / RSC payload)
for (const page of PAGES) {
  const res = await fetch(`${BASE}${page}?cb=${Date.now()}`, { redirect: "manual" });
  if (res.status !== 200) continue;
  scan(await res.text(), `html:${page}`);
}

console.log(`scanned ${(total / 1024 / 1024).toFixed(2)} MB of JavaScript\n`);
console.log("--- secret-shaped patterns ---");
for (const name of Object.keys(PATTERNS)) {
  const hits = patternHits[name];
  console.log(`  ${hits ? "PRESENT" : "absent "}  ${name}${hits ? "  in " + hits.slice(0, 3).join(", ") : ""}`);
}
console.log("\n--- your ACTUAL values from .env.local ---");
for (const name of Object.keys(secrets)) {
  const hits = valueHits[name];
  console.log(`  ${hits ? "LEAKED!" : "absent "}  ${name}${hits ? "  in " + hits.slice(0, 3).join(", ") : ""}`);
}

const leaked = Object.keys(valueHits).length + Object.keys(PATTERNS).filter((n) => patternHits[n] && !n.startsWith("env name ")).length;
const nameOnly = Object.keys(PATTERNS).filter((n) => n.startsWith("env name ") && patternHits[n]);

console.log();
if (nameOnly.length) {
  console.log(
    `note: ${nameOnly.length} environment-variable NAME(S) appear as plain text. These are not secrets,` +
      " but check each is inside a user-facing message rather than a real reference:",
  );
  console.log("  " + nameOnly.join(", "));
}
console.log();
console.log(
  leaked === 0
    ? "VERDICT: no secret value and no key-shaped string in the browser bundle"
    : "VERDICT: SECRETS FOUND IN THE BUNDLE - see above",
);
process.exit(leaked === 0 ? 0 : 1);