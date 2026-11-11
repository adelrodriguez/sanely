import { DurableObject } from "cloudflare:workers"
import type { Algorithm } from "#lib/algorithms/index.ts"
import type { StoreResult } from "#lib/store/index.ts"
import { transition } from "#lib/transitions/index.ts"
import { parseState } from "#lib/transitions/state-store.ts"

// Each object holds the state of one key, under this storage key.
const STATE = "state"

/**
 * A check that the store sends to the object for one key.
 */
export type ObjectRequest = {
  readonly algorithm: Algorithm
  /**
   * A whole number from 0 to the algorithm's capacity. A cost of 0 reads without writing.
   */
  readonly cost: number
}

/**
 * The Durable Object that holds the counts of one key. Export it from your Worker's main module and
 * bind it with SQLite storage. `durableObjectStore` sends each check to the object named after its
 * key.
 */
export class RateLimitObject extends DurableObject {
  // When the alarm that deletes expired state runs, in epoch ms, or `null` when none is set. The
  // object reads it once at start, so a check never waits on storage.
  #alarm: number | null = null

  constructor(...args: ConstructorParameters<typeof DurableObject>) {
    super(...args)
    void this.ctx.blockConcurrencyWhile(async () => {
      this.#alarm = await this.ctx.storage.getAlarm()
    })
  }

  // Nothing in this method awaits, so the object runs no other event between the read and the write,
  // and each check is atomic. The object's clock is the store's clock.
  consume({ algorithm, cost }: ObjectRequest): StoreResult {
    const now = Date.now()
    const { result, state } = transition(
      algorithm,
      parseState(this.ctx.storage.kv.get(STATE), now),
      cost,
      now
    )

    if (state !== undefined) {
      this.ctx.storage.kv.put(STATE, state)
      this.#schedule(state.expiresAt)
    }

    return result
  }

  async clear(): Promise<void> {
    this.#alarm = null
    await Promise.all([this.ctx.storage.deleteAll(), this.ctx.storage.deleteAlarm()])
  }

  // A check ignores expired state, so the alarm only frees storage. A state that a later check renewed
  // stays, and the alarm moves to its new expiry.
  async alarm(): Promise<void> {
    this.#alarm = null
    const state = parseState(this.ctx.storage.kv.get(STATE), Date.now())

    if (state === undefined) {
      await this.ctx.storage.deleteAll()
      return
    }

    this.#schedule(state.expiresAt)
  }

  // Sets the alarm only when none is set, so most checks write the state alone. An alarm that runs
  // before the latest expiry sets itself again.
  #schedule(expiresAt: number) {
    if (this.#alarm !== null) return

    this.#alarm = expiresAt
    void this.ctx.storage.setAlarm(expiresAt)
  }
}
