import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@farbencrm/shared"],
  // output: "standalone" is set via NEXT_OUTPUT in Dockerfile for Docker builds
  ...(process.env.NEXT_OUTPUT === "standalone" ? { output: "standalone" as const } : {}),
};

export default nextConfig;
