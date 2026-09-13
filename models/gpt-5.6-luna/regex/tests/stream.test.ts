import { describe, expect, it } from 'vitest';
import { compile } from '../src/index';

function nativeMatches(pattern: string, flags: string, input: string) {
  const regex = new RegExp(pattern, flags.includes('g') ? flags : `${flags}g`);
  const result: Array<{ index: number; captures: string[]; groups: Record<string, string | undefined> }> = [];
  while (true) {
    const match = regex.exec(input);
    if (!match) break;
    result.push({ index: match.index, captures: [...match], groups: match.groups ?? {} });
    if (match[0] === '') {
      const unit = flags.includes('u') && match.index < input.length
        ? (input.codePointAt(match.index) as number) > 0xffff
          ? 2
          : 1
        : 1;
      regex.lastIndex = match.index + unit;
    }
  }
  return result;
}

describe('streaming', () => {
  it('returns only stable matches at chunk boundaries', () => {
    const stream = compile('\\d+').stream();
    expect(stream.feed('12')).toEqual([]);
    expect(stream.feed('3x4')).toEqual([
      { index: 0, captures: ['123'], groups: {} },
    ]);
    expect(stream.feed('5')).toEqual([]);
    expect(stream.end()).toEqual([
      { index: 4, captures: ['45'], groups: {} },
    ]);
  });

  it('distinguishes alternatives whose result can still grow', () => {
    const first = compile('a|ab').stream();
    expect(first.feed('a')).toEqual([{ index: 0, captures: ['a'], groups: {} }]);
    expect(first.feed('b')).toEqual([]);
    expect(first.end()).toEqual([]);

    const second = compile('ab|a').stream();
    expect(second.feed('a')).toEqual([]);
    expect(second.feed('b')).toEqual([{ index: 0, captures: ['ab'], groups: {} }]);
    expect(second.end()).toEqual([]);
  });

  it('defers end-sensitive matches', () => {
    const stream = compile('a$').stream();
    expect(stream.feed('a')).toEqual([]);
    expect(stream.feed('b')).toEqual([]);
    expect(stream.end()).toEqual([]);

    const atEnd = compile('a$').stream();
    expect(atEnd.feed('a')).toEqual([]);
    expect(atEnd.end()).toEqual([{ index: 0, captures: ['a'], groups: {} }]);

    const withNewline = compile('a$').stream();
    expect(withNewline.feed('a\n')).toEqual([]);
    expect(withNewline.end()).toEqual([]);
  });

  it('handles empty matches and split surrogate pairs', () => {
    const stream = compile('a*?').stream();
    const actual = [...stream.feed('a'), ...stream.end()];
    expect(actual).toEqual(nativeMatches('a*?', '', 'a'));

    const emoji = compile('.+', 'u').stream();
    expect(emoji.feed('\ud83d')).toEqual([]);
    expect(emoji.end()).toEqual([{ index: 0, captures: ['\ud83d'], groups: {} }]);
    const split = compile('.+', 'u').stream();
    expect(split.feed('\ud83d')).toEqual([]);
    expect(split.feed('\ude00')).toEqual([]);
    expect(split.end()).toEqual([{ index: 0, captures: ['😀'], groups: {} }]);
    const single = compile('.', 'u').stream();
    expect(single.feed('\ud83d')).toEqual([]);
    expect(single.feed('\ude00')).toEqual([{ index: 0, captures: ['😀'], groups: {} }]);
    const emptyUnicode = compile('', 'u').stream();
    expect([...emptyUnicode.feed('😀'), ...emptyUnicode.end()]).toEqual([
      { index: 0, captures: [''], groups: {} },
      { index: 2, captures: [''], groups: {} },
    ]);
  });

  it('is independent from lastIndex and matches complete global execution', () => {
    const regex = compile('(a+)', 'g');
    regex.lastIndex = 99;
    const stream = regex.stream();
    const input = 'baaaacaa';
    const actual = [...stream.feed('baa'), ...stream.feed('aac'), ...stream.feed('aa'), ...stream.end()];
    expect(actual).toEqual(nativeMatches('(a+)', 'g', input));
    expect(regex.lastIndex).toBe(99);
  });

  it('processes two megabytes of digit chunks linearly', () => {
    const stream = compile('\\d+').stream();
    const chunk = '7'.repeat(1024);
    const started = performance.now();
    for (let count = 0; count < 2048; count += 1) stream.feed(chunk);
    const matches = stream.end();
    expect(matches).toHaveLength(1);
    expect(matches[0].captures[0]).toHaveLength(2 * 1024 * 1024);
    expect(performance.now() - started).toBeLessThan(2_000);
  });

  it('agrees with global execution when every chunk is one code unit', () => {
    for (const [pattern, flags, input] of [
      ['a+', '', 'baaacaa'],
      ['a*?', '', 'aba'],
      ['ab|a', '', 'aba'],
      ['(a|b)+', '', 'xxabbaa'],
      ['^a', 'm', 'x\na'],
      ['a$', 'm', 'a\nb'],
      ['\\b', 'u', 'a😀 b'],
      ['.', 'u', 'a😀b'],
      ['(?=(a+))a', '', 'aaaa'],
      ['(a)\\1', '', 'aaaa'],
    ]) {
      const stream = compile(pattern, flags).stream();
      const actual: unknown[] = [];
      for (const unit of input) actual.push(...stream.feed(unit));
      actual.push(...stream.end());
      expect(actual, `${pattern}/${flags}/${input}`).toEqual(nativeMatches(pattern, flags, input));
    }
  });
});
