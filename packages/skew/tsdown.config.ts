import { defineConfig } from "tsdown"
import packageJson from "./package.json" with { type: "json" }

export default defineConfig({
  clean: true,
  define: {
    "process.env.NODE_ENV": "process.env.NODE_ENV",
  },
  deps: {
    alwaysBundle: ["@sanely/core/time"],
    onlyBundle: [],
    // The runtime imports its dependencies, and the adapters import their framework peers.
    onlyImport: [
      ...Object.keys(packageJson.dependencies),
      ...Object.keys(packageJson.peerDependencies),
    ],
  },
  dts: true,
  entry: [
    "src/index.ts",
    "src/integrations/react/index.ts",
    "src/adapters/vite/index.ts",
    "src/adapters/next/index.ts",
  ],
  fixedExtension: false,
  outDir: "dist",
  platform: "browser",
  sourcemap: true,
})
