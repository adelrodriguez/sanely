import { defineConfig } from "tsdown"
import { Macros } from "unplugin-macros"
import packageJson from "./package.json" with { type: "json" }

export default defineConfig({
  clean: true,
  deps: {
    alwaysBundle: ["@sanely/core/time"],
    neverBundle: ["cloudflare:workers"],
    onlyBundle: [],
    // Tracks package.json, so the bundle imports only its runtime dependencies. The Durable Object
    // store also imports the Workers runtime module, which only workerd provides, so it stays external.
    onlyImport: [...Object.keys(packageJson.dependencies), "cloudflare:workers"],
  },
  dts: true,
  // `scripts/verify-package.ts` fails when a built store has no export in `package.json`.
  entry: ["src/index.ts", "src/stores/*.ts"],
  fixedExtension: false,
  minify: true,
  outDir: "dist",
  platform: "node",
  plugins: [Macros.rolldown()],
  sourcemap: false,
})
