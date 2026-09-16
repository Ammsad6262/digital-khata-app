/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    typedRoutes: false, // enable later once routes stabilize
  },
  // Prisma needs to be transpiled for Next.js production builds
  // (works without this in dev mode but breaks in `next build`)
};

export default nextConfig;
