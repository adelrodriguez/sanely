import type { MaybePromise } from "./utils"

export function reportInBackground<TReport>(
  reporter: ((report: TReport) => MaybePromise<void>) | undefined,
  report: TReport
): void {
  if (!reporter) {
    return
  }

  void Promise.resolve()
    .then(() => reporter(report))
    .catch(() => null)
}
