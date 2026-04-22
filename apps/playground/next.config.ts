import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@rdbms-erd/core", "@rdbms-erd/designer"],
  allowedDevOrigins: ["211.116.225.14"]
};

export default nextConfig;
