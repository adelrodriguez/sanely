import type { Store, StoreResult } from "#lib/store/index.ts"
import type { ObjectRequest } from "./object.ts"

/**
 * The part of a Durable Object namespace binding for `RateLimitObject` that the store uses.
 */
export type RateLimitNamespace = {
  getByName(name: string): {
    consume(request: ObjectRequest): Promise<StoreResult>
    clear(): Promise<void>
  }
}

/**
 * Counts in Cloudflare Durable Objects, one object for each key. Each check runs in the object that
 * holds its key, so it is atomic across every Worker that shares the namespace. Pass the binding of
 * a `RateLimitObject` class.
 */
export function durableObjectStore(namespace: RateLimitNamespace): Store {
  return {
    clear: (key) => namespace.getByName(key).clear(),
    consume: ({ algorithm, cost, key }) => namespace.getByName(key).consume({ algorithm, cost }),
  }
}
