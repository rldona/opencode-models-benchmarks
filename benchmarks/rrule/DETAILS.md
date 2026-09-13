# rrule — Detalle de la nota

Generado por `node scripts/bench.mjs report`. Cómo se calcula: [RUBRIC.md](RUBRIC.md).

## Ranking

| # | Modelo | Nota | Corrección /4 | Autonomía /1 | Tests propios /2 | Código /2 | Robustez /1 | Penalización |
|---|---|---|---|---|---|---|---|---|
| 1 | DeepSeek V4.1 Flash | **9.8** | 4 | 1 | 1.95 | 1.8 | 1 |  |
| 2 | GLM-5.3 | **9.8** | 4 | 1 | 1.95 | 1.8 | 1 |  |
| 3 | Hy4 preview | **9.8** | 4 | 1 | 1.95 | 1.8 | 1 |  |
| 4 | GLM-5.3-Flash | **9.6** | 4 | 1 | 1.95 | 1.6 | 1 |  |
| 5 | GPT-5.6 Luna | **9.6** | 4 | 1 | 1.8 | 1.8 | 1 |  |
| 6 | DeepSeek V4 Pro (New) | **9.4** | 4 | 1 | 1.75 | 1.6 | 1 |  |
| 7 | Grok 4.6 | **9.2** | 4 | 1 | 1.55 | 1.6 | 1 |  |
| 8 | MiniMax-M3 | **9.1** | 3.58 | 1 | 1.9 | 1.6 | 1 |  |
| 9 | Kimi K2.7 Code | **8.9** | 3.79 | 1 | 1.7 | 1.4 | 1 |  |
| 10 | Kimi K3 | **8.9** | 3.37 | 1 | 1.9 | 1.6 | 1 |  |
| 11 | MiMo V2.5 | **8.7** | 3.37 | 1 | 1.9 | 1.4 | 1 |  |
| 12 | MiMo V2.5 Pro | **8.2** | 2.74 | 1 | 1.9 | 1.6 | 1 |  |
| 13 | Muse Spark 1.3 Contributor | **8.1** | 2.95 | 1 | 1.8 | 1.4 | 1 |  |
| 14 | LongCat-2.0 | **7.9** | 3.58 | 1 | 1.5 | 0.8 | 1 |  |

## DeepSeek V4.1 Flash — 9.8

> Solución muy sólida: arquitectura limpia y tipada, algoritmo acotado con manejo explícito de DST, y tests con aserciones exactas que cubren los cuatro escenarios pedidos además de varios casos límite adicionales. El adaptador conecta sin workarounds porque la API pública ya sigue casi literalmente el contrato del benchmark.

- **Corrección** 4/4: suite oculta 19/19
- **Autonomía** 1/1: 0 intervención(es) del usuario (empezó en modo plan; la aprobación del plan no cuenta)
- **Tests propios** 1.95/2: pasan 0.5/0.5 (15/15) · cobertura 0.5/0.5 · cantidad 0.5/0.5 · calidad 0.45/0.5 (9/10)
- **Código** 1.8/2 (9/10)
- **Robustez** 1/1
- Cobertura de lo pedido: ✅ dstOctubreMadrid · ✅ ultimoViernes · ✅ mesesSin31 · ✅ countConByday

**Código**

- + Separación clara entre parseo (parse.ts), aritmética de zona horaria (timezone.ts), generación de ocurrencias (expand.ts) y API pública (index.ts)
- + Tipado estricto sin `any`, con interfaces precisas para la regla normalizada y las fechas
- + Generadores acotados por semana/mes (no día a día salvo en DAILY, donde es inherente) con límite de seguridad de iteraciones
- + Valida entradas exhaustivamente (partes RRULE no soportadas, ordinales BYDAY inválidos, COUNT+UNTIL simultáneos, zona horaria inválida) con mensajes de error claros
- + Resolución explícita y documentada de horas ambiguas/inexistentes en el cambio de hora
- − En MONTHLY sin BYDAY, los meses sin el día de anclaje se omiten silenciosamente; es una decisión razonable pero no queda documentada en la API pública
- − Los helpers internos carecen de comentarios, solo la función pública principal tiene JSDoc

**Tests**

- + Aserciones exactas sobre instantes ISO y hora local, con valores esperados razonados de forma independiente (comentarios que justifican el desfase horario en el cruce de DST)
- + Cubre los cuatro escenarios pedidos con casos concretos y además añade UNTIL inclusivo, INTERVAL en semanas y meses, filtrado por ventana parcial, entrada como objeto tipado y validaciones de errores
- + Nombres de test descriptivos en español que explican el escenario cubierto
- − Solo se prueba una zona horaria (Europe/Madrid); no hay casos con otra zona (p. ej. hemisferio sur o desfase no entero)
- − No hay un caso que combine varios tokens BYDAY con ordinal (p. ej. 1MO y -1FR) en MONTHLY

<sub>Juez: claude:sonnet · 2026-09-11 10:22 · adaptador: [results/deepseek-v4.1-flash.adapter.ts](results/deepseek-v4.1-flash.adapter.ts)</sub>

## GLM-5.3 — 9.8

> Solución muy sólida: arquitectura limpia y bien tipada, manejo correcto de DST (horas inexistentes/ambiguas), BYDAY con ordinales y meses cortos, y una suite de tests propia de gran calidad que supera ampliamente lo pedido en el enunciado. No se detectaron errores tras revisar el código y probar casos adicionales.

- **Corrección** 4/4: suite oculta 19/19
- **Autonomía** 1/1: 0 intervención(es) del usuario (empezó en modo plan; la aprobación del plan no cuenta)
- **Tests propios** 1.95/2: pasan 0.5/0.5 (60/60) · cobertura 0.5/0.5 · cantidad 0.5/0.5 · calidad 0.45/0.5 (9/10)
- **Código** 1.8/2 (9/10)
- **Robustez** 1/1
- Cobertura de lo pedido: ✅ dstOctubreMadrid · ✅ ultimoViernes · ✅ mesesSin31 · ✅ countConByday

**Código**

- + Separación clara en módulos: types, rrule (parseo/validación), timezone (aritmética de zona horaria) y expand (generación)
- + Tipado estricto sin ningún uso de any, con tipos precisos para tokens BYDAY y reglas normalizadas
- + Validación exhaustiva de la regla con errores claros y específicos (RuleError, TypeError, RangeError según el caso)
- + Algoritmo acotado: generadores perezosos por FREQ con salto directo a semana/mes siguiente (no día a día salvo en DAILY) y límite MAX_CANDIDATES como salvaguarda
- − Para FREQ=DAILY sin COUNT/UNTIL con ventanas muy grandes, itera día a día (mitigado por el límite de candidatos, pero no es la aproximación más eficiente posible)
- − Alguna duplicación menor entre resolveStart/toInstant al parsear cadenas con sufijo de zona

