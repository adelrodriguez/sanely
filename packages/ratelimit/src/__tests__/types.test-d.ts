import type { RedisClient } from "bun"
import type { Redis } from "ioredis"
import type { Valkey } from "iovalkey"
import type { RedisClientType } from "redis"
import { describe, expectTypeOf, it } from "vitest"
import type {
  FixedWindow,
  InvalidOptionError,
  Limiter,
  LimitResult,
  LimitResults,
  Mode,
  Store,
  StoreError,
} from "#index.ts"
import { buildLimiter, fixedWindow, rateLimit, tokenBucket } from "#index.ts"
import { bunRedisStore } from "#stores/bun-redis.ts"
import { memoryStore } from "#stores/memory.ts"
import { redisStore } from "#stores/redis.ts"
import { valkeyStore } from "#stores/valkey.ts"

type Request = { readonly ip: string }

const limiter = buildLimiter({ store: memoryStore() })
const algorithm = fixedWindow({ limit: 10, window: 60_000 })
const perIp = limiter({ algorithm, identify: (request: Request) => request.ip, name: "ip" })
const global = limiter({ algorithm, identify: () => null, name: "global" })
const direct = limiter({ algorithm, name: "direct" })
const request: Request = { ip: "203.0.113.7" }

declare const fixedOnly: Store<FixedWindow>
declare const ioredis: Redis
declare const nodeRedis: RedisClientType
declare const iovalkey: Valkey
declare const bun: RedisClient

describe("limiter", () => {
  it("takes its input type from identify", () => {
    expectTypeOf(perIp).toEqualTypeOf<Limiter<Request>>()
    void rateLimit(perIp, request)
    // @ts-expect-error -- perIp identifies a Request.
    void rateLimit(perIp, "203.0.113.7")
  })

  it("takes the identity itself without identify", () => {
    expectTypeOf(direct).toEqualTypeOf<Limiter>()
    void rateLimit(direct, "key")
    void rateLimit(direct, ["203.0.113.7", "ada"])
    // @ts-expect-error -- an identity has at least one part.
    void rateLimit(direct, [])
    // @ts-expect-error -- an identity is made of strings.
    void rateLimit(direct, 1)
  })

  it("accepts any input when identify ignores it", () => {
    expectTypeOf(global).toEqualTypeOf<Limiter<unknown>>()
    void rateLimit([perIp, global], request)
  })

  it("accepts null as the global identity", () => {
    const daily = limiter({ algorithm, identify: () => null, name: "daily" })

    expectTypeOf(daily).toEqualTypeOf<Limiter<unknown>>()
    void rateLimit(direct, null)
  })

  it("requires identify to return an identity", () => {
    // @ts-expect-error -- identify returns a string or a tuple of strings.
    limiter({ algorithm, identify: (request: Request) => request.ip.length, name: "length" })
  })

  it("accepts only algorithms the store supports", () => {
    const fixedLimiter = buildLimiter({ store: fixedOnly })

    fixedLimiter({ algorithm, name: "fixed" })
    fixedLimiter({
      // @ts-expect-error -- the store does not support token buckets.
      algorithm: tokenBucket({ capacity: 5, interval: 1000, refillRate: 1 }),
      name: "bucket",
    })
  })

  it("rejects a store for fewer algorithms where all are needed", () => {
    // @ts-expect-error -- a store for fixed windows cannot stand in for every algorithm.
    const everything: Store = fixedOnly
    void everything
  })
})

describe("rateLimit", () => {
  it("returns one result for one limiter, and every result for several", () => {
    expectTypeOf(rateLimit(perIp, request)).resolves.toEqualTypeOf<LimitResult>()
    expectTypeOf(rateLimit([perIp, global], request)).resolves.toEqualTypeOf<LimitResults>()
  })

  it("needs at least one limiter", () => {
    // @ts-expect-error -- an empty list has no limiter to run.
    void rateLimit([], request)
  })
})

describe("LimitResult", () => {
  it("has counts only when the store or the cache decided", async () => {
    const result = await rateLimit(perIp, request)

    // @ts-expect-error -- a store error has no counts.
    void result.remaining

    if (result.reason === "storeError") {
      expectTypeOf(result.success).toEqualTypeOf<false>()
      expectTypeOf(result.error).toEqualTypeOf<StoreError>()
    } else {
      expectTypeOf(result.remaining).toEqualTypeOf<number>()
      expectTypeOf(result.reset).toEqualTypeOf<number>()
    }
  })

  it("is never a success when the store failed", async () => {
    const result = await rateLimit(perIp, request)

    if (result.success) expectTypeOf(result.reason).toEqualTypeOf<"store" | "dryRun">()
  })

  it("carries the mode only on an allowed result", async () => {
    const result = await rateLimit(perIp, request)

    // @ts-expect-error -- a denial is always enforced, and a store error has no mode.
    void result.mode

    if (result.success) expectTypeOf(result.mode).toEqualTypeOf<Mode>()
  })
})

describe("client stores", () => {
  it("take each client as it is", () => {
    expectTypeOf(redisStore(ioredis)).toEqualTypeOf<Store>()
    expectTypeOf(redisStore(nodeRedis)).toEqualTypeOf<Store>()
    expectTypeOf(valkeyStore(iovalkey)).toEqualTypeOf<Store>()
    expectTypeOf(bunRedisStore(bun)).toEqualTypeOf<Store>()
  })

  it("reject a client they cannot send commands through", () => {
    // @ts-expect-error -- node-redis names it `evalSha`, and the Valkey store calls `evalsha`.
    void valkeyStore(nodeRedis)
    // @ts-expect-error -- node-redis has no `send`, which the Bun store calls.
    void bunRedisStore(nodeRedis)
  })
})

describe("errors", () => {
  it("carry typed fields", () => {
    expectTypeOf<InvalidOptionError["option"]>().toEqualTypeOf<string>()
    expectTypeOf<InvalidOptionError["value"]>().toEqualTypeOf<unknown>()
  })
})
