import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const dir = ".next/static";
const files = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith(".css")) files.push(p);
  }
})(dir);

let all = "";
for (const f of files) all += readFileSync(f, "utf8");
const norm = all.replace(/\\/g, "");

const needles = [
  "end-2.5", "end-4", "end-20", "end-1", "-end-1", "-end-0.5",
  "start-3.5", "start-2", "ps-10", "pe-10", "ps-8", "pe-2",
  "rounded-es-sm", "rounded-ee-sm",
];
let bad = 0;
for (const n of needles) {
  const ok = norm.includes(n);
  if (!ok) bad++;
  console.log(`${n.padEnd(16)} ${ok ? "ok" : "MISSING"}`);
}
console.log(bad ? `\n${bad} missing` : "\nall logical utilities emitted");
