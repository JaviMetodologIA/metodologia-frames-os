# ADR 0003 · Núcleo de movimiento

- Estado: aceptado · 2026-09-24
- Contexto: la capacidad central del sucesor es producir HTML interactivo, ilustrado y animado, con movimiento y transiciones. Cada familia visual (deck, playbook, workbook, carrusel, campaña, video, curso) lo necesita. [DOC]

## Decisión

Un solo núcleo en `domains/motion/`, que todas las familias consumen:

| Pieza              | Archivo             | Qué hace                                                                                                               |
| ------------------ | ------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Primitivas SMIL    | `smil.ts`           | loops reiniciables, trazos que se dibujan, movimiento por trayectoria, pulsos                                          |
| Color              | `color.ts`          | tinta o blanco sobre cada relleno, según el contraste WCAG real contra los tokens                                      |
| Escenas como datos | `custom.ts`         | DSL `motion-v1`, validado con Zod: formas, texto, iconos, personas y grupos, con pistas draw, op, move, rotate y scale |
| Ilustraciones      | `art.ts`            | 5 genéricas en TS, las 6 a medida de la referencia A portadas a `motion-v1` y 8 figuras nuevas                         |
| Iconos             | `icons.ts`          | Lucide (ISC), fijado por versión e integridad en `registry/vendor.lock.json`, inlinado en el build                     |
| SVG externo        | `sanitize.ts`       | lista blanca de elementos y atributos; lo que no está permitido rechaza el archivo entero                              |
| Captura            | `engine/capture.ts` | PNG, PDF y MP4 del mismo HTML, fijando el tiempo de cada cuadro                                                        |

Las transiciones entre láminas usan la View Transitions API nativa (`fade`, `push`, `zoom`, `morph`, `none`). Cada lámina declara la suya, y el deck declara una por defecto. Sin la API, o con movimiento reducido, el cambio es instantáneo. [CÓDIGO]

## Por qué así

- **Datos, no SVG crudo:** el host describe la escena y el motor la dibuja. Así la escena no puede traer hex fuera de marca, un script ni un `keyTimes` desordenado que SMIL descartaría en silencio: el gate lo detecta antes. [CÓDIGO]
- **El tiempo se fija, no se lee:** SMIL (`setCurrentTime`) y Web Animations (`currentTime`) permiten pintar cualquier instante. Por eso carrusel, video y PDF salen del mismo HTML con cuadros deterministas; el test `capture.test.ts` lo prueba con hashes. [CÓDIGO]
- **Nativo antes que dependencia:** SMIL, Web Animations y View Transitions cubren lo que Frames buscaba en librerías de terceros. [CONFIG]

## Waivers firmados

| Dependencia en Frames         | Estado en Frames                         | Decisión                        | Reemplazo                              |
| ----------------------------- | ---------------------------------------- | ------------------------------- | -------------------------------------- |
| GSAP 3.15                     | `verified_custom_restricted`             | fuera                           | SMIL + Web Animations                  |
| Three.js / @react-three/fiber | `productionEligibility: blocked_license` | fuera                           | ilustraciones isométricas en SVG       |
| Lottie (@remotion/lottie)     | `evaluation_only`                        | fuera                           | escenas `motion-v1`                    |
| Remotion 4                    | licencia sin adjudicar                   | pack opcional futuro            | `frames capture --mp4` con ffmpeg      |
| d3                            | ISC, sin uso en decks                    | fuera hasta que un caso lo pida | SVG a mano; las cifras nunca se animan |

Fuente de los estados: `04_estado/registries/renderers/renderer-capability-registry-v1.yml` en Frames. [CONFIG]

## Consecuencias

- La referencia A pasa de 19/25 a 25/25 escenas exactas. Sus ilustraciones usan el slot `c2` donde A usaba su azul `c1`, por contraste sobre fondos oscuros. [CÓDIGO]
- La referencia B pasa de 9/19 a 19/19: sus 10 escenas por etapa del SDLC se escriben como datos `motion-v1` en `verify/parity/external/b-scenes.ts`, con sus coordenadas y tiempos. Para eso el DSL sumó `glow`, `along`, `attr`, `dash`, `turn`, flechas y texto monoespaciado. [CÓDIGO]
- El video no lleva transiciones entre láminas: los cortes son directos. Las transiciones en video llegan con `video.method`, en la ola 4. [SUPUESTO: un corte directo basta mientras no haya un caso de video real]
