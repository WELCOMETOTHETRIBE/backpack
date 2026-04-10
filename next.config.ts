import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // URL redirects: legacy paths → canonical paths
  async redirects() {
    return [
      {
        source: "/dashboard/os-baselines/scoping",
        destination: "/dashboard/boundary/scoping",
        permanent: true,
      },
    ];
  },
  // Force clients to always revalidate page documents so the GUI shows the current live build
  async headers() {
    return [
      {
        source: "/((?!_next/static|_next/image|favicon).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
    ];
  },
  // Expose build identifier so the UI can display which build is running
  env: {
    NEXT_PUBLIC_BUILD_ID:
      process.env.RAILWAY_GIT_COMMIT_SHA ??
      process.env.VERCEL_GIT_COMMIT_SHA ??
      process.env.NEXT_PUBLIC_BUILD_ID ??
      "dev",
  },
};

export default nextConfig;
