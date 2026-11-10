---
"@sanely/cron": patch
---

Give the same reason at the type level as at runtime for a phrase that ends before a clause is complete

`cron("every 15 minutes on")` now fails with `expected a day set after "every 15 minutes on"`, the same reason that `parse` gives. The type-level reasons now match the runtime for an empty day set, a day list that ends in "and", a day set that starts at "at", a window that ends after "and", and "on the" without a day of the month. Before, some of these named the wrong word, such as `expected "and"` when "and" was already in the phrase.
