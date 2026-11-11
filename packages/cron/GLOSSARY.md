# Cron

`@sanely/cron` is a TypeScript package with no external dependencies and one model of a schedule, the `Schedule` object. It converts a schedule to an exact standard 5-field cron expression, parses a schedule from a cron phrase or a schedule object, and writes a schedule back as a cron phrase.

## Language

**Schedule**:
The set of times that one standard 5-field cron expression selects exactly, as a `Schedule` object of one kind.
_Avoid_: Plan, timetable, job

**Schedule object**:
A `Schedule` written as an object, in code or as JSON, such as `{ every: "day", at: { hour: 9, minute: 30 } }`.
_Avoid_: Config, options

**Kind**:
The value of `every` in a schedule object: `minute`, `hour`, `day`, or `month`. Each kind has its own keys.
_Avoid_: Type, frequency

**Canonical form**:
The form of a schedule with each list of days in calendar order and without duplicates. Two schedules with the same canonical form run at the same times.
_Avoid_: Normal form

**Cron phrase**:
A string in the cron-phrase language, such as `"every 15 minutes"` or `"every weekday at 17:30"`.
_Avoid_: Human cron, natural-language schedule, sentence

**Cron expression**:
A standard 5-field cron string, such as `"*/15 * * * *"`. The `CronExpression` type marks one that `cron` made.
_Avoid_: Crontab, cron string, pattern

**Sentence shape**:
One of the fixed patterns that a cron phrase must follow, such as the minute-interval shape.
_Avoid_: Template, pattern, form

**Clause**:
One part of a sentence shape that restricts the schedule, such as `at 9:30` or `on weekdays`.
_Avoid_: Segment, part

**Slot**:
A place in a clause that takes a value from a closed set, such as the interval in `every <N> minutes`.
_Avoid_: Placeholder, parameter

**Strict form**:
The cron-phrase grammar that `cron` accepts in a string literal and that `describe` writes: lowercase, single spaces, fixed clause order, and canonical words only.
_Avoid_: Canonical form

**Lenient form**:
The superset of the strict form that `parse` accepts. A lenient cron phrase becomes a strict cron phrase after normalization.
_Avoid_: Loose form, free text

**Normalization**:
The step that changes a lenient cron phrase to a strict cron phrase: lowercase, collapse whitespace, and map each alias to its canonical word.
_Avoid_: Cleanup, sanitization

**Exactness rule**:
The rule that a schedule is valid only when one standard 5-field cron expression runs at exactly its times. Every other schedule is an error.
_Avoid_: Approximation, best effort

**Cron field**:
One of the five positions of a cron expression: minute, hour, day of month, month, day of week.
_Avoid_: Column, part

**Interval**:
The fixed step between runs of a minute or hour schedule, such as 15 minutes. It divides 60 or 24. A schedule without an interval runs every minute or every hour.
_Avoid_: Frequency, period

**Phase**:
The first run of an interval inside its cycle. A minute interval starts at :00 of each hour, and an hour interval starts at 00:00 of each day.
_Avoid_: Offset, start

**Window**:
A time range in each day, on whole hours, that limits a minute schedule. The start is included and the end is not. An end of 24 is midnight at the end of the day.
_Avoid_: Range, period

**Day set**:
The days of the week that a schedule runs on: a day group, or a list of one or more day names. A list is a set: the order and duplicates do not change the schedule.
_Avoid_: Day list, days

**Day name**:
One of the seven days, `monday` to `sunday`. The `Weekday` type is the set of day names.
_Avoid_: Weekday (for one day)

**Day group**:
A word that selects a fixed day set: `weekdays` (Monday to Friday) or `weekends` (Saturday and Sunday). A schedule object and the `on` clause use the plural word, and the `every` clause uses the singular word.
_Avoid_: Day range, business days

**Shortcut**:
A one-word cron phrase: `hourly`, `daily`, `weekly`, or `monthly`. `describe` writes its long form.
_Avoid_: Macro, alias

**Ordinal**:
A day of the month in a cron phrase, from `1st` to `28th`. In a schedule object, the day of the month is a number from 1 to 28.
_Avoid_: Date, day number

**Reason**:
The text that says why an input is not a valid schedule, such as `7 does not divide 60`. For a cron phrase, the type error and the runtime error give the same reason.
_Avoid_: Message, cause

**Path**:
The keys from the root of a schedule object to the value that failed, such as `["at", "hour"]`.
_Avoid_: Pointer, location

**Normalizer**:
The part of the package that does normalization.
_Avoid_: Sanitizer, cleaner

**Dialect**:
A cron format and the set of schedules that it can express, such as standard 5-field cron.
_Avoid_: Flavor, variant

**Package consumer**:
A person or project that installs and uses `@sanely/cron`.
_Avoid_: User, package author
