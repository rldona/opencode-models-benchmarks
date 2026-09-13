# SQL — Cómo se calcula la nota (0-10)

Prueba de dificultad ~1,5–2× RRULE, pensada para separar modelos: la corrección pesa más y la suite oculta es grande. Pesos en [bench.json](bench.json); fórmula en `computeScore` de [scripts/bench.mjs](../../scripts/bench.mjs).

| Bloque | Máx | De dónde sale |
|---|---|---|
| **Corrección** | 5 | Suite oculta de 173 casos: `5 × aciertos / 173`. 0 si no se pudo conectar la solución. |
| **Autonomía** (no bloquea) | 1 | 0 intervenciones = 1 · 1 = 0,5 · 2 o más = 0. 0 si no terminó o hubo timeout (60 min). La fase *plan* es libre; en autopiloto cada "Continúa" automático cuenta. |
| **Tests propios** | 1,5 | ¼ pasan al re-ejecutarlos · ¼ escenarios pedidos cubiertos (juez) · ¼ cantidad (10+ tests) · ¼ calidad (juez) |
| **Calidad de código** | 2 | Nota del juez sobre 10 |
| **Robustez** | 0,5 | ½ `tsc` limpio · ½ sin dependencias extra |
| **Motor prohibido** | nota 0 | Si el código de la solución importa `node:sqlite`, `sqlite3`, `better-sqlite3` o `child_process` |
| **Penalización** | −1,5 | Otros paquetes externos importados desde el código |

## Suite oculta

173 casos en 8 categorías; `DETAILS.md` muestra los aciertos de cada modelo por categoría:

| Categoría | Casos | Qué mide |
|---|---|---|
| `expr` | 37 | precedencia (`<` sobre `=`, NOT, AND/OR), división y módulo enteros con signo, reales, `||` con números, comparación de texto binaria, CASE, funciones (ROUND lejos de cero, UPPER/LOWER solo ASCII, LENGTH) |
| `null` | 27 | lógica de tres valores, `NOT IN` con NULL, BETWEEN con NULL, agregados con NULL y sobre conjunto vacío, NULL en GROUP BY, DISTINCT y ORDER BY |
| `where` | 21 | AND/OR, BETWEEN, LIKE (sin mayúsculas, `_`, sobre números), números como booleanos |
| `join` | 25 | INNER, LEFT (condición en ON frente a WHERE, anti-join), self join, 3-4 tablas, comas, desigualdad, `*` y `tabla.*`, columnas repetidas |
| `group` | 25 | GROUP BY de expresiones, HAVING con agregados fuera del SELECT, COUNT DISTINCT, SUM entero / COUNT frente a AVG, ORDER BY por agregado |
| `order` | 22 | varias claves, NULL primero/último, alias, posición, expresiones, DISTINCT, LIMIT/OFFSET |
| `error` | 11 | tabla/columna inexistente, ambigüedad, sintaxis, agregado en WHERE, posición fuera de rango, alias que oculta el nombre original |
| `perf` | 5 | JOIN 100k × 5k, GROUP BY 100k filas en 5 y ~5.000 grupos, COUNT DISTINCT, anti-join; límite **3 s** por consulta (el enunciado pide < 2 s) |

Los resultados esperados los calcula **SQLite** ([oracle/gen-cases.mjs](judge/oracle/gen-cases.mjs) sobre [oracle/queries.mjs](judge/oracle/queries.mjs)); nada está escrito a mano. Cada consulta se ejecuta con los datos cargados en tres órdenes físicos distintos y se descarta si el resultado cambia (orden no definido). Las consultas sin ORDER BY se comparan como multiconjunto; los reales con tolerancia 1e-9; los tipos son estrictos (`12` ≠ `'12'`).

Para regenerar tras cambiar consultas o datos: `node benchmarks/sql/judge/oracle/gen-cases.mjs`.

## Juez y adaptador

Como en RRULE: el juez (por defecto `claude:sonnet`) escribe `results/<slug>.adapter.ts`, que solo traduce formatos al contrato común ([judge/bench/contract.ts](judge/bench/contract.ts)): `query(tables, sql) → { columns, rows }`, con los errores propagados. Luego valora código y tests, y se pasa la suite oculta sobre una copia del proyecto sin cambios del juez.
