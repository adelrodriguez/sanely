import { defineConfig } from "tsdown"
import packageJson from "./package.json" with { type: "json" }

export default defineConfig({
  clean: true,
  deps: {
    onlyBundle: [],
    // Tracks package.json, so the bundle imports only its runtime dependencies.
    onlyImport: Object.keys(packageJson.dependencies),
  },
  dts: true,
  entry: ["src/index.ts", "src/errors.ts", "src/types.ts"],
  fixedExtension: false,
  outDir: "dist",
  platform: "browser",
  sourcemap: true,
})
