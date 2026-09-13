import { LocalDateTime } from './types.js';

interface TransitionRule {
  month: number;
  week: number;
  dayOfWeek: number;
  hour: number;
  minute: number;
  utcHour: number;
}

interface TimezoneData {
  standardOffset: number;
  dstOffset: number;
  dstStart: TransitionRule;
  dstEnd: TransitionRule;
}

const TIMEZONE_DATABASE: Record<string, TimezoneData> = {
  'Europe/Madrid': {
    standardOffset: 1,
    dstOffset: 2,
    dstStart: { month: 3, week: -1, dayOfWeek: 0, hour: 2, minute: 0, utcHour: 1 },
    dstEnd: { month: 10, week: -1, dayOfWeek: 0, hour: 3, minute: 0, utcHour: 2 },
  },
  'Europe/London': {
    standardOffset: 0,
    dstOffset: 1,
    dstStart: { month: 3, week: -1, dayOfWeek: 0, hour: 1, minute: 0, utcHour: 1 },
    dstEnd: { month: 10, week: -1, dayOfWeek: 0, hour: 2, minute: 0, utcHour: 1 },
  },
  'America/New_York': {
    standardOffset: -5,
    dstOffset: -4,
    dstStart: { month: 3, week: 2, dayOfWeek: 0, hour: 2, minute: 0, utcHour: 7 },
    dstEnd: { month: 11, week: 1, dayOfWeek: 0, hour: 2, minute: 0, utcHour: 7 },
  },
  'UTC': {
    standardOffset: 0,
    dstOffset: 0,
    dstStart: { month: 1, week: 1, dayOfWeek: 0, hour: 0, minute: 0, utcHour: 0 },
    dstEnd: { month: 1, week: 1, dayOfWeek: 0, hour: 0, minute: 0, utcHour: 0 },
  },
};

export class Timezone {
  private data: TimezoneData;

  constructor(private tzName: string) {
    if (!TIMEZONE_DATABASE[tzName]) {
      throw new Error(`Unsupported timezone: ${tzName}`);
    }
    this.data = TIMEZONE_DATABASE[tzName];
  }

  getName(): string {
    return this.tzName;
  }

  isDst(localDate: LocalDateTime): boolean {
    const year = localDate.year;
    const dstStart = this.getTransitionDate(year, this.data.dstStart, true);
    const dstEnd = this.getTransitionDate(year, this.data.dstEnd, false);

    const localMinutes = this.toMinutes(localDate);
    const startMinutes = this.toMinutes(dstStart);
    const endMinutes = this.toMinutes(dstEnd);

    if (this.data.dstStart.month > this.data.dstEnd.month) {
      return localMinutes >= startMinutes || localMinutes < endMinutes;
    }
    return localMinutes >= startMinutes && localMinutes < endMinutes;
  }

  private getTransitionDate(year: number, rule: TransitionRule, isStart: boolean): LocalDateTime {
    const { month, week, dayOfWeek, hour, minute, utcHour } = rule;
    let day: number;

    if (week === -1) {
      day = this.getLastDayOfMonth(year, month, dayOfWeek);
    } else {
      day = this.getNthDayOfMonth(year, month, dayOfWeek, week);
    }

    const utcDate = new Date(Date.UTC(year, month - 1, day, utcHour, minute, 0));
    const localHour = hour;
    const localDate = new Date(utcDate);
    localDate.setHours(localHour, minute, 0, 0);

    const result = this.dateToLocalDateTime(localDate);
    result.hour = localHour;
    result.minute = minute;
    result.second = 0;

    return result;
  }

  private getNthDayOfMonth(year: number, month: number, dayOfWeek: number, n: number): number {
    const firstDay = new Date(year, month - 1, 1).getDay();
    const targetDay = (dayOfWeek - firstDay + 7) % 7 + 1;
    return targetDay + (n - 1) * 7;
  }

  private getLastDayOfMonth(year: number, month: number, dayOfWeek: number): number {
    const lastDay = new Date(year, month, 0).getDate();
    const lastDayOfWeek = new Date(year, month - 1, lastDay).getDay();
    const diff = (lastDayOfWeek - dayOfWeek + 7) % 7;
    return lastDay - diff;
  }

  private toMinutes(date: LocalDateTime): number {
    return date.day * 24 * 60 + date.hour * 60 + date.minute;
  }

  toTimestamp(localDate: LocalDateTime): number {
    const isDst = this.isDst(localDate);
    const offset = isDst ? this.data.dstOffset : this.data.standardOffset;
    const utcDate = new Date(Date.UTC(
      localDate.year,
      localDate.month - 1,
      localDate.day,
      localDate.hour,
      localDate.minute,
      localDate.second
    ));
    const utcTimestamp = utcDate.getTime();
    return utcTimestamp - offset * 60 * 60 * 1000;
  }

  fromTimestamp(timestamp: number): LocalDateTime {
    const isDst = this.isDstAtTimestamp(timestamp);
    const offset = isDst ? this.data.dstOffset : this.data.standardOffset;
    const utcDate = new Date(timestamp + offset * 60 * 60 * 1000);
    return this.dateToLocalDateTime(utcDate);
  }

  private isDstAtTimestamp(timestamp: number): boolean {
    const utcDate = new Date(timestamp);
    const year = utcDate.getUTCFullYear();
    const dstStart = this.getTransitionDate(year, this.data.dstStart, true);
    const dstEnd = this.getTransitionDate(year, this.data.dstEnd, false);

    const startTs = this.toTimestamp(dstStart);
    const endTs = this.toTimestamp(dstEnd);

    if (this.data.dstStart.month > this.data.dstEnd.month) {
      return timestamp >= startTs || timestamp < endTs;
    }
    return timestamp >= startTs && timestamp < endTs;
  }

  private dateToLocalDateTime(date: Date): LocalDateTime {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      second: date.getSeconds(),
      isDst: false,
    };
  }

  getOffset(localDate: LocalDateTime): number {
    return this.isDst(localDate) ? this.data.dstOffset : this.data.standardOffset;
  }

  addDays(localDate: LocalDateTime, days: number): LocalDateTime {
    const date = new Date(localDate.year, localDate.month - 1, localDate.day);
    date.setDate(date.getDate() + days);
    return this.dateToLocalDateTime(date);
  }

  addMonths(localDate: LocalDateTime, months: number): LocalDateTime {
    let year = localDate.year;
    let month = localDate.month + months;

    while (month > 12) {
      month -= 12;
      year++;
    }
    while (month < 1) {
      month += 12;
      year--;
    }

    const lastDayOfMonth = new Date(year, month, 0).getDate();
    const day = Math.min(localDate.day, lastDayOfMonth);

    return {
      year,
      month,
      day,
      hour: localDate.hour,
      minute: localDate.minute,
      second: localDate.second,
      isDst: false,
    };
  }

  setTime(localDate: LocalDateTime, hour: number, minute: number, second: number): LocalDateTime {
    return {
      ...localDate,
      hour,
      minute,
      second,
    };
  }
}

export function createTimezone(tzName: string): Timezone {
  return new Timezone(tzName);
}
