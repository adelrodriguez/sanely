import type { RuntimeEnvironment, RuntimeEvent, RuntimeEventType, TimerHandle } from "./environment"

export interface DeploymentSchedule {
  readonly checkInterval: number
  readonly checkOnReconnect: boolean
  readonly checkOnSubscribe: boolean
  readonly checkOnVisible: boolean
}

export const DEFAULT_DEPLOYMENT_SCHEDULE: DeploymentSchedule = {
  checkInterval: 5 * 60_000,
  checkOnReconnect: true,
  checkOnSubscribe: true,
  checkOnVisible: true,
}

export const MINIMUM_CHECK_INTERVAL = 10_000

export class DeploymentScheduler {
  readonly #environment: RuntimeEnvironment
  readonly #check: () => void
  #interval: TimerHandle | undefined
  #schedule: DeploymentSchedule | undefined

  constructor(environment: RuntimeEnvironment, check: () => void) {
    this.#check = check
    this.#environment = environment
  }

  stop(): void {
    this.#clearInterval()
    this.#removeListener("visibilitychange", this.#onVisibilityChange)
    this.#removeListener("pageshow", this.#onPageShow)
    this.#removeListener("online", this.#onOnline)
    this.#schedule = undefined
  }

  update(schedule: DeploymentSchedule): void {
    if (this.#schedule !== undefined && schedulesMatch(this.#schedule, schedule)) {
      return
    }

    this.stop()
    this.#schedule = schedule
    this.#environment.addEventListener("visibilitychange", this.#onVisibilityChange)

    if (schedule.checkOnVisible) {
      this.#environment.addEventListener("pageshow", this.#onPageShow)
    }

    if (schedule.checkOnReconnect) {
      this.#environment.addEventListener("online", this.#onOnline)
    }

    this.#startInterval()
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

    if (this.#schedule?.checkOnVisible === true) {
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
    if (this.#schedule === undefined || !this.#environment.isVisible()) {
      return
    }

    this.#interval = this.#environment.setInterval(this.#check, this.#schedule.checkInterval)
  }
}

function schedulesMatch(left: DeploymentSchedule, right: DeploymentSchedule): boolean {
  return (
    left.checkInterval === right.checkInterval
    && left.checkOnReconnect === right.checkOnReconnect
    && left.checkOnSubscribe === right.checkOnSubscribe
    && left.checkOnVisible === right.checkOnVisible
  )
}
