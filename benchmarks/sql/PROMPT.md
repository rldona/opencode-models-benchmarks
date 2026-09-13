En un proyecto TypeScript nuevo con Vitest, implementa un motor SQL en memoria que ejecute consultas SELECT sobre tablas que recibe como datos, con la misma semántica que SQLite. No uses librerías externas salvo Vitest; la implementación no puede usar SQLite (ni `node:sqlite` ni el binario `sqlite3`) ni lanzar procesos.

Entrada: las tablas (nombre → nombres de columnas y filas, con valores número, texto o null) y una consulta SQL (una única sentencia SELECT, con `;` final opcional). Salida: los nombres de las columnas y las filas como arrays en el orden del SELECT (puede haber nombres repetidos, como en `e.id, d.id`). Los errores (sintaxis, tabla o columna inexistente, columna ambigua, función desconocida, agregado mal usado, posición de ORDER BY fuera de rango) se lanzan como excepciones.

Debe soportar:
- SELECT [DISTINCT] con `*`, `tabla.*` y expresiones con alias opcional (`AS`). FROM opcional (`SELECT 1 + 1`).
- FROM con alias; JOIN, INNER JOIN y LEFT [OUTER] JOIN con ON; tablas separadas por comas (producto cartesiano).
- WHERE, GROUP BY (de expresiones), HAVING, ORDER BY (expresiones, alias de salida o posición, ASC/DESC), LIMIT y OFFSET.
- Expresiones: literales enteros, reales, 'texto' (`''` escapa la comilla) y NULL; columnas con o sin tabla; identificadores entre comillas dobles; `+ - * / %`, `-` unario, `||`, `= == != <> < <= > >=`, AND, OR, NOT, IS [NOT] NULL, [NOT] BETWEEN, [NOT] IN (lista), [NOT] LIKE (`%` y `_`), CASE (con y sin expresión base) y paréntesis.
- Funciones: COUNT(*), COUNT([DISTINCT] expr), SUM, AVG, MIN, MAX, ABS, ROUND(x[, n]), LOWER, UPPER, LENGTH, COALESCE, IFNULL y NULLIF.

Semántica de SQLite, en particular: palabras clave e identificadores sin distinguir mayúsculas; lógica de tres valores con NULL (también en IN, NOT IN y BETWEEN); los agregados ignoran NULL (SUM sin valores es NULL y COUNT es 0); enteros y reales son tipos distintos (7/2 = 3, -7/2 = -3, 7/2.0 = 3.5, AVG siempre es real; en los datos un número es entero si no tiene parte decimal); dividir o hacer módulo por cero da NULL; comparaciones y booleanos devuelven 1/0 y en WHERE cuenta como verdadero cualquier número distinto de 0; los textos se comparan byte a byte (mayúsculas antes que minúsculas); LIKE no distingue mayúsculas en ASCII; LOWER/UPPER solo cambian letras ASCII; `||`, LIKE y LENGTH convierten los números a texto; ROUND redondea alejándose de cero; en ORDER BY los NULL van primero en ASC y al final en DESC; precedencia de operadores de SQLite, de mayor a menor: `||`; `* / %`; `+ -`; `< <= > >=`; `= == != <> IS IN LIKE BETWEEN`; NOT; AND; OR.

Rendimiento: un JOIN por igualdad entre tablas de 100.000 y 5.000 filas, y un GROUP BY de 100.000 filas en 5.000 grupos, deben tardar menos de 2 segundos cada uno.

Escribe tests que cubran: NULL en NOT IN y en agregados, LEFT JOIN con filas sin pareja, GROUP BY con HAVING, ORDER BY con NULL y LIMIT/OFFSET, división entera frente a real, y el caso de rendimiento. Ejecuta los tests y no termines hasta que pasen todos.
