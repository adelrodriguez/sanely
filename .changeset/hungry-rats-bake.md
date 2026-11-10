---
"@sanely/duration": minor
"@sanely/cron": minor
---

Reject the unit `M`, which other notations read as months

Units ignore case, so `ms("1M")` was one minute, and `parse("every 5 M")` in cron ran every 5 minutes. Moment, date-fns, and ISO 8601 use `M` for months. `M` is now an error in every form, with the hint `use "m" for minutes or "mo" for months`. `UnitAnyCase` no longer includes `"M"`.

To migrate, write `m` for minutes or `mo` for months.
