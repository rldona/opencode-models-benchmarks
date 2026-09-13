export type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export type Weekday = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

export interface ByDayItem {
  readonly weekday: Weekday;
  /** 1..5 (nth from the start of the period) or -1..-5 (nth from the end). */
  readonly ordinal?: number;
}

export type DateInput = Date | string | number;

export interface RecurrenceRule {
  readonly freq: Frequency;
  readonly interval?: number;
  readonly byDay?: readonly ByDayItem[];
  readonly count?: number;
  /** Absolute cut-off (inclusive). `parseRRule` always normalises it to a `Date`. */
  readonly until?: DateInput;
  readonly wkst?: Weekday;
}

/**
 * What to do when a recurrence lands on a local time that does not exist
 * (spring-forward DST gap, e.g. 2026-03-29T02:30 in Europe/Madrid).
 *
 * - `shift`: move the instant forward by the size of the gap (02:30 -> 03:30 local).
 * - `skip`: drop the occurrence entirely (it does not consume COUNT).
 */
export type NonExistentLocalTimePolicy = 'shift' | 'skip';

export interface ExpandOptions {
  /** First occurrence of the series. Bare local strings are read in `timeZone`. */
  readonly dtstart: DateInput;
  readonly rule: string | RecurrenceRule;
  /** IANA time zone name, e.g. `Europe/Madrid`. */
  readonly timeZone: string;
  /** Inclusive lower bound. Defaults to `dtstart`. */
  readonly rangeStart?: DateInput;
  /** Inclusive upper bound. Required unless the rule has COUNT or UNTIL. */
  readonly rangeEnd?: DateInput;
  /** Maximum number of occurrences returned (the rule itself keeps being honoured). */
  readonly limit?: number;
  readonly onNonExistentLocalTime?: NonExistentLocalTimePolicy;
}

export interface Occurrence {
  /** The occurrence as an absolute instant. */
  readonly start: Date;
  /** Wall-clock time in `timeZone`, e.g. `2026-10-25T09:00:00`. */
  readonly localDateTime: string;
  /** Wall-clock date in `timeZone`, e.g. `2026-10-25`. */
  readonly localDate: string;
  /** Wall-clock time of day in `timeZone`, e.g. `09:00:00`. */
  readonly localTime: string;
  /** UTC offset of `timeZone` at `start`, in minutes (e.g. 120 for CEST, 60 for CET). */
  readonly offsetMinutes: number;
  /** 0-based position of the occurrence within the whole series (COUNT order). */
  readonly index: number;
}
