/**
 * Read the Android signing certificate's SHA-256 fingerprint from a keystore and
 * bake it into src/app/api/assetlinks/route.ts, so the Play Store app can open
 * dukhata.com in a full-screen Trusted Web Activity.
 *
 * Usage:
 *   node scripts/android-write-assetlinks.mjs <keystore> <alias> <storepass> [keytoolDir]
 *
 * For Play App Signing you must run this twice — once with the upload keystore
 * and once with the certificate Google issues — and keep BOTH fingerprints.
 * Passing several comma-separated fingerprints via the
 * ANDROID_SHA256_CERT_FINGERPRINTS env var in Vercel overrides this file.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const [keystore, alias, storepass, keytoolDirArg] = process.argv.slice(2);
if (!keystore || !alias || storepass === undefined) {
  console.error("usage: node scripts/android-write-assetlinks.mjs <keystore> <alias> <storepass> [keytoolDir]");
  process.exit(1);
}
if (!existsSync(keystore)) {
  console.error(`keystore not found: ${keystore}`);
  process.exit(1);
}

const keytoolDir =
  keytoolDirArg ?? "C:\\Users\\user\\android-tools\\jdk-17\\bin";
const keytool = path.join(keytoolDir, process.platform === "win32" ? "keytool.exe" : "keytool");
if (!existsSync(keytool)) {
  console.error(`keytool not found: ${keytool}`);
  process.exit(1);
}

const listed = execFileSync(
  keytool,
  ["-list", "-v", "-keystore", keystore, "-alias", alias, "-storepass", storepass],
  { encoding: "utf8" },
);
const match = listed.match(/SHA256:\s*((?:[0-9A-Fa-f]{2}:){31}[0-9A-Fa-f]{2})/);
if (!match) {
  console.error("could not find a SHA256 fingerprint in keytool output");
  process.exit(1);
}
const fingerprint = match[1].toUpperCase();
console.log("SHA-256 fingerprint:", fingerprint);

const routePath = path.resolve(process.cwd(), "src", "app", "api", "assetlinks", "route.ts");
let src = readFileSync(routePath, "utf8");
const block = /const FALLBACK_FINGERPRINTS: string\[\] = \[[\s\S]*?\];/;
if (!block.test(src)) {
  console.error("FALLBACK_FINGERPRINTS block not found in route.ts");
  process.exit(1);
}
src = src.replace(block, `const FALLBACK_FINGERPRINTS: string[] = [\n  "${fingerprint}",\n];`);
writeFileSync(routePath, src, "utf8");
console.log("wrote fingerprint into", routePath);
