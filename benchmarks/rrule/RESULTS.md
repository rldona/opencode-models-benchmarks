# RRULE — Resultados

Prompt: [PROMPT.md](PROMPT.md) · Carpeta de trabajo de cada modelo: `models/<modelo>/rrule/` · Datos en bruto: [results/](results/)

La tabla la regenera `node scripts/bench.mjs collect|judge|report`. Las columnas desde **DST** en adelante son de revisión manual: el script las conserva tal cual. Desglose de la nota y comentarios del juez: [DETAILS.md](DETAILS.md) · Cómo se calcula: [RUBRIC.md](RUBRIC.md).

| Modelo | Nota | Estado | Suite oculta | Cód. | Cal. tests | Cobertura | Aislamiento | Tests | Otras TZ | tsc | Deps extra | LOC src/test | T. activo | T. total | Intervenciones | Pasos | Tools (err) | Tok. in | Tok. out | Tok. razon. | Tok. caché | Coste | Variante | DST | -1FR | Día 31 | COUNT+BYDAY | Notas |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| DeepSeek V4 Pro (New) | **9.4** | ✅ | 19/19 | 8 | 8 | 4/4 | ✅ | 7/7 | ✅ | ✅ | ninguna | 332/118 | 6m 47s | 6m 57s | 0 (plan) | 14 | 16 (0) | 23.4k | 8.8k | 21.0k | 307.6k | $0.0813 | max |  |  |  |  |  |
| DeepSeek V4.1 Flash | **9.8** | ✅ | 19/19 | 9 | 9 | 4/4 | ✅ | 15/15 | ✅ | ✅ | ninguna | 502/216 | 3m 30s | 3m 36s | 0 (plan, 1 preg. plan) | 16 | 22 (0) | 24.2k | 12.6k | 28.6k | 523.3k | $0.0300 | max |  |  |  |  |  |
| GLM-5.3 | **9.8** | ✅ | 19/19 | 9 | 9 | 4/4 | ✅ | 60/60 | ✅ | ✅ | ninguna | 569/510 | 15m 20s | 15m 22s | 0 (plan) | 8 | 16 (0) | 100.1k | 15.3k | 64.1k | 361.4k | $0.5837 | max |  |  |  |  |  |
| GLM-5.3-Flash | **9.6** | ✅ | 19/19 | 8 | 9 | 4/4 | ✅ | 17/17 | ✅ | ✅ | ninguna | 376/240 | 10m 32s | 10m 34s | 0 (plan) | 20 | 24 (1) | 140.4k | 58.8k | 0 | 973.7k | $0.0797 | max |  |  |  |  |  |
| GPT-5.6 Luna | **9.6** | ✅ | 19/19 | 9 | 9 | 4/4 | 🔒 intentó | 7/7 | ✅ | ✅ | ninguna | 653/116 | 6m 12s | 6m 14s | 0 (plan) | 18 | 27 (2) | 54 | 11.4k | 22.2k | 467.7k | $0.0677 | max |  |  |  |  |  |
| Grok 4.6 | **9.2** | ✅ | 19/19 | 8 | 7 | 4/4 | ✅ | 4/4 | ✅ | ✅ | ninguna | 369/81 | 7m 56s | 7m 58s | 0 (plan) | 11 | 19 (0) | 75.6k | 6.8k | 23.5k | 208.5k | $0.4372 | xhigh |  |  |  |  |  |
| Hy4 preview | **9.8** | ✅ | 19/19 | 9 | 9 | 4/4 | 👀 fuera | 40/40 | ✅ | ✅ | ninguna | 431/539 | 12m 29s | 12m 31s | 0 (plan) | 40 | 44 (0) | 101.1k | 20.5k | 20.3k | 1.35M | $0.2432 | high |  |  |  |  |  |
| Kimi K2.7 Code | **8.9** | ✅ | 18/19 | 7 | 8 | 4/4 | ✅ | 6/6 | ✅ | ✅ | ninguna | 386/111 | 8m 41s | 8m 43s | 0 (plan) | 22 | 26 (1) | 38.2k | 10.3k | 10.2k | 395.8k | $0.1933 | default |  |  |  |  |  |
| Kimi K3 | **8.9** | ✅ | 16/19 | 8 | 9 | 4/4 | 👀 fuera | 9/9 | ✅ | ✅ | ninguna | 358/160 | 11m 00s | 11m 02s | 0 (plan) | 18 | 22 (0) | 28.8k | 10.4k | 9.4k | 313.1k | $0.4782 | max |  |  |  |  |  |
| LongCat-2.0 | **7.9** | ✅ | 17/19 | 4 | 6 | 4/4 | ✅ | 4/4 | ✅ | ✅ | ninguna | 298/98 | 20m 53s | 20m 55s | 0 (plan) | 30 | 33 (0) | 101.0k | 11.6k | 51.1k | 1.43M | $0.1141 | high |  |  |  |  |  |
| MiMo V2.5 | **8.7** | ✅ | 16/19 | 7 | 8 | 4/4 | ✅ | 13/13 | ✅ | ✅ | ninguna | 446/355 | 5m 11s | 5m 12s | 0 (plan) | 26 | 27 (0) | 50.0k | 29.8k | 0 | 513.9k | $0.0168 | default |  |  |  |  |  |
| MiMo V2.5 Pro | **8.2** | ✅ | 13/19 | 8 | 8 | 4/4 | ✅ | 25/25 | ✅ | ✅ | ninguna | 533/520 | 7m 33s | 7m 36s | 0 (plan) | 44 | 42 (0) | 52.2k | 24.9k | 0 | 1.12M | $0.0485 | default |  |  |  |  |  |
| MiniMax-M2.7 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| MiniMax-M3 | **9.1** | ✅ | 17/19 | 8 | 8 | 4/4 | ✅ | 19/19 | ✅ | ✅ | ninguna | 399/273 | 6m 49s | 6m 51s | 0 (plan) | 40 | 38 (0) | 40.5k | 34.4k | 13.8k | 1.33M | $0.1500 | thinking |  |  |  |  |  |
| Muse Spark 1.3 Contributor | **8.1** | ✅ | 14/19 | 7 | 8 | 4/4 | ✅ | 8/8 | ✅ | ✅ | ninguna | 578/187 | 3m 41s | 3m 44s | 0 (plan) | 26 | 26 (0) | 48.7k | 15.8k | 9.0k | 574.8k | $0.0110 | xhigh |  |  |  |  |  |
| Qwen3.6 Plus |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| Qwen3.7 Max |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| Qwen3.7 Plus |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| Qwen3.8 Flash |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| Qwen3.8 Max |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |

