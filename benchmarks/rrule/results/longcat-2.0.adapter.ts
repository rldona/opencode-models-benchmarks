import type { Expand } from './contract';
import { parseRRule, expand as solutionExpand } from '../src/index';

export const expand: Expand = (input) => {
  const rule = parseRRule(input.rrule);
  const startUTC = Date.parse(input.dtstartUtc);
  const rangeStart = Date.parse(input.from);
  const rangeEnd = Date.parse(input.to);

  const occurrences = solutionExpand(rule, startUTC, input.tz, rangeStart, rangeEnd);

  return occurrences.map((ms) => new Date(ms).toISOString());
};
