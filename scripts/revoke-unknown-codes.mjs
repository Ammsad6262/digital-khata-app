/**
 * Revoke "orphan" codes: active RedeemCode rows that no known plaintext maps to.
 *
 * Codes are stored only as sha256 hashes. If we hold a plaintext list (for
 * example the owner's printed inventory), any active row whose hash is NOT in
 * that list is a code nobody can ever redeem — it only inflates the inventory.
 * This finds those and, with --apply, revokes the unredeemed ones.
 *
 * Read-only by default. Usage:
 *   node scripts/revoke-unknown-codes.mjs <known-codes.csv|pdf> [more ...] [--apply]
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PdfReader } from "./_pdf.mjs";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const sources = args.filter((a) => a !== "--apply");
if (!sources.length) {
  console.error("usage: node scripts/revoke-unknown-codes.mjs <file> [...] [--apply]");
  process.exit(1);
}

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
const sha = (c) => createHash("sha256").update(c.toUpperCase().trim()).digest("hex");

const known = new Set();
for (const src of sources) {
  const text = src.toLowerCase().endsWith(".pdf")
    ? new PdfReader(src).pages.map((p) => p.text).join("\n")
    : readFileSync(src, "utf8");
  for (const m of text.match(CODE_RE) ?? []) known.add(sha(m));
  for (const m of text.matchAll(/"(DKH-[A-Z]-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4})"/g)) known.add(sha(m[1]));
}
console.log("known plaintext hashes:", known.size);

const prisma = new PrismaClient();
const active = await prisma.redeemCode.findMany({
  where: { active: true },
  select: { id: true, codeHash: true, kind: true, durationDays: true, redemptionCount: true, createdAt: true },
});
const unknown = active.filter((r) => !known.has(r.codeHash));
console.log("active codes with no known plaintext:", unknown.length);
for (const u of unknown) {
  console.log(`  ${u.kind} ${u.durationDays}d redeemed=${u.redemptionCount} created=${u.createdAt.toISOString().slice(0, 10)}`);
}

const safe = unknown.filter((u) => u.redemptionCount === 0);
const refused = unknown.filter((u) => u.redemptionCount > 0);
if (refused.length) console.log("kept (already redeemed, not revoking):", refused.length);

if (apply && safe.length) {
  const res = await prisma.redeemCode.updateMany({
    where: { id: { in: safe.map((u) => u.id) }, active: true, redemptionCount: 0 },
    data: { active: false, revokedAt: new Date(), revokedBy: "admin" },
  });
  console.log("revoked:", res.count);
} else if (!apply) {
  console.log("dry run — pass --apply to revoke the", safe.length, "unredeemed orphans");
}

console.log("active codes remaining:", await prisma.redeemCode.count({ where: { active: true } }));
await prisma.$disconnect();
