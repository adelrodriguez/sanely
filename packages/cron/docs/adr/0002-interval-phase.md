# Interval phase

An interval starts at the beginning of the next larger cycle: a minute interval runs at :00 of each hour, and an hour interval runs at 00:00 of each day. `every 2 hours` is `0 */2 * * *`, not "2 hours after now". The language has no words to change the phase, because a phrase must have one meaning without the time when it was written. This matches the `*/N` step in cron.
