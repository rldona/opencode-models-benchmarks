const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

export type Frequency = "DAILY" | "WEEKLY" | "MONTHLY";

export interface RecurrenceRule {
  readonly freq: Frequency;
  readonly interval?: number;
  readonly byDay?: string | readonly string[];
  readonly count?: number;
  readonly until?: Date | string;
}

export type RuleInput = string | RecurrenceRule;

type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

interface ByDay {
  readonly weekday: Weekday;
  readonly ordinal?: number;
}

interface NormalizedRule {
  readonly freq: Frequency;
  readonly interval: number;
  readonly byDay: readonly ByDay[];
  readonly count?: number;
  readonly until?: number;
}

interface CivilDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

interface CivilDateTime extends CivilDate {
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly millisecond: number;
}

const WEEKDAY_CODES: Record<string, Weekday> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

/**
 * Expands the supported RRULE subset while keeping DTSTART's local clock time.
 * The range is half-open: occurrences are >= rangeStart and < rangeEnd.
 */
export function expandOccurrences(
  start: Date,
  ruleInput: RuleInput,
  timeZone: string,
  rangeStart: Date,
  rangeEnd: Date,
): Date[] {
  const startMilliseconds = getDateMilliseconds(start, "start");
  const rangeStartMilliseconds = getDateMilliseconds(rangeStart, "rangeStart");
  const rangeEndMilliseconds = getDateMilliseconds(rangeEnd, "rangeEnd");

  if (rangeEndMilliseconds <= rangeStartMilliseconds) {
    return [];
  }

  getFormatter(timeZone);
  const rule = normalizeRule(ruleInput, timeZone);
  const startLocal = getZonedDateTime(startMilliseconds, timeZone);

  if (rule.until !== undefined && rule.until < startMilliseconds) {
    return [];
  }

  const upperBound = Math.min(
    rangeEndMilliseconds,
    rule.until ?? Number.POSITIVE_INFINITY,
  );
  const upperBoundLocal = getZonedDateTime(upperBound, timeZone);
  const startDate: CivilDate = startLocal;
  const startWeekday = getWeekday(startDate);
  const startWeekMonday = addCalendarDays(
    startDate,
    -((startWeekday + 6) % 7),
  );
  const occurrences: Date[] = [];
  let periodIndex = 0;
  let occurrenceCount = 0;

  while (true) {
    const period = getPeriod(rule, startLocal, startWeekMonday, periodIndex);

    if (compareCivilDates(period.anchor, upperBoundLocal) > 0) {
      break;
    }

    for (const localOccurrence of period.occurrences) {
      const occurrenceMilliseconds = localDateTimeToInstant(
        localOccurrence,
        timeZone,
      );

      if (occurrenceMilliseconds < startMilliseconds) {
        continue;
      }

      if (
        rule.until !== undefined &&
        occurrenceMilliseconds > rule.until
      ) {
        return occurrences;
      }

      occurrenceCount += 1;

      if (
        occurrenceMilliseconds >= rangeStartMilliseconds &&
        occurrenceMilliseconds < rangeEndMilliseconds
      ) {
        occurrences.push(new Date(occurrenceMilliseconds));
      }

      if (
        rule.count !== undefined &&
        occurrenceCount >= rule.count
      ) {
        return occurrences.sort((left, right) => left.getTime() - right.getTime());
      }
    }

    periodIndex += 1;
  }

  return occurrences.sort((left, right) => left.getTime() - right.getTime());
}

