/**
 * Reconcile human-readable code lists against the hashes stored in the database.
 *
 * Codes are only ever stored as sha256 hashes, so a plaintext list can only be
 * trusted if it is *proven* to match a row. This reads one or more sources (a
 * PDF, a CSV), extracts the code-looking strings, hashes them exactly the way
 * the app does (sha256 of upper(trim(code))), and reports which ones correspond
 * to a real RedeemCode row and what state that row is in.
 *
 * Read-only: it never writes to the database.
 *
 * Usage:
 *   node scripts/code-inventory.mjs <pdf-or-csv> [more ...]
 * Writes the consolidated master list next to the working dir (outside the repo).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PdfReader } from "./_pdf.mjs";

for (const f of [".env.local", ".env"]) {
  const p = path.resolve(process.cwd(), f);
  if (!existsSync(p)) continue;
  for (const raw of readFileSync(p, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

const CODE_RE = /DKH-[A-Z]-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/g;
const sha = (code) => createHash("sha256").update(code.toUpperCase().trim()).digest("hex");

const sources = process.argv.slice(2);
if (!sources.length) {
  console.error("usage: node scripts/code-inventory.mjs <pdf-or-csv> [...]");
  process.exit(1);
}

const found = new Map(); // code -> source label
for (const src of sources) {
  if (!existsSync(src)) {
    console.error(`missing: ${src}`);
    continue;
  }
  let text = "";
  if (src.toLowerCase().endsWith(".pdf")) {
    const r = new PdfReader(src);
    text = r.pages.map((pg) => pg.text).join("\n");
  } else {
    text = readFileSync(src, "utf8");
  }
  const hits = text.match(CODE_RE) ?? [];
  for (const h of hits) if (!found.has(h)) found.set(h, path.basename(src));
  console.log(`${path.basename(src)}: ${hits.length} code strings, ${new Set(hits).size} unique`);
}

console.log(`\ntotal unique codes across sources: ${found.size}`);

const prisma = new PrismaClient();
const rows = await prisma.redeemCode.findMany({
  select: {
    codeHash: true, kind: true, durationDays: true, active: true,
    redemptionCount: true, maxRedemptions: true, label: true,
    revokedAt: true, expiresAt: true, createdAt: true,
  },
});
const byHash = new Map(rows.map((r) => [r.codeHash, r]));

const matched = [];
const unmatched = [];
for (const [code, src] of found) {
  const row = byHash.get(sha(code));
  if (row) matched.push({ code, src, ...row });
  else unmatched.push({ code, src });
}

console.log(`\nmatched to a DB row : ${matched.length}`);
console.log(`NOT in the database : ${unmatched.length}`);
if (unmatched.length) {
  console.log("  (these plaintexts do not correspond to any stored hash)");
  for (const u of unmatched.slice(0, 20)) console.log(`   ${u.code}  [${u.src}]`);
}

// group matched by kind/duration/active
const groups = new Map();
for (const m of matched) {
  const key = `${m.kind} ${m.durationDays}d active=${m.active} redeemed=${m.redemptionCount > 0}`;
  groups.set(key, (groups.get(key) ?? 0) + 1);
}
console.log("\nmatched rows, grouped:");
for (const [k, v] of [...groups.entries()].sort()) console.log(`  ${k}: ${v}`);

// DB rows that are active but have no plaintext we know about
const knownHashes = new Set([...found].map(([c]) => sha(c)));
const orphanActive = rows.filter((r) => r.active && !knownHashes.has(r.codeHash));
console.log(`\nactive DB codes with NO known plaintext: ${orphanActive.length}`);
for (const o of orphanActive.slice(0, 20)) {
  console.log(`  ${o.kind} ${o.durationDays}d label=${o.label ?? "-"} created=${o.createdAt.toISOString().slice(0, 10)}`);
}

const out = path.resolve("C:\\Users\\user\\Documents\\Default Project", "dukhata-codes-master.csv");
const lines = ["plan,kind,duration_days,active,redemptions,code"];
for (const m of matched.sort((a, b) => (a.kind + a.durationDays).localeCompare(b.kind + b.durationDays))) {
  const plan =
    m.kind === "PRODUCT" ? "Product (permanent core)" :
    m.kind === "AFFILIATE" ? "Affiliate (permanent)" :
    `Premium ${m.durationDays} days`;
  lines.push(`"${plan}","${m.kind}",${m.durationDays},${m.active},${m.redemptionCount},"${m.code}"`);
}
writeFileSync(out, lines.join("\n") + "\n", "utf8");
console.log(`\nmaster list written: ${out}  (${matched.length} codes)`);

await prisma.$disconnect();
