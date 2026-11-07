import { defineConfig } from "tsdown"

export default defineConfig({
  clean: true,
  deps: { onlyBundle: [], onlyImport: [] },
  dts: true,
  entry: ["src/time.ts"],
  fixedExtension: false,
  minify: true,
  outDir: "dist",
  platform: "node",
  sourcemap: false,
})
