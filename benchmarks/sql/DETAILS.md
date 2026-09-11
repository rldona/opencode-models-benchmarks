# sql — Detalle de la nota

Generado por `node scripts/bench.mjs report`. Cómo se calcula: [RUBRIC.md](RUBRIC.md).

## Ranking

| # | Modelo | Nota | Corrección /5 | Autonomía /1 | Tests propios /1.5 | Código /2 | Robustez /0.5 | Penalización |
|---|---|---|---|---|---|---|---|---|
| 1 | DeepSeek V4.1 Flash | **9.8** | 5 | 1 | 1.46 | 1.8 | 0.5 |  |
| 2 | GPT-5.6 Luna | **9.6** | 4.97 | 1 | 1.46 | 1.8 | 0.35 |  |
| 3 | Muse Spark 1.3 Contributor | **9.5** | 5 | 1 | 1.43 | 1.6 | 0.5 |  |
| 4 | Hy4 preview\* | **8.5**\* | 4.97 | 0 | 1.46 | 1.8 | 0.25 |  |

## DeepSeek V4.1 Flash — 9.8

> Implementación muy sólida y fiel a la semántica de SQLite: arquitectura en fases claras, manejo centralizado de NULL/tipos numéricos, joins por hash para cumplir el rendimiento exigido, y una suite de tests exhaustiva con aserciones exactas que cubre todos los escenarios pedidos y varios adicionales.

- **Corrección** 5/5: suite oculta 173/173 — expr 37/37 · null 27/27 · where 21/21 · join 25/25 · group 25/25 · order 22/22 · error 11/11 · perf 5/5
- **Autonomía** 1/1: 0 intervención(es) del usuario (empezó en modo plan; la aprobación del plan no cuenta)
- **Tests propios** 1.46/1.5: pasan 0.38/0.375 (64/64) · cobertura 0.38/0.375 · cantidad 0.38/0.375 · calidad 0.34/0.375 (9/10)
- **Código** 1.8/2 (9/10)
- **Robustez** 0.5/0.5
- Cobertura de lo pedido: ✅ nullNotInAgregados · ✅ leftJoin · ✅ groupByHaving · ✅ orderByNullsLimit · ✅ divisionEnteraReal · ✅ rendimiento

**Código**

- + Fases claras: lexer, parser recursivo-descendente a AST tipado, paso de binding/resolución separado y evaluador
- + Semántica de NULL, enteros/reales y comparación de tres valores centralizada en values.ts, sin duplicación por operador
- + JOIN por igualdad implementado con hash map (extractEquality + hashKey) en vez de bucle anidado, cumpliendo el requisito de rendimiento
- + TypeScript estricto sin 'any', tipos precisos para el AST y los valores (boxeo mínimo de reales enteros para distinguir INTEGER/REAL)
- − El AST usa una interfaz Expr única con muchos campos opcionales en vez de una unión discriminada, lo que reduce algo la seguridad de tipos
- − El binder muta el AST in-place (bound, index, hasAgg) mezclando resolución y estructura, dificultando reutilizar el AST parseado
- − Alguna duplicación entre bindInner/substituteAliases/containsAggregate/collectIndexes, cuatro recorridos recursivos similares del árbol

**Tests**

- + Aserciones exactas sobre filas y columnas en todos los casos, sin depender de toBeDefined ni conteos
- + Cobertura amplia más allá de lo pedido: precedencia exacta de operadores, columnas duplicadas, identificadores entre comillas, DISTINCT multicolumna, GROUP BY por posición, aridad de funciones
- + Casos de error bien probados (tabla/columna inexistente, ambigüedad, función desconocida, agregado mal usado, ORDER/GROUP BY fuera de rango)
- + Test de rendimiento realista con límite de tiempo y verificación del tamaño del resultado
- − No hay test de LEFT JOIN con múltiples tablas encadenadas ni de subconsultas/UNION (aunque no eran obligatorias)
- − Falta algún caso de ROUND con negativos de dígitos o números muy grandes cerca del límite de precisión

