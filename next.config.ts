import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    experimental: {
        serverActions: {
            bodySizeLimit: '100mb',
        },
    },
    output: 'standalone',
    outputFileTracingIncludes: {
        '*': [
            './node_modules/.prisma/**/*',
            './node_modules/@prisma/**/*',
            './prisma/schema.prisma',
        ],
    },
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'lh3.googleusercontent.com',
                pathname: '/**',
            },
            {
                protocol: 'https',
                hostname: '*.googleusercontent.com',
                pathname: '/**',
            },
        ],
    },
};

export default nextConfig;
