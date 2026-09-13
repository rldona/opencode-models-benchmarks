import { describe, expect, it } from 'vitest';
import { compile } from '../src/index';

describe('linear regular matching', () => {
  it('does not backtrack exponentially on pathological regular patterns', () => {
    const cases = [
      ['(a|a)*b', 'a'.repeat(50_000)],
      ['(x+x+)+y', 'x'.repeat(50_000)],
      ['.*.*=.*', 'x'.repeat(50_000)],
      ['a*b', 'a'.repeat(100_000)],
    ];
    const started = performance.now();
    for (const [pattern, input] of cases) expect(compile(pattern).exec(input)).toBeNull();
    expect(performance.now() - started).toBeLessThan(1_000);
  });
});
