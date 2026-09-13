import { describe, expect, it } from 'vitest';
import { compile } from '../src/index.js';

interface ExecSnapshot {
  index: number;
  captures: (string | undefined)[];
  groups: Record<string, string | undefined>;
  lastIndex: number;
}

interface CustomMatch {
  index: number;
  captures: readonly (string | undefined)[];
  groups: Record<string, string | undefined>;
}

export function snapshotMatch(
  m: RegExpExecArray | CustomMatch | null,
  lastIndex: number,
): ExecSnapshot {
  if (m === null) return { index: -1, captures: [], groups: {}, lastIndex };
  if (Array.isArray(m)) {
    const captures: (string | undefined)[] = [];
    for (let i = 0; i < m.length; i++) captures.push(m[i]);
    const groups: Record<string, string | undefined> = {};
    if (m.groups) {
      for (const key of Object.keys(m.groups)) groups[key] = m.groups[key];
    }
    return { index: m.index, captures, groups, lastIndex };
  }
  return {
    index: m.index,
    captures: [...m.captures],
    groups: { ...m.groups },
    lastIndex,
  };
}

export function checkExec(pattern: string, flags: string, input: string, lastIndex?: number): void {
  const expected = new RegExp(pattern, flags);
  const actual = compile(pattern, flags);
  if (lastIndex !== undefined) {
    expected.lastIndex = lastIndex;
    actual.lastIndex = lastIndex;
  }
  expect(snapshotMatch(actual.exec(input), actual.lastIndex)).toEqual(
    snapshotMatch(expected.exec(input), expected.lastIndex),
  );
  expect(actual.lastIndex).toBe(expected.lastIndex);
}

describe('exec vs RegExp', () => {
  const cases: [string, string, string][] = [
    ['a', '', 'a'],
    ['a', '', 'b'],
    ['a', '', 'banana'],
    ['ab', '', 'xxabyy'],
    ['a|b', '', 'xbx'],
    ['a|ab', '', 'ab'],
    ['ab|a', '', 'ab'],
    ['(a)', '', 'xxa'],
    ['(a)(b)', '', 'zab'],
    ['(?:a)(b)', '', 'zab'],
    ['(a)|(b)', '', 'b'],
    ['(a)|(b)', '', 'a'],
    ['(a*)', '', 'aaa'],
    ['a*', '', ''],
    ['a*b', '', 'aaab'],
    ['a*b', '', 'aaac'],
    ['.*.*=.*', '', 'no equals here'],
    ['.*.*=.*', '', 'a=b'],
    ['.', '', '\n'],
    ['.', 's', '\n'],
    ['^a$', '', 'a'],
    ['^a$', 'm', 'b\na\nc'],
    ['\\bfoo\\b', '', 'a foo b'],
    ['\\Bfoo', '', 'afoo'],
    ['[abc]+', '', 'xxabcxx'],
    ['[^abc]+', '', 'abxyzcd'],
    ['[a-z0-9_]+', '', 'A_foo9_B'],
    ['[\\d]+', '', 'a123b'],
    ['[\\D]+', '', 'a123b'],
    ['[\\w]+', '', '!ab_9!'],
    ['[\\W]+', '', 'ab!? cd'],
    ['[\\s]+', '', 'a \t\n b'],
    ['[\\S]+', '', ' a b '],
    ['\\t\\n\\v\\f\\r', '', '\t\n\v\f\r'],
    ['\\x41\\u0042', '', 'AB'],
    ['\\cA', '', '\u0001'],
    ['\\0', '', '\u0000'],
    ['a{2}', '', 'aaa'],
    ['a{2,}', '', 'aaaa'],
    ['a{2,3}', '', 'aaaa'],
    ['a{2,3}?', '', 'aaaa'],
    ['a??', '', 'aa'],
    ['a+?', '', 'aaa'],
    ['(a|aa)?', '', 'aa'],
    ['(a|aa)+', '', 'aaa'],
    ['(a+)+', '', 'aaaa'],
    ['(a*)+', '', 'aa'],
    ['(a?)*', '', 'aa'],
    ['(a?)+', '', 'aa'],
    ['(a*)*', '', 'aa'],
    ['(a*)*', '', 'b'],
    ['(a|)*', '', ''],
    ['(a|)*', '', 'a'],
    ['(?:|a){0,2}', '', 'a'],
    ['(?:|a)*', '', 'aa'],
    ['(a?){2}', '', ''],
    ['(a?){2}', '', 'a'],
    ['(?:(a)|b)*', '', 'ab'],
    ['(?:(a)|b)*', '', 'ba'],
    ['((a)|b)*', '', 'ab'],
    ['(a|(b))*', '', 'ab'],
    ['(z)((a+)?(b+)?(c))*', '', 'zaacbbbcac'],
    ['(a*)b\\1+', '', 'baaaac'],
    ['(?<year>\\d{4})-(?<month>\\d\\d)', '', 'on 2024-03 and 1999-12'],
    ['(?<w>\\w+)\\s+\\k<w>', '', 'hey hey there'],
    ['(?=(a+))', '', 'baaabac'],
    ['(?=(a+))a*b\\1', '', 'baaabac'],
    ['(?!a)', '', 'a'],
    ['(?!a)', '', 'b'],
    ['(?!(a+))b', '', 'ab'],
    ['(.*?)a(?!(a+)b\\2c)\\2(.*)', '', 'baaabaac'],
    ['(?=a)a', '', 'a'],
    ['(?!a)b', '', 'b'],
    ['(?=(a))\\1', '', 'a'],
    ['x(?=y)', '', 'xy'],
    ['x(?!y)', '', 'xz'],
    ['(?:(?=(a))|b)*', '', 'ab'],
    ['(a)?b\\1', '', 'b'],
    ['(a)?b\\1', '', 'ab'],
    ['((a)|(b)){2}', '', 'ab'],
    ['(a)(b)?(c)?', '', 'a'],
    ['(a*)b', '', 'aaab'],
    ['(a*)*b', '', 'aaab'],
    ['(a*)+b', '', 'aaab'],
    ['(a|b)*abb', '', 'aabb'],
    ['(|a)*', '', 'aa'],
    ['(|a)+', '', 'aa'],
    ['((|a))*', '', 'aa'],
    ['(a|){0,2}', '', 'a'],
    ['((a)|b){0,2}', '', 'b'],
    ['(a?){0,3}', '', 'a'],
    ['(a*){0,2}', '', 'aa'],
    ['(a|b){1,3}', '', 'abab'],
    ['x{0}', '', 'x'],
    ['x{0}y', '', 'y'],
    ['(x){0}y', '', 'y'],
    ['((x)){0}y', '', 'y'],
    ['\\u{1F600}', 'u', '\u{1F600}'],
    ['\\u{1F600}', 'u', '\u{1F600}x'],
    ['\\uD83D\\uDE00', '', '\u{1F600}'],
    ['\\uD83D\\uDE00', 'u', '\u{1F600}'],
    ['.', 'u', '\u{1F600}'],
    ['.', '', '\u{1F600}'],
    ['[\\u{1F600}]', 'u', '\u{1F600}'],
    ['[\\uD83D\\uDE00]', '', '\u{1F600}'],
    ['[^\\u{1F600}]', 'u', 'a'],
    ['[^\\u{1F600}]', 'u', '\u{1F600}'],
    ['[a-z]', 'i', 'A'],
    ['[a-z]', 'i', 'Z'],
    ['[^a-z]', 'i', 'A'],
    ['k', 'iu', '\u212a'],
    ['[k]', 'iu', '\u212a'],
    ['[^k]', 'iu', '\u212a'],
    ['\u00df', 'iu', '\u1e9e'],
    ['[\u00df]', 'iu', '\u1e9e'],
    ['[^\u00df]', 'iu', '\u1e9e'],
    ['s', 'iu', '\u017f'],
    ['[\u017f]', 'iu', 's'],
    ['[\u017f]', 'i', 's'],
    ['\u2126', 'i', '\u03c9'],
    ['\u2126', 'iu', '\u03c9'],
    ['[\u2126]', 'i', '\u03c9'],
    ['[\u2126]', 'iu', '\u03c9'],
    ['[\u03c9]', 'i', '\u2126'],
    ['[\u03c9]', 'iu', '\u2126'],
    ['(?!\\u{1F600})', 'u', '\u{1F600}'],
    ['(?=\\u{1F600})', 'u', '\u{1F600}'],
    ['\\u{10400}', 'iu', '\u{10428}'],
    ['(\\u{10400})\\1', 'iu', '\u{10400}\u{10428}'],
    ['^', '', ''],
    ['$', '', ''],
    ['^$', '', ''],
    ['\\B', '', ''],
    ['a*?b', '', 'aaab'],
    ['(a*?)b', '', 'aaab'],
    ['(a|b)*?c', '', 'ababc'],
  ];

  for (const [pattern, flags, input] of cases) {
    it(`/${pattern}/${flags} on ${JSON.stringify(input)}`, () => {
      checkExec(pattern, flags, input);
    });
  }
});

