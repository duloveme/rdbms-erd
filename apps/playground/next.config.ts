import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@rdbms-erd/core", "@rdbms-erd/designer"]
};

export default nextConfig;
