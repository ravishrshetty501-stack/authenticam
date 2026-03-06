import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  turbopack: {},
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost', port: '5000' },
      { protocol: 'https', hostname: '*.onrender.com' },
    ],
  },
};

export default nextConfig;