<sub>Juez: claude:sonnet · 2026-09-11 15:54 · adaptador: [results/deepseek-v4.1-flash.adapter.ts](results/deepseek-v4.1-flash.adapter.ts)</sub>

## GPT-5.6 Luna — 9.6

> Implementación sólida y bien estructurada (lexer/parser/AST/evaluador separados, semántica numérica centralizada, JOIN con hash) que pasa sus 12 tests, incluidos los de rendimiento; los tests tienen aserciones exactas y cubren con creces lo pedido por el enunciado, con solo una pequeña desviación de precedencia entre operadores de comparación relacionales y de igualdad.

- **Corrección** 4.97/5: suite oculta 172/173 — **expr 36/37** · null 27/27 · where 21/21 · join 25/25 · group 25/25 · order 22/22 · error 11/11 · perf 5/5
- **Autonomía** 1/1: 0 intervención(es) del usuario (empezó en modo plan; la aprobación del plan no cuenta)
- **Tests propios** 1.46/1.5: pasan 0.38/0.375 (12/12) · cobertura 0.38/0.375 · cantidad 0.38/0.375 · calidad 0.34/0.375 (9/10)
- **Código** 1.8/2 (9/10)
- **Robustez** 0.35/0.5
- Cobertura de lo pedido: ✅ nullNotInAgregados · ✅ leftJoin · ✅ groupByHaving · ✅ orderByNullsLimit · ✅ divisionEnteraReal · ✅ rendimiento

**Código**

- + Fases claras y separadas: lexer, parser recursivo a AST tipado, resolución de columnas/fuentes y evaluación
- + Semántica de entero/real centralizada con un tipo RealValue y funciones numericValue/textValue/compareValues/makeNumber reutilizadas en todo el evaluador
- + JOIN por igualdad implementado con hash map (findEquiJoin + Map de claves) con fallback a bucle anidado cuando no hay igualdad, cumpliendo el requisito de rendimiento
- + Validación de columnas ambiguas, funciones desconocidas, mal uso de agregados y posición de ORDER BY fuera de rango con mensajes de error claros
- − La precedencia de '< <= > >=' frente a '= == != <> IS IN LIKE BETWEEN' se colapsa en una única función parseComparison sin bucle, por lo que en la práctica solo admite una comparación por expresión en vez de dos niveles de precedencia distintos como en SQLite
- − Un único archivo de ~1930 líneas sin dividir en módulos, lo que dificulta la navegación

**Tests**

- + Aserciones exactas sobre columnas y filas (toEqual) en todos los tests, no solo conteos
- + Cubre explícitamente todos los escenarios pedidos por el enunciado más casos límite adicionales: precedencia de operadores, CASE con/sin base, LIKE, BETWEEN, DISTINCT, columnas repetidas con tabla.*, identificadores entre comillas, y varios errores (columna ambigua, agregado mal usado, función desconocida, posición de ORDER BY fuera de rango)
- + Test de rendimiento reproduce exactamente el escenario del enunciado (100.000 filas JOIN 5.000 y GROUP BY en 5.000 grupos) con límite de 2s cada uno
- + Nombres de test descriptivos que documentan el comportamiento esperado
- − Todos los tests viven en un único describe/archivo; podría beneficiarse de más granularidad para localizar fallos

**Bugs detectados por el juez**

- 🐛 parseComparison no es un bucle, así que solo permite una comparación por subexpresión: una expresión con dos operadores de comparación relacional distintos encadenados (p. ej. 'a < b = c') deja un token sin consumir y lanza error de sintaxis en vez de aplicar los dos niveles de precedencia de SQLite

**Casos de la suite oculta que fallan**

- ✗ [012] precedencia < sobre =

<sub>Juez: claude:sonnet · 2026-09-11 16:01 · adaptador: [results/gpt-5.6-luna.adapter.ts](results/gpt-5.6-luna.adapter.ts)</sub>

