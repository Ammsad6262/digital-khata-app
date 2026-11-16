/**
 * Submit the public URLs to IndexNow (Bing, Yandex and the engines that share
 * their index). Google does not support IndexNow — it needs Search Console —
 * but this gets the site into the other engines within minutes instead of
 * waiting for a crawl.
 *
 * The key file lives at public/<key>.txt and is served from the site root, which
 * is how the engines prove you control the domain.
 *
 * Usage: node scripts/indexnow-submit.mjs
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const HOST = "https://dukhata.com";
const PUBLIC_DIR = path.resolve(process.cwd(), "public");

const keyFile = readdirSync(PUBLIC_DIR).find((f) => /^[a-f0-9]{32}\.txt$/.test(f));
if (!keyFile) {
  console.error("No IndexNow key file found in public/. Expected a 32-char hex name.");
  process.exit(1);
}
const key = path.basename(keyFile, ".txt");

const urls = [
  `${HOST}/`,
  `${HOST}/about`,
  `${HOST}/contact`,
  `${HOST}/privacy`,
  `${HOST}/terms`,
  `${HOST}/refund-policy`,
  `${HOST}/delete-account`,
];

console.log(`IndexNow key: ${key}`);
console.log(`Key file: ${HOST}/${keyFile}`);
console.log(`Submitting ${urls.length} URLs:`);
for (const u of urls) console.log(`  ${u}`);

const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({
    host: new URL(HOST).host,
    key,
    keyLocation: `${HOST}/${keyFile}`,
    urlList: urls,
  }),
});

const body = await res.text();
console.log(`\nIndexNow response: ${res.status} ${res.statusText}`);
if (body.trim()) console.log(body.slice(0, 500));
console.log(
  res.status === 200 || res.status === 202
    ? "Accepted. Bing and partners will crawl these URLs shortly."
    : "Not accepted — check the key file is reachable at the keyLocation above.",
);
