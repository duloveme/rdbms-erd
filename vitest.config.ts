import path from "node:path";
import { defineConfig } from "vitest/config";

const root = process.cwd();

export default defineConfig({
    resolve: {
        alias: {
            "@rdbms-erd/core": path.join(root, "packages/erd-core/src/index.ts"),
            "@rdbms-erd/designer": path.join(
                root,
                "packages/erd-designer/src/index.ts",
            ),
        },
    },
    test: {
        globals: true,
        environment: "node",
        include: ["packages/**/*.test.ts"],
    },
});