function normalizeRule(ruleInput: RuleInput, timeZone: string): NormalizedRule {
  const rawRule = typeof ruleInput === "string"
    ? parseRuleString(ruleInput)
    : getRuleObject(ruleInput);

  if (typeof rawRule.freq !== "string") {
    throw new TypeError("RRULE must include FREQ");
  }

  const frequency = rawRule.freq.toUpperCase();
  if (frequency !== "DAILY" && frequency !== "WEEKLY" && frequency !== "MONTHLY") {
    throw new RangeError(`Unsupported FREQ: ${rawRule.freq}`);
  }

  const interval = normalizePositiveInteger(rawRule.interval ?? 1, "INTERVAL");
  const count = rawRule.count === undefined
    ? undefined
    : normalizePositiveInteger(rawRule.count, "COUNT");
  const byDay = normalizeByDay(rawRule.byDay);

  if (frequency === "DAILY" && byDay.length > 0) {
    throw new RangeError("BYDAY is only supported for WEEKLY and MONTHLY");
  }

  if (
    frequency === "WEEKLY" &&
    byDay.some((value) => value.ordinal !== undefined)
  ) {
    throw new RangeError("WEEKLY BYDAY entries cannot have an ordinal");
  }

  const until = rawRule.until === undefined
    ? undefined
    : parseUntil(rawRule.until, timeZone);

  return {
    freq: frequency,
    interval,
    byDay,
    count,
    until,
  };
}

interface RawRule {
  readonly freq?: unknown;
  readonly interval?: unknown;
  readonly byDay?: unknown;
  readonly count?: unknown;
  readonly until?: unknown;
}

function getRuleObject(ruleInput: RecurrenceRule): RawRule {
  if (ruleInput === null || typeof ruleInput !== "object") {
    throw new TypeError("RRULE must be a string or an object");
  }

  return ruleInput;
}

function parseRuleString(ruleInput: string): RawRule {
  const value = ruleInput.trim().replace(/^RRULE:/i, "");
  if (value.length === 0) {
    throw new TypeError("RRULE cannot be empty");
  }

  const result: {
    freq?: string;
    interval?: string;
    byDay?: string;
    count?: string;
    until?: string;
  } = {};

  for (const part of value.split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) {
      throw new TypeError(`Invalid RRULE part: ${part}`);
    }

    const key = part.slice(0, separator).trim().toUpperCase();
    const partValue = part.slice(separator + 1).trim();
    if (partValue.length === 0) {
      throw new TypeError(`RRULE value cannot be empty: ${key}`);
    }

    if (key !== "FREQ" && key !== "INTERVAL" && key !== "BYDAY" && key !== "COUNT" && key !== "UNTIL") {
      throw new RangeError(`Unsupported RRULE property: ${key}`);
    }

    if (key === "FREQ") {
      if (result.freq !== undefined) {
        throw new TypeError("RRULE cannot contain FREQ more than once");
      }
      result.freq = partValue;
    } else if (key === "INTERVAL") {
      if (result.interval !== undefined) {
        throw new TypeError("RRULE cannot contain INTERVAL more than once");
      }
      result.interval = partValue;
    } else if (key === "BYDAY") {
      if (result.byDay !== undefined) {
        throw new TypeError("RRULE cannot contain BYDAY more than once");
      }
      result.byDay = partValue;
    } else if (key === "COUNT") {
      if (result.count !== undefined) {
        throw new TypeError("RRULE cannot contain COUNT more than once");
      }
      result.count = partValue;
    } else {
      if (result.until !== undefined) {
        throw new TypeError("RRULE cannot contain UNTIL more than once");
      }
      result.until = partValue;
    }
  }

  return result;
}

function normalizePositiveInteger(value: unknown, name: string): number {
  const numberValue = typeof value === "number"
    ? value
    : typeof value === "string" && /^\d+$/.test(value)
      ? Number(value)
      : Number.NaN;

  if (
    !Number.isSafeInteger(numberValue) ||
    numberValue < 1
  ) {
    throw new RangeError(`${name} must be a positive integer`);
  }

  return numberValue;
}

function normalizeByDay(value: unknown): ByDay[] {
  if (value === undefined) {
    return [];
  }

  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : undefined;

  if (values === undefined || values.length === 0) {
    throw new TypeError("BYDAY must contain at least one weekday");
  }

  return values.map((entry) => parseByDay(String(entry).trim().toUpperCase()));
}

