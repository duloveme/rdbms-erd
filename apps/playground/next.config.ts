import type { NextConfig } from "next";
import path from "node:path";

const isDev = process.env.NODE_ENV !== "production";
const coreSrcEntry = path.resolve(
  __dirname,
  "../../packages/erd-core/src/index.ts",
);
const designerSrcEntry = path.resolve(
  __dirname,
  "../../packages/erd-designer/src/index.ts",
);
const designerCssSrcEntry = path.resolve(
  __dirname,
  "../../packages/erd-designer/src/designer.css",
);
const nextConfig: NextConfig = {
  transpilePackages: ["@rdbms-erd/core", "@rdbms-erd/designer"],
  allowedDevOrigins: ["211.116.225.14"],
  ...(isDev
    ? {
        webpack: (config: any) => {
          config.resolve = config.resolve ?? {};
          config.resolve.alias = {
            ...(config.resolve.alias ?? {}),
            "@rdbms-erd/core": coreSrcEntry,
            "@rdbms-erd/designer": designerSrcEntry,
            "@rdbms-erd/designer/designer.css": designerCssSrcEntry,
          };
          return config;
        },
        turbopack: {
          resolveAlias: {
            // Turbopack on Windows currently requires non-absolute alias paths.
            "@rdbms-erd/core": "../../packages/erd-core/src/index.ts",
            "@rdbms-erd/designer": "../../packages/erd-designer/src/index.ts",
            "@rdbms-erd/designer/designer.css":
              "../../packages/erd-designer/src/designer.css",
          },
        },
      }
    : {
        // Next 16 production build defaults to Turbopack.
        // Keep an explicit turbopack block so it doesn't conflict with dev-only webpack customization.
        turbopack: {},
      }),
};

export default nextConfig;
