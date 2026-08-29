import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: process.env.NEXT_DIST_DIR === ".next-e2e" ? ["127.0.0.1"] : [],
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  output: "export",
  trailingSlash: true,
  transpilePackages: ["@spherepath/shared"],
};

export default nextConfig;
