import type { Expand } from './contract';
import { expandParsed } from '../src/index';
import type { RRule, ByDay, Weekday } from '../src/types';

function toByDay(byday: string[]): ByDay[] {
  return byday.map((item) => {
    const m = /^(-?\d)?(MO|TU|WE|TH|FR|SA|SU)$/.exec(item);
    if (!m) throw new Error(`BYDAY no soportado: ${item}`);
    return {
      position: m[1] ? parseInt(m[1], 10) : undefined,
      weekday: m[2] as Weekday,
    };
  });
}

export const expand: Expand = (input) => {
  const rule: RRule = {
    freq: input.rule.freq,
    interval: input.rule.interval,
    ...(input.rule.byday ? { byDay: toByDay(input.rule.byday) } : {}),
    ...(input.rule.count !== undefined ? { count: input.rule.count } : {}),
    ...(input.rule.until !== undefined ? { until: new Date(input.rule.until) } : {}),
  };

  const start = new Date(input.dtstartUtc);
  const from = new Date(input.from);
  const to = new Date(input.to);

  const occurrences = expandParsed(start, rule, input.tz, from, to);
  return occurrences.map((d) => d.toISOString());
};