## Muse Spark 1.3 Contributor — 9.5

> Implementación sólida y bien fasificada (tokenizer/parser/binding/eval/executor) con semántica SQLite cuidada (NULL, enteros/reales, LIKE, hash join) y batería de tests con aserciones exactas que cubre todos los escenarios pedidos, incluido el de rendimiento; el código pierde algo de nitidez por comentarios de razonamiento sin resolver y un executor monolítico.

- **Corrección** 5/5: suite oculta 173/173 — expr 37/37 · null 27/27 · where 21/21 · join 25/25 · group 25/25 · order 22/22 · error 11/11 · perf 5/5
- **Autonomía** 1/1: 0 intervención(es) del usuario (empezó en modo plan; la aprobación del plan no cuenta)
- **Tests propios** 1.43/1.5: pasan 0.38/0.375 (33/33) · cobertura 0.38/0.375 · cantidad 0.38/0.375 · calidad 0.3/0.375 (8/10)
- **Código** 1.6/2 (8/10)
- **Robustez** 0.5/0.5
- Cobertura de lo pedido: ✅ nullNotInAgregados · ✅ leftJoin · ✅ groupByHaving · ✅ orderByNullsLimit · ✅ divisionEnteraReal · ✅ rendimiento

**Código**

- + Fases claras: tokenizer, parser a AST, resolución/binding de columnas separada, evaluación (evalRow/evalGroup) y ejecución en executor.ts.
- + Tipo Val etiquetado (int/real/text/null) que centraliza la semántica de NULL, tres valores y enteros vs reales en value.ts, sin dispersarla por los operadores.
- + JOIN por igualdad implementado con hash join (Map) y fallback a nested loop solo para condiciones no equi; GROUP BY con Map, ambos O(n), cumpliendo el requisito de rendimiento.
- + LIKE implementado con backtracking manual (no regex), ROUND/round-half-away-from-zero y conversión texto-número replican matices de SQLite.
- − Numerosos comentarios largos de "pensamiento en voz alta" sobre casos límite dudosos (alias duplicados, columnas duplicadas) que deberían resolverse en código o eliminarse, no dejarse como notas de incertidumbre.
- − Uso de casts `as unknown as {...}` para adjuntar `__flatIdx` a los nodos AST en vez de tiparlo en la interfaz Expr.
- − executor.ts es un módulo grande (700+ líneas) que mezcla expansión de SELECT, ORDER BY, LIMIT/OFFSET y ejecución de FROM sin separarlos en módulos propios.

**Tests**

- + Aserciones exactas sobre filas y columnas (no solo conteos), con casos independientes del motor (valores calculados a mano).
- + Cubre bien más allá de lo pedido: precedencia de operadores, columnas repetidas (e.id/d.id), DISTINCT con NULL, CASE con y sin base, LIKE case-insensitive, errores de sintaxis/ambigüedad/función desconocida.
- + Test de rendimiento mide con performance.now() y verifica tanto el tiempo como el resultado correcto (no solo que no lance).
- − Algunos tests agrupan muchas aserciones no relacionadas en un único `it`, dificultando localizar fallos.
- − No hay tests de subconsultas ni de mezclas más complejas de JOIN con GROUP BY/HAVING simultáneos (aunque no es estrictamente requerido).

<sub>Juez: claude:sonnet · 2026-09-11 15:56 · adaptador: [results/muse-spark-1.3-contributor.adapter.ts](results/muse-spark-1.3-contributor.adapter.ts)</sub>

## Hy4 preview — 8.5\*

> ⏹ **\* No terminó (≈95 % hecho)**: detenido a mano por tardar demasiado (≈35 min): código y 81 tests en verde, le faltaba corregir 1 error de tsc. Se valora el código tal como estaba al detenerlo; autonomía 0.

