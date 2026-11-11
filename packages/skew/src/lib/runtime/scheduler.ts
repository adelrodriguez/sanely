import { MS_PER_MINUTE, MS_PER_SECOND } from "@sanely/core/time"
import type { RuntimeEnvironment, RuntimeEvent, RuntimeEventType, TimerHandle } from "./environment"

export interface DeploymentSchedule {
  readonly checkInterval: number
  readonly checkOnReconnect: boolean
  readonly checkOnSubscribe: boolean
  readonly checkOnVisible: boolean
}

export const DEFAULT_DEPLOYMENT_SCHEDULE: DeploymentSchedule = {
  checkInterval: 5 * MS_PER_MINUTE,
  checkOnReconnect: true,
  checkOnSubscribe: true,
  checkOnVisible: true,
}

export const MINIMUM_CHECK_INTERVAL = 10 * MS_PER_SECOND

export class DeploymentScheduler {
  readonly #environment: RuntimeEnvironment
  readonly #schedule: DeploymentSchedule
  readonly #check: () => void
  #interval: TimerHandle | undefined
  #started = false

  constructor(environment: RuntimeEnvironment, schedule: DeploymentSchedule, check: () => void) {
    this.#check = check
    this.#environment = environment
    this.#schedule = schedule
  }

  start(): void {
    this.#started = true
    this.#environment.addEventListener("visibilitychange", this.#onVisibilityChange)

    if (this.#schedule.checkOnVisible) {
      this.#environment.addEventListener("pageshow", this.#onPageShow)
    }

    if (this.#schedule.checkOnReconnect) {
      this.#environment.addEventListener("online", this.#onOnline)
    }

    this.#startInterval()
  }

  stop(): void {
    this.#started = false
    this.#clearInterval()
    this.#removeListener("visibilitychange", this.#onVisibilityChange)
    this.#removeListener("pageshow", this.#onPageShow)
    this.#removeListener("online", this.#onOnline)
  }

  readonly #onOnline = (): void => {
    this.#check()
  }

  readonly #onPageShow = (event: RuntimeEvent): void => {
    if (event.persisted === true) {
      this.#check()
    }
  }

  readonly #onVisibilityChange = (): void => {
    this.#clearInterval()

    if (!this.#environment.isVisible()) {
      return
    }

    if (this.#schedule.checkOnVisible) {
      this.#check()
    }

    this.#startInterval()
  }

  #clearInterval(): void {
    if (this.#interval !== undefined) {
      this.#environment.clearInterval(this.#interval)
      this.#interval = undefined
    }
  }

  #removeListener(type: RuntimeEventType, listener: (event: RuntimeEvent) => void): void {
    this.#environment.removeEventListener(type, listener)
  }

  #startInterval(): void {
    if (!this.#started || !this.#environment.isVisible()) {
      return
    }

    this.#interval = this.#environment.setInterval(this.#check, this.#schedule.checkInterval)
  }
}
