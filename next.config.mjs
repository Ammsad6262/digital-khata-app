/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Prisma needs to be transpiled for Next.js production builds
  // (works without this in dev mode but breaks in `next build`)
};

export default nextConfig;
