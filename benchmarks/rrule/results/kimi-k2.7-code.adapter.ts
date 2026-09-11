import type { Expand } from './contract';
import { expand as solutionExpand } from '../src/expander';

export const expand: Expand = (input) => {
  const results = solutionExpand(
    input.dtstartLocal,
    input.rrule,
    input.tz,
    new Date(input.from),
    new Date(input.to)
  );
  return results.map((d) => d.toISOString());
};

export const adapterWorkarounds: string[] = [];
