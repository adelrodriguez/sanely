import { env } from "cloudflare:workers"
import { describe } from "vitest"
import { testStore } from "#lib/store/__tests__/conformance.ts"
import { durableObjectStore } from "#lib/stores/durable-object/index.ts"

// Runs in workerd: `pnpm run test:durable-object-store`.
describe("durableObjectStore", () => {
  testStore(() => durableObjectStore(env.RATE_LIMITS))
})
