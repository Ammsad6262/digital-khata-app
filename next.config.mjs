/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Enable gzip + brotli compression for all responses
  // Vercel does this automatically, but for self-hosted/local dev this helps
  compress: true,

  // Optimize: don't generate static pages for API routes (they're all dynamic)
  // and only generate the specific pages we need at build time
  experimental: {
    optimizePackageImports: ["lucide-react"],
    // Enable instrumentation hook (src/instrumentation.ts) — runs once on server
    // startup before any request. We use it to force-load .env values into
    // process.env, overriding any stale parent-shell env vars.
    // NOTE: In Next.js 15+ this is stable and enabled by default.
    instrumentationHook: true,
  },
};

export default nextConfig;
