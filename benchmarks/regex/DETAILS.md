# regex — Detalle de la nota

Generado por `node scripts/bench.mjs report`. Cómo se calcula: [RUBRIC.md](RUBRIC.md).

## Ranking

| # | Modelo | Nota | Corrección /6 | Autonomía /1 | Tests propios /1 | Código /1.5 | Robustez /0.5 | Penalización |
|---|---|---|---|---|---|---|---|---|
| 1 | DeepSeek V4.1 Flash | **8.7** | 5.91 | 1 | 0.95 | 1.35 | 0.5 | -1 |

## DeepSeek V4.1 Flash — 8.7

> Implementación muy sólida: motor propio (sin depender del RegExp del lenguaje salvo validaciones auxiliares) con backtracking memoizado para garantizar tiempo lineal y un motor NFA incremental genuino para streaming, tipos a nivel de tipos correctos y tests exhaustivos comparados contra RegExp nativo. El defecto más relevante es que el streaming con el flag 'y' se degrada a un modo buffer-and-wait que no entrega coincidencias a tiempo ni limita la memoria usada, sin que los propios tests lo detecten.

- **Corrección** 5.91/6: suite oculta 554/561 (main: 2 caso(s) colgaron o tumbaron el proceso y se aislaron (285, 379)) · por bloque (ponderados): **semantica 351/355** (40) · rendimiento 14/14 (20) · streaming 77/77 (15) · **tipos 40/43** (15) · retro 72/72 (10) — capturas 37/37 · cuantificadores 19/19 · alternancia 8/8 · **clases 23/25** · anclas 19/19 · flags 14/14 · mayusculas 38/38 · unicode 23/23 · retro 22/22 · lookahead 15/15 · sintaxis 22/22 · **azar 148/150** · azar-retro 35/35 · streaming 45/45 · a-tiempo 32/32 · rendimiento 14/14 · **tipos 40/43**
- **Autonomía** 1/1: 0 intervención(es) del usuario (empezó en modo plan; la aprobación del plan no cuenta)
- **Tests propios** 0.95/1: pasan 0.25/0.25 (349/349) · cobertura 0.25/0.25 · cantidad 0.25/0.25 · calidad 0.2/0.25 (8/10)
- **Código** 1.35/1.5 (9/10)
- **Robustez** 0.5/0.5 · **Penalización** -1 (usa el motor de expresiones del lenguaje en tareas auxiliares: src/parser.ts líneas 336, 371, 390, 426 y 456: usa literales /regex/.test(...) solo para validar identificadores de nombre de grupo y dígitos hexadecimales de escapes, no para hacer coincidir el patrón de entrada.)
- Cobertura de lo pedido: ✅ capturasRepeticion · ✅ perezososCodiciosos · ✅ mayusculas · ✅ paresSustitutos · ✅ lastIndex · ✅ tiempoLineal · ✅ streaming · ✅ tipos

**Código**

- + Arquitectura en fases limpia: parser a AST, compilador a bytecode tipo VM (Save/Clear/Split/Loop/LoopBack/SetReg/EmptyCheck), y dos motores de ejecución bien separados.
- + Backtracker con memoización de estados (pc, pos) fallidos/activos que garantiza tiempo lineal cuando no hay backreferences ni lookahead, incluyendo un análisis de qué instrucciones son 'sensibles a registro' (dependientes de la iteración del bucle) para excluirlas de la memoización de forma correcta.
- + Motor de streaming (NfaStream) es una auténtica simulación Thompson-NFA incremental con hilos, pausas en asserts que dependen de más texto, y compactación del buffer reteniendo solo lo necesario; no es un buffer-and-reprocess.
- + Semántica de ECMAScript centralizada (canonicalización de 'i' con y sin 'u', puntos de código con pares sustitutos, limpieza de capturas por iteración) en chars.ts/casefold.ts, sin duplicación evidente ni 'any'.
- − stream() cae a BufferedStream (que acumula todo el buffer y no libera matches hasta end()) en cuanto el patrón tiene el flag 'y', aunque no tenga backreferences ni lookahead, incumpliendo el requisito de entrega temprana y de guardar solo el texto necesario para ese caso.
- − El mismo fallback se activa si loopCount > 30, un límite arbitrario no documentado en el enunciado que podría afectar a patrones complejos legítimos.
- − Alguna duplicación entre Backtracker.search/matchAt (construcción de captures, normalización unicode) que podría factorizarse.

**Tests**

- + La mayoría de los tests de exec/sintaxis comparan directamente contra el RegExp nativo (incluyendo lastIndex), lo que da valores esperados independientes de la implementación.
- + Tests de streaming muy rigurosos: comparan contra matchAll con distintos tamaños de trozo y además verifican el momento exacto de entrega feed a feed (p. ej. 'waits while a greedy repetition could still extend', '\d+' definitividad, división de pares sustitutos entre chunks).
- + Casos límite bien cubiertos: mayúsculas Unicode con 'i'/'iu' (ẞ, Kelvin sign, ſ, Ω), backreferences a grupos no participantes, lastIndex con valores fuera de rango tipo ToLength, patrones inválidos variados.
- + Test de rendimiento explícito para streaming (2MB en chunks de 1KB) y para tiempo lineal con los tres patrones patológicos del enunciado más 'a*b' sobre 100k caracteres.
- − Los tests de tipos no usan aserciones de igualdad de tipos (p. ej. expectTypeOf); solo asignan a variables anotadas, lo que no detecta si un campo que debería ser 'string' es en realidad más amplio.
- − No hay ningún test que distinga el comportamiento de streaming con flag 'y' en cuanto al momento exacto de entrega (el test de sticky solo compara el resultado final agregado), por lo que no detecta el bug de BufferedStream para ese caso.

**Bugs detectados por el juez**

- 🐛 stream() con el flag 'y' usa BufferedStream incluso sin backreferences ni lookahead: todas las coincidencias se retrasan hasta end() y se guarda el texto completo en memoria, en vez de entregarlas en cuanto son definitivas y liberar el buffer no necesario (src/regex.ts líneas 72-82).
- 🐛 El mismo fallback a BufferedStream se dispara cuando loopCount > 30, un límite interno no derivado del enunciado que penaliza patrones legítimos con muchas repeticiones anidadas.

**Casos de la suite oculta que fallan**

- ✗ [072] clase vacía no coincide nunca
- ✗ [073] [^] coincide con todo
- ✗ [285] azar $|(?:[a-c]?)*(b)b?? /i
- ✗ [379] azar (b{0,2}((?<g3>$.*?c|b?)+?b??)?)(?:c) /
- ✗ [538] alternativa dentro del grupo: el grupo es obligatorio
- ✗ [539] alternativa con rama vacía dentro del grupo
- ✗ [540] grupo en una rama de un grupo

<sub>Juez: claude:sonnet · 2026-09-11 19:40 · adaptador: [results/deepseek-v4.1-flash.adapter.ts](results/deepseek-v4.1-flash.adapter.ts)</sub>