**Tests**

- + Aserciones con instantes UTC exactos calculados independientemente (offsets conocidos de CEST/CET), no derivados de la propia implementación
- + Cubre con creces lo pedido: UNTIL inclusivo/exclusivo, INTERVAL, horas locales inexistentes y ambiguas, varias zonas horarias, entrada como objeto vs texto, y numerosos casos de validación de errores
- + Nombres de test descriptivos en español que documentan el comportamiento esperado
- + Verifica coherencia cruzada (hora local, día de la semana, mes) además del instante UTC final
- − No prueba explícitamente combinaciones de BYDAY con ordinales positivo y negativo a la vez (p. ej. 1MO,-1MO) aunque el código sí lo soporta
- − No hay pruebas de rendimiento/límite para ventanas muy grandes con DAILY que ejerciten el tope MAX_CANDIDATES

<sub>Juez: claude:sonnet · 2026-09-11 11:02 · adaptador: [results/glm-5.3.adapter.ts](results/glm-5.3.adapter.ts)</sub>

## Hy4 preview — 9.8

> Solución muy sólida: arquitectura limpia, tipado estricto, generación acotada y correcta gestión de DST (ambigüedad y huecos horarios), con una suite de tests exhaustiva y con valores esperados verificables independientemente. No se detectaron errores funcionales.

- **Corrección** 4/4: suite oculta 19/19
- **Autonomía** 1/1: 0 intervención(es) del usuario (empezó en modo plan; la aprobación del plan no cuenta)
- **Tests propios** 1.95/2: pasan 0.5/0.5 (40/40) · cobertura 0.5/0.5 · cantidad 0.5/0.5 · calidad 0.45/0.5 (9/10)
- **Código** 1.8/2 (9/10)
- **Robustez** 1/1
- Cobertura de lo pedido: ✅ dstOctubreMadrid · ✅ ultimoViernes · ✅ mesesSin31 · ✅ countConByday

**Código**

- + Separación clara en civil.ts (aritmética de fechas), tz.ts (conversión con Intl) y rrule.ts (parseo y generación)
- + Tipos precisos y estrictos (tsconfig con strict, noUncheckedIndexedAccess) sin uso de any
- + Generación con generator acotado por maxOccurrences, COUNT y UNTIL, evitando bucles sin límite
- + Validación exhaustiva de la regla con mensajes de error claros (FREQ, INTERVAL, BYDAY, COUNT, UNTIL, zona horaria)
- − Política de ambigüedad/gap en DST configurable pero no exigida por el enunciado; el valor por defecto no se documenta en un README
- − maxOccurrences por defecto (100000) podría iterarse igualmente muchos pasos en reglas patológicas sin COUNT/UNTIL ni resultados en el rango

**Tests**

- + Aserciones con instantes UTC exactos y hora local, con valores calculados independientemente a mano (verificables por el offset real de Madrid)
- + Cubre casos límite más allá de lo pedido: horas ambiguas e inexistentes del cambio de hora, política ambiguous/gap, UNTIL inclusivo en UTC y local, WKST, INTERVAL, ordinales inexistentes (5º lunes)
- + Nombres de test descriptivos en español que documentan el comportamiento esperado
- + Tests de parseo y de conversión de zona horaria separados y específicos, con casos de error
- − Solo se prueba Europe/Madrid y puntualmente America/New_York; no hay zonas con offsets no enteros o del hemisferio sur
- − No hay test de INTERVAL combinado con DST o de MONTHLY con BYDAY cruzando cambio de hora en el mismo mes

<sub>Juez: claude:sonnet · 2026-09-11 11:09 · adaptador: [results/hy4-preview.adapter.ts](results/hy4-preview.adapter.ts)</sub>

## GLM-5.3-Flash — 9.6

> Solución sólida y bien estructurada que soporta correctamente el subconjunto de RRULE pedido, con manejo cuidadoso de DST (horas ambiguas e inexistentes) verificado con cálculos independientes; los tests cubren con precisión los cuatro escenarios requeridos y varios casos límite adicionales.

- **Corrección** 4/4: suite oculta 19/19
- **Autonomía** 1/1: 0 intervención(es) del usuario (empezó en modo plan; la aprobación del plan no cuenta)
- **Tests propios** 1.95/2: pasan 0.5/0.5 (17/17) · cobertura 0.5/0.5 · cantidad 0.5/0.5 · calidad 0.45/0.5 (9/10)
- **Código** 1.6/2 (8/10)
- **Robustez** 1/1
- Cobertura de lo pedido: ✅ dstOctubreMadrid · ✅ ultimoViernes · ✅ mesesSin31 · ✅ countConByday

**Código**

- + Separación clara entre cálculo de zona horaria (timezone.ts) y parseo/generación de ocurrencias (rrule.ts)
- + Tipos precisos sin `any`, compila con tsconfig estricto (strict, noUnusedLocals, etc.)
- + Algoritmo acotado y eficiente: avanza por semanas/meses (no día a día) con corte temprano al superar la ventana `to`, más un tope duro de iteraciones
- + Valida entradas (FREQ, INTERVAL, BYDAY con ordinal fuera de MONTHLY, zona horaria IANA) con mensajes de error claros
- − La resolución de horas ambiguas/inexistentes en `wallToUtc` usa una heurística de deltas fijos (30/60/.../240 min) en vez de un cálculo general del cambio de offset
- − Duplicación de estructura entre los bucles WEEKLY y MONTHLY (emisión, corte por `remaining`/`stopped`) que podría factorizarse
- − DTSTART se emite siempre como primera ocurrencia aunque su día no coincida con BYDAY, sin documentar ni testear ese caso

**Tests**

- + Aserciones exactas de instantes UTC y hora local, con valores calculados independientemente de la implementación (verificados a mano: DST de Madrid, días de la semana, días por mes)
- + Cubre casos límite más allá de lo pedido: hora inexistente y ambigua en el cambio de hora, UNTIL inclusivo, INTERVAL, COUNT contado desde DTSTART aunque la ventana empiece después
- + Nombres de test descriptivos en español que explican el escenario y el resultado esperado
- + Incluye tests de validación de errores (FREQ no soportada, BYDAY con DAILY, ordinal en WEEKLY, zona inválida, INTERVAL inválido)
- − Todos los tests de zona horaria usan Europe/Madrid; no se prueba con otra zona IANA (p. ej. hemisferio sur o sin DST)
- − No se testea el caso de DTSTART cuyo día no coincide con BYDAY

