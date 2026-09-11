// Ejecuta especificaciones de casos con el RegExp del motor que lo corre. El mismo fichero se usa en V8 (node,
// importado) y en JavaScriptCore (jsc runner.js -- specs.json), para quedarse solo con los casos en los que ambos
// motores coinciden: así la suite mide la especificación y no las peculiaridades de un motor.
//   spec exec:   { pattern, flags, steps: [{ input, lastIndex? }] }  → { steps: [{ m, li }] } | { error }
//   spec props:  { pattern, flags, props: true }                     → { source, flags } | { error }
//   spec all:    { pattern, flags, text }                            → { all: [m…] } (matchAll con g añadido)
// Las capturas undefined se codifican como null (JSON).

function encMatch(m) {
  if (!m) return null;
  var caps = [];
  for (var i = 0; i < m.length; i++) caps.push(m[i] === undefined ? null : m[i]);
  var groups = {};
  if (m.groups) {
    var keys = Object.keys(m.groups).sort();
    for (var k = 0; k < keys.length; k++) groups[keys[k]] = m.groups[keys[k]] === undefined ? null : m.groups[keys[k]];
  }
  return { index: m.index, captures: caps, groups: groups };
}

function runSpec(spec) {
  var re;
  try {
    re = new RegExp(spec.pattern, spec.flags);
  } catch (e) {
    return { error: e.name };
  }
  if (spec.props) return { source: re.source, flags: re.flags };
  if (spec.text !== undefined) {
    var g = new RegExp(spec.pattern, spec.flags.indexOf('g') >= 0 ? spec.flags : spec.flags + 'g');
    var all = [];
    var it = spec.text.matchAll(g);
    for (var r = it.next(); !r.done; r = it.next()) all.push(encMatch(r.value));
    return { all: all };
  }
  var steps = [];
  for (var s = 0; s < spec.steps.length; s++) {
    var st = spec.steps[s];
    if (st.lastIndex !== undefined) re.lastIndex = st.lastIndex;
    var m = re.exec(st.input);
    steps.push({ m: encMatch(m), li: re.lastIndex });
  }
  return { steps: steps };
}

function runAll(specs) {
  var out = [];
  for (var i = 0; i < specs.length; i++) out.push(runSpec(specs[i]));
  return out;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { runSpec: runSpec, runAll: runAll, encMatch: encMatch };
} else if (typeof readFile === 'function') {
  // JavaScriptCore: jsc engine-runner.js -- entrada.json
  print(JSON.stringify(runAll(JSON.parse(readFile(arguments[0])))));
}
