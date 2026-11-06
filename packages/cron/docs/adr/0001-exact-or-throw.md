# Exact or throw

The language contains only cron phrases whose set of run times is exactly one standard 5-field cron expression. A phrase that cron can only approximate is not in the language, and `cron` and `parse` throw for it. For example, `every 7 minutes` is not valid, because `*/7 * * * *` runs at :56 and then at :00 (a gap of 4 minutes).

A cron expression is a product of field sets. An interval of N units is a product set only if N divides the length of the next larger cycle. Thus the minute intervals are the divisors of 60, and the hour intervals are the divisors of 24. Days 29 to 31 of the month are also not in the language, because they do not occur in every month.

## Considered Options

- **Approximate and warn.** Rejected: a warning is easy to miss, and the schedule then does something different from the phrase.
- **A list of crons for intervals such as 90 minutes.** Rejected for now: many schedulers accept only one cron expression. The schedule model can support this later.