**Bugs detectados por el juez**

- 🐛 DTSTART se incluye siempre como primera ocurrencia en WEEKLY/MONTHLY con BYDAY aunque su día no esté en la lista BYDAY, lo que puede ser sorprendente y no está cubierto por tests
- 🐛 La heurística de `wallToUtc` para resolver horas ambiguas/inexistentes usa deltas fijos en minutos, lo que podría no generalizar a zonas con transiciones de DST distintas de 30/60 minutos

<sub>Juez: claude:sonnet · 2026-09-11 11:06 · adaptador: [results/glm-5.3-flash.adapter.ts](results/glm-5.3-flash.adapter.ts)</sub>

## GPT-5.6 Luna — 9.6

> Implementación sólida y bien probada: separa responsabilidades con claridad, trata correctamente los saltos y solapes de DST, y las pruebas verifican instantes exactos calculables de forma independiente, cubriendo con creces los cuatro escenarios pedidos.

- **Corrección** 4/4: suite oculta 19/19
- **Autonomía** 1/1: 0 intervención(es) del usuario (empezó en modo plan; la aprobación del plan no cuenta)
- **Tests propios** 1.8/2: pasan 0.5/0.5 (7/7) · cobertura 0.5/0.5 · cantidad 0.35/0.5 · calidad 0.45/0.5 (9/10)
- **Código** 1.8/2 (9/10)
- **Robustez** 1/1
- Cobertura de lo pedido: ✅ dstOctubreMadrid · ✅ ultimoViernes · ✅ mesesSin31 · ✅ countConByday

**Código**

- + Separa claramente parseo de RRULE, normalización, aritmética de fechas civiles y generación por periodos
- + Maneja explícitamente huecos (spring-forward) y solapes (fall-back) de DST con criterio documentado
- + Algoritmo acotado por periodos (semana/mes), no itera día a día, con caché del formateador Intl
- + Tipado estricto sin `any` y validación de entradas con errores claros (RangeError/TypeError)
- − Todo el código vive en un único fichero de ~750 líneas, dificultando la navegación
- − No soporta WKST (asume semana de lunes a domingo) ni lo documenta como limitación explícita
- − El corte de bucle por periodo compara solo fecha civil (no hora), es una heurística poco explicada

**Tests**

- + Aserciones de instantes exactos (toISOString) verificables a mano, incluyendo el offset UTC correcto en cada lado del cambio de hora
- + Cubre tanto el cambio de octubre (fall-back) como el de marzo (spring-forward) aunque solo se pedía octubre
- + Prueba ordinal positivo (2TU), ordinal negativo (-1FR), meses sin día 31, COUNT+BYDAY y UNTIL inclusivo
- + Nombres de test descriptivos que explican el escenario cubierto
- − Todos los casos usan una única zona horaria (Europe/Madrid); no se prueban otras zonas ni offsets no enteros
- − No hay tests de validación de entradas inválidas (FREQ no soportado, BYDAY mal formado, etc.)
- − No se prueban ventanas parciales (from/to que corten la serie) más allá de acotar el rango total

**Bugs detectados por el juez**

- 🐛 No se ha detectado ningún bug funcional en la implementación tras revisión y pruebas ad-hoc de los casos límite

<sub>Juez: claude:sonnet · 2026-09-11 11:08 · adaptador: [results/gpt-5.6-luna.adapter.ts](results/gpt-5.6-luna.adapter.ts)</sub>

## DeepSeek V4 Pro (New) — 9.4

> Implementación sólida y bien tipada que maneja correctamente DST, último día de la semana/mes y COUNT combinado con BYDAY, con tests concretos y verificados independientemente; le faltan casos límite adicionales (salto de primavera, otras zonas) y tiene algo de duplicación menor entre los bucles WEEKLY y MONTHLY.

- **Corrección** 4/4: suite oculta 19/19
- **Autonomía** 1/1: 0 intervención(es) del usuario (empezó en modo plan; la aprobación del plan no cuenta)
- **Tests propios** 1.75/2: pasan 0.5/0.5 (7/7) · cobertura 0.5/0.5 · cantidad 0.35/0.5 · calidad 0.4/0.5 (8/10)
- **Código** 1.6/2 (8/10)
- **Robustez** 1/1
- Cobertura de lo pedido: ✅ dstOctubreMadrid · ✅ ultimoViernes · ✅ mesesSin31 · ✅ countConByday

**Código**

- + Buena separación en tres módulos: parseo/generación (rrule.ts), conversión de zona horaria (tz.ts) y API pública (index.ts)
- + Tipos precisos sin any, con tsconfig estricto (noUncheckedIndexedAccess) y sin errores de typecheck
- + wallTimeToUtc resuelve DST con corrección iterativa de offset y detecta y reporta horas locales inexistentes (salto de primavera) con un error claro
- + Valida la RRULE de forma estricta (FREQ, INTERVAL, COUNT, BYDAY) y rechaza partes no soportadas (BYMONTH, BYMONTHDAY, BYSETPOS, WKST) en vez de ignorarlas silenciosamente
- − Los bucles WEEKLY y MONTHLY repiten un patrón muy similar de generar candidatos, ordenarlos y filtrar antes de dtstart, con algo de duplicación
- − El límite MAX_ITERATIONS (1_000_000) es un tope defensivo pero arbitrario en vez de derivar el número máximo de iteraciones necesarias de la ventana/COUNT
- − El ordinal en BYDAY se ignora silenciosamente para FREQ=WEEKLY (p. ej. '2TU' se trata como 'TU') sin advertencia, aunque es razonable según RFC 5545

**Tests**

- + Aserciones concretas y calculadas a mano (no derivadas de la propia implementación): fechas exactas, horas UTC y duraciones de intervalo en horas
- + El test de DST va más allá de lo pedido: comprueba la hora local constante, el offset UTC antes/después del cambio y la duración exacta de la semana con 169h
- + Cubre además INTERVAL=2 semanal con BYDAY, UNTIL inclusivo y un test unitario de parseRRule para ordinales como 2TU/-1FR
- + Nombres de test descriptivos en español que reflejan exactamente los escenarios pedidos en el enunciado
- − No hay ningún test del salto de primavera (marzo) ni de horas locales ambiguas en el retraso de otoño
- − Todos los tests usan Europe/Madrid; no se prueba ninguna otra zona horaria ni UTC salvo en el propio parseRRule
- − No se testean los errores de validación (RRULE inválida, BYMONTHDAY no soportado, etc.)

