// Social frames from the same deck-v1: a carousel (4:5), a story (9:16) or a square
// post, one slide per frame, played by the deck runtime at the frame's size and
// exported by `frames capture` (PNG per frame, MP4 for a story). The copy sits on top,
// the slide's scene below it, cropped to where the scene draws.
import type { DeckV1, TokensV1 } from './schema.ts';
import { copy, layoutOf, lockupOf, present, sceneSvg } from './render.ts';
import { css, js } from './runtime.ts';
import { esc } from '../motion/smil.ts';

export const FORMATS = {
  carousel: { w: 1080, h: 1350 },
  story: { w: 1080, h: 1920 },
  square: { w: 1080, h: 1080 },
} as const;
export type Format = keyof typeof FORMATS;

// Where each deck layout draws its scene (same crop as the playbook).
const CROP: Record<string, string> = {
  left: '800 0 800 900',
  right: '0 0 800 900',
  top: '0 250 1600 650',
  full: '0 0 1600 900',
};

// Copy on top at its natural height, the scene fills what is left (never under 35 %).
const frameCss = (w: number, h: number) =>
  `.slide.active{display:flex;flex-direction:column;padding:96px 72px 96px}
.slide .copy{position:static;flex:none;display:block;text-align:left;width:auto;max-width:none}
.slide h1{font-size:${h > w * 1.5 ? 76 : 64}px;line-height:1.02;max-width:none}.slide .sub{font-size:31px;max-width:none}
.slide .list li{font-size:27px;padding:12px 16px 12px 44px}.slide .eyebrow{font-size:21px}
.slide .fr{position:relative;flex:1;min-height:${Math.round(h * 0.35)}px;margin:24px -72px 0}.slide .fr svg{position:absolute;inset:0;width:100%;height:100%;display:block}
#num{right:72px;bottom:36px;font-size:22px}#brand{left:72px;bottom:36px;font-size:18px}body.cover #brand{opacity:.8}`;

export function renderFrames(deck: DeckV1, t: TokensV1, format: Format): string {
  const { w, h } = FORMATS[format];
  const n = deck.slides.length;
  const acts = new Map(deck.acts.map((a) => [a.id, a.title]));
  const slides = deck.slides.map((s, k) => {
    const { svg, dur, freeze } = sceneSvg(s, t, CROP[layoutOf(s)]);
    const fitted = svg.replace('preserveAspectRatio="xMidYMid slice"', 'preserveAspectRatio="xMidYMid meet"');
    return `<section class="slide" id="${s.id}" data-kind="${s.kind}" data-act="${esc(acts.get(s.act) ?? '')}" data-dur="${dur}" data-freeze="${freeze}" data-hold="${s.hold ?? deck.meta.hold}" data-tr="${s.transition ?? deck.meta.transition}" data-notes="${present(s.notes ?? '')}" aria-roledescription="diapositiva" aria-label="${k + 1} / ${n}">${copy(s, 'top', k === 0 ? lockupOf(t) : '')}<div class="fr">${fitted}</div></section>`;
  });
  return `<!doctype html>
<html lang="${deck.meta.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'">
<meta name="generator" content="Frames OS content.carousel · ${format} ${w}x${h}">
<title>${present(deck.meta.title)}</title>
<meta name="description" content="${present(deck.meta.subtitle)}">
<style>${css(t, w, h)}
${frameCss(w, h)}</style>
</head>
<body>
<div id="shell"><div id="stage" data-w="${w}" data-h="${h}">
${slides.join('\n')}
<div id="brand">${esc(t.wordmark)}</div><div id="num"></div><div id="prog"><div id="progfill"></div></div>
</div></div>
<div id="auto">AUTO</div><aside id="overlay" role="dialog" aria-label="Notas del presentador"></aside>
<div id="help">→ ← lámina · A avance automático · P pausa · M menos movimiento · N notas · F pantalla completa</div>
<script>${js(w, h)}</script>
</body>
</html>
`;
}

// Frames' carousel rules (02_proceso/workflows/content/types/carousel/schema.ts), held
// on the same deck-v1: 3 to 10 cards, a conclusion first and a call to action last
// (CAR-003) at position 3 or later (CAR-005), a pillar on every support card
// (CAR-004), 1 to 8 sources and alt text on every card, and Frames' text limits.
const EMOJI = /\p{Extended_Pictographic}/u;
export function carouselGate(deck: DeckV1): string[] {
  const errs: string[] = [];
  const s = deck.slides;
  if (s.length < 3 || s.length > 10) errs.push(`${s.length} tarjetas: un carrusel lleva de 3 a 10`);
  s.forEach((c, k) => {
    const at = `tarjeta ${k + 1} (${c.id})`;
    if (!c.role) errs.push(`${at}: sin role`);
    if (!c.alt) errs.push(`${at}: sin texto alternativo (alt, 20 a 700)`);
    if (c.role === 'support' && !c.pillar) errs.push(`${at}: una tarjeta support necesita pillar`);
    if (!c.sources?.length) errs.push(`${at}: cada tarjeta cita de 1 a 8 fuentes (sources)`);
    if ((c.eyebrow?.length ?? 0) > 64) errs.push(`${at}: eyebrow de más de 64 caracteres`);
    if (c.title.length > 96) errs.push(`${at}: título de más de 96 caracteres`);
    if ((c.sub?.length ?? 0) > 360) errs.push(`${at}: texto de más de 360 caracteres`);
    if ((c.items?.length ?? 0) > 3) errs.push(`${at}: más de 3 viñetas`);
    if (c.items?.some((i) => i.length > 120)) errs.push(`${at}: una viñeta pasa de 120 caracteres`);
    if ([c.title, c.sub ?? '', ...(c.items ?? [])].some((x) => EMOJI.test(x)))
      errs.push(`${at}: emoji en el texto`);
  });
  if (s.length && s[0]!.role !== 'conclusion') errs.push('la primera tarjeta debe ser conclusion');
  if (s.length && s[s.length - 1]!.role !== 'cta') errs.push('la última tarjeta debe ser cta');
  const cta = s.findIndex((c) => c.role === 'cta');
  if (cta >= 0 && cta + 1 < 3) errs.push('la llamada a la acción llega antes de la tarjeta 3');
  if (!deck.meta.caption) errs.push('falta meta.caption (40 a 2200)');
  if (!deck.meta.alt) errs.push('falta meta.alt del conjunto (40 a 2200)');
  if (!deck.meta.cta) errs.push('falta meta.cta (8 a 180)');
  return errs;
}
