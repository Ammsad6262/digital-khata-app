import { NextResponse } from "next/server";

/**
 * Android Digital Asset Links — the handshake that lets the installed Play
 * Store app open dukhata.com in a full-screen Trusted Web Activity instead of
 * showing browser chrome.
 *
 * The app declares this site's origin; this file declares the app. Android
 * checks both, so the fingerprint here MUST match the certificate the app is
 * signed with. Two sources, in order:
 *
 *   1. `ANDROID_SHA256_CERT_FINGERPRINTS` — comma/space separated, lets a new
 *      signing key be added (Play App Signing re-signs the app, so BOTH the
 *      upload key and Google's app-signing key belong here).
 *   2. `FALLBACK_FINGERPRINTS` — baked in at build time by
 *      `scripts/android-write-assetlinks.mjs`.
 *
 * Served at /.well-known/assetlinks.json by a rewrite in next.config.mjs.
 */
export const dynamic = "force-dynamic";

const ANDROID_PACKAGE = "com.dukhata.app";

/** Fingerprints baked in by scripts/android-write-assetlinks.mjs. */
const FALLBACK_FINGERPRINTS: string[] = [
  "9E:60:5E:F3:73:37:5E:04:06:91:8B:0D:70:40:AD:B6:7D:A8:52:1F:8F:64:89:B3:54:6D:DE:D0:6E:8A:A2:18",
];

function fingerprints(): string[] {
  const fromEnv = (process.env.ANDROID_SHA256_CERT_FINGERPRINTS ?? "")
    .split(/[,\s]+/)
    .map((value) => value.trim())
    .filter(Boolean);
  return fromEnv.length > 0 ? fromEnv : FALLBACK_FINGERPRINTS;
}

export async function GET() {
  const sha256 = fingerprints();
  return NextResponse.json(
    [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: ANDROID_PACKAGE,
          sha256_cert_fingerprints: sha256,
        },
      },
    ],
    {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
      },
    },
  );
}