function parseByDay(value: string): ByDay {
  const match = /^([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/.exec(value);
  if (match === null) {
    throw new RangeError(`Invalid BYDAY entry: ${value}`);
  }

  const ordinal = match[1] === undefined ? undefined : Number(match[1]);
  if (
    ordinal !== undefined &&
    (ordinal === 0 || ordinal < -5 || ordinal > 5)
  ) {
    throw new RangeError(`Invalid BYDAY ordinal: ${value}`);
  }

  return {
    weekday: WEEKDAY_CODES[match[2]],
    ordinal,
  };
}

function parseUntil(value: unknown, timeZone: string): number {
  if (value instanceof Date) {
    return getDateMilliseconds(value, "UNTIL");
  }

  if (typeof value !== "string") {
    throw new TypeError("UNTIL must be a Date or string");
  }

  const trimmed = value.trim();
  const compact = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/i.exec(trimmed);
  if (compact !== null) {
    const date = {
      year: Number(compact[1]),
      month: Number(compact[2]),
      day: Number(compact[3]),
    };

    if (compact[4] === undefined) {
      return localDateTimeToInstant(
        { ...date, hour: 23, minute: 59, second: 59, millisecond: 999 },
        timeZone,
      );
    }

    const dateTime: CivilDateTime = {
      ...date,
      hour: Number(compact[4]),
      minute: Number(compact[5]),
      second: Number(compact[6]),
      millisecond: 0,
    };
    validateCivilDateTime(dateTime, "UNTIL");

    return compact[7] === undefined
      ? localDateTimeToInstant(dateTime, timeZone)
      : civilToUtcMilliseconds(dateTime);
  }

  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    const parsed = new Date(trimmed).getTime();
    if (!Number.isFinite(parsed)) {
      throw new RangeError(`Invalid UNTIL: ${value}`);
    }
    return parsed;
  }

  const isoLocal = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/.exec(trimmed);
  if (isoLocal === null) {
    throw new RangeError(`Invalid UNTIL: ${value}`);
  }

  const date = {
    year: Number(isoLocal[1]),
    month: Number(isoLocal[2]),
    day: Number(isoLocal[3]),
  };
  if (isoLocal[4] === undefined) {
    return localDateTimeToInstant(
      { ...date, hour: 23, minute: 59, second: 59, millisecond: 999 },
      timeZone,
    );
  }

  const fraction = isoLocal[7] ?? "";
  const dateTime: CivilDateTime = {
    ...date,
    hour: Number(isoLocal[4]),
    minute: Number(isoLocal[5]),
    second: Number(isoLocal[6] ?? 0),
    millisecond: Number(fraction.padEnd(3, "0")),
  };
  validateCivilDateTime(dateTime, "UNTIL");
  return localDateTimeToInstant(dateTime, timeZone);
}

interface Period {
  readonly anchor: CivilDate;
  readonly occurrences: readonly CivilDateTime[];
}

function getPeriod(
  rule: NormalizedRule,
  start: CivilDateTime,
  startWeekMonday: CivilDate,
  periodIndex: number,
): Period {
  const startDate: CivilDate = start;

  if (rule.freq === "DAILY") {
    const date = addCalendarDays(startDate, periodIndex * rule.interval);
    return {
      anchor: date,
      occurrences: [withTime(date, start)],
    };
  }

  if (rule.freq === "WEEKLY") {
    const weekStart = addCalendarDays(
      startWeekMonday,
      periodIndex * rule.interval * 7,
    );
    const startWeekday = getWeekday(startDate);
    const days = rule.byDay.length > 0
      ? rule.byDay
      : [{ weekday: startWeekday }];
    const uniqueDays = new Map<Weekday, ByDay>();
    for (const day of days) {
      uniqueDays.set(day.weekday, day);
    }

    const occurrences = [...uniqueDays.values()]
      .sort((left, right) => mondayOrder(left.weekday) - mondayOrder(right.weekday))
      .map((day) => withTime(
        addCalendarDays(weekStart, mondayOrder(day.weekday)),
        start,
      ));

    return { anchor: weekStart, occurrences };
  }

  const month = getMonthAtOffset(startDate, periodIndex * rule.interval);
  const lastDay = daysInMonth(month.year, month.month);

  if (rule.byDay.length === 0) {
    if (start.day > lastDay) {
      return { anchor: month, occurrences: [] };
    }

    const date = { ...month, day: start.day };
    return { anchor: month, occurrences: [withTime(date, start)] };
  }

  const matchingDays = new Set<number>();
  for (const byDay of rule.byDay) {
    if (byDay.ordinal === undefined) {
      for (let day = 1; day <= lastDay; day += 1) {
        if (getWeekday({ ...month, day }) === byDay.weekday) {
          matchingDays.add(day);
        }
      }
    } else {
      const day = getOrdinalWeekdayInMonth(
        month.year,
        month.month,
        lastDay,
        byDay.weekday,
        byDay.ordinal,
      );
      if (day !== undefined) {
        matchingDays.add(day);
      }
    }
  }

  const occurrences = [...matchingDays]
    .sort((left, right) => left - right)
    .map((day) => withTime({ ...month, day }, start));

  return { anchor: month, occurrences };
}

function getOrdinalWeekdayInMonth(
  year: number,
  month: number,
  lastDay: number,
  weekday: Weekday,
  ordinal: number,
): number | undefined {
  if (ordinal > 0) {
    const firstWeekday = getWeekday({ year, month, day: 1 });
    const day = 1 + (weekday - firstWeekday + 7) % 7 + (ordinal - 1) * 7;
    return day <= lastDay ? day : undefined;
  }

  const lastWeekday = getWeekday({ year, month, day: lastDay });
  const day = lastDay - (lastWeekday - weekday + 7) % 7 + (ordinal + 1) * 7;
  return day >= 1 ? day : undefined;
}

function withTime(date: CivilDate, time: CivilDateTime): CivilDateTime {
  return {
    ...date,
    hour: time.hour,
    minute: time.minute,
    second: time.second,
    millisecond: time.millisecond,
  };
}

function getMonthAtOffset(date: CivilDate, offset: number): CivilDate {
  const absoluteMonth = date.year * 12 + date.month - 1 + offset;
  const year = Math.floor(absoluteMonth / 12);
  const month = ((absoluteMonth % 12) + 12) % 12 + 1;
  return { year, month, day: 1 };
}

function mondayOrder(weekday: Weekday): number {
  return (weekday + 6) % 7;
}

function getWeekday(date: CivilDate): Weekday {
  return makeUtcDate(date).getUTCDay() as Weekday;
}

function addCalendarDays(date: CivilDate, amount: number): CivilDate {
  const result = makeUtcDate(date);
  result.setUTCDate(result.getUTCDate() + amount);
  return {
    year: result.getUTCFullYear(),
    month: result.getUTCMonth() + 1,
    day: result.getUTCDate(),
  };
}

function daysInMonth(year: number, month: number): number {
  const result = new Date(0);
  result.setUTCFullYear(year, month, 0);
  result.setUTCHours(0, 0, 0, 0);
  return result.getUTCDate();
}

function makeUtcDate(date: CivilDate): Date {
  const result = new Date(0);
  result.setUTCFullYear(date.year, date.month - 1, date.day);
  result.setUTCHours(0, 0, 0, 0);
  return result;
}

function compareCivilDates(left: CivilDate, right: CivilDate): number {
  if (left.year !== right.year) {
    return left.year - right.year;
  }
  if (left.month !== right.month) {
    return left.month - right.month;
  }
  return left.day - right.day;
}

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  if (typeof timeZone !== "string" || timeZone.trim() === "") {
    throw new TypeError("timeZone must be a non-empty IANA time zone");
  }

  const cached = formatterCache.get(timeZone);
  if (cached !== undefined) {
    return cached;
  }

  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      calendar: "gregory",
      numberingSystem: "latn",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    throw new RangeError(`Invalid IANA time zone: ${timeZone}`);
  }

  formatterCache.set(timeZone, formatter);
  return formatter;
}