describe('exec lastIndex', () => {
  it('global iteration', () => {
    const pattern = 'a';
    const flags = 'g';
    const input = 'banana';
    checkExec(pattern, flags, input, 0);
    checkExec(pattern, flags, input, 1);
    checkExec(pattern, flags, input, 2);
    checkExec(pattern, flags, input, 5);
    checkExec(pattern, flags, input, 6);
    checkExec(pattern, flags, input, 99);
    checkExec(pattern, flags, input, -3);
  });

  it('sticky', () => {
    for (let i = 0; i <= 6; i++) checkExec('a', 'y', 'banana', i);
    for (let i = 0; i <= 3; i++) checkExec('an', 'y', 'banana', i);
  });

  it('empty match does not advance lastIndex in exec', () => {
    const re = compile('x*', 'g');
    expect(re.exec('abc')).not.toBeNull();
    expect(re.lastIndex).toBe(0);
    expect(re.exec('abc')).not.toBeNull();
    expect(re.lastIndex).toBe(0);
  });

  it('no g/y leaves lastIndex untouched', () => {
    const re = compile('a');
    re.lastIndex = 42;
    re.exec('aaa');
    expect(re.lastIndex).toBe(42);
    re.exec('bbb');
    expect(re.lastIndex).toBe(42);
  });

  it('rounds lastIndex down out of surrogate pairs with u', () => {
    for (let i = 0; i <= 4; i++) checkExec('\\u{1F600}', 'gu', 'a\u{1F600}b', i);
    for (let i = 0; i <= 4; i++) checkExec('\\u{1F600}', 'yu', 'a\u{1F600}b', i);
  });

  it('converts odd lastIndex values like ToLength', () => {
    const expected = new RegExp('a', 'g');
    const actual = compile('a', 'g');
    for (const value of [NaN, -1, 1.9, '2', Infinity, 1e30]) {
      expected.lastIndex = value as number;
      actual.lastIndex = value as number;
      expect(snapshotMatch(actual.exec('banana'), actual.lastIndex)).toEqual(
        snapshotMatch(expected.exec('banana'), expected.lastIndex),
      );
    }
  });
});
