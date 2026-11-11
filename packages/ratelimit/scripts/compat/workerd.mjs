// Runs the compatibility checks in workerd, and checks the Durable Object store, which only workerd
// can load. Vitest runs this file in the Worker of `workerd/wrangler.jsonc`.
//
// Usage: pnpm run test:compat:workerd (after a build)

import * as durableObject from "@sanely/ratelimit/stores/durable-object"
import { env } from "cloudflare:workers"
import { expect, it } from "vitest"
import * as library from "../../dist/index.js"
import * as bunRedis from "../../dist/stores/bun-redis.js"
import * as memory from "../../dist/stores/memory.js"
import * as redis from "../../dist/stores/redis.js"
import * as valkey from "../../dist/stores/valkey.js"
import { smoke } from "./smoke.mjs"

it("passes the compatibility checks", async () => {
  await smoke({ bunRedis, library, memory, redis, valkey })
})

it("counts in a Durable Object", async () => {
  const algorithm = library.fixedWindow({ limit: 1, window: 60_000 })
  const store = durableObject.durableObjectStore(env.RATE_LIMITS)
  const limiter = library.buildLimiter({ store })({ algorithm, name: "key" })

  expect(await library.rateLimit(limiter, "a")).toMatchObject({ success: true })
  expect(await library.rateLimit(limiter, "a")).toMatchObject({ success: false })
})
