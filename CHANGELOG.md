# Changelog

Formato: una entrada por versión; cada línea dice qué cambió y qué lo prueba.

## [0.2.0-rc.1] — 2026-10-01

- Familia `aula` con ocho formatos y edición MetodologIA predeterminada; marca blanca por solicitud explícita. Las 18 skills incluyen dos decks comerciales dentro de `deck.immersive` con `renderer=frames-aula`.
- El catálogo runtime verifica fuentes, paquetes y handlers. El bridge comparte el motor Aula con Frames actual, conserva `frames-aula-v1` y entrega salidas mediante la autoridad del run.
- Dirección, especificación y aceptación conservan gates humanos con hashes actuales. La generación local produce `RENDERED_DRAFT`; no publica ni acredita aceptación humana.
- Desktop, tableta, móvil, interacción, rechazos y recorridos de las 18 combinaciones verificados. Se preservan tests y pisos históricos de routing.
- Publicación inicial en snapshot sanitizado, licencia MIT para código propio y atribución a Franklin Ospina y Javier Montaño. Avisos por componente en `NOTICE`.
- La versión estable requiere aceptación humana de tres piezas reales. Jarvis permanece en fallback local; Office es opcional y estático; los decks conservan cinco escenas originales.

## Baseline histórico — camino a 1.0.0

### Núcleo

- Registro tipado (`registry/`) que el motor lee en runtime: lo declarado es lo ejecutado. Invariantes: todo handler y schema declarado existe; un efecto externo exige un gate humano antes.
- Motor de runs con gates humanos de un uso atados al sha de los artefactos; `frames approve` solo en una terminal interactiva; el guard se lo niega al agente. Un artefacto editado en su gate reabre el paso.
- Guard único para Claude Code, Gemini CLI y Copilot, cada uno en su contrato documentado; Codex con sandbox y aprobación (waiver en ADR 0004). Ventanas de efecto para NotebookLM: la herramienta MCP solo corre después de su gate.
- `pnpm verify` tri-estado (ok · gap · red) con ratchet de gaps que solo baja.

### Núcleo de movimiento (ADR 0003)

- Escenas SMIL, DSL `motion-v1` para escenas e ilustraciones como datos, 19 ilustraciones, iconos Lucide fijados por integridad, saneador de SVG externo por lista blanca.
- Transiciones entre láminas con View Transitions nativas; ninguna con movimiento reducido.
- Captura determinista: PNG, PDF y MP4 (con transiciones) del mismo HTML; dos corridas dan los mismos bytes.
- Idiomas ES/EN/PT/FR en una sola página, con gate de completitud y de marcadores.

### Familias activas

- `content.piece`: brief portado tal cual (bytes idénticos a Frames) y pieza escrita con su HTML.
- `deck.immersive`: deck, playbook y workbook desde un `deck-v1`, con texto idéntico en los tres; reconstruye las dos referencias (A 25/25, B 19/19).
- `content.carousel`, `content.campaign`, `content.prompts`: carrusel 4:5, historia 9:16 y cuadrado; campaña con landing y publicar como hard stop; biblioteca de prompts interactiva.
- `video.method`: MP4 de 9:16 con subtítulos iguales a la narración (Frames no renderizaba este video; ADR 0005).
- `nlm`: runtime de NotebookLM de Frames portado tal cual, con efectos externos detrás de su gate.
- `trainer`: landing, masterclass (HTML y PDF), workbook, playbook y biblioteca con los límites de Trainer OS; benchmark ejecutado.
- `career.cv`, `career.cover`, `career.search`: código de carrera de Frames portado tal cual (108 tests pasan); CV en HTML, DOCX y PDF A4; postular es hard stop.
- `improve`: audita una página existente y acepta la mejorada solo si corrige hallazgos sin agregar ninguno.
- `skills.build` (ADR 0006): extensión local sobre el loader de Frames, instalada con `frames extend` solo tras su gate y con la prueba de una copia alterada; skill del sistema con la demotion, la política de efectos y el veredicto PASS/REVISE/UNKNOWN de Frames sobre casos que el clasificador del motor puntúa.
- `meta.maintain` (ADR 0006): base congelada, orden de trabajo con los límites de Frames, diff real contra el write set y el presupuesto de la orden, documentación cerrada contra el diff, deriva del inventario del ecosistema y handoff atado al sha verificado.

### Herramientas

- `frames doctor`: herramientas, registro, adapters, hooks, vendor, navegador, ffmpeg y runs que esperan un gate.
- `frames extend <run>`: instala una extensión local aprobada.

### Correcciones

- El chequeo de tildes cortaba las palabras en la tilde («funcionó» contaba como «funcion»): `\b` en JS es ASCII.
- El brief HTML de Frames, portado tal cual, fallaba el gate visual (índice a 4,0:1 y hash que desbordaba a 390 px); una capa CSS lo corrige sin tocar la proyección de Frames.

### Evaluación

- Ruteo: held-out v3 escrito antes de medir, 64,3 % top-1 y 92,9 % top-3 en su primera medición (piso fijado).