**Bugs detectados por el juez**

- 🐛 El ordinal en BYDAY se ignora para FREQ=WEEKLY sin lanzar error ni advertencia, lo que podría ocultar un uso incorrecto de la regla por parte del llamante

<sub>Juez: claude:sonnet · 2026-09-11 10:22 · adaptador: [results/deepseek-v4-pro.adapter.ts](results/deepseek-v4-pro.adapter.ts)</sub>

## Grok 4.6 — 9.2

> Implementación sólida y bien estructurada que cubre correctamente los cuatro escenarios pedidos, con manejo cuidadoso de DST (incluyendo huecos y horas ambiguas verificados manualmente); los tests son concretos pero podrían ampliar la cobertura de casos límite como UNTIL, INTERVAL o múltiples zonas horarias.

- **Corrección** 4/4: suite oculta 19/19
- **Autonomía** 1/1: 0 intervención(es) del usuario (empezó en modo plan; la aprobación del plan no cuenta)
- **Tests propios** 1.55/2: pasan 0.5/0.5 (4/4) · cobertura 0.5/0.5 · cantidad 0.2/0.5 · calidad 0.35/0.5 (7/10)
- **Código** 1.6/2 (8/10)
- **Robustez** 1/1
- Cobertura de lo pedido: ✅ dstOctubreMadrid · ✅ ultimoViernes · ✅ mesesSin31 · ✅ countConByday

**Código**

- + Separación clara entre parseo (parse.ts), aritmética de calendario (civil.ts), conversión de zona horaria (timezone.ts) y generación (expand.ts)
- + Tipos precisos sin `any` y validación de entrada con errores descriptivos (FREQ, INTERVAL, COUNT, BYDAY inválidos)
- + Algoritmo acotado y eficiente: itera por semanas/meses según la frecuencia (no día a día), con MAX_STEPS como salvaguarda
- + Maneja correctamente horas locales inexistentes (salto de primavera) y ambiguas (retraso de otoño) al convertir a UTC, en vez de asumir naivemente un offset fijo
- − MAX_STEPS=10000 es un límite mágico sin justificación ni test que lo ejerza
- − No soporta WKST ni otras partes de RRULE (BYMONTHDAY, BYSETPOS...) aunque no eran requeridas
- − Los tipos internos (ParsedRRule, ByDay) no se exportan desde index.ts, limitando el uso tipado por consumidores
- − El manejo de milisegundos de wallMs añade complejidad para un caso borde no cubierto por ningún test

**Tests**

- + Aserciones concretas sobre instantes ISO exactos y sobre hora local calculada de forma independiente con Intl.DateTimeFormat (no reutiliza el código de la solución)
- + Cubre los cuatro escenarios pedidos por el enunciado con fechas y horas esperadas verificables a mano
- + Nombres de test descriptivos que explican el escenario cubierto
- − No hay test de UNTIL ni de INTERVAL>1, ni de horas locales ambiguas/inexistentes por DST
- − Solo se prueba una zona horaria (Europe/Madrid) y no se verifican ventanas parciales (from/to a mitad de la serie)
- − Solo 4 tests en total; no se comprueban errores de validación (reglas inválidas)

<sub>Juez: claude:sonnet · 2026-09-11 11:04 · adaptador: [results/grok-4.6.adapter.ts](results/grok-4.6.adapter.ts)</sub>

## MiniMax-M3 — 9.1

> Implementación sólida y bien tipada que resuelve correctamente DST, BYDAY posicional y meses sin día 31, con tests concretos que cubren los cuatro escenarios pedidos; solo lastrada por un bug menor en UNTIL floating y cobertura de zonas horarias algo limitada.

- **Corrección** 3.58/4: suite oculta 17/19
- **Autonomía** 1/1: 0 intervención(es) del usuario (empezó en modo plan; la aprobación del plan no cuenta)
- **Tests propios** 1.9/2: pasan 0.5/0.5 (19/19) · cobertura 0.5/0.5 · cantidad 0.5/0.5 · calidad 0.4/0.5 (8/10)
- **Código** 1.6/2 (8/10)
- **Robustez** 1/1
- Cobertura de lo pedido: ✅ dstOctubreMadrid · ✅ ultimoViernes · ✅ mesesSin31 · ✅ countConByday

**Código**

- + Separación clara en types/parser/tz/expander/index, sin `any` y con tipos precisos (ByDayEntry, Frequency, Weekday)
- + Cálculo de zona horaria correcto con Intl.DateTimeFormat y resolución de ambigüedad DST por punto fijo (zonedWallToUtc)
- + Generación acotada: WEEKLY/MONTHLY avanzan por semana/mes (no día a día) y cada rama para en count/until/rangeEnd
- + Parser valida entradas (FREQ, INTERVAL, BYDAY, COUNT) y lanza errores claros ante valores inválidos
- − UNTIL sin sufijo 'Z' (floating) se interpreta con la hora local de la máquina en vez de la tz del evento, inconsistente con el resto del diseño
- − Salvaguarda 'y > 2200' como límite mágico para evitar bucles infinitos en MONTHLY, poco elegante
- − Duplicación entre las dos ramas de MONTHLY (con y sin BYDAY) que podría unificarse
- − expand() no valida que dtstart/rangeStart/rangeEnd sean Date válidos antes de operar con ellos

**Tests**

- + Aserciones exactas de instantes UTC con valores razonados a mano en comentarios (no derivados de la propia implementación)
- + Cubre los cuatro escenarios pedidos por el enunciado con casos concretos y realistas
- + Añade casos límite más allá de lo pedido: UNTIL inclusivo, INTERVAL, rangeStart/rangeEnd (ventana semiabierta), parser de BYDAY y errores
- − Solo se prueba una zona horaria no-UTC (Europe/Madrid); no hay otras zonas ni casos de hora inexistente/ambigua por salto de primavera
- − No hay test de MONTHLY con BYDAY combinado con INTERVAL>1
- − El caso DST solo cubre el cambio de octubre (retraso de reloj), no el de marzo (adelanto)

**Bugs detectados por el juez**

