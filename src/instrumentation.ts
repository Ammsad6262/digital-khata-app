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
  // Edge runtime check — instrumentation can run in edge or nodejs runtime.
  // We only want to load .env in the Node.js runtime (where fs is available).
  if (typeof process !== "undefined" && typeof window === "undefined") {
    try {
      // Use eval() to hide the require() call from webpack's static analysis.
      // Without this, webpack tries to bundle 'fs' and 'path' for the browser,
      // which breaks the client JS bundle (Module not found: Can't resolve 'fs').
      // At runtime on the server, eval('require') returns Node.js's require,
      // which can load built-in modules normally.
      const _require = eval("require");
      const fs = _require("fs");
      const path = _require("path");

      const projectRoot = process.cwd();
      const envPaths = [
        path.join(projectRoot, ".env"),
        path.join(projectRoot, ".env.local"),
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

      console.log("[instrumentation] .env loaded. DATABASE_URL starts with:",
        process.env.DATABASE_URL?.substring(0, 15));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[instrumentation] Could not load env file:", msg);
    }
  }
}
