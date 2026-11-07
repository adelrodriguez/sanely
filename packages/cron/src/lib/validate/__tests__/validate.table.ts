import type { Schedule, Time } from "#lib/schedule/schedule.ts"

const AT: Time = { hour: 9, minute: 0 }

// Valid schedule objects, and the schedule that `parse` returns for each.
export const VALID_OBJECTS: ReadonlyArray<[unknown, Schedule]> = [
  [{ every: "minute" }, { every: "minute" }],
  [
    { between: { from: 9, to: 17 }, every: "minute", interval: 15, on: "weekdays" },
    { between: { from: 9, to: 17 }, every: "minute", interval: 15, on: "weekdays" },
  ],
  [{ every: "hour", interval: undefined }, { every: "hour" }],
  [
    { at: AT, every: "day", on: ["friday", "monday", "friday"] },
    { at: AT, every: "day", on: ["friday", "monday", "friday"] },
  ],
  [
    { at: { hour: 23, minute: 59 }, day: 28, every: "month" },
    { at: { hour: 23, minute: 59 }, day: 28, every: "month" },
  ],
]

// Invalid schedule objects, with the reason and the path of the key that failed.
export const INVALID_OBJECTS: ReadonlyArray<[unknown, string, ReadonlyArray<string | number>]> = [
  [{}, `the key "every" is required. Use "day", "hour", "minute", or "month"`, ["every"]],
  [{ every: "week" }, `"week" is not a kind of schedule`, ["every"]],
  [{ every: 1 }, `1 is not a kind of schedule`, ["every"]],
  [{ every: "constructor" }, `"constructor" is not a kind of schedule`, ["every"]],
  [{ every: "hour", label: "report" }, `"label" is not a key of an hour schedule`, ["label"]],
  [
    { between: { from: 9, to: 17 }, every: "hour" },
    `"between" is not a key of an hour schedule. Use "every", "interval", "on"`,
    ["between"],
  ],
  [
    { at: AT, day: 1, every: "month", on: "weekdays" },
    `"on" is not a key of a month schedule`,
    ["on"],
  ],
  [
    { every: "minute", interval: 7 },
    "7 does not divide 60. Use 2, 3, 4, 5, 6, 10, 12, 15, 20, or 30",
    ["interval"],
  ],
  [{ every: "minute", interval: 90 }, "90 minutes has no exact single cron", ["interval"]],
  [
    { every: "minute", interval: 1 },
    `leave out "interval" for an interval of 1 minute`,
    ["interval"],
  ],
  [
    { every: "minute", interval: 60 },
    `use "every": "hour" for an interval of 60 minutes`,
    ["interval"],
  ],
  [
    { every: "minute", interval: 1.5 },
    "1.5 is not a valid interval. Use a whole number",
    ["interval"],
  ],
  [{ every: "minute", interval: "15" }, `"15" is not a valid interval`, ["interval"]],
  [{ every: "hour", interval: 5 }, "5 does not divide 24. Use 2, 3, 4, 6, 8, or 12", ["interval"]],
  [
    { every: "hour", interval: 24 },
    `use "every": "day" at midnight for an interval of 24 hours`,
    ["interval"],
  ],
  [
    { between: { from: 17, to: 9 }, every: "minute" },
    "the window must end after it starts",
    ["between"],
  ],
  [
    { between: { from: 9, to: 9 }, every: "minute" },
    "the window must end after it starts",
    ["between"],
  ],
  [
    { between: { from: 9, to: 25 }, every: "minute" },
    "25 is not a window end. Use 1 to 24",
    ["between", "to"],
  ],
  [
    { between: { from: 24, to: 24 }, every: "minute" },
    "24 is not an hour. Use 0 to 23",
    ["between", "from"],
  ],
  [{ between: { from: 9 }, every: "minute" }, `the key "to" is required`, ["between", "to"]],
  [
    { between: { days: 1, from: 9, to: 17 }, every: "minute" },
    `"days" is not a key of a window. Use "from", "to"`,
    ["between", "days"],
  ],
  [
    { every: "minute", on: "weekday" },
    `"weekday" is not a day set. Use "weekdays", "weekends", or a list of day names`,
    ["on"],
  ],
  [{ every: "minute", on: [] }, "the list of days is empty", ["on"]],
  [
    { every: "minute", on: ["monday", "frday"] },
    `"frday" is not a day. Use monday to sunday`,
    ["on", 1],
  ],
  [{ every: "day" }, `the key "at" is required`, ["at"]],
  [{ at: { hour: 24, minute: 0 }, every: "day" }, "24 is not an hour. Use 0 to 23", ["at", "hour"]],
  [
    { at: { hour: 9, minute: 60 }, every: "day" },
    "60 is not a minute. Use 0 to 59",
    ["at", "minute"],
  ],
  [
    { at: "9:30", every: "day" },
    `"9:30" is not a time. Use an object with "hour", "minute"`,
    ["at"],
  ],
  [
    { at: AT, day: 29, every: "month" },
    "day 29 does not occur in every month. Use 1 to 28",
    ["day"],
  ],
  [{ at: AT, day: 0, every: "month" }, "0 is not a day of the month. Use 1 to 28", ["day"]],
]
