import { describe, expect, it } from 'vitest';
import { compile } from '../src/index.js';

function elapsed(fn: () => unknown): number {
  const start = Date.now();
  fn();
  return Date.now() - start;
}

describe('linear-time exec', () => {
  it('(a|a)*b does not blow up on 50k characters', () => {
    const ms = elapsed(() => compile('(a|a)*b').exec('a'.repeat(50000)));
    expect(ms).toBeLessThan(1000);
  });

  it('(x+x+)+y does not blow up on 50k characters', () => {
    const ms = elapsed(() => compile('(x+x+)+y').exec('x'.repeat(50000)));
    expect(ms).toBeLessThan(1000);
  });

  it('.*.*=.* does not blow up on 50k characters', () => {
    const ms = elapsed(() => compile('.*.*=.*').exec('a'.repeat(50000)));
    expect(ms).toBeLessThan(1000);
  });

  it('a*b scans 100k characters quickly', () => {
    const ms = elapsed(() => compile('a*b').exec('a'.repeat(100000)));
    expect(ms).toBeLessThan(1000);
  });

  it('finds the match in the linear cases', () => {
    expect(compile('(a|a)*b').exec('aaaaab')?.captures[0]).toBe('aaaaab');
    expect(compile('(x+x+)+y').exec('xxxxy')?.captures[0]).toBe('xxxxy');
    expect(compile('.*.*=.*').exec('abc=def')?.captures[0]).toBe('abc=def');
    expect(compile('a*b').exec('aaab')?.captures[0]).toBe('aaab');
  });
});
