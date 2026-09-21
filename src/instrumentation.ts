/**
 * Next.js Instrumentation — runs ONCE on the server before any request.
 *
 * This is the ONLY safe place to load .env files using Node.js `fs`/`path`
 * modules, because Next.js guarantees this file never gets bundled for the
 * browser.
 *
 * We use it to force-load .env values into process.env, overriding any stale
 * parent-shell env vars (e.g. a leftover DATABASE_URL from a previous SQLite
 * setup).
 *
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only run on the server (not in the browser / edge runtime)
  if (typeof process !== "undefined" && typeof window === "undefined") {
    const { loadEnvForcefully } = await import("./lib/server/load-env");
    loadEnvForcefully();
  }
}
