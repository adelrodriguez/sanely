# Core

Shared time vocabulary for the Sanely libraries.

## Language

**Unit**:
One of the supported time measures, from milliseconds to years. A year is 365.25 days, and a month is one twelfth of that year.
_Avoid_: Calendar period

**Unit name**:
The canonical long plural name of a unit, such as `"seconds"`.
_Avoid_: Unit key, unit id

**Unit alias**:
A lowercase spelling of a unit, such as `"minute"`, `"mins"`, or `"m"`. An alias identifies exactly one unit; `"m"` means minutes and `"mo"` means months.
_Avoid_: Shorthand
