import type { Expand } from './contract';
import { expand as solutionExpand } from '../src/index';

export const expand: Expand = (input) => {
  const occurrences = solutionExpand({
    start: input.dtstartUtc,
    rule: input.rrule,
    timeZone: input.tz,
    rangeStart: input.from,
    rangeEnd: input.to,
  });
  return occurrences.map((d) => d.toISOString());
};
