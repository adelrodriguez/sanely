import { cloudflareTest } from "@cloudflare/vitest-plugin"
import { Macros } from "unplugin-macros"
import { defineConfig } from "vitest/config"

const scriptTests = "src/lib/stores/redis/__tests__/script-store.test.ts"
const durableObjectTests = "src/lib/stores/durable-object/**"

// The unit tests need no server. Each store project needs its server at REDIS_URL, and `bun-redis-store`
// also needs Bun: `bun --bun vitest run --project bun-redis-store`. `durable-object-store` runs in
// workerd through @cloudflare/vitest-plugin and needs no server. `vitest bench` runs each project's
// `benchmark.include` files instead of its tests.
export default defineConfig({
  plugins: [Macros.vite()],
  test: {
    coverage: {
      provider: "v8",
    },
    projects: [
      {
        extends: true,
        test: {
          benchmark: { exclude: ["src/lib/stores/redis/**"], include: ["src/**/*.bench.ts"] },
          exclude: ["src/lib/stores/redis/**", durableObjectTests],
          include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
          name: "unit",
        },
      },
      {
        extends: true,
        test: {
          benchmark: { include: ["src/lib/stores/redis/__tests__/redis-store.bench.ts"] },
          include: [scriptTests, "src/lib/stores/redis/__tests__/redis-store.test.ts"],
          name: "redis-store",
        },
      },
      {
        extends: true,
        test: {
          benchmark: { include: ["src/lib/stores/redis/__tests__/valkey-store.bench.ts"] },
          include: [scriptTests, "src/lib/stores/redis/__tests__/valkey-store.test.ts"],
          name: "valkey-store",
        },
      },
      {
        extends: true,
        test: {
          benchmark: { include: ["src/lib/stores/redis/__tests__/bun-redis-store.bench.ts"] },
          include: ["src/lib/stores/redis/__tests__/bun-redis-store.test.ts"],
          name: "bun-redis-store",
        },
      },
      {
        extends: true,
        plugins: [
          cloudflareTest({
            wrangler: { configPath: "./src/lib/stores/durable-object/__tests__/wrangler.jsonc" },
          }),
        ],
        test: {
          include: ["src/lib/stores/durable-object/__tests__/*.test.ts"],
          name: "durable-object-store",
        },
      },
      {
        extends: true,
        plugins: [
          cloudflareTest({ wrangler: { configPath: "./scripts/compat/workerd/wrangler.jsonc" } }),
        ],
        test: {
          include: ["scripts/compat/workerd.mjs"],
          name: "compat-workerd",
        },
      },
    ],
  },
})
