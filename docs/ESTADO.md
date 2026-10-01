# Estado de Frames OS

Fuente de verdad para retomar en cualquier sesión. Las cifras salen de comandos, no de memoria: `pnpm verify`, `pnpm port:stats`, `pnpm refs`.

## Publicación de evaluación

`v0.2.0-rc.1` agrega 18 skills ejecutables de Aula y decks, en ambas ediciones, al refactor histórico. El catálogo `registry/aula-capabilities.json` fija sus hashes y handlers. Los bancos públicos de assets son opcionales; el funcionamiento básico es local.

La prerelease acredita validación técnica. La aceptación humana de las tres piezas reales sigue pendiente; todos los ejemplos nuevos son `RENDERED_DRAFT`.

## Olas

| Ola | Alcance                                                                 | Estado               |
| --- | ----------------------------------------------------------------------- | -------------------- |
| 0   | esqueleto, registro, motor, guards, evals de ruteo                      | cerrada              |
| 1   | `content.piece`                                                         | cerrada · superset   |
| 2   | `deck.immersive`                                                        | cerrada · superset   |
| M   | núcleo de movimiento (ADR 0003)                                         | cerrada              |
| 2b  | playbook, workbook, idiomas, escenas propias de B                       | cerrada              |
| 3   | carrusel, campaña, prompts                                              | cerrada · superset   |
| 4   | `video.method` (ADR 0005)                                               | cerrada · superset   |
| 5   | trainer + nlm                                                           | cerrada · superset   |
| 6   | career + improve                                                        | cerrada · superset   |
| 7   | skills.build, meta.maintain (ADR 0006), hooks de otros hosts (ADR 0004) | cerrada · superset   |
| 1.0 | aceptación de 3 piezas reales y tag `v1.0.0`                            | espera tu aceptación |

## Definición de "lista" (v1.0.0)

1. Las 15 familias activas o con waiver firmado; las 168 entradas históricas y 18 capacidades Aula del inventario mapean.
2. `pnpm parity --all` sin rojos.
3. `pnpm verify` ok con 0 gaps, o cada gap restante como waiver en un ADR.
4. Auditoría del harness 15/15.
5. Cada familia que emite HTML pasa el gate visual: 3 viewports, movimiento reducido y teclado.
6. Captura determinista: mismo input, mismos hashes.
7. El dueño acepta 3 piezas reales: un deck, un workbook o playbook, y un carrusel o video. Es un gate humano.
8. Tag local `v1.0.0`, más `CHANGELOG.md` y este archivo al día.

## Cómo está cada criterio

| #   | Criterio                                 | Evidencia                                                                                                                                                  |
| --- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 15/15 familias, 168 históricas + 18 Aula | `pnpm frames families` · `pnpm port:stats`                                                                                                                 |
| 2   | sucesión sin rojos                       | `verify` paso `parity`: las familias históricas superset y Aula añadida                                                                                    |
| 3   | 0 gaps                                   | `verify` paso `ratchet`: 0/0                                                                                                                               |
| 4   | auditoría del harness                    | `audit_harness.py` con H1, H2 y H3 requeridos; pasa con la copia de trabajo del toolkit (reconoce convenciones externas); la 2.18.0 instalada da 12/100    |
| 5   | gate visual en cada familia HTML         | deck, playbook, workbook, carrusel, historia, landing, biblioteca, guía NLM, curso: gate dentro de su paso; brief, CV y carta: auditoría en `verify:decks` |
| 6   | captura determinista                     | `verify/tests/capture.test.ts`                                                                                                                             |
| 7   | aceptación de 3 piezas                   | gate humano: solo el dueño                                                                                                                                 |
| 8   | tag, changelog y estado                  | `CHANGELOG.md`, este archivo; el tag sale tras el punto 7                                                                                                  |

## Pendientes del dueño

- Aceptar las tres piezas de v1. Cada run espera primero su gate `direction` (el brief) y después `acceptance` (la pieza terminada):
  - deck, playbook y workbook: `pnpm frames approve deck.immersive-5f7ba3f7 direction`
  - carrusel: `pnpm frames approve content.carousel-7479350b direction`
  - video: `pnpm frames approve video.method-64be0d22 direction`
  - Brief de cada uno para revisar: `work/runs/<run>/artifacts/brief-html.html`.

- Aprobar la dirección del post: `pnpm frames approve content.piece-40d499f7 direction`, en una terminal interactiva.
