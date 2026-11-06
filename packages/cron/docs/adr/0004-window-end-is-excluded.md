# The window end is excluded

In `every 15 minutes between 9:00 and 17:00`, the last run is at 16:45, and there is no run at 17:00. The cron is `*/15 9-16 * * *`.

One cron can express the window only if the end is excluded. `*/15 9-17 * * *` runs until 17:45, and a run at 17:00 without a run at 17:15 needs two crons. The window start and end must be on the hour. An end at `midnight` is the end of the day.

## Considered Options

- **An end word such as `from 9:00 until 17:00`.** Rejected: `between` is the word that most people use for working hours, and a second word adds a sentence shape with the same meaning.
- **An included end with two crons.** Rejected by ADR 0001.
