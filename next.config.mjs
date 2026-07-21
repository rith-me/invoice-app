/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  // Adds your repository name as a prefix to all routing and asset URLs
  basePath: '/invoice-app',
  images: {
    unoptimized: true,
  },
};

export default nextConfig;