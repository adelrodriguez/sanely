// The bindings in `wrangler.jsonc`, and the parts of `cloudflare:test` that the tests use.
declare module "cloudflare:workers" {
  import type { RateLimitNamespace } from "#lib/stores/durable-object/index.ts"

  export const env: { readonly RATE_LIMITS: RateLimitNamespace }
}

declare module "cloudflare:test" {
  import type { RateLimitNamespace } from "#lib/stores/durable-object/index.ts"

  type Stub = ReturnType<RateLimitNamespace["getByName"]>
  type Storage = {
    readonly kv: { get(key: string): unknown }
    getAlarm(): Promise<number | null>
  }

  export function runInDurableObject<Result>(
    stub: Stub,
    callback: (instance: unknown, state: { readonly storage: Storage }) => Result | Promise<Result>
  ): Promise<Result>
  export function runDurableObjectAlarm(stub: Stub): Promise<boolean>
  export function evictDurableObject(stub: Stub): Promise<void>
}
