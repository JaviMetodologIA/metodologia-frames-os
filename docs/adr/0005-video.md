# ADR 0005 · Video de método

- Estado: aceptado · 2026-09-24
- Contexto: Video OS de Frames planificaba y validaba JSON, pero no renderizaba («Video OS no renderiza», `01_intencion/video-os/ARCHITECTURE.md:11`). Los únicos MP4 salían de un piloto de Remotion con licencia `evaluation_only`. [DOC]

## Decisión

- El storyboard es un `deck-v1`: cada lámina es un beat, con su narración (`voiceover`) y su duración (`hold`). [CÓDIGO]
- `video.render` reproduce el formato historia (1080×1920) beat por beat, captura cada cuadro con el tiempo fijado y arma el MP4 con ffmpeg. Los beats se unen con la transición que cada lámina declara. [CÓDIGO]
- Los subtítulos WebVTT son la narración palabra por palabra, sobre la misma línea de tiempo que usa el encoder (`timeline()` en `engine/capture.ts`). [CÓDIGO]
- El manifiesto amarra el MP4 a su sha256, al digest de sus cuadros, a su duración y a sus subtítulos. [CÓDIGO]
- Se cumple el contrato de Frames: 9:16, 30 fps, de 15 a 180 s, hasta 30 beats, voz de hasta 1000 caracteres, 3,2 palabras por segundo y 8 textos de 160 caracteres. El comparador de sucesión rompe cada límite y exige el rechazo. [CÓDIGO]
- Productor (RT-07), revisor (RT-09) y guardián (RT-11) son tres agentes distintos, como exigía `video-os-state.ts:107`. [CÓDIGO]

## Waivers firmados

| Qué                 | Por qué                                                                                                                           | Mientras tanto                                                                              |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Audio narrado (TTS) | Frames tampoco generaba audio: `audio/narration.wav` era solo un hash declarado. No hay un motor de voz con licencia en el stack. | El MP4 sale sin audio (`audio: none` en el manifiesto) y trae la narración como subtítulos. |
| Remotion            | La licencia sigue sin adjudicar (ADR 0003).                                                                                       | La captura con Playwright y ffmpeg cubre el render, de forma determinista.                  |

## Consecuencias

- El test de punta a punta renderiza un MP4 real de 18 s (540 cuadros) y comprueba tamaño, fps, duración y subtítulos. Tarda unos dos minutos. [CÓDIGO]
- [SUPUESTO: la persona agrega la voz fuera del motor si la necesita; los subtítulos le dan el guion y los tiempos]
