import { compileImplementation } from './engine';
import type { Match, Regex, RegexStream } from './types';

export type { Match, Regex, RegexStream } from './types';

export function compile<const P extends string>(pattern: P, flags?: string): Regex<P> {
  return compileImplementation(pattern, flags);
}
