import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'export',
  trailingSlash: true,
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? '',
  // Explicit local preview hosts; do not allow arbitrary origins.
  allowedDevOrigins: ['127.0.0.1', '172.29.80.1'],
};

export default config;
