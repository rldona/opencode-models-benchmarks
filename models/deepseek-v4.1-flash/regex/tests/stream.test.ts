import { describe, expect, it } from 'vitest';
import { compile } from '../src/index.js';

interface SimpleMatch {
  index: number;
  captures: (string | undefined)[];
  groups: Record<string, string | undefined>;
}

function simple(m: {
  index: number;
  captures: readonly (string | undefined)[];
  groups: Record<string, string | undefined>;
}): SimpleMatch {
  return { index: m.index, captures: [...m.captures], groups: { ...m.groups } };
}

function expectedMatchAll(pattern: string, flags: string, text: string): SimpleMatch[] {
  const re = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g');
  return [...text.matchAll(re)].map((m) =>
    simple({
      index: m.index,
      captures: Array.from(m).map((x) => (x === undefined ? undefined : x)),
      groups: m.groups ? { ...m.groups } : {},
    }),
  );
}

function streamAll(pattern: string, flags: string, text: string, chunkSize: number): SimpleMatch[] {
  const stream = compile(pattern, flags).stream();
  const out: SimpleMatch[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    for (const m of stream.feed(text.slice(i, i + chunkSize))) out.push(simple(m));
  }
  for (const m of stream.end()) out.push(simple(m));
  return out;
}

describe('stream matches matchAll', () => {
  const cases: [string, string, string][] = [
    ['a', '', 'banana'],
    ['\\d+', '', 'a1b22c333'],
    ['\\d+', 'g', 'a1b22c333'],
    ['a*', '', 'aa b aaa'],
    ['a*?', '', 'aa b aaa'],
    ['(ab|a)+', '', 'ababa'],
    ['(a?)*', '', 'aaa'],
    ['(?<w>\\w+)', '', 'hola mundo'],
    ['\\b\\w+\\b', 'g', 'uno dos tres'],
    ['^', 'm', 'a\nb\nc'],
    ['$', 'm', 'a\nb\nc'],
    ['.', 'su', 'a\u{1F600}b\nc'],
    ['.', 'gu', 'a\u{1F600}b\nc'],
    ['[^a]', '', 'a\u{1F600}a'],
    ['\\u{1F600}', 'u', 'x\u{1F600}y\u{1F600}'],
    ['(\\u{1F600})', 'u', 'x\u{1F600}y'],
    ['\\B', 'u', '\u{1F600}a'],
    ['(?:)', '', 'abc'],
    ['(?:a?)', '', 'aab'],
    ['(\\d)(\\d)?', '', 'a12b3'],
    ['(a)|(b)', '', 'abba'],
    ['((a)|b)*', '', 'abba'],
    ['(a*)b', '', 'aaab b'],
    ['x(?=y)', '', 'xy xx'],
    ['(a)\\1', '', 'aa ab a'],
    ['(\\w+) \\1', '', 'hola hola adios'],
  ];

  for (const [pattern, flags, text] of cases) {
    for (const chunkSize of [1, 2, 3, 7, 1000]) {
      it(`/${pattern}/${flags} on ${JSON.stringify(text)} in chunks of ${chunkSize}`, () => {
        expect(streamAll(pattern, flags, text, chunkSize)).toEqual(
          expectedMatchAll(pattern, flags, text),
        );
      });
    }
  }
});

describe('stream definitiveness timing', () => {
  it('returns a match as soon as no future text can change it', () => {
    const stream = compile('a').stream();
    expect(stream.feed('a')).toHaveLength(1);
    expect(stream.feed('b')).toHaveLength(0);
    expect(stream.feed('c')).toHaveLength(0);
    expect(stream.end()).toHaveLength(0);
  });

  it('waits for the character that completes a match', () => {
    const stream = compile('ab').stream();
    expect(stream.feed('a')).toEqual([]);
    const [m] = stream.feed('b');
    expect(m).toBeDefined();
    expect(m!.index).toBe(0);
    expect(m!.captures[0]).toBe('ab');
    expect(stream.end()).toEqual([]);
  });

  it('waits while a greedy repetition could still extend', () => {
    const stream = compile('a*').stream();
    expect(stream.feed('aa')).toEqual([]);
    const first = stream.feed('b');
    expect(first).toHaveLength(2);
    expect(first[0]!.index).toBe(0);
    expect(first[0]!.captures[0]).toBe('aa');
    expect(first[1]!.index).toBe(2);
    expect(first[1]!.captures[0]).toBe('');
    expect(stream.feed('aa')).toEqual([]);
    const last = stream.end();
    expect(last).toHaveLength(2);
    expect(last[0]!.index).toBe(3);
    expect(last[0]!.captures[0]).toBe('aa');
    expect(last[1]!.index).toBe(5);
    expect(last[1]!.captures[0]).toBe('');
  });

  it('returns \\d+ runs only when they are known to be complete', () => {
    const stream = compile('\\d+').stream();
    expect(stream.feed('ab12')).toEqual([]);
    const runs = stream.feed('34c');
    expect(runs).toHaveLength(1);
    expect(runs[0]!.index).toBe(2);
    expect(runs[0]!.captures[0]).toBe('1234');
    expect(stream.feed('56')).toEqual([]);
    const tail = stream.end();
    expect(tail).toHaveLength(1);
    expect(tail[0]!.index).toBe(7);
    expect(tail[0]!.captures[0]).toBe('56');
  });

  it('handles lookahead priority across chunks', () => {
    const stream = compile('ab|a').stream();
    expect(stream.feed('a')).toEqual([]);
    const matches = stream.feed('b');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.captures[0]).toBe('ab');
  });

  it('does not use or change lastIndex', () => {
    const re = compile('a', 'g');
    re.lastIndex = 7;
    const stream = re.stream();
    expect(stream.feed('banana')).toHaveLength(3);
    expect(re.lastIndex).toBe(7);
    expect(stream.end()).toHaveLength(0);
    expect(re.lastIndex).toBe(7);
  });
});

