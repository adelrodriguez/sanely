import { defineConfig } from "tsdown"
import packageJson from "./package.json" with { type: "json" }

export default defineConfig({
  clean: true,
  deps: {
    neverBundle: true,
    // Deliberately tracks package.json: adding a dependency widens this
    // import guard without a change to the build config.
    onlyImport: Object.keys(packageJson.dependencies),
  },
  dts: true,
  entry: [
    "src/index.ts",
    "src/wire.ts",
    "src/wire/fetch.ts",
    "src/wire/message-port.ts",
    "src/wire/web-socket.ts",
  ],
  fixedExtension: false,
  outDir: "dist",
  platform: "node",
  sourcemap: true,
})
