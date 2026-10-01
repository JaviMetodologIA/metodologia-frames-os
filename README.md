# Frames OS · por MetodologIA

Autoría de Franklin Ospina y Javier Montaño. Código propio bajo [MIT](LICENSE).
Versión pública de evaluación: `v0.2.0-rc.1`; aceptación humana de la versión estable pendiente.

Sucesor de Frames ContentOS. Convierte una idea, una fuente o una necesidad de comunicación en un
entregable verificado: presentaciones HTML inmersivas, playbooks y workbooks, carruseles, campañas,
videos de método, cursos, cuadernos de NotebookLM, CV y cartas, y la mejora de páginas existentes.

**Lo declarado es lo ejecutado:** `registry/` es la única declaración y el motor la lee en runtime.
Cada pieza visual pasa por un navegador real antes de llegar a una persona, y cada gate humano lo
aprueba la persona en su terminal.

## Empezar

```bash
pnpm install --frozen-lockfile
pnpm frames route "convierte este informe en una presentación animada"
pnpm frames families
pnpm frames doctor
pnpm verify
```

Renderizar un deck en sus tres layouts y capturarlo:

```bash
pnpm frames deck verify/parity/cases/deck.immersive/frames-os/deck.yml --out work/deck.html
pnpm frames deck verify/parity/cases/deck.immersive/frames-os/deck.yml --out work/playbook.html --layout playbook
pnpm frames capture work/deck.html --mp4 work/deck.mp4 --seconds 3 --slides portada,eje,ciclo
```

## Aula y decks comerciales

MetodologIA es la edición predeterminada. Solicita «marca blanca» para una identidad neutral configurable. Conceptos seleccionan masterclass; práctica, workbook; sesión presentada, clase inmersiva; kit completo, módulo. Lean Coffee, playbooks e índices admiten selección explícita.

```bash
pnpm frames start aula --request "Crea un workbook para practicar prompts"
pnpm frames start deck.immersive --request "Crea un deck comercial de marca blanca"
pnpm frames next <run>
```

El run solicita aprobación humana de dirección y de especificación antes del renderer, y de aceptación después. Usa `pnpm frames approve <run> <gate>` en terminal interactiva cuando el run lo indique. El catálogo verifica las 18 skills; cada paquete también admite uso autónomo mediante su `SKILL.md`. Ver [NOTICE](NOTICE) para licencias y límites de marca.

Requisitos de verificación: Node y pnpm fijados en `package.json`, Python 3.12, Chromium de Playwright y FFmpeg. Office opcional requiere `python-pptx==1.0.2` y `python-docx==1.2.0`.

## Qué hay

| Carpeta     | Qué hay                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------ |
| `registry/` | familias, gates, agentes, lock de vendor                                                   |
| `engine/`   | CLI, clasificador, runs, gates, captura, generador de adapters, guard                      |
| `domains/`  | núcleo de movimiento (`motion/`) y un dominio por familia; código de Frames en `*/frames/` |
| `verify/`   | `pnpm verify`, tests, evals de ruteo, inventario y sucesión frente a Frames                |
| `docs/`     | alcance del agente (`scope.md`), estado (`ESTADO.md`) y ADRs                               |
| `work/`     | estado local de runs (ignorado por git)                                                    |

Estado de las olas y definición de «lista»: `docs/ESTADO.md`. Decisiones: `docs/adr/`.