> Implementación sólida y bien estructurada (lexer/parser/AST/ejecución separados, semántica de NULL y numérica centralizada, joins por hash) con tests exhaustivos y aserciones exactas que cubren todos los escenarios pedidos; tiene un bug real de importación en el camino de error de GROUP BY y una imprecisión menor en la precedencia de operadores de comparación.

- **Corrección** 4.97/5: suite oculta 172/173 — **expr 36/37** · null 27/27 · where 21/21 · join 25/25 · group 25/25 · order 22/22 · error 11/11 · perf 5/5
- **Autonomía** 0/1: 0 intervención(es) del usuario (empezó en modo plan; la aprobación del plan no cuenta), sesión sin terminar
- **Tests propios** 1.46/1.5: pasan 0.38/0.375 (81/81) · cobertura 0.38/0.375 · cantidad 0.38/0.375 · calidad 0.34/0.375 (9/10)
- **Código** 1.8/2 (9/10)
- **Robustez** 0.25/0.5
- Cobertura de lo pedido: ✅ nullNotInAgregados · ✅ leftJoin · ✅ groupByHaving · ✅ orderByNullsLimit · ✅ divisionEnteraReal · ✅ rendimiento

**Código**

- + Fases claras y separadas: tokenizer, parser a AST, compilación de expresiones a closures y ejecución, cada una en su propio fichero
- + Semántica de NULL, enteros/reales y comparación centralizada en values.ts (compare, toNumeric, andValues/orValues de tres valores, etc.), no dispersa por operador
- + Joins por igualdad implementados con hash (buckets por clave) en vez de anidado, cumpliendo el requisito de rendimiento
- + Tipos precisos sin any, errores con código y mensaje claros (SqlError con no such table/column, ambiguous, misuse, out of range, etc.)
- − Bug real: groupByOutOfRange se usa en executor.ts pero no se importa desde errors.ts, lo que rompe `tsc --noEmit` y lanzaría ReferenceError en tiempo de ejecución si se alcanza ese camino
- − La precedencia de `< <= > >=` frente a `= == != <> IS IN LIKE BETWEEN` se colapsa en un único nivel (parseCompare), en vez de los dos niveles distintos que pide SQLite, lo que da resultados distintos en expresiones encadenadas sin paréntesis como `a < b = c < d`
- − Código muerto: el manejo de NOT dentro de parseUnary es inalcanzable porque parseNot ya consume NOT antes de llegar ahí

**Tests**

- + Aserciones exactas sobre filas y columnas en todos los casos, no solo conteos
- + Cubren bien más allá de lo pedido: precedencia completa, CASE con y sin base, LIKE con ESCAPE, DISTINCT, columnas repetidas, alias, identificadores entre comillas, entrada de tablas como objetos
- + Valores esperados calculados a mano/independientes (p. ej. AVG, ROUND, desbordamiento a real) en vez de reutilizar el propio motor
- + Tests de rendimiento con resultados exactos además del límite de tiempo, no solo 'no debe tardar'
- − No hay ningún test de GROUP BY por posición fuera de rango, que es justo el camino con el bug de importación
- − No se ejecuta typecheck (tsc --noEmit) como parte del flujo de test, lo que dejó pasar el bug de importación

**Bugs detectados por el juez**

- 🐛 src/executor.ts usa `groupByOutOfRange` sin importarlo de ./errors.js: `tsc --noEmit` falla y un GROUP BY con posición fuera de rango lanzaría ReferenceError en vez de un SqlError claro
- 🐛 La precedencia de comparaciones (< <= > >=) y de igualdad/IS/IN/LIKE/BETWEEN se trata como un único nivel en el parser, en vez de los dos niveles que especifica SQLite, alterando el resultado de expresiones encadenadas sin paréntesis

**Casos de la suite oculta que fallan**

- ✗ [012] precedencia < sobre =

<sub>Juez: claude:sonnet · 2026-09-11 16:24 · adaptador: [results/hy4-preview.adapter.ts](results/hy4-preview.adapter.ts)</sub>
