// deck-v1 + brand tokens → one offline HTML file. The brand arrives as tokens;
// nothing brand-specific lives in this renderer.
import type { DeckV1, Slide, TokensV1 } from './schema.ts';
import { css, js } from './runtime.ts';
import { DEFAULT_LAYOUT, scene } from './scenes.ts';
import { DEFS, esc, stars } from '../motion/smil.ts';

// Evidence tags are editorial metadata: they never reach the audience (A's present()).
export const EVIDENCE_TAG =
  /\s*\[(?:CÓDIGO|CODIGO|CODE|CONFIG|DOC|INFERENCIA|INFERENCE|SUPUESTO|ASSUMPTION|METODOLOGIA)\]/g;
export const present = (s: string) => esc(s.replace(EVIDENCE_TAG, ''));

export function copy(s: Slide, layout: string, lockup: string): string {
  let i = 0;
  const item = (tag: string, inner: string, cls = '') =>
    `<${tag} class="in ${cls}" style="--i:${++i}">${inner}</${tag}>`;
  const parts: string[] = [];
  if (lockup) parts.push(item('div', lockup, 'lockup'));
  if (s.eyebrow) parts.push(item('p', present(s.eyebrow), 'eyebrow'));
  parts.push(item('h1', present(s.title)));
  if (s.sub) parts.push(item('p', present(s.sub), 'sub'));
  if (s.items && !['terminal', 'close'].includes(s.kind))
    parts.push(`<ul class="list">${s.items.map((t) => item('li', present(t))).join('')}</ul>`);
  if (s.cols)
    parts.push(
      `<div class="cols">${s.cols.map((c) => item('div', `<b>${present(c.label)}</b>${c.items.map((t) => `<span>${present(t)}</span>`).join('')}`, 'col')).join('')}</div>`,
    );
  if (s.table)
    parts.push(
      `<table class="tbl"><thead><tr>${s.table.head.map((h) => `<th>${present(h)}</th>`).join('')}</tr></thead><tbody>${s.table.rows
        .map((r) =>
          item('tr', r.map((c, j) => (j ? `<td>${present(c)}</td>` : `<th>${present(c)}</th>`)).join('')),
        )
        .join('')}</tbody></table>`,
    );
  if (s.lesson) parts.push(item('p', present(s.lesson), 'lesson'));
  if (s.takeaway) parts.push(item('p', present(s.takeaway), 'takeaway'));
  if (s.disclaimer) parts.push(item('p', present(s.disclaimer), 'disclaimer'));
  if (s.links?.length)
    parts.push(
      item('p', s.links.map((l) => `<a href="${esc(l.href)}">${present(l.label)}</a>`).join(''), 'links'),
    );
  return `<div class="copy" data-layout="${layout}">${parts.join('')}</div>`;
}

export const layoutOf = (s: Slide) =>
  s.layout ?? (s.kind === 'zig' ? (s.side ?? 'left') : DEFAULT_LAYOUT[s.kind]);
export const lockupOf = (t: TokensV1) =>
  t.logo ? `<img src="${esc(t.logo)}" alt="${esc(t.wordmark)}">` : `<b>${esc(t.wordmark)}</b>`;

// The slide's scene as an SVG; `viewBox` crops it for layouts that set it beside the copy.
export function sceneSvg(s: Slide, t: TokensV1, viewBox = '0 0 1600 900') {
  const sc = scene(s, t);
  const svg = `<svg class="scene" viewBox="${viewBox}" role="img" aria-label="${present(s.scene_label)}" preserveAspectRatio="xMidYMid slice">${DEFS}${stars(s.id)}${sc.svg}</svg>`;
  return { svg, dur: sc.dur, freeze: sc.freeze };
}

export function renderDeck(deck: DeckV1, t: TokensV1): string {
  const n = deck.slides.length;
  const acts = new Map(deck.acts.map((a) => [a.id, a.title]));
  const lockup = lockupOf(t);
  const slides = deck.slides.map((s, k) => {
    const { svg, dur, freeze } = sceneSvg(s, t);
    return `<section class="slide" id="${s.id}" data-kind="${s.kind}" data-act="${esc(acts.get(s.act) ?? '')}" data-dur="${dur}" data-freeze="${freeze}" data-hold="${s.hold ?? deck.meta.hold}" data-tr="${s.transition ?? deck.meta.transition}" data-notes="${present(s.notes ?? '')}" aria-roledescription="diapositiva" aria-label="${k + 1} / ${n}">${svg}${copy(s, layoutOf(s), k === 0 || (t.logo && k === n - 1) ? lockup : '')}</section>`;
  });
  return `<!doctype html>
<html lang="${deck.meta.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'">
<meta name="generator" content="Frames OS deck.immersive">
<title>${present(deck.meta.title)}</title>
<meta name="description" content="${present(deck.meta.subtitle)}">
<style>${css(t)}</style>
</head>
<body>
<div id="shell"><div id="stage" data-w="1600" data-h="900">
${slides.join('\n')}
<div id="brand">${t.mark ? `<img class="mark" src="${esc(t.mark)}" alt="">` : esc(t.wordmark)}</div><div id="num"></div><div id="prog"><div id="progfill"></div></div>
</div></div>
<div id="auto">AUTO</div><aside id="overlay" role="dialog" aria-label="Notas del presentador"></aside>
<div id="help">→ ← lámina · A avance automático · P pausa · M menos movimiento · N notas · F pantalla completa · imprimir = PDF</div>
<script>${js()}</script>
</body>
</html>
`;
}
