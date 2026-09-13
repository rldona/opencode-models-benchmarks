import { RRule } from './types'
import { parseRRule } from './parse'
import { expandRRule } from './expand'

export { parseRRule, RRule }

export function expand(
  start: Date,
  rruleString: string,
  tzid: string,
  from: Date,
  to: Date
): Date[] {
  const rule = parseRRule(rruleString)
  return expandRRule({ start, rule, tzid, from, to })
}

export function expandParsed(
  start: Date,
  rule: RRule,
  tzid: string,
  from: Date,
  to: Date
): Date[] {
  return expandRRule({ start, rule, tzid, from, to })
}
