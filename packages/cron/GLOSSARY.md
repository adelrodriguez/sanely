# Plaincron

Plaincron is a zero-dependency TypeScript package that converts cron phrases, a small English-like language, to exact standard 5-field cron expressions.

## Language

**Cron phrase**:
A string in the Plaincron language, such as `"every 15 minutes"` or `"every weekday at 17:30"`.
_Avoid_: Human cron, natural-language schedule, sentence

**Cron expression**:
A standard 5-field cron string, such as `"*/15 * * * *"`.
_Avoid_: Crontab, cron string

**Sentence shape**:
One of the fixed patterns that a cron phrase must follow, such as the minute-interval shape.
_Avoid_: Template, pattern, form

**Clause**:
One part of a sentence shape that restricts some cron fields, such as `at 9:30` or `on weekdays`.
_Avoid_: Segment, part

**Slot**:
A place in a clause that takes a value from a closed set, such as the interval in `every <N> minutes`.
_Avoid_: Placeholder, parameter

**Strict form**:
The cron-phrase grammar that the `CronPhrase` type accepts: lowercase, single spaces, fixed clause order, and canonical words only.
_Avoid_: Canonical form

**Lenient form**:
The superset that the runtime accepts. A lenient cron phrase becomes a strict cron phrase after normalization.
_Avoid_: Loose form, free text

**Normalization**:
The step that changes a lenient cron phrase to a strict cron phrase: lowercase, collapse whitespace, and map each alias to its canonical word.
_Avoid_: Cleanup, sanitization

**Schedule**:
The set of times that a cron phrase selects, stored as one set of values for each cron field.
_Avoid_: Plan, timetable

**Cron field**:
One of the five positions of a cron expression: minute, hour, day of month, month, day of week.
_Avoid_: Column, part

**Interval**:
The fixed step between runs in an interval clause, such as 15 minutes.
_Avoid_: Frequency, period

**Phase**:
The first run of an interval inside its cycle. Plaincron intervals start at the beginning of the next larger cycle.
_Avoid_: Offset, start

**Window**:
A clause that limits an interval to a time range in each day.
_Avoid_: Range, period

**Day set**:
The days of the week that a clause selects, such as `monday and friday` or `weekdays`.
_Avoid_: Day list, days

**Day name**:
One of the seven days, `monday` to `sunday`. The `Weekday` type is the set of day names.
_Avoid_: Weekday (for one day)

**Day group**:
A word that selects a fixed day set: `weekday` (Monday to Friday) or `weekend` (Saturday and Sunday).
_Avoid_: Day range, business days

**Shortcut**:
A one-word cron phrase: `hourly`, `daily`, `weekly`, or `monthly`.
_Avoid_: Macro, alias

**Ordinal**:
A day of the month in a cron phrase, from `1st` to `28th`.
_Avoid_: Date, day number

**Normalizer**:
The part of Plaincron that does normalization.
_Avoid_: Sanitizer, cleaner

**Dialect**:
A cron format and the set of schedules that it can express, such as standard 5-field cron.
_Avoid_: Flavor, variant

**Package consumer**:
A person or project that installs and uses Plaincron.
_Avoid_: User, package author
