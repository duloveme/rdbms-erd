import { defineConfig } from "tsup";

export default defineConfig({
    tsconfig: "tsconfig.json",
    entry: ["src/index.ts"],
    format: ["esm"],
    dts: {
        compilerOptions: {
            jsx: "react-jsx",
            skipLibCheck: true,
            ignoreDeprecations: "6.0",
        },
    },
    sourcemap: true,
    clean: true,
    treeshake: true,
    platform: "browser",
    target: "es2022",
    external: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        /^react\//,
        "@rdbms-erd/core",
        "@xyflow/react",
        "immer",
        "zustand",
        "zundo",
        "uuid",
        "lucide-react",
        "html-to-image",
        "jspdf",
    ],
    banner: {
        // esbuild가 CSS side-effect import를 떨어뜨려 dist/index.css가 고아가 되지 않도록 고정한다.
        js: 'import "./index.css";',
    },
    esbuildOptions(options) {
        options.loader = {
            ...options.loader,
            ".css": "copy",
        };
    },
});