- 🐛 parseUntil interpreta un UNTIL sin 'Z' con la zona horaria del sistema en lugar de la tz del evento, lo que puede producir instantes incorrectos en máquinas con otra zona horaria

**Casos de la suite oculta que fallan**

- ✗ [10] COUNT se cuenta desde el inicio, no desde la ventana
- ✗ [16] semanal INTERVAL=2 empezando en miércoles (semanas con WKST=MO)

**Adaptaciones del adaptador**

- ⚙️ La solución espera `dtstart` como un Date cuyos campos UTC codifican la hora de pared local (no un instante real); el adaptador lo construye a partir de dtstartLocal en vez de usar dtstartUtc directamente, siguiendo la convención interna de src/expander.ts.

<sub>Juez: claude:sonnet · 2026-09-11 11:54 · adaptador: [results/minimax-m3.adapter.ts](results/minimax-m3.adapter.ts)</sub>

## Kimi K2.7 Code — 8.9

> Solución sólida y correcta para el subconjunto de RRULE pedido, con buena separación de responsabilidades, tipado estricto y manejo correcto del DST; los tests cubren con precisión los cuatro escenarios exigidos y algunos extra, aunque el algoritmo de generación es innecesariamente eager y hay algún caso límite no documentado.

- **Corrección** 3.79/4: suite oculta 18/19
- **Autonomía** 1/1: 0 intervención(es) del usuario (empezó en modo plan; la aprobación del plan no cuenta)
- **Tests propios** 1.7/2: pasan 0.5/0.5 (6/6) · cobertura 0.5/0.5 · cantidad 0.3/0.5 · calidad 0.4/0.5 (8/10)
- **Código** 1.4/2 (7/10)
- **Robustez** 1/1
- Cobertura de lo pedido: ✅ dstOctubreMadrid · ✅ ultimoViernes · ✅ mesesSin31 · ✅ countConByday

**Código**

- + Buena separación en módulos: parser, timezone, types y expander
- + Tipos precisos sin 'any' y con interfaces claras (RRule, LocalParts, ByDayPart)
- + Conversión hora local↔UTC correcta y robusta ante DST mediante iteración de convergencia
- + Valida entradas (FREQ requerido, INTERVAL/COUNT >=1, formatos de BYDAY/UNTIL) y lanza errores claros
- − generateDaily/Weekly/Monthly siempre materializan candidatos hasta ~100 años antes de aplicar COUNT/UNTIL/ventana, en vez de generar de forma perezosa; ineficiente aunque acotado
- − BYDAY mensual sin posición numérica solo produce la primera ocurrencia del mes (caso no exigido por el enunciado, pero deja un comportamiento parcial sin advertencia clara)
- − parseUntil sin sufijo 'Z' construye un Date en la zona horaria de la máquina, no en UTC, lo que puede dar resultados inconsistentes entre entornos
- − El corte de seguridad final ('generated > 10000') es prácticamente inalcanzable dado que los límites previos ya acotan la lista, es código muerto

**Tests**

- + Cubre los cuatro escenarios pedidos con aserciones exactas de instantes y hora local, no solo longitudes
- + Valores esperados calculados manualmente (razonamiento de calendario/offset), no derivados de la propia implementación
- + Añade casos extra no pedidos: INTERVAL>1 y UNTIL inclusivo, con tres zonas horarias distintas (Europe/Madrid, UTC, America/New_York)
- + Nombres de test descriptivos y verificación explícita de la diferencia de 169h en el cruce de DST
- − No hay tests de ventana parcial (from/to que recorten la serie) ni de validación de errores (FREQ no soportado, INTERVAL inválido, etc.)
- − No se prueba BYDAY con varios días en la misma semana/mes combinados
- − No se cubre el cambio de hora de primavera (spring-forward) ni horas locales inexistentes/ambiguas

**Bugs detectados por el juez**

- 🐛 Las funciones de generación por frecuencia recorren siempre hasta el límite de seguridad (~100 años) antes de aplicar COUNT/UNTIL o la ventana solicitada, aunque el resultado final sea correcto
- 🐛 parseUntil interpreta un UNTIL sin 'Z' en la zona horaria local del proceso en lugar de UTC, lo que puede producir resultados distintos según la máquina
- 🐛 BYDAY mensual sin posición numérica (p. ej. 'TU' suelto) solo devuelve la primera ocurrencia del mes en vez de todas las coincidencias, comportamiento no documentado para quien lea la firma pública

**Casos de la suite oculta que fallan**

- ✗ [14] mensual BYDAY=FR sin ordinal = todos los viernes del mes

<sub>Juez: claude:sonnet · 2026-09-11 11:10 · adaptador: [results/kimi-k2.7-code.adapter.ts](results/kimi-k2.7-code.adapter.ts)</sub>

## Kimi K3 — 8.9

> Implementación sólida y bien acotada que cumple todo lo pedido por el enunciado, con tests de buena calidad y aserciones independientes; el único punto débil real es el manejo silencioso de horas locales inexistentes en el salto de primavera, un caso no cubierto por el enunciado pero relevante para la robustez frente a DST.

- **Corrección** 3.37/4: suite oculta 16/19
- **Autonomía** 1/1: 0 intervención(es) del usuario (empezó en modo plan; la aprobación del plan no cuenta)
- **Tests propios** 1.9/2: pasan 0.5/0.5 (9/9) · cobertura 0.5/0.5 · cantidad 0.45/0.5 · calidad 0.45/0.5 (9/10)
- **Código** 1.6/2 (8/10)
- **Robustez** 1/1
- Cobertura de lo pedido: ✅ dstOctubreMadrid · ✅ ultimoViernes · ✅ mesesSin31 · ✅ countConByday

**Código**

- + Separación clara entre parseo de zona horaria (timezone.ts), parseo/validación de la regla y generación de ocurrencias (rrule.ts)
- + Algoritmo por bloques periódicos (no itera día a día) con límite MAX_BLOCKS=100_000 y cortes tempranos por COUNT/UNTIL/ventana
- + Tipos precisos sin 'any' y validación de entradas con errores claros (FREQ no soportada, BYDAY inválido, ordinal 0, etc.)
- + Conversión local↔UTC con refinamiento en dos iteraciones para resolver correctamente los offsets alrededor de transiciones DST
- − El manejo de horas locales inexistentes durante el salto de primavera (spring-forward) no se detecta ni se ajusta explícitamente: puede devolver un instante cuya hora local real no coincide con la solicitada
- − La lógica de 'semana' para BYDAY semanal se ancla al día de la semana del inicio en vez de a un WKST fijo, lo cual es razonable pero no se documenta como decisión de diseño
- − Algo de duplicación entre el cálculo de año/mes en blockCandidates (MONTHLY) y en la rama de salida temprana del bucle principal

