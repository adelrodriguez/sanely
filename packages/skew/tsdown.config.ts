import { defineConfig } from "tsdown"

export default defineConfig({
  clean: true,
  define: {
    "process.env.NODE_ENV": "process.env.NODE_ENV",
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
