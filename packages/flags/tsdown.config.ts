import { defineConfig } from "tsdown"

export default defineConfig({
  clean: true,
  deps: {
    neverBundle: true,
  },
  dts: true,
  entry: ["src/index.ts", "src/integrations/react/index.tsx", "src/testing/index.ts"],
  fixedExtension: false,
  format: "esm",
  minify: false,
  outDir: "dist",
  platform: "browser",
  sourcemap: true,
})