**Tests**

- + Aserciones exactas sobre instantes ISO UTC con comentarios que justifican el valor esperado de forma independiente al código (p. ej. '2024 es bisiesto: el 29 es jueves')
- + Cubre los cuatro escenarios pedidos por el enunciado más casos límite adicionales: UNTIL inclusivo con fecha sin hora, INTERVAL, recorte de ventana [from,to), ventana vacía y segundo martes de mes
- + Nombres de test descriptivos en español que explican el propósito de cada caso
- − Solo se usa una zona horaria no-UTC (Europe/Madrid); no se prueban otras zonas con reglas DST distintas (p. ej. hemisferio sur)
- − No hay test explícito de INTERVAL combinado con WEEKLY/MONTHLY (solo con DAILY)

**Bugs detectados por el juez**

- 🐛 Las horas locales inexistentes durante el cambio de hora de primavera (p. ej. 02:30 en Europe/Madrid el 31-mar-2024) no se rechazan ni se normalizan: el resultado corresponde a un instante cuya hora local real difiere de la solicitada, sin aviso ni error.

**Casos de la suite oculta que fallan**

- ✗ [11] semanal INTERVAL=2 BYDAY=TU,TH con UNTIL inclusivo y cambio de hora
- ✗ [12] diario con UNTIL (UTC)
- ✗ [16] semanal INTERVAL=2 empezando en miércoles (semanas con WKST=MO)

<sub>Juez: claude:sonnet · 2026-09-11 11:17 · adaptador: [results/kimi-k3.adapter.ts](results/kimi-k3.adapter.ts)</sub>

## MiMo V2.5 — 8.7

> Implementación sólida y bien organizada que cubre correctamente los cuatro escenarios pedidos, con tests concretos y fiables; el punto débil real es la conversión hora-local→UTC, que falla silenciosamente en horas inexistentes del salto de primavera, un caso límite que los propios tests no llegan a ejercitar.

- **Corrección** 3.37/4: suite oculta 16/19
- **Autonomía** 1/1: 0 intervención(es) del usuario (empezó en modo plan; la aprobación del plan no cuenta)
- **Tests propios** 1.9/2: pasan 0.5/0.5 (13/13) · cobertura 0.5/0.5 · cantidad 0.5/0.5 · calidad 0.4/0.5 (8/10)
- **Código** 1.4/2 (7/10)
- **Robustez** 1/1
- Cobertura de lo pedido: ✅ dstOctubreMadrid · ✅ ultimoViernes · ✅ mesesSin31 · ✅ countConByday

**Código**

- + Separación clara en módulos (types, parser, timezone, generator) con tipos precisos sin `any`
- + Conversión de hora local a UTC vía Intl.DateTimeFormat, sin dependencias externas ni asumir la TZ de la máquina
- + Bucle de generación acotado con MAX_ITER y corta en cuanto se supera COUNT, UNTIL o el rango, evitando iterar sin límite
- + Manejo correcto de BYDAY con nth y 'last' (2TU, -1FR) y de clamping de días inexistentes en el mes
- − `fromLocal` solo hace una corrección de offset (no iterativa como debería); en horas locales inexistentes durante el salto de primavera devuelve un instante cuya hora local resultante no coincide con la solicitada (ej. pide 02:30 y el round-trip da 01:30)
- − La expansión semanal de BYDAY calcula el offset respecto al día de referencia en curso, no respecto al inicio de semana (WKST); con INTERVAL>1 y DTSTART que no es el día más temprano del conjunto BYDAY puede desalinear qué semanas se generan
- − `advancePeriod` recibe parámetros y/m/d que nunca usa (usa las variables de closure homónimas), código confuso y con variable shadowing innecesaria
- − No valida INTERVAL<=0, COUNT negativo ni BYDAY vacío/duplicado; errores de parseo son genéricos sin indicar posición

**Tests**

- + Aserciones exactas tanto en instante UTC como en hora local de pared para los casos de DST, distinguiendo antes/después del cambio de hora
- + Cubre explícitamente los cuatro escenarios pedidos por el enunciado con fechas y valores calculados a mano en los comentarios, no derivados de la propia implementación
- + Añade casos no pedidos pero relevantes: INTERVAL en DAILY y WEEKLY, UNTIL, año bisiesto con día 29 de febrero
- + Nombres de test descriptivos que documentan el escenario y el resultado esperado
- − No prueba el caso ambiguo (hora repetida en el retroceso de otoño) ni la hora inexistente (salto de primavera) que sí afecta a `fromLocal`, dejando sin cubrir el propio punto débil del código
- − Todos los tests monthly con BYDAY empiezan con DTSTART coincidiendo con el primer/único día BYDAY de esa semana, sin ejercitar el caso WEEKLY;INTERVAL>1 combinado con varios BYDAY donde el bug de anclaje de semana se manifestaría
- − No hay test de UNTIL exclusivo/inclusivo en el límite exacto ni de varias zonas horarias distintas de Europe/Madrid y UTC

**Bugs detectados por el juez**

- 🐛 `fromLocal` (src/timezone.ts) usa una sola corrección de offset en vez de iterar; para horas locales que no existen por el salto de primavera (DST gap) produce un instante cuya hora local real difiere en una hora de la solicitada, sin avisar
- 🐛 La expansión WEEKLY con BYDAY ancla los offsets al día de referencia en curso (no a un inicio de semana fijo tipo WKST=MO), lo que con INTERVAL>1 y DTSTART que no es el día BYDAY más temprano puede generar una cadencia distinta a la esperada por RFC 5545
- 🐛 El manejo de horas ambiguas en el retroceso de otoño (02:30 ocurre dos veces) no está documentado ni es configurable: siempre resuelve al segundo paso (offset post-DST) sin que el usuario pueda elegir

**Casos de la suite oculta que fallan**

- ✗ [07] mensual día 31 salta los meses sin día 31 (COUNT)
- ✗ [08] mensual día 31 sin fin, ventana de febrero a junio
- ✗ [16] semanal INTERVAL=2 empezando en miércoles (semanas con WKST=MO)

<sub>Juez: claude:sonnet · 2026-09-11 11:18 · adaptador: [results/mimo-v2.5.adapter.ts](results/mimo-v2.5.adapter.ts)</sub>

