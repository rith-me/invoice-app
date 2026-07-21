/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';

const nextConfig = {
  output: 'export',
  basePath: isProd ? '/invoice-app' : '',
  images: {
    unoptimized: true,
  },
};

export default nextConfig;