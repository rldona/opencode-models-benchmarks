// Textos grandes deterministas para los casos de rendimiento (los usan el generador y la suite oculta), y la
// huella con la que se comparan listas de coincidencias muy largas sin guardarlas en cases.json.

function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return s / 4294967296;
  };
}

// spec: { parts: [[texto, repeticiones], ...] }  o  { words: { seed, length, kind } }
export function makeText(spec) {
  if (spec.parts) return spec.parts.map(([s, n]) => s.repeat(n)).join('');
  const { seed, length, kind } = spec.words;
  const rnd = lcg(seed);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  const word = (min, max) => {
    const n = min + Math.floor(rnd() * (max - min + 1));
    let w = '';
    for (let i = 0; i < n; i++) w += letters[Math.floor(rnd() * 26)];
    return w;
  };
  const num = () => String(Math.floor(rnd() * 1e6));
  const out = [];
  let len = 0;
  while (len < length) {
    let t;
    const r = rnd();
    if (kind === 'emails') t = r < 0.1 ? `${word(2, 8)}@${word(3, 7)}.com` : r < 0.15 ? `${word(2, 5)}@${word(2, 4)}.org` : word(1, 9);
    else t = r < 0.3 ? num() : r < 0.35 ? `x${num()}` : word(1, 8);
    t += pick([' ', ' ', ' ', ', ', '\n', '. ']);
    out.push(t);
    len += t.length;
  }
  return out.join('').slice(0, length);
}

export function chunksOf(text, size) {
  const out = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

// FNV-1a de 32 bits sobre cada coincidencia serializada (índice, capturas y grupos): huella de listas largas.
export function digest(matches) {
  let h = 0x811c9dc5;
  for (const m of matches) {
    const s = JSON.stringify(m);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return { count: matches.length, hash: h.toString(16) };
}