## MiMo V2.5 Pro — 8.2

> Implementación sólida y bien acotada que cubre correctamente FREQ/INTERVAL/BYDAY/COUNT/UNTIL con manejo cuidadoso de DST vía Intl.DateTimeFormat, con tests exhaustivos y de aserciones exactas para los cuatro escenarios pedidos; los defectos son menores (código muerto, duplicación, un caso de UNTIL sin 'Z' dependiente de la zona horaria de la máquina).

- **Corrección** 2.74/4: suite oculta 13/19
- **Autonomía** 1/1: 0 intervención(es) del usuario (empezó en modo plan; la aprobación del plan no cuenta)
- **Tests propios** 1.9/2: pasan 0.5/0.5 (25/25) · cobertura 0.5/0.5 · cantidad 0.5/0.5 · calidad 0.4/0.5 (8/10)
- **Código** 1.6/2 (8/10)
- **Robustez** 1/1
- Cobertura de lo pedido: ✅ dstOctubreMadrid · ✅ ultimoViernes · ✅ mesesSin31 · ✅ countConByday

**Código**

- + Buena separación en módulos: parser.ts, timezone.ts, rrule.ts y types.ts con tipos precisos, sin `any`
- + Cálculo de fechas locales robusto usando Intl.DateTimeFormat con reintento ante ambigüedad/gap de DST
- + Algoritmo acotado y eficiente: WEEKLY avanza semana a semana y MONTHLY mes a mes (no itera día a día sin límite)
- + Validaciones claras en el parser (FREQ, INTERVAL, COUNT) que lanzan errores explícitos
- − UNTIL sin sufijo 'Z' y sin hora se interpreta con la zona horaria del proceso Node, no con la IANA `timeZone` del evento, lo que lo hace no portable
- − Código muerto: `addMonths` se importa pero no se usa, y `startParts` en `generateWeeklyCandidates` se declara sin usar
- − `weekdayMatches` duplica la lógica de n-ésimo/último día de la semana que ya existe en `findMonthlyByDay`

**Tests**

- + Aserciones exactas sobre día, mes, hora local y también sobre horas UTC concretas en el cruce de DST (verificando el cambio de offset)
- + Valores esperados calculados a mano (documentados en comentarios), no derivados de la propia implementación
- + Cubre casos límite adicionales: DST de primavera y otoño, año bisiesto vs no bisiesto, INTERVAL, filtrado por ventana parcial
- + Nombres de test descriptivos y organizados por bloques (parser, timezone, weekly, monthly, count/until, edge cases)
- − Todos los tests de zona horaria usan únicamente Europe/Madrid, sin probar otras zonas (p.ej. hemisferio sur o con offset no entero)
- − No hay tests de UNTIL combinado con BYDAY, ni de entradas inválidas (BYDAY o FREQ mal formados)

**Bugs detectados por el juez**

- 🐛 UNTIL sin 'Z' y sin componente de hora se resuelve con la zona horaria local del proceso Node en vez de con la `timeZone` del evento (parser.ts, parseUntil)
- 🐛 Código muerto: `addMonths` (timezone.ts) se importa en rrule.ts pero nunca se invoca
- 🐛 Variable `startParts` en `generateWeeklyCandidates` (rrule.ts) se declara pero no se usa
- 🐛 `weekdayMatches` reimplementa la lógica de n-ésimo/último día de la semana ya presente en `findMonthlyByDay`, duplicando código en vez de reutilizarlo
- 🐛 El límite de seguridad `maxMonths = count*2` en `generateMonthlyCandidates` podría quedarse corto en combinaciones extremas de BYDAY con posiciones que faltan en muchos meses

**Casos de la suite oculta que fallan**

- ✗ [02] semanal sin BYDAY cruza cambio de hora de marzo (America/New_York)
- ✗ [07] mensual día 31 salta los meses sin día 31 (COUNT)
- ✗ [08] mensual día 31 sin fin, ventana de febrero a junio
- ✗ [14] mensual BYDAY=FR sin ordinal = todos los viernes del mes
- ✗ [16] semanal INTERVAL=2 empezando en miércoles (semanas con WKST=MO)
- ✗ [17] semanal cruza cambio de hora del hemisferio sur (Australia/Sydney)

<sub>Juez: claude:sonnet · 2026-09-11 11:26 · adaptador: [results/mimo-v2.5-pro.adapter.ts](results/mimo-v2.5-pro.adapter.ts)</sub>

## Muse Spark 1.3 Contributor — 8.1

> Implementación sólida y bien estructurada que cubre correctamente el subconjunto de RRULE pedido y preserva la hora local en DST, con tests propios de buena calidad y valores esperados calculados de forma independiente; el defecto más grave es que rechaza la zona horaria 'UTC' por una validación excesivamente estricta, lo que rompe un caso de uso básico no cubierto por sus propios tests.

- **Corrección** 2.95/4: suite oculta 14/19
- **Autonomía** 1/1: 0 intervención(es) del usuario (empezó en modo plan; la aprobación del plan no cuenta)
- **Tests propios** 1.8/2: pasan 0.5/0.5 (8/8) · cobertura 0.5/0.5 · cantidad 0.4/0.5 · calidad 0.4/0.5 (8/10)
- **Código** 1.4/2 (7/10)
- **Robustez** 1/1
- Cobertura de lo pedido: ✅ dstOctubreMadrid · ✅ ultimoViernes · ✅ mesesSin31 · ✅ countConByday

**Código**

- + Buena separación en tres módulos: parseo de RRULE (rrule.ts), aritmética de zona horaria con Intl (timezone.ts) y generación de ocurrencias (expand.ts)
- + Tipado estricto sin `any`, con `noUncheckedIndexedAccess` activado y validación de entradas (FREQ, INTERVAL, BYDAY, COUNT, UNTIL) con errores claros
- + Algoritmo acotado (MAX_PERIODS/MAX_CANDIDATES) que itera por periodos civiles en vez de día a día sin límite, y resuelve correctamente huecos/ambigüedades de DST muestreando offsets antes/después de la transición
- − Bug real: `validateTimeZone` rechaza 'UTC' y 'Etc/UTC' como zonas inválidas porque `Intl.supportedValuesOf('timeZone')` no las incluye, pese a que `Intl.DateTimeFormat` las soporta perfectamente; esto rompe un caso de uso común
- − Duplicación notable: la lógica de `consider` (comprobar UNTIL/COUNT/rango) está extraída como helper para DAILY pero reimplementada inline con ligeras variaciones en WEEKLY y MONTHLY
- − Comentarios que documentan dudas o razonamientos a medio resolver del propio autor ('Pero cuidado...', 'Heurística de parada...', 'Seguridad adicional...') en vez de explicar invariantes, lo que resta claridad al código de producción

