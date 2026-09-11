# SQL — Resultados

Prompt: [PROMPT.md](PROMPT.md) · Carpeta de trabajo de cada modelo: `models/<modelo>/sql/` · Datos en bruto: [results/](results/)

La tabla la regenera `node scripts/bench.mjs collect|judge|report --test sql`. Las columnas que no genera el script (a partir de **Notas**) se conservan tal cual. Desglose de la nota, aciertos por categoría y comentarios del juez: [DETAILS.md](DETAILS.md) · Cómo se calcula: [RUBRIC.md](RUBRIC.md).

| Modelo | Nota | Estado | Suite oculta | Cód. | Cal. tests | Cobertura | Aislamiento | Tests | Otras TZ | tsc | Deps extra | LOC src/test | T. activo | T. total | Intervenciones | Pasos | Tools (err) | Tok. in | Tok. out | Tok. razon. | Tok. caché | Coste | Variante | Notas |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| DeepSeek V4 Pro (New) |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| DeepSeek V4.1 Flash | **9.8** | ✅ | 173/173 | 9 | 9 | 6/6 | 🔒 intentó | 64/64 | — | ✅ | ninguna | 1878/405 | 8m 47s | 8m 50s | 0 (plan) | 35 | 53 (1) | 38.7k | 31.6k | 77.4k | 3.22M | $0.0809 | max |  |
| GLM-5.3-Flash |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| GPT-5.6 Luna | **9.6** | ✅ | 172/173 | 9 | 9 | 6/6 | 🔒 intentó | 12/12 | — | — | ninguna | 1725/294 | 15m 44s | 15m 47s | 0 (plan) | 46 | 54 (2) | 138 | 28.6k | 52.1k | 3.21M | $0.1917 | max |  |
| Grok 4.6 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| Hy4 preview | **8.5**\* | ⏹ no terminó (≈95 %)\* | 172/173 | 9 | 9 | 6/6 | ⚠️ accedió | 81/81 | — | ❌ 1 | ninguna | 2310/637 | 36m 49s | 36m 53s | 0 (plan) | 88 | 94 (9) | 189.5k | 48.3k | 46.5k | 7.11M | $0.6937 | high |  |
| Kimi K2.7 Code |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| Kimi K3 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| LongCat-2.0 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| MiMo V2.5 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| MiMo V2.5 Pro |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| MiniMax-M2.7 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| MiniMax-M3 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| Muse Spark 1.3 Contributor | **9.5** | ✅ | 173/173 | 8 | 8 | 6/6 | ✅ | 33/33 | — | ✅ | ninguna | 2745/342 | 10m 41s | 10m 45s | 0 (plan) | 53 | 52 (1) | 231.2k | 45.8k | 46.5k | 3.52M | $0.0486 | xhigh |  |
| Qwen3.6 Plus |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| Qwen3.7 Max |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| Qwen3.7 Plus |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| Qwen3.8 Flash |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| Qwen3.8 Max |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |

## Leyenda

- **Nota** (0-10): corrección 5 + autonomía 1 + tests propios 1,5 + código 2 + robustez 0,5 − penalización. Ver [RUBRIC.md](RUBRIC.md).
- **Suite oculta**: casos de referencia (173, resultados calculados con SQLite) que pasa la solución. **Cód.** / **Cal. tests**: nota del juez sobre 10. **Cobertura**: escenarios del enunciado que sus tests cubren según el juez.
- **Estado**: ✅ todos los tests del modelo pasan al re-ejecutarlos · ❌ alguno falla o no hay tests · ⏳ ejecutando · ⛔ sin proyecto (nota 0) o cortado por cuota (repetir) · ⚠️ avisos (ver el JSON).
- **Aislamiento**: ✅ limpio · 🔒 intentó leer fuera de su carpeta pero se bloqueó · ⚠️ accedió a otras rutas del repo (contaminado) · 👀 exploró tu carpeta personal fuera del benchmark (no contamina, pero se registra) · ℹ️ contexto del editor.
- **Otras TZ**: no aplica a esta prueba (—).
- **Deps extra**: dependencias distintas de `vitest`, `@vitest/*`, `typescript` y `@types/node`.
- **Intervenciones**: mensajes del usuario tras la aprobación del plan + preguntas durante la construcción. `corte` = respuestas cortadas por el límite de tokens.
- **T. activo** / **T. total**, **Pasos**, **Tools (err)**, **Tokens**, **Coste**: como en RRULE.
