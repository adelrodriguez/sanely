/**
 * One row of the grammar table.
 *
 * - `strict`: the `CronPhrase` type, the validator, and `isCronPhrase` accept the phrase.
 * - `lenient`: `parse` accepts the phrase.
 * - `cron`: the expected cron expression, for a phrase that `parse` accepts.
 * - `error`: a part of the reason, for a phrase that `parse` rejects.
 * - `strictError`: a part of the reason in the strict form (the type-level message), when it is
 *   different from `error`. When it is not given, the type-level message contains `error`.
 */
export type GrammarRow =
  | {
      readonly phrase: string
      readonly strict: true
      readonly lenient: true
      readonly cron: string
    }
  | {
      readonly phrase: string
      readonly strict: false
      readonly lenient: true
      readonly cron: string
      readonly strictError?: string
    }
  | {
      readonly phrase: string
      readonly strict: false
      readonly lenient: false
      readonly error: string
      readonly strictError?: string
    }

/**
 * The grammar table: the source of truth for the grammar tests, the type-level tests, and the
 * `parse`, `cron`, and guard tests.
 */
export const GRAMMAR = [
  // ---- Minute interval ----
  { cron: "* * * * *", lenient: true, phrase: "every minute", strict: true },
  { cron: "*/2 * * * *", lenient: true, phrase: "every 2 minutes", strict: true },
  { cron: "*/3 * * * *", lenient: true, phrase: "every 3 minutes", strict: true },
  { cron: "*/4 * * * *", lenient: true, phrase: "every 4 minutes", strict: true },
  { cron: "*/5 * * * *", lenient: true, phrase: "every 5 minutes", strict: true },
  { cron: "*/6 * * * *", lenient: true, phrase: "every 6 minutes", strict: true },
  { cron: "*/10 * * * *", lenient: true, phrase: "every 10 minutes", strict: true },
  { cron: "*/12 * * * *", lenient: true, phrase: "every 12 minutes", strict: true },
  { cron: "*/15 * * * *", lenient: true, phrase: "every 15 minutes", strict: true },
  { cron: "*/20 * * * *", lenient: true, phrase: "every 20 minutes", strict: true },
  { cron: "*/30 * * * *", lenient: true, phrase: "every 30 minutes", strict: true },
  {
    error: "7 does not divide 60. Use 2, 3, 4, 5, 6, 10, 12, 15, 20, or 30",
    lenient: false,
    phrase: "every 7 minutes",
    strict: false,
  },
  { error: "45 does not divide 60", lenient: false, phrase: "every 45 minutes", strict: false },
  {
    error: "90 minutes has no exact single cron",
    lenient: false,
    phrase: "every 90 minutes",
    strict: false,
  },
  {
    error: `use "every minute" for an interval of 1 minute`,
    lenient: false,
    phrase: "every 1 minutes",
    strict: false,
  },
  {
    error: `use "every hour" for an interval of 60 minutes`,
    lenient: false,
    phrase: "every 60 minutes",
    strict: false,
  },
  {
    error: `"0" is not a valid interval`,
    lenient: false,
    phrase: "every 0 minutes",
    strict: false,
  },
  {
    error: `"05" is not a valid interval`,
    lenient: false,
    phrase: "every 05 minutes",
    strict: false,
  },
  {
    error: `"1.5" is not a valid interval`,
    lenient: false,
    phrase: "every 1.5 minutes",
    strict: false,
  },
  {
    error: `"-5" is not a valid interval`,
    lenient: false,
    phrase: "every -5 minutes",
    strict: false,
  },
  {
    cron: "*/5 * * * *",
    lenient: true,
    phrase: "every 5 minute",
    strict: false,
    strictError: `use "minutes" after a number`,
  },
  {
    error: `expected "minutes" or "hours" after "every 15"`,
    lenient: false,
    phrase: "every 15",
    strict: false,
  },
  {
    error: `"days" is not an interval unit`,
    lenient: false,
    phrase: "every 2 days",
    strict: false,
  },
  {
    error: `"weeks" is not an interval unit`,
    lenient: false,
    phrase: "every 2 weeks",
    strict: false,
  },

  // ---- Window ----
  {
    cron: "*/15 9-16 * * *",
    lenient: true,
    phrase: "every 15 minutes between 9:00 and 17:00",
    strict: true,
  },
  {
    cron: "*/15 9-16 * * 1-5",
    lenient: true,
    phrase: "every 15 minutes between 9:00 and 17:00 on weekdays",
    strict: true,
  },
  { cron: "* 9 * * *", lenient: true, phrase: "every minute between 9:00 and 10:00", strict: true },
  {
    cron: "*/30 9,10 * * *",
    lenient: true,
    phrase: "every 30 minutes between 09:00 and 11:00",
    strict: true,
  },
  {
    cron: "*/10 18-23 * * *",
    lenient: true,
    phrase: "every 10 minutes between 6:00pm and midnight",
    strict: true,
  },
  {
    cron: "*/5 0-5 * * *",
    lenient: true,
    phrase: "every 5 minutes between midnight and 6:00am",
    strict: true,
  },
  {
    cron: "*/20 12-16 * * 0,6",
    lenient: true,
    phrase: "every 20 minutes between noon and 17:00 on weekends",
    strict: true,
  },
  {
    error: `"9:30" is not on the hour`,
    lenient: false,
    phrase: "every 15 minutes between 9:30 and 17:00",
    strict: false,
  },
  {
    error: `"17:15" is not on the hour`,
    lenient: false,
    phrase: "every 15 minutes between 9:00 and 17:15",
    strict: false,
  },
  {
    error: "the window must end after it starts",
    lenient: false,
    phrase: "every 15 minutes between 17:00 and 9:00",
    strict: false,
  },
  {
    error: "the window must end after it starts",
    lenient: false,
    phrase: "every 15 minutes between 9:00 and 9:00",
    strict: false,
  },
  {
    error: `the window clause must come before the "on" clause`,
    lenient: false,
    phrase: "every 15 minutes on weekdays between 9:00 and 17:00",
    strict: false,
  },
  {
    error: `expected "and" after "every 15 minutes between 9:00"`,
    lenient: false,
    phrase: "every 15 minutes between 9:00 to 17:00",
    strict: false,
  },

  // ---- Minute interval with a day set ----
  { cron: "*/15 * * * 1-5", lenient: true, phrase: "every 15 minutes on weekdays", strict: true },
  { cron: "*/15 * * * 0,6", lenient: true, phrase: "every 15 minutes on weekends", strict: true },
  { cron: "* * * * 1", lenient: true, phrase: "every minute on monday", strict: true },
  {
    cron: "*/5 * * * 1,3,5",
    lenient: true,
    phrase: "every 5 minutes on monday, wednesday and friday",
    strict: true,
  },
  {
    error: `a minute interval cannot have an "at" clause`,
    lenient: false,
    phrase: "every 15 minutes at 9:30",
    strict: false,
  },
  {
    error: `a minute interval cannot have an "at" clause`,
    lenient: false,
    phrase: "every 15 minutes on weekdays at 9:30",
    strict: false,
  },
  {
    cron: "*/15 * * * 1-5",
    lenient: true,
    phrase: "every 15 minutes on weekday",
    strict: false,
    strictError: `use "weekdays" after "on"`,
  },

  // ---- Hour interval ----
  { cron: "0 * * * *", lenient: true, phrase: "every hour", strict: true },
  { cron: "0 */2 * * *", lenient: true, phrase: "every 2 hours", strict: true },
  { cron: "0 */3 * * *", lenient: true, phrase: "every 3 hours", strict: true },
  { cron: "0 */4 * * *", lenient: true, phrase: "every 4 hours", strict: true },
  { cron: "0 */6 * * *", lenient: true, phrase: "every 6 hours", strict: true },
  { cron: "0 */8 * * *", lenient: true, phrase: "every 8 hours", strict: true },
  { cron: "0 */12 * * *", lenient: true, phrase: "every 12 hours", strict: true },
  { cron: "0 */6 * * 1-5", lenient: true, phrase: "every 6 hours on weekdays", strict: true },
  { cron: "0 * * * 0", lenient: true, phrase: "every hour on sunday", strict: true },
  {
    error: "5 does not divide 24. Use 2, 3, 4, 6, 8, or 12",
    lenient: false,
    phrase: "every 5 hours",
    strict: false,
  },
  {
    error: "36 hours has no exact single cron",
    lenient: false,
    phrase: "every 36 hours",
    strict: false,
  },
  {
    error: `use "every day at midnight" for an interval of 24 hours`,
    lenient: false,
    phrase: "every 24 hours",
    strict: false,
  },
  {
    error: `use "every hour" for an interval of 1 hour`,
    lenient: false,
    phrase: "every 1 hours",
    strict: false,
  },
  {
    error: "an hour interval cannot have a window",
    lenient: false,
    phrase: "every 2 hours between 9:00 and 17:00",
    strict: false,
  },
  {
    error: `an hour interval cannot have an "at" clause`,
    lenient: false,
    phrase: "every 2 hours at 9:30",
    strict: false,
  },

  // ---- Shortcuts ----
  { cron: "0 * * * *", lenient: true, phrase: "hourly", strict: true },
  { cron: "0 0 * * *", lenient: true, phrase: "daily", strict: true },
  { cron: "0 0 * * 0", lenient: true, phrase: "weekly", strict: true },
  { cron: "0 0 1 * *", lenient: true, phrase: "monthly", strict: true },
  {
    error: `unexpected text "at 9:00" after "daily"`,
    lenient: false,
    phrase: "daily at 9:00",
    strict: false,
  },

  // ---- Daily ----
  { cron: "30 9 * * *", lenient: true, phrase: "every day at 9:30", strict: true },
  { cron: "30 9 * * *", lenient: true, phrase: "every day at 09:30", strict: true },
  { cron: "0 0 * * *", lenient: true, phrase: "every day at 0:00", strict: true },
  { cron: "59 23 * * *", lenient: true, phrase: "every day at 23:59", strict: true },
  { cron: "30 9 * * *", lenient: true, phrase: "every day at 9:30am", strict: true },
  { cron: "30 21 * * *", lenient: true, phrase: "every day at 9:30pm", strict: true },
  { cron: "30 0 * * *", lenient: true, phrase: "every day at 12:30am", strict: true },
  { cron: "30 12 * * *", lenient: true, phrase: "every day at 12:30pm", strict: true },
  { cron: "0 12 * * *", lenient: true, phrase: "every day at noon", strict: true },
  { cron: "0 0 * * *", lenient: true, phrase: "every day at midnight", strict: true },
  {
    error: `"9" is not a valid time. Write the minutes, such as "9:00"`,
    lenient: false,
    phrase: "every day at 9",
    strict: false,
  },
  {
    error: `"9am" is not a valid time. Write the minutes, such as "9:00am"`,
    lenient: false,
    phrase: "every day at 9am",
    strict: false,
  },
  {
    error: `"24:00" is not a valid time`,
    lenient: false,
    phrase: "every day at 24:00",
    strict: false,
  },
  {
    error: `"9:60" is not a valid time`,
    lenient: false,
    phrase: "every day at 9:60",
    strict: false,
  },
  { error: `"9:5" is not a valid time`, lenient: false, phrase: "every day at 9:5", strict: false },
  {
    error: `"13:00pm" is not a valid time`,
    lenient: false,
    phrase: "every day at 13:00pm",
    strict: false,
  },
  {
    error: `"09:30am" is not a valid time`,
    lenient: false,
    phrase: "every day at 09:30am",
    strict: false,
  },
  {
    error: `"0:30am" is not a valid time`,
    lenient: false,
    phrase: "every day at 0:30am",
    strict: false,
  },
  {
    error: `"12:00am" is ambiguous. Use midnight`,
    lenient: false,
    phrase: "every day at 12:00am",
    strict: false,
  },
  {
    error: `"12:00pm" is ambiguous. Use noon`,
    lenient: false,
    phrase: "every day at 12:00pm",
    strict: false,
  },
  {
    error: `"morning" is not a valid time`,
    lenient: false,
    phrase: "every day at morning",
    strict: false,
  },
  {
    error: `expected "at <time>" after "every day"`,
    lenient: false,
    phrase: "every day",
    strict: false,
  },
  {
    error: `expected a time after "every day at"`,
    lenient: false,
    phrase: "every day at",
    strict: false,
  },
  {
    error: `unexpected text "on weekdays" after "every day at 9:30"`,
    lenient: false,
    phrase: "every day at 9:30 on weekdays",
    strict: false,
  },

  // ---- Days of the week ----
  { cron: "30 17 * * 1-5", lenient: true, phrase: "every weekday at 17:30", strict: true },
  { cron: "0 10 * * 0,6", lenient: true, phrase: "every weekend at 10:00", strict: true },
  { cron: "30 9 * * 1", lenient: true, phrase: "every monday at 9:30", strict: true },
  { cron: "0 12 * * 1,5", lenient: true, phrase: "every monday and friday at 12:00", strict: true },
  {
    cron: "0 8 * * 1,3,5",
    lenient: true,
    phrase: "every monday, wednesday and friday at 8:00",
    strict: true,
  },
  {
    cron: "0 8 * * 1-3",
    lenient: true,
    phrase: "every monday, tuesday and wednesday at 8:00",
    strict: true,
  },
  { cron: "0 9 * * 0,6", lenient: true, phrase: "every saturday and sunday at 9:00", strict: true },
  {
    cron: "15 6 * * *",
    lenient: true,
    phrase: "every monday, tuesday, wednesday, thursday, friday, saturday and sunday at 6:15",
    strict: true,
  },
  {
    error: `list the days in calendar order, Monday first: "monday and friday"`,
    lenient: false,
    phrase: "every friday and monday at 12:00",
    strict: false,
  },
  {
    error: `list the days in calendar order, Monday first: "monday and sunday"`,
    lenient: false,
    phrase: "every sunday and monday at 12:00",
    strict: false,
  },
  {
    error: `"monday" is in the list more than one time`,
    lenient: false,
    phrase: "every monday and monday at 12:00",
    strict: false,
  },
  {
    error: `write the list as "monday, wednesday and friday"`,
    lenient: false,
    phrase: "every monday and wednesday and friday at 8:00",
    strict: false,
  },
  {
    cron: "0 8 * * 1,3,5",
    lenient: true,
    phrase: "every monday, wednesday, and friday at 8:00",
    strict: false,
    strictError: `write the list as "monday, wednesday and friday"`,
  },
  { error: `"frday" is not a day`, lenient: false, phrase: "every frday at 9:00", strict: false },
  {
    error: `"weekday" cannot be part of a list of days`,
    lenient: false,
    phrase: "every weekday and saturday at 9:00",
    strict: false,
  },
  {
    cron: "0 9 * * 1-5",
    lenient: true,
    phrase: "every weekdays at 9:00",
    strict: false,
    strictError: `use "weekday" after "every"`,
  },
  {
    error: `expected "at <time>" after "every monday"`,
    lenient: false,
    phrase: "every monday",
    strict: false,
  },

  // ---- Day of the month ----
  { cron: "0 8 1 * *", lenient: true, phrase: "on the 1st of every month at 8:00", strict: true },
  {
    cron: "30 23 2 * *",
    lenient: true,
    phrase: "on the 2nd of every month at 11:30pm",
    strict: true,
  },
  {
    cron: "0 0 3 * *",
    lenient: true,
    phrase: "on the 3rd of every month at midnight",
    strict: true,
  },
  {
    cron: "0 12 11 * *",
    lenient: true,
    phrase: "on the 11th of every month at noon",
    strict: true,
  },
  { cron: "0 9 21 * *", lenient: true, phrase: "on the 21st of every month at 9:00", strict: true },
  { cron: "0 9 22 * *", lenient: true, phrase: "on the 22nd of every month at 9:00", strict: true },
  { cron: "0 9 23 * *", lenient: true, phrase: "on the 23rd of every month at 9:00", strict: true },
  { cron: "0 9 28 * *", lenient: true, phrase: "on the 28th of every month at 9:00", strict: true },
  {
    error: "the 29th does not occur in every month. Use 1st to 28th",
    lenient: false,
    phrase: "on the 29th of every month at 9:00",
    strict: false,
  },
  {
    error: "the 31st does not occur in every month",
    lenient: false,
    phrase: "on the 31st of every month at 9:00",
    strict: false,
  },
  {
    error: `"32nd" is not a day of the month`,
    lenient: false,
    phrase: "on the 32nd of every month at 9:00",
    strict: false,
  },
  {
    error: `"0th" is not a day of the month`,
    lenient: false,
    phrase: "on the 0th of every month at 9:00",
    strict: false,
  },
  {
    error: `"1th" has the wrong suffix. Use "1st"`,
    lenient: false,
    phrase: "on the 1th of every month at 9:00",
    strict: false,
  },
  {
    error: `"12nd" has the wrong suffix. Use "12th"`,
    lenient: false,
    phrase: "on the 12nd of every month at 9:00",
    strict: false,
  },
  {
    error: `expected "at <time>" after "on the 1st of every month"`,
    lenient: false,
    phrase: "on the 1st of every month",
    strict: false,
  },
  {
    error: `expected "the" after "on"`,
    lenient: false,
    phrase: "on 1st of every month at 9:00",
    strict: false,
  },

  // ---- Lenient form ----
  {
    cron: "*/15 * * * *",
    lenient: true,
    phrase: "Every 15 Minutes",
    strict: false,
    strictError: "use lowercase words",
  },
  { cron: "*/15 * * * *", lenient: true, phrase: "EVERY 15 MINUTES", strict: false },
  {
    cron: "*/15 * * * *",
    lenient: true,
    phrase: "  every   15\tminutes  ",
    strict: false,
    strictError: "use one space between words",
  },
  {
    cron: "*/15 * * * *",
    lenient: true,
    phrase: "every 15 mins",
    strict: false,
    strictError: `"mins" is not an interval unit`,
  },
  { cron: "*/15 * * * *", lenient: true, phrase: "every 15 min", strict: false },
  { cron: "*/15 * * * *", lenient: true, phrase: "every 15m", strict: false },
  { cron: "*/15 * * * *", lenient: true, phrase: "every 15 m", strict: false },
  { cron: "* * * * *", lenient: true, phrase: "every min", strict: false },
  { cron: "0 */2 * * *", lenient: true, phrase: "every 2 hrs", strict: false },
  { cron: "0 */2 * * *", lenient: true, phrase: "every 2h", strict: false },
  { cron: "0 */2 * * *", lenient: true, phrase: "every 2 hour", strict: false },
  { cron: "0 * * * *", lenient: true, phrase: "every hr", strict: false },
  { cron: "0 * * * *", lenient: true, phrase: "Hourly", strict: false },
  {
    cron: "30 9 * * 1",
    lenient: true,
    phrase: "every mon at 9:30",
    strict: false,
    strictError: `"mon" is not a day`,
  },
  { cron: "30 9 * * 1", lenient: true, phrase: "every Monday at 9:30", strict: false },
  {
    cron: "30 9 * * 1,2,4",
    lenient: true,
    phrase: "every mon, tues and thurs at 9:30",
    strict: false,
  },
  { cron: "30 9 * * 1,2,4", lenient: true, phrase: "every mon,tue and thu at 9:30", strict: false },
  { cron: "30 9 * * 0,6", lenient: true, phrase: "every sat and sun at 9:30", strict: false },
  { cron: "30 21 * * *", lenient: true, phrase: "every day at 9:30 PM", strict: false },
  { cron: "30 21 * * *", lenient: true, phrase: "every day at 9:30PM", strict: false },
  { cron: "0 12 * * *", lenient: true, phrase: "Every Day At Noon", strict: false },
  {
    cron: "*/15 9-16 * * 1-5",
    lenient: true,
    phrase: "Every 15 Mins Between 9:00 AM And 5:00 PM On Weekdays",
    strict: false,
  },
  { cron: "0 9 * * 1", lenient: true, phrase: "every mondays at 9:00", strict: false },
  { cron: "0 8 1 * *", lenient: true, phrase: "On The 1st Of Every Month At 8:00", strict: false },

  // ---- Not in the language ----
  { error: "the phrase is empty", lenient: false, phrase: "", strict: false },
  {
    error: "the phrase is empty",
    lenient: false,
    phrase: "   ",
    strict: false,
    strictError: "use one space between words",
  },
  {
    error: `"biweekly" is not a valid start of a phrase`,
    lenient: false,
    phrase: "biweekly",
    strict: false,
  },
  {
    error: `"twice" is not a valid start of a phrase`,
    lenient: false,
    phrase: "twice a day",
    strict: false,
  },
  {
    error: `"at" is not a valid start of a phrase`,
    lenient: false,
    phrase: "at 9:30",
    strict: false,
  },
  {
    error: `"every" is not a day`,
    lenient: false,
    phrase: "every every day at 9:00",
    strict: false,
  },
  {
    error: `"other" is not a day`,
    lenient: false,
    phrase: "every other day at 9:00",
    strict: false,
  },
  { error: `"month" is not a day`, lenient: false, phrase: "every month at 9:00", strict: false },
  {
    error: `"morning" is not a day`,
    lenient: false,
    phrase: "every morning at 9:00",
    strict: false,
  },
  {
    error: `expected an interval, "day", or a day set after "every"`,
    lenient: false,
    phrase: "every",
    strict: false,
  },
  {
    cron: "* * * * *",
    lenient: true,
    phrase: "every minutes",
    strict: false,
    strictError: `use "every minute", or write a number before "minutes"`,
  },
] as const satisfies readonly GrammarRow[]
