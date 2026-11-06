import { defineConfig } from "tsdown"

export default defineConfig({
  clean: true,
  dts: true,
  entry: ["src/index.ts"],
  fixedExtension: false,
  minify: true,
  outDir: "dist",
  platform: "node",
  sourcemap: false,
  tsconfig: "tsconfig.build.json",
})
