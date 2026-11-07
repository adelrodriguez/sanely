import { defineConfig } from "tsdown"

export default defineConfig({
  clean: true,
  deps: {
    alwaysBundle: ["@sanely/core/time"],
    onlyBundle: [],
    onlyImport: [],
  },
  dts: true,
  entry: ["src/index.ts"],
  fixedExtension: false,
  minify: true,
  outDir: "dist",
  platform: "node",
  sourcemap: false,
})
