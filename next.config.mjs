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
  },
};

export default nextConfig;
