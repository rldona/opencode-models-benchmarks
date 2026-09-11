import { describe, expect, it } from 'vitest';
import { compile } from '../src/index';

function own(pattern: string, flags: string, input: string) {
  const actual = compile(pattern, flags).exec(input);
  const native = new RegExp(pattern, flags).exec(input);
  return {
    actual: actual && { index: actual.index, captures: actual.captures, groups: actual.groups },
    native: native && { index: native.index, captures: [...native], groups: native.groups ?? {} },
  };
}

describe('smoke', () => {
  it.each([
    ['a', '', 'ba'],
    ['a|ab', '', 'ab'],
    ['ab|a', '', 'ab'],
    ['a*', '', 'baaaac'],
    ['a*?', '', 'baaaac'],
    ['(a|b)+c', '', 'aabbc'],
    ['(a|b)*c', '', 'xx'],
    ['(?<year>\\d{4})-(?<month>\\d\\d)(?:T(\\d\\d))?', '', '2026-09'],
    ['^a+$', '', 'aaa'],
    ['\\bword\\b', '', 'a word!'],
    ['[a-z]+', 'i', '123ÉZ'],
    ['.', 'u', '😀'],
    ['.', '', '😀'],
  ])('matches %s /%s/ against %s', (pattern, flags, input) => {
    expect(own(pattern, flags, input).actual).toEqual(own(pattern, flags, input).native);
  });

  it('handles backreferences and lookahead', () => {
    expect(own('(a+)\\1', '', 'aaaa')).toEqual({
      actual: { index: 0, captures: ['aaaa', 'aa'], groups: {} },
      native: { index: 0, captures: ['aaaa', 'aa'], groups: {} },
    });
    expect(own('(?=(a+))a', '', 'aaa')).toEqual({
      actual: { index: 0, captures: ['a', 'aaa'], groups: {} },
      native: { index: 0, captures: ['a', 'aaa'], groups: {} },
    });
  });

  it('updates lastIndex only for stateful flags', () => {
    const regex = compile('a', 'g');
    expect(regex.exec('baab')).toMatchObject({ index: 1, captures: ['a'] });
    expect(regex.lastIndex).toBe(2);
    expect(regex.exec('baab')).toMatchObject({ index: 2, captures: ['a'] });
    expect(regex.lastIndex).toBe(3);
    expect(regex.exec('baab')).toBeNull();
    expect(regex.lastIndex).toBe(0);
  });
});
