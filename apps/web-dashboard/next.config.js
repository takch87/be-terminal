/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  transpilePackages: ['@be/sdk-client', '@be/shared'],
};
module.exports = nextConfig;