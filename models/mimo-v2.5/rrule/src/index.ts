import { parseRRule } from "./parser.js";
import { generateOccurrences } from "./generator.js";

export function expandRRule(
  rule: string,
  dtstart: Date,
  tz: string,
  rangeStart: Date,
  rangeEnd: Date,
): Date[] {
  const options = parseRRule(rule, dtstart);
  return generateOccurrences(options, dtstart, tz, rangeStart, rangeEnd);
}