describe('stream surrogate splitting', () => {
  it('joins surrogate pairs split across chunks with u', () => {
    const stream = compile('\\u{1F600}', 'u').stream();
    expect(stream.feed('\uD83D')).toEqual([]);
    const [m] = stream.feed('\uDE00');
    expect(m).toBeDefined();
    expect(m!.index).toBe(0);
    expect(m!.captures[0]).toBe('\u{1F600}');
    expect(stream.end()).toEqual([]);
  });

  it('treats lone surrogates as characters with u', () => {
    const stream = compile('.', 'u').stream();
    const [m] = stream.feed('\uD83D');
    expect(m).toBeUndefined();
    const [m2] = stream.end();
    expect(m2).toBeDefined();
    expect(m2!.captures[0]).toBe('\uD83D');
  });

  it('. with u matches whole code points', () => {
    const stream = compile('.', 'u').stream();
    expect(stream.feed('\uD83D')).toEqual([]);
    const [m] = stream.feed('\uDE00');
    expect(m).toBeDefined();
    expect(m!.captures[0]).toBe('\u{1F600}');
  });

  it('keeps empty-match advancement code-point aware with u', () => {
    const text = 'a\u{1F600}b';
    expect(streamAll('\\w*?', 'gu', text, 1)).toEqual(expectedMatchAll('\\w*?', 'gu', text));
  });
});

describe('stream captures', () => {
  it('extracts captures for matches finalized by the NFA', () => {
    const stream = compile('(?<key>\\w+)=(\\d+)').stream();
    const out = [];
    for (const m of stream.feed('foo=12 ba')) out.push(simple(m));
    for (const m of stream.end()) out.push(simple(m));
    const expected = expectedMatchAll('(?<key>\\w+)=(\\d+)', '', 'foo=12 ba');
    expect(out).toEqual(expected);
  });

  it('defers backreference matches to end without changing results', () => {
    const pattern = '(\\w+) \\1';
    const text = 'hola hola adios adios';
    const stream = compile(pattern).stream();
    const out: SimpleMatch[] = [];
    for (const m of stream.feed(text.slice(0, 5))) out.push(simple(m));
    for (const m of stream.feed(text.slice(5))) out.push(simple(m));
    for (const m of stream.end()) out.push(simple(m));
    expect(out).toEqual(expectedMatchAll(pattern, '', text));
  });

  it('honours sticky semantics when the pattern has y', () => {
    expect(streamAll('a', 'y', 'banana', 3)).toEqual(expectedMatchAll('a', 'y', 'banana'));
    expect(streamAll('b', 'y', 'banana', 2)).toEqual(expectedMatchAll('b', 'y', 'banana'));
    expect(streamAll('a', 'gy', 'aab', 1)).toEqual(expectedMatchAll('a', 'gy', 'aab'));
  });

  it('defers lookahead matches to end without changing results', () => {
    const pattern = 'a(?=b)';
    const text = 'ab ac ab';
    const stream = compile(pattern).stream();
    const out: SimpleMatch[] = [];
    for (const m of stream.feed('ab ac ')) out.push(simple(m));
    for (const m of stream.feed('ab')) out.push(simple(m));
    for (const m of stream.end()) out.push(simple(m));
    expect(out).toEqual(expectedMatchAll(pattern, '', text));
  });
});

describe('stream performance', () => {
  it('processes 2MB in 1KB chunks with \\d+ in under 2 seconds', () => {
    const text = '1'.repeat(2 * 1024 * 1024);
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += 1024) chunks.push(text.slice(i, i + 1024));
    const start = Date.now();
    const stream = compile('\\d+').stream();
    let count = 0;
    for (const chunk of chunks) count += stream.feed(chunk).length;
    count += stream.end().length;
    const elapsed = Date.now() - start;
    expect(count).toBe(1);
    expect(elapsed).toBeLessThan(2000);
  });
});
