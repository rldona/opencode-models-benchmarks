import { compile } from '../build-tmp/src/index.js';

const cases = [
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

function normalize(m, lastIndex) {
  if (m === null) return { index: -1, captures: [], groups: {}, lastIndex };
  if (Array.isArray(m)) {
    return {
      index: m.index,
      captures: Array.from(m).map((x) => (x === undefined ? undefined : x)),
      groups: m.groups ? { ...m.groups } : {},
      lastIndex,
    };
  }
  return { index: m.index, captures: [...m.captures], groups: { ...m.groups }, lastIndex };
}

const from = Number(process.argv[2] ?? 0);
const to = Number(process.argv[3] ?? cases.length);
let failures = 0;
for (let i = from; i < to; i++) {
  const [pattern, flags, input] = cases[i];
  console.log(`#${i} /${pattern}/${flags} on ${JSON.stringify(input)}`);
  try {
    const expected = new RegExp(pattern, flags);
    const actual = compile(pattern, flags);
    const em = expected.exec(input);
    const am = actual.exec(input);
    const es = normalize(em, expected.lastIndex);
    const as = normalize(am, actual.lastIndex);
    if (JSON.stringify(es) !== JSON.stringify(as)) {
      failures++;
      console.log('  MISMATCH');
      console.log('    expected', JSON.stringify(es));
      console.log('    actual  ', JSON.stringify(as));
    }
  } catch (e) {
    failures++;
    console.log('  THREW', e.message);
    console.log(e.stack);
    break;
  }
}
console.log(failures === 0 ? 'ALL OK' : `FAILURES: ${failures}`);
