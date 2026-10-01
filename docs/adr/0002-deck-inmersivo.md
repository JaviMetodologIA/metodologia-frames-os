# ADR 0002 · Presentaciones HTML inmersivas: `deck.immersive`

Estado: aceptado · 2026-09-24 · ola 2

## Decisión

Una presentación es **datos**. `deck-v1` es la fuente tipada: actos, láminas, `kind`, notas y cifras con fuente. Junto con un archivo de tokens de marca, el mismo renderer produce un HTML offline de un solo archivo. [CÓDIGO]

- **22 `kind`s de escena, sin texto de ningún tema.** Las escenas SMIL hacen loop y cada una declara el cuadro donde se congela con movimiento reducido. Las cifras se dibujan fijas, nunca se animan.
- **La marca entra por tokens.** El repo solo trae `brand/metodologia.deck-tokens.json`, con hex tomados de `brand-tokens.yml` de Frames. Otra marca llega con `--brand <tokens.json>` desde fuera del repo.
- **Texto sobre relleno:** tinta o blanco según el contraste WCAG contra el token real, con mínimo 4,5. MetodologIA no permite blanco sobre dorado.
- **Gates de contenido**, la unión de las dos referencias más tres nuevos:
  - eje en el primer tercio;
  - todos los actos cubiertos;
  - sin evidence tags visibles ni rutas absolutas;
  - hex solo de los tokens;
  - un h1 por lámina;
  - loops;
  - términos prohibidos;
  - 400 KB;
  - nuevos: **enlaces que resuelven**, **tildes en español** y **nombre accesible por visual**.
- **Gate visual en Chromium:** 1920, 1366 y 390 sin desborde; teclado; cada escena se mueve y queda quieta con movimiento reducido. Mientras mide, esconde el texto: la entrada del texto no puede pasar por movimiento de la escena.

## Evidencia de sucesión

- Frames no generaba decks: su perfil `commercial-proposal` sellaba `deck.materialized: false`, con tope `RENDERED_DRAFT`. Veredicto: `superset`. [CÓDIGO]
- `pnpm refs` reconstruye las dos referencias desde **sus propias fuentes JSON y con sus propias paletas**, en `work/external` (fuera de git: llevan marca Amaris o de cliente). [CÓDIGO]

| Referencia                         | Láminas | Gates | Gate visual | Escenas equivalentes | Qué se pierde                                                                            |
| ---------------------------------- | ------- | ----- | ----------- | -------------------- | ---------------------------------------------------------------------------------------- |
| A · Puntos Colombia (Demo Day)     | 25      | ok    | ok          | 25/25                | la fuente por cifra no existe en el origen (las 6 ilustraciones se portaron, ADR 0003)   |
| B · Agentic SDLC (Clase Inmersiva) | 19      | ok    | ok          | 19/19                | el tecleo de `$ make check` pasa de un recorte que crece a glifos que aparecen uno a uno |

## Pendiente de la ola 2 (declarado, no afirmado)

- ~~Playbook con scroll y workbook interactivo~~: cerrado (`domains/deck/playbook.ts`), con paridad de texto verificada.
- ~~Selector de idioma ES/EN/PT/FR~~: cerrado (`domains/motion/i18n.ts`); la muestra trae los cuatro completos.
- ~~Ilustraciones hechas a medida~~: cerrado en el ADR 0003.
- **Aceptación humana** de una presentación real, por la tarea de entregables.
