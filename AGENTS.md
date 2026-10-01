<!-- GENERADO por `pnpm gen` (engine/gen.ts). No editar a mano: edita la fuente. -->

# Frames OS · MetodologIA

Sucesor de Frames ContentOS. Lo declarado en `registry/` es lo que el motor ejecuta. [CÓDIGO]

## Arranque

- `pnpm install --frozen-lockfile` (Node 22.23.1, pnpm 11.9.0).
- Pedido nuevo: `pnpm frames route "<pedido>"`. Si responde R0, haz su pregunta: como máximo 3 preguntas bloqueantes.
- Con familia clara: `pnpm frames start <familia> --request "<pedido>"`, luego `pnpm frames next <run>` hasta el siguiente gate.
- Retomar: `pnpm frames status` y `pnpm frames status <run> --capsule`.

## Flujo

- Cada paso lo ejecuta el motor; `engine/cli.ts` es la única ruta de escritura del estado de un run.
- Si `next` devuelve `needs_input`, escribe los artefactos pedidos en `requests/` del run y vuelve a llamar `next`.
- Un gate humano se aprueba con `frames approve`. **Lo corre la persona en su terminal; el agente nunca.**
- `hard_stop` (publicar, postular) no lo aprueba el motor: la persona actúa fuera.

## Verificación

- Gate: `pnpm verify` (ok · gap · red). Nada queda «listo» sin verify en ok o gap declarado.
- Ruteo: `pnpm frames eval`; los pisos solo suben.

## Definición de done

- El artefacto existe, pasa su schema y su gate; la evidencia es el archivo, no la afirmacion.
- `pnpm verify` sin red.
- Cada afirmación lleva evidence tag: [CÓDIGO] [CONFIG] [DOC] [INFERENCIA] [SUPUESTO].

## Reglas

- Una sola marca por entregable: MetodologIA por defecto; marca blanca por solicitud explícita. Identidades privadas entran por tokens externos.
- Aula usa sus ocho formatos; decks comerciales seleccionan `renderer=frames-aula`. El catálogo liga las 18 skills al motor por hashes.
- Sin efectos externos (publicar, enviar, NotebookLM, n8n) sin gate humano consumido.
- Generados (este archivo, adapters de host, settings): edita `engine/gen.ts` o `registry/` y corre `pnpm gen`.
- Alcance de escritura: `docs/scope.md` (el guard lo aplica).

## Familias

| Familia | Que hace | Estado |
|---|---|---|
| `aula` | Aula dinámica · formación y práctica | activa |
| `career.cover` | Cover letter | activa |
| `career.cv` | CV | activa |
| `career.search` | Búsqueda laboral | activa |
| `content.campaign` | Campaña | activa |
| `content.carousel` | Carrusel o pieza gráfica | activa |
| `content.piece` | Pieza de contenido | activa |
| `content.prompts` | Imágenes y miniclips | activa |
| `deck.immersive` | Presentación HTML inmersiva | activa |
| `improve` | Mejorar algo existente | activa |
| `meta.maintain` | Mantener Frames | activa |
| `nlm` | NotebookLM OS | activa |
| `skills.build` | Crear o mejorar una skill | activa |
| `trainer` | Trainer OS | activa |
| `video.method` | Método explicado con diagramas y video | activa |
