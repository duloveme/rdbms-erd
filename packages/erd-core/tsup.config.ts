import { defineConfig } from "tsup";

export default defineConfig({
    entry: ["src/index.ts"],
    format: ["esm"],
    dts: {
        compilerOptions: {
            skipLibCheck: true,
            ignoreDeprecations: "6.0",
        },
    },
    sourcemap: true,
    clean: true,
    treeshake: true,
    platform: "neutral",
    target: "es2022",
});