## Leyenda

- **Nota** (0-10): corrección 4 + autonomía 1 + tests propios 2 + código 2 + robustez 1 − penalización. Ver [RUBRIC.md](RUBRIC.md).
- **Suite oculta**: casos de referencia que pasa la solución (el modelo no los conoce). **Cód.** / **Cal. tests**: nota del juez sobre 10. **Cobertura**: escenarios del enunciado que sus tests cubren según el juez.
- **Estado**: ✅ todos los tests del modelo pasan al re-ejecutarlos · ❌ alguno falla o no hay tests · ⏳ sesión sin terminar · ⛔ la sesión terminó sin generar proyecto (nota 0) · ⚠️ avisos (modelo distinto al esperado, timeout…; ver el JSON).
- **Aislamiento**: ✅ limpio · 🔒 intentó leer fuera de su carpeta pero se bloqueó · ⚠️ accedió a otras rutas del repo (resultado contaminado: otras soluciones, resultados o suite oculta) · 👀 exploró tu carpeta personal fuera del benchmark (no contamina, pero se registra) · ℹ️ opencode le pasó el fichero abierto en el editor.
- **Tests**: tests del propio modelo que pasan / total, ejecutados de nuevo con `vitest run` en la TZ del sistema.
- **Otras TZ**: los mismos tests con `TZ=UTC`, `America/New_York` y `Asia/Kolkata`. Si fallan, la implementación (o sus tests) depende de la zona horaria de la máquina.
- **tsc**: `tsc --noEmit` sobre el `tsconfig.json` del proyecto (— si no hay).
- **Deps extra**: dependencias distintas de `vitest`, `@vitest/*`, `typescript` y `@types/node` (el enunciado prohíbe librerías externas).
- **T. activo**: suma del tiempo en que el modelo está trabajando (incluye la ejecución de herramientas y las esperas de permisos). **T. total**: desde el primer mensaje hasta la última respuesta.
- **Intervenciones**: mensajes del usuario después del prompt inicial + preguntas que el modelo le hizo con la herramienta `question` durante la construcción. `plan` = empezó en el agente plan (la aprobación del plan no cuenta) · `preg. plan` = preguntas en la fase plan (no cuentan) · `preg.` = preguntas durante build (cuentan) · `corte` = respuestas cortadas por el límite de tokens de salida.
- **Pasos**: llamadas al modelo. **Tools (err)**: llamadas a herramientas (las que fallaron).
- **Tokens / Coste**: suma de la sesión y sus subagentes, según opencode.