**Tests**

- + Aserciones exactas sobre instantes ISO UTC y sobre hora/día local derivados independientemente (con comentarios que muestran el cálculo manual de la transición DST de 2025), no solo longitudes o booleanos
- + Cubre casos límite más allá de lo pedido: UNTIL inclusivo, INTERVAL>1, COUNT contado desde DTSTART con ventana que empieza después, y la forma ordinal '2TU'
- + Nombres de test descriptivos en español que documentan el escenario y el resultado esperado
- − Todos los tests usan una única zona horaria (Europe/Madrid); no se prueba ninguna otra zona (p. ej. hemisferio sur o con offset no entero) ni UTC
- − No hay ningún test que ejercite `validateTimeZone` con una zona inválida ni que detecte el bug de rechazo de 'UTC'

**Bugs detectados por el juez**

- 🐛 `validateTimeZone` (src/timezone.ts) rechaza las zonas 'UTC' y 'Etc/UTC' con 'Invalid IANA time zone' porque no aparecen en `Intl.supportedValuesOf('timeZone')`, aunque son zonas IANA válidas y usables con Intl.DateTimeFormat; esto impide expandir cualquier regla en UTC.
- 🐛 La comprobación de `validateTimeZone` genera falsos negativos en general para cualquier alias de zona horaria que Intl acepte pero que `supportedValuesOf` no liste explícitamente.

**Casos de la suite oculta que fallan**

- ✗ [04] diario INTERVAL=3 recortado por la ventana (UTC)
- ✗ [12] diario con UNTIL (UTC)
- ✗ [14] mensual BYDAY=FR sin ordinal = todos los viernes del mes
- ✗ [16] semanal INTERVAL=2 empezando en miércoles (semanas con WKST=MO)
- ✗ [19] ventana anterior al inicio devuelve vacío

**Adaptaciones del adaptador**

- ⚙️ expandRecurrence solo acepta rangeStart/rangeEnd, start, rrule y timeZone: el mapeo con BenchInput es directo (dtstartUtc -> start, from -> rangeStart, to -> rangeEnd), sin necesidad de adaptación real más allá de convertir las Date resultantes a ISO string.

<sub>Juez: claude:sonnet · 2026-09-11 11:43 · adaptador: [results/muse-spark-1.3-contributor.adapter.ts](results/muse-spark-1.3-contributor.adapter.ts)</sub>

## LongCat-2.0 — 7.9

> Arquitectura limpia y manejo de DST correcto para los casos probados, pero UNTIL está completamente roto por un parseo de fecha inválido y MONTHLY con varios BYDAY puede devolver resultados desordenados; los tests cubren bien los cuatro escenarios pedidos pero no detectan estos bugs porque no prueban UNTIL, INTERVAL ni BYDAY multivaluado en MONTHLY.

- **Corrección** 3.58/4: suite oculta 17/19
- **Autonomía** 1/1: 0 intervención(es) del usuario (empezó en modo plan; la aprobación del plan no cuenta)
- **Tests propios** 1.5/2: pasan 0.5/0.5 (4/4) · cobertura 0.5/0.5 · cantidad 0.2/0.5 · calidad 0.3/0.5 (6/10)
- **Código** 0.8/2 (4/10)
- **Robustez** 1/1
- Cobertura de lo pedido: ✅ dstOctubreMadrid · ✅ ultimoViernes · ✅ mesesSin31 · ✅ countConByday

**Código**

- + Buena separación en módulos (types, parse, timezone, expand, index) con tipos propios sin `any`
- + Conversión local↔UTC con refinamiento iterativo para lidiar con DST, en vez de asumir offsets fijos
- + Algoritmo acotado por frecuencia (avanza por semanas/meses, no día a día) con early-exit al alcanzar COUNT/UNTIL/rango
- − UNTIL no funciona en absoluto: usa `Date.parse` sobre el formato básico de RFC5545 ('20250403T170000Z'), que no es válido para Date.parse y lanza excepción siempre
- − MONTHLY con varios valores BYDAY no ordenados por día de semana (p.ej. 'FR,MO') genera ocurrencias fuera de orden cronológico dentro del mismo mes, a diferencia de WEEKLY que sí ordena por weekday
- − Los segundos del dtstart se descartan silenciosamente en toda la cadena (LocalParts solo tiene hour/minute)
- − Sin validación de entradas en `expand()` (asume rule/startUTC ya válidos) y sin límite explícito de iteraciones más allá del rango de fechas

**Tests**

- + Cubre los 4 escenarios pedidos con aserciones concretas (horas locales, offsets, días de la semana, meses exactos)
- + El test de meses sin 31 y el de COUNT+BYDAY usan valores esperados fijos e independientes (array de meses, patrón de weekdays)
- + El test de DST verifica explícitamente el cambio de offset UTC+2→UTC+1 además de la hora local
- − No hay ningún test de UNTIL ni de INTERVAL>1, pese a que el enunciado los pide como parte del subconjunto soportado
- − Varias aserciones (DST, último viernes) se apoyan en funciones de la propia solución (utcToLocal/localToUTC) para construir los valores esperados, en vez de usar instantes ISO fijos calculados a mano
- − No hay tests de ventana parcial (from/to que recorten ocurrencias) ni de otras zonas horarias distintas de Europe/Madrid

**Bugs detectados por el juez**

- 🐛 UNTIL siempre lanza 'Invalid UNTIL' porque parseRRule usa Date.parse sobre el formato básico RFC5545 (sin separadores), que Date.parse no reconoce
- 🐛 MONTHLY con BYDAY multivaluado no ordenado (ej. 'FR,MO') produce ocurrencias en el orden de la lista BYDAY, no en orden cronológico dentro del mes
- 🐛 Los segundos de dtstartLocal se pierden silenciosamente en toda la cadena de conversión de zona horaria

**Casos de la suite oculta que fallan**

- ✗ [11] semanal INTERVAL=2 BYDAY=TU,TH con UNTIL inclusivo y cambio de hora
- ✗ [12] diario con UNTIL (UTC)

<sub>Juez: claude:sonnet · 2026-09-11 11:32 · adaptador: [results/longcat-2.0.adapter.ts](results/longcat-2.0.adapter.ts)</sub>