function getZonedDateTime(
  milliseconds: number,
  timeZone: string,
): CivilDateTime {
  const date = new Date(milliseconds);
  if (!Number.isFinite(date.getTime())) {
    throw new RangeError("Date is outside the supported range");
  }

  const values: Partial<Record<"year" | "month" | "day" | "hour" | "minute" | "second", number>> = {};
  for (const part of getFormatter(timeZone).formatToParts(date)) {
    if (
      part.type === "year" ||
      part.type === "month" ||
      part.type === "day" ||
      part.type === "hour" ||
      part.type === "minute" ||
      part.type === "second"
    ) {
      values[part.type] = Number(part.value);
    }
  }

  if (
    values.year === undefined ||
    values.month === undefined ||
    values.day === undefined ||
    values.hour === undefined ||
    values.minute === undefined ||
    values.second === undefined
  ) {
    throw new RangeError("Could not read the local date in the requested time zone");
  }

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
    millisecond: date.getUTCMilliseconds(),
  };
}

function getOffsetMilliseconds(milliseconds: number, timeZone: string): number {
  const second = Math.floor(milliseconds / 1000) * 1000;
  const local = getZonedDateTime(second, timeZone);
  return civilToUtcMilliseconds({ ...local, millisecond: 0 }) - second;
}

