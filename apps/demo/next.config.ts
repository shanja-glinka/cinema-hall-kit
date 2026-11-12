import type { NextConfig } from 'next';

// The packages are consumed from their built `dist` through the public `exports`,
// exactly like an npm consumer: no transpilePackages, no imports from packages/*/src.
const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
