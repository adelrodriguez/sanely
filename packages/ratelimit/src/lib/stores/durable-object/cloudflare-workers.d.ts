// The part of the Workers runtime module that the Durable Object store uses. The published
// declarations import `cloudflare:workers`, and a consumer resolves it with their own Workers types.
declare module "cloudflare:workers" {
  type Storage = {
    readonly kv: {
      get(key: string): unknown
      put(key: string, value: unknown): void
    }
    getAlarm(): Promise<number | null>
    setAlarm(scheduledTime: number): Promise<void>
    deleteAlarm(): Promise<void>
    deleteAll(): Promise<void>
  }

  type DurableObjectState = {
    readonly storage: Storage
    blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>
  }

  export abstract class DurableObject<Env = unknown> {
    protected readonly ctx: DurableObjectState
    protected readonly env: Env
    constructor(ctx: DurableObjectState, env: Env)
  }
}