function localDateTimeToInstant(
  local: CivilDateTime,
  timeZone: string,
): number {
  validateCivilDateTime(local, "local date");
  const targetMilliseconds = civilToUtcMilliseconds(local);
  const offsets = new Set<number>();

  for (const probe of [
    targetMilliseconds - 3 * DAY_IN_MILLISECONDS,
    targetMilliseconds - DAY_IN_MILLISECONDS,
    targetMilliseconds,
    targetMilliseconds + DAY_IN_MILLISECONDS,
    targetMilliseconds + 3 * DAY_IN_MILLISECONDS,
  ]) {
    if (Number.isFinite(new Date(probe).getTime())) {
      offsets.add(getOffsetMilliseconds(probe, timeZone));
    }
  }

  const candidates = [...offsets]
    .map((offset) => targetMilliseconds - offset)
    .filter((candidate) => Number.isFinite(new Date(candidate).getTime()));
  const exactMatches = candidates.filter((candidate) => {
    const actual = getZonedDateTime(candidate, timeZone);
    return compareCivilDateTimes(actual, local) === 0;
  });

  if (exactMatches.length > 0) {
    // On a fall-back transition the same local time occurs twice. Choose the earlier instant.
    return Math.min(...exactMatches);
  }

  if (candidates.length === 0) {
    throw new RangeError("Local date is outside the supported range");
  }

  // A spring-forward gap has no exact instant. Use the first local time after the gap.
  const normalized = candidates
    .map((candidate) => ({
      candidate,
      local: getZonedDateTime(candidate, timeZone),
    }))
    .sort((left, right) => {
      const localDifference = compareCivilDateTimes(left.local, right.local);
      return localDifference !== 0
        ? localDifference
        : left.candidate - right.candidate;
    });
  const afterGap = normalized.find(
    (value) => compareCivilDateTimes(value.local, local) >= 0,
  );

  return afterGap?.candidate ?? normalized[normalized.length - 1].candidate;
}

function compareCivilDateTimes(
  left: CivilDateTime,
  right: CivilDateTime,
): number {
  const leftMilliseconds = civilToUtcMilliseconds(left);
  const rightMilliseconds = civilToUtcMilliseconds(right);
  return leftMilliseconds - rightMilliseconds;
}

function civilToUtcMilliseconds(date: CivilDateTime): number {
  const result = new Date(0);
  result.setUTCFullYear(date.year, date.month - 1, date.day);
  result.setUTCHours(
    date.hour,
    date.minute,
    date.second,
    date.millisecond,
  );
  return result.getTime();
}

function validateCivilDateTime(date: CivilDateTime, label: string): void {
  if (
    !Number.isInteger(date.year) ||
    !Number.isInteger(date.month) ||
    !Number.isInteger(date.day) ||
    !Number.isInteger(date.hour) ||
    !Number.isInteger(date.minute) ||
    !Number.isInteger(date.second) ||
    !Number.isInteger(date.millisecond) ||
    date.month < 1 ||
    date.month > 12 ||
    date.day < 1 ||
    date.day > daysInMonth(date.year, date.month) ||
    date.hour < 0 ||
    date.hour > 23 ||
    date.minute < 0 ||
    date.minute > 59 ||
    date.second < 0 ||
    date.second > 59 ||
    date.millisecond < 0 ||
    date.millisecond > 999
  ) {
    throw new RangeError(`Invalid ${label}`);
  }
}

function getDateMilliseconds(value: Date, label: string): number {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new TypeError(`${label} must be a valid Date`);
  }
  return value.getTime();
}
