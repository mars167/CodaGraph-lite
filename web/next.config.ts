import type { NextConfig } from "next";
import { dirname } from "path";
import { fileURLToPath } from "url";

const projectRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },

  // API 代理配置
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: process.env.NEXT_PUBLIC_API_URL
          ? `${process.env.NEXT_PUBLIC_API_URL}/api/:path*`
          : 'http://localhost:7900/api/:path*',
      },
      {
        source: '/oauth/:path*',
        destination: process.env.NEXT_PUBLIC_API_URL
          ? `${process.env.NEXT_PUBLIC_API_URL}/oauth/:path*`
          : 'http://localhost:7900/oauth/:path*',
      },
    ];
  },

  // 生产环境优化
  reactStrictMode: true,

  // 图片优化
  images: {
    remotePatterns: [],
  },

  // 实验性功能
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },

  // 输出配置
  output: 'standalone',
};

export default nextConfig;
