import { compile } from '../src/index';
import type { Regex } from '../src/index';

const apiShape: (pattern: string, flags?: string) => Regex = compile;
void apiShape;

const typed = compile('(?<year>\\d{4})-(?<month>\\d\\d)(?:T(\\d\\d))?');
const typedMatch = typed.exec('2026-09');
if (typedMatch) {
  const year: string = typedMatch.groups.year;
  const month: string = typedMatch.groups.month;
  const day: string | undefined = typedMatch.captures[3];
  const whole: string = typedMatch.captures[0];
  void year;
  void month;
  void day;
  void whole;
  // @ts-expect-error The pattern has no group named day.
  typedMatch.groups.day;
  // @ts-expect-error The pattern has no fourth capture.
  typedMatch.captures[4];
}

const required = compile('(a)(?<name>b)');
const requiredMatch = required.exec('ab');
if (requiredMatch) {
  const first: string = requiredMatch.captures[1];
  const name: string = requiredMatch.groups.name;
  void first;
  void name;
  // @ts-expect-error Patterns without named groups expose an empty groups object.
  requiredMatch.groups.other;
}

const optionalContexts = compile('a|(b)(c)?(?=(d))');
const optionalMatch = optionalContexts.exec('a');
if (optionalMatch) {
  const branch: string | undefined = optionalMatch.captures[1];
  const quantified: string | undefined = optionalMatch.captures[2];
  const asserted: string | undefined = optionalMatch.captures[3];
  void branch;
  void quantified;
  void asserted;
}

const optionalNamed = compile('(?<maybe>a)?|(?<branch>b)');
const optionalNamedMatch = optionalNamed.exec('');
if (optionalNamedMatch) {
  const maybe: string | undefined = optionalNamedMatch.groups.maybe;
  const branch: string | undefined = optionalNamedMatch.groups.branch;
  void maybe;
  void branch;
}

const dynamicPattern: string = '(a)';
const dynamic = compile(dynamicPattern);
const dynamicMatch = dynamic.exec('a');
if (dynamicMatch) {
  const capture: string | undefined = dynamicMatch.captures[1];
  const arbitrary: string | undefined = dynamicMatch.groups.anything;
  void capture;
  void arbitrary;
}

const streamMatch = typed.stream().feed('2026-09')[0];
if (streamMatch) {
  const year: string = streamMatch.groups.year;
  const day: string | undefined = streamMatch.captures[3];
  void year;
  void day;
  // @ts-expect-error Streaming matches use the same inferred groups.
  streamMatch.groups.day;
}
