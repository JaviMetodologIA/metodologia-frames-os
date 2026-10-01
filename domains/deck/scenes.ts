// Scene library: one looping SVG per slide kind, drawn from the slide's own data
// (chain, items, cards, metrics). No topic text is hard-coded here. Each scene
// returns its loop length and the fraction where reduced motion freezes it: a
// meaningful end state, never a blank. Numbers are drawn static, never animated.
import type { Slide, TokensV1 } from './schema.ts';
import {
  BOLD,
  MONO,
  T,
  TC,
  anim,
  check,
  draw,
  glow,
  lock,
  move,
  person,
  pulseR,
  ringPath,
  slideTr,
  spin,
  token,
  vis,
} from '../motion/smil.ts';
import { onFor, type On } from '../motion/color.ts';
import { ART, COL } from '../motion/art.ts';
import { renderMotion } from '../motion/custom.ts';
import { sanitizeSvg } from '../motion/sanitize.ts';
export { contrast, onFor } from '../motion/color.ts';

export type Scene = { svg: string; dur: number; freeze: number };

let on: On = () => 'var(--white)';
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// `highlight` lists the nodes that stay lit (0-based); the rest dim. Empty: all lit.
function ring(
  cx: number,
  cy: number,
  r: number,
  D: number,
  labels: string[],
  nodeR = 44,
  highlight: number[] = [],
): string {
  const n = Math.max(labels.length, 3);
  const g = [
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--line)" stroke-width="3" opacity=".7"/>`,
    `<g>${spin(cx, cy, D * 4)}<circle cx="${cx}" cy="${cy}" r="${r + 38}" fill="none" stroke="var(--c2)" stroke-width="1.5" stroke-dasharray="3 14" opacity=".45"/></g>`,
  ];
  for (let k = 0; k < n; k++) {
    const a = ((-90 + (360 / n) * k) * Math.PI) / 180;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    const t = k / n || 0.001;
    const hot = !highlight.length || highlight.includes(k);
    const col = hot ? COL[k % 8]! : 'var(--dim)';
    g.push(
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${nodeR}" fill="${col}"${hot ? '' : ' opacity=".5"'}>${pulseR(nodeR, nodeR * 1.18, t, D)}</circle>`,
    );
    if (labels[k])
      g.push(
        TC(x.toFixed(1), (y + 7).toFixed(1), clip(labels[k]!, 12), 17, hot ? on(col) : 'var(--white)', BOLD),
      );
  }
  g.push(
    `<g>${token()}${move(
      ringPath(cx, cy, r),
      [
        [0, 0],
        [1, 1],
      ],
      D,
    )}</g>`,
  );
  return g.join('');
}

// An external illustration, fitted to a 560 px box and floating gently (it may carry
// its own SMIL too). The source gate has already rejected anything off the allowlist.
function external(s: Slide, cx: number, cy: number, D: number): string {
  const r = sanitizeSvg(s.art_svg!, s.id);
  if (!r.ok) return '';
  const k = Math.min(560 / r.box[0], 560 / r.box[1]);
  const [w, h] = [r.box[0] * k, r.box[1] * k];
  const float = slideTr(
    [
      [0, '0 0'],
      [0.5, '0 -12'],
      [1, '0 0'],
    ],
    D,
  );
  return `<g transform="translate(${(cx - w / 2).toFixed(1)} ${(cy - h / 2).toFixed(1)})"><g>${float}<g transform="scale(${k.toFixed(4)})">${r.inner}</g></g></g>`;
}

const custom = (s: Slide): Scene => ({
  svg: renderMotion(structuredClone(s.scene!)),
  dur: s.scene!.dur,
  freeze: s.scene!.freeze,
});

const S: Record<Slide['kind'], (s: Slide) => Scene> = {
  cover: (s) => ({
    svg: glow(1160, 470, 420, 'var(--brand)', 0.7) + ring(1160, 470, 250, 12, s.chain ?? [], 50),
    dur: 12,
    freeze: 0.02,
  }),

  question: () => {
    const D = 10;
    const g = [
      glow(800, 690, 620, 'var(--accent)', 0.35),
      `<rect x="230" y="600" width="210" height="140" rx="22" fill="var(--c1)"/>`,
      `<rect x="1060" y="590" width="280" height="160" rx="22" fill="var(--card)" stroke="var(--accent)" stroke-width="3"/>`,
    ];
    for (let k = 0; k < 7; k++) {
      const t0 = 0.04 + k * 0.1;
      const to = `${990 - (k % 4) * 100} ${690 - Math.floor(k / 4) * 64}`;
      g.push(
        `<g opacity="0">${vis(t0, 0.92, D, 0.01)}<rect x="-44" y="-26" width="88" height="52" rx="9" fill="var(--c4)"/><rect x="-30" y="-10" width="50" height="6" rx="3" fill="var(--ink)" opacity=".6"/>${slideTr(
          [
            [0, '440 670'],
            [t0, '440 670'],
            [t0 + 0.06, to],
            [1, to],
          ],
          D,
        )}</g>`,
      );
    }
    g.push(
      `<g transform="translate(1200 540)"><circle r="34" fill="none" stroke="var(--c2)" stroke-width="4"/><line x1="0" y1="0" x2="0" y2="-24" stroke="var(--c4)" stroke-width="5" stroke-linecap="round">${spin(0, 0, 3)}</line></g>`,
    );
    return { svg: g.join(''), dur: D, freeze: 0.85 };
  },

  // The axis: its chain lights up box by box, joined by strokes that draw themselves.
  axis: (s) => {
    const D = 12;
    const chain = s.chain ?? [];
    const g = [glow(1170, 460, 430, 'var(--brand)', 0.6)];
    const step = 560 / Math.max(chain.length - 1, 1);
    chain.forEach((c, k) => {
      const y = 180 + k * step;
      const t = 0.05 + k * (0.7 / chain.length);
      if (k)
        g.push(
          `<path d="M1170 ${y - step + 36} V${y - 36}" pathLength="1" stroke-dasharray="1" stroke="var(--c2)" stroke-width="4" fill="none">${draw(D, t - 0.08, t)}</path>`,
        );
      g.push(
        `<rect x="930" y="${y - 32}" width="480" height="64" rx="18" fill="var(--card)" stroke="var(--line)" stroke-width="2"/>`,
      );
      g.push(
        `<rect x="930" y="${y - 32}" width="480" height="64" rx="18" fill="${COL[k % 8]}" fill-opacity=".35" stroke="${COL[k % 8]}" stroke-width="3" opacity="0">${vis(t, 1, D)}</rect>`,
      );
      g.push(TC(1170, y + 8, clip(c, 34), 22, 'var(--white)', BOLD));
    });
    // A token walks the chain for the whole loop: the scene never stands still, even
    // with two nodes whose reveals are seconds apart.
    const end = 180 + (chain.length - 1) * step;
    g.push(
      `<g>${token('var(--accent)', 9)}${move(
        `M890 180 V${end.toFixed(1)}`,
        [
          [0, 0],
          [0.85, 1],
          [1, 1],
        ],
        D,
      )}</g>`,
    );
    return { svg: g.join(''), dur: D, freeze: 0.95 };
  },

  section: (s) => ({
    svg:
      glow(1150, 470, 440, 'var(--brand)', 0.75) +
      ring(1150, 470, 250, 14, s.chain ?? [], 40, s.highlight) +
      TC(1150, 530, s.num ?? '', 190, 'var(--accent)', 'font-weight="700" opacity=".95"'),
    dur: 14,
    freeze: 0.02,
  }),

  statement: () => ({
    svg:
      glow(800, 450, 620, 'var(--brand)', 0.55) +
      `<g>${spin(800, 450, 60)}<circle cx="800" cy="450" r="380" fill="none" stroke="var(--c2)" stroke-width="2" stroke-dasharray="4 16" opacity=".4"/></g>` +
      `<g>${spin(800, 450, 40, true)}<circle cx="800" cy="450" r="300" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="2 22" opacity=".45"/></g>`,
    dur: 18,
    freeze: 0.5,
  }),

  list: (s) => {
    const D = 12;
    const n = Math.max(s.items?.length ?? 3, 1);
    const g = [
      glow(1180, 460, 420, 'var(--brand)', 0.5),
      `<line x1="1180" y1="200" x2="1180" y2="${200 + (n - 1) * 110}" stroke="var(--line)" stroke-width="4"/>`,
    ];
    for (let k = 0; k < n; k++) {
      const y = 200 + k * 110;
      const t = 0.08 + k * (0.7 / n);
      g.push(
        `<circle cx="1180" cy="${y}" r="26" fill="var(--card)" stroke="${COL[k % 8]}" stroke-width="4"/>`,
      );
      g.push(
        `<g opacity="0">${vis(t, 1, D)}<circle cx="1180" cy="${y}" r="26" fill="${COL[k % 8]}"/>${check(1180, y, 1, on(COL[k % 8]!))}</g>`,
      );
    }
    return { svg: g.join(''), dur: D, freeze: 0.9 };
  },

  flow: (s) => {
    const D = 12;
    const chain = s.chain ?? [];
    const n = chain.length;
    const w = Math.min(260, 1240 / n - 30);
    const xs = chain.map((_, k) => 180 + k * (1240 / Math.max(n - 1, 1)));
    const g = [
      glow(800, 640, 700, 'var(--brand)', 0.4),
      `<line x1="${xs[0]}" y1="640" x2="${xs[n - 1]}" y2="640" stroke="var(--line)" stroke-width="5"/>`,
    ];
    const stops: [number, number][] = [[0, 0]];
    chain.forEach((c, k) => {
      const x = xs[k]!;
      const t = 0.05 + k * (0.8 / n);
      if (k) stops.push([t - 0.06, (k - 1) / (n - 1)], [t, k / (n - 1)]);
      g.push(
        `<rect x="${x - w / 2}" y="590" width="${w}" height="100" rx="20" fill="var(--card)" stroke="${COL[k % 8]}" stroke-width="3"/>`,
      );
      g.push(
        `<rect x="${x - w / 2}" y="590" width="${w}" height="100" rx="20" fill="${COL[k % 8]}" fill-opacity=".4" opacity="0">${anim(
          'opacity',
          [
            [0, 0],
            [t, 0],
            [t + 0.02, 1],
            [t + 0.14, 1],
            [t + 0.17, 0],
            [1, 0],
          ],
          D,
        )}</rect>`,
      );
      g.push(TC(x, 648, clip(c, 18), 20, 'var(--white)', BOLD));
    });
    g.push(
      `<g>${token('var(--c4)', 12)}${move(`M${xs[0]} 740 H${xs[n - 1]}`, [...stops, [0.96, 1], [1, 1]], D)}</g>`,
    );
    return { svg: g.join(''), dur: D, freeze: 0.92 };
  },

  cycle: (s) => {
    const D = 12;
    const chain = s.chain ?? [];
    const n = Math.max(chain.length, 3);
    const cx = 1170;
    const cy = 440;
    const r = 250;
    const pts = Array.from({ length: n }, (_, k) => {
      const a = ((-90 + (360 / n) * k) * Math.PI) / 180;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
    });
    const poly = `M${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L')} Z`;
    const g = [
      glow(cx, cy, 420, 'var(--brand)', 0.6),
      `<path d="${poly}" fill="none" stroke="var(--line)" stroke-width="3" stroke-dasharray="6 10"/>`,
    ];
    const stops: [number, number][] = [];
    pts.forEach(([x, y], k) => {
      const t = k / n;
      stops.push([t, t], [t + 0.1, t]);
      g.push(
        `<rect x="${(x - 80).toFixed(1)}" y="${(y - 30).toFixed(1)}" width="160" height="60" rx="14" fill="var(--card)" stroke="${COL[k % 8]}" stroke-width="3"/>`,
      );
      g.push(
        `<rect x="${(x - 80).toFixed(1)}" y="${(y - 30).toFixed(1)}" width="160" height="60" rx="14" fill="${COL[k % 8]}" fill-opacity=".4" opacity="0">${anim(
          'opacity',
          [
            [0, 0],
            [t, 0],
            [t + 0.02, 1],
            [t + 0.15, 1],
            [t + 0.18, 0],
            [1, 0],
          ],
          D,
        )}</rect>`,
      );
      g.push(TC(x.toFixed(1), (y + 7).toFixed(1), clip(chain[k] ?? '', 14), 19, 'var(--white)', BOLD));
    });
    g.push(`<g>${token('var(--c4)', 11)}${move(poly, [...stops, [1, 1]], D)}</g>`);
    return { svg: g.join(''), dur: D, freeze: 0.95 };
  },

  stairs: (s) => {
    const D = 13;
    const labels = s.chain ?? [];
    const n = labels.length;
    const w = Math.min(130, 640 / n);
    const h = Math.min(90, 520 / n);
    const x0 = 860;
    const y0 = 760;
    const g = [glow(1180, 560, 430, 'var(--brand)', 0.55)];
    let path = `M${x0 + w / 2} ${y0 - h - 30}`;
    labels.forEach((lbl, k) => {
      const x = x0 + k * w;
      const top = y0 - (k + 1) * h;
      g.push(
        `<rect x="${x}" y="${top}" width="${w - 6}" height="${(k + 1) * h}" rx="8" fill="${COL[k % 8]}" opacity=".85"/>`,
      );
      g.push(TC(x + w / 2 - 3, top + 30, clip(lbl, 11), 15, on(COL[k % 8]!), BOLD));
      if (k) path += ` L${x + w / 2} ${top + h - 30} L${x + w / 2} ${top - 30}`;
    });
    const stops: [number, number][] = [];
    labels.forEach((_, k) => {
      const f = k / Math.max(n - 1, 1);
      stops.push([k * (0.8 / n), f], [k * (0.8 / n) + 0.06, f]);
    });
    g.push(`<g>${person(0, -12, 0.55, 'var(--c4)')}${move(path, [...stops, [0.95, 1], [1, 1]], D)}</g>`);
    if (s.badge)
      g.push(
        `<rect x="${x0}" y="${y0 + 22}" width="${Math.min(3, n) * w - 6}" height="34" rx="17" fill="none" stroke="var(--c4)" stroke-width="2"/>` +
          TC(x0 + (Math.min(3, n) * w) / 2, y0 + 45, s.badge, 16, 'var(--c4)', BOLD),
      );
    return { svg: g.join(''), dur: D, freeze: 0.9 };
  },

  cards: (s) => {
    const D = 15;
    const g = [glow(1180, 470, 440, 'var(--brand)', 0.55)];
    (s.cards ?? []).forEach((c, k) => {
      const x = 860 + (k % 2) * 330;
      const y = 180 + Math.floor(k / 2) * 220;
      const t = 0.04 + k * 0.14;
      g.push(
        `<rect x="${x}" y="${y}" width="300" height="190" rx="18" fill="var(--card)" stroke="var(--line)" stroke-width="2"/>`,
      );
      g.push(
        `<g>${anim(
          'opacity',
          [
            [0, 1],
            [t, 1],
            [t + 0.02, 0],
            [0.96, 0],
            [1, 1],
          ],
          D,
        )}${TC(x + 150, y + 112, '?', 64, 'var(--c2)', BOLD)}</g>`,
      );
      g.push(
        `<g opacity="0">${vis(t, 0.96, D)}${T(x + 22, y + 52, clip(c.title, 22), 23, 'var(--white)', BOLD)}${T(x + 22, y + 92, clip(c.fix, 28), 17, 'var(--c2)')}<g opacity="0">${vis(t + 0.05, 0.96, D)}${check(x + 262, y + 158, 1.2)}</g></g>`,
      );
    });
    return { svg: g.join(''), dur: D, freeze: 0.9 };
  },

  pipeline: (s) => {
    const D = 14;
    const names = s.chain ?? [];
    const n = names.length;
    const xs = names.map((_, k) => 150 + k * (1300 / Math.max(n - 1, 1)));
    const y = 660;
    const g = [
      glow(800, 680, 700, 'var(--brand)', 0.4),
      `<line x1="${xs[0]}" y1="${y}" x2="${xs[n - 1]}" y2="${y}" stroke="var(--line)" stroke-width="5" stroke-linecap="round"/>`,
    ];
    const stops: [number, number][] = [[0, 0]];
    names.forEach((name, k) => {
      const t = 0.03 + k * (0.82 / n);
      if (k) stops.push([t - 0.05, (k - 1) / (n - 1)], [t, k / (n - 1)]);
      const col = k === s.gate ? 'var(--accent)' : 'var(--c1)';
      g.push(
        `<circle cx="${xs[k]}" cy="${y}" r="34" fill="var(--card)" stroke="${col}" stroke-width="4"/>` +
          TC(xs[k]!, y + 76, clip(name, 16), 19, 'var(--white)', BOLD),
      );
      g.push(`<g opacity="0">${vis(t + 0.02, 0.96, D)}${check(xs[k]!, y + 2, 1.3)}</g>`);
    });
    if (s.gate !== undefined && xs[s.gate] !== undefined) {
      const gx = xs[s.gate]!;
      const openAt = 0.03 + s.gate * (0.82 / n) - 0.03;
      g.push(lock(gx, y - 96, D, openAt));
      g.push(`<g opacity="0">${vis(openAt - 0.08, 0.96, D)}${person(gx + 52, y - 64, 0.6, 'var(--c4)')}</g>`);
    }
    g.push(
      `<g>${token('var(--c4)', 12)}${move(`M${xs[0]} ${y} H${xs[n - 1]}`, [...stops, [0.96, 1], [1, 1]], D)}</g>`,
    );
    return { svg: g.join(''), dur: D, freeze: 0.9 };
  },

  terminal: (s) => {
    const D = 11;
    const [cmd = '$ pnpm verify', ...lines] = s.items ?? [];
    const g = [
      glow(1180, 470, 420, 'var(--brand)', 0.55),
      '<rect x="860" y="220" width="620" height="440" rx="18" fill="var(--ink)" opacity=".75" stroke="var(--line)" stroke-width="2"/>',
      '<circle cx="890" cy="248" r="7" fill="var(--accent)"/><circle cx="914" cy="248" r="7" fill="var(--c4)"/><circle cx="938" cy="248" r="7" fill="var(--c2)"/>',
      `<clipPath id="typeclip-${s.id}"><rect x="890" y="276" width="0" height="40">${anim(
        'width',
        [
          [0, 0],
          [0.02, 0],
          [0.14, 560],
          [1, 560],
        ],
        D,
      )}</rect></clipPath>`,
      `<g clip-path="url(#typeclip-${s.id})">${T(892, 306, clip(cmd, 34), 24, 'var(--c4)', MONO)}</g>`,
    ];
    lines.slice(0, 5).forEach((ln, k) => {
      const y = 360 + k * 52;
      const tr = 0.18 + k * 0.04;
      const tg = 0.45 + k * 0.07;
      g.push(
        `<g opacity="0">${vis(tr, 0.95, D)}<circle cx="900" cy="${y}" r="11" fill="var(--accent)"/><circle cx="900" cy="${y}" r="11" fill="var(--ok)" opacity="0">${vis(tg, 0.95, D, 0.01)}</circle>${T(926, y + 7, clip(ln, 40), 19, 'var(--white)', MONO)}</g>`,
      );
    });
    return { svg: g.join(''), dur: D, freeze: 0.9 };
  },

  // Figures are text, drawn once; only the bars under them move.
  metrics: (s) => {
    const D = 12;
    const ms = s.metrics ?? [];
    const w = 1300 / ms.length;
    const g = [glow(800, 640, 700, 'var(--brand)', 0.4)];
    ms.forEach((m, k) => {
      const x = 150 + k * w + w / 2;
      const t = 0.05 + k * 0.12;
      g.push(TC(x, 640, m.value, 92, 'var(--accent)', BOLD));
      g.push(TC(x, 690, clip(m.label, 30), 20, 'var(--white)'));
      g.push(TC(x, 722, clip(m.source, 40), 14, 'var(--muted)'));
      g.push(
        `<rect x="${x - w / 2 + 30}" y="760" width="0" height="8" rx="4" fill="${COL[k % 8]}">${anim(
          'width',
          [
            [0, 0],
            [t, 0],
            [t + 0.25, w - 60],
            [0.95, w - 60],
            [1, 0],
          ],
          D,
        )}</rect>`,
      );
    });
    return { svg: g.join(''), dur: D, freeze: 0.9 };
  },

  timeline: (s) => {
    const D = 11;
    const chain = s.chain ?? [];
    const n = chain.length;
    const xs = chain.map((_, k) => 180 + k * (1240 / Math.max(n - 1, 1)));
    const ys = chain.map((_, k) => (k % 2 ? 560 : 660));
    const d = `M${xs.map((x, k) => `${x} ${ys[k]}`).join(' L')}`;
    const g = [
      glow(820, 620, 620, 'var(--brand)', 0.45),
      `<path d="${d}" fill="none" stroke="var(--line)" stroke-width="6" stroke-linecap="round"/>`,
      `<path d="${d}" pathLength="1" stroke-dasharray="1" fill="none" stroke="var(--c2)" stroke-width="6" stroke-linecap="round">${draw(D, 0, 0.9)}</path>`,
    ];
    const stops: [number, number][] = [[0, 0]];
    chain.forEach((c, k) => {
      const t = 0.02 + k * (0.9 / n);
      if (k) stops.push([t - 0.04, (k - 1) / (n - 1)], [t, k / (n - 1)]);
      g.push(
        `<circle cx="${xs[k]}" cy="${ys[k]}" r="30" fill="var(--card)" stroke="${COL[k % 8]}" stroke-width="4"/>`,
      );
      g.push(
        `<circle cx="${xs[k]}" cy="${ys[k]}" r="30" fill="${COL[k % 8]}" fill-opacity=".45" opacity="0">${vis(t, 1, D)}</circle>`,
      );
      g.push(TC(xs[k]!, ys[k]! + 8, String(k + 1).padStart(2, '0'), 22, 'var(--white)', BOLD));
      g.push(
        `<g opacity="0">${vis(t, 1, D)}${TC(xs[k]!, ys[k]! + (k % 2 ? -56 : 78), clip(c, 18), 21, 'var(--white)', BOLD)}</g>`,
      );
    });
    g.push(`<g>${token('var(--c4)', 12)}${move(d, [...stops, [0.96, 1], [1, 1]], D)}</g>`);
    return { svg: g.join(''), dur: D, freeze: 0.95 };
  },

  close: (s) => {
    const D = 12;
    const g = [
      glow(1160, 470, 440, 'var(--brand)', 0.7),
      `<g>${spin(1160, 470, 50)}<circle cx="1160" cy="470" r="330" fill="none" stroke="var(--c2)" stroke-width="2" stroke-dasharray="3 14" opacity=".5"/></g>`,
      '<rect x="880" y="200" width="560" height="440" rx="18" fill="var(--ink)" opacity=".6" stroke="var(--line)" stroke-width="2"/>',
    ];
    (s.items ?? []).slice(0, 8).forEach((ln, k) => {
      g.push(
        `<g opacity="0">${vis(0.04 + k * 0.08, 0.95, D)}${T(912, 256 + k * 48, clip(ln, 40), 21, k === 0 ? 'var(--c4)' : 'var(--white)', MONO)}</g>`,
      );
    });
    return { svg: g.join(''), dur: D, freeze: 0.9 };
  },

  // ---- kinds from the Puntos Colombia reference
  quote: () => {
    const D = 14;
    const q =
      'M700 330 q-60 0 -60 70 v90 h110 v-110 h-60 q0 -30 40 -30 Z M880 330 q-60 0 -60 70 v90 h110 v-110 h-60 q0 -30 40 -30 Z';
    return {
      svg:
        glow(800, 450, 620, 'var(--brand)', 0.55) +
        `<g>${spin(800, 450, 50)}<circle cx="800" cy="450" r="360" fill="none" stroke="var(--c2)" stroke-width="2" stroke-dasharray="4 16" opacity=".35"/></g>` +
        `<path d="${q}" pathLength="1" stroke-dasharray="1" fill="none" stroke="var(--accent)" stroke-width="4" opacity=".5">${draw(D, 0.02, 0.3)}</path>`,
      dur: D,
      freeze: 0.9,
    };
  },

  matrix: (s) => {
    const D = 12;
    const [x = '', y = ''] = s.axes ?? [];
    const g = [
      glow(1200, 480, 420, 'var(--brand)', 0.5),
      `<path d="M960 740 H1480" pathLength="1" stroke-dasharray="1" stroke="var(--c2)" stroke-width="4" marker-end="url(#arrow)" fill="none">${draw(D, 0.02, 0.18)}</path>`,
      `<path d="M960 740 V220" pathLength="1" stroke-dasharray="1" stroke="var(--c2)" stroke-width="4" marker-end="url(#arrow)" fill="none">${draw(D, 0.08, 0.24)}</path>`,
      T(960, 790, clip(x, 46), 17, 'var(--muted)'),
      `<text x="930" y="220" font-size="17" fill="var(--muted)" transform="rotate(-90 930 220)" text-anchor="end">${clip(y, 40).replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</text>`,
      `<line x1="1220" y1="240" x2="1220" y2="740" stroke="var(--line)" stroke-dasharray="6 10"/><line x1="960" y1="480" x2="1470" y2="480" stroke="var(--line)" stroke-dasharray="6 10"/>`,
    ];
    const dots: [number, number, number][] = [
      [1090, 620, 0.3],
      [1350, 620, 0.38],
      [1090, 360, 0.46],
      [1350, 360, 0.54],
    ];
    dots.forEach(([cx, cy, t], k) =>
      g.push(
        `<circle cx="${cx}" cy="${cy}" r="22" fill="${COL[k % 8]}" opacity="0">${vis(t, 1, D)}</circle>`,
      ),
    );
    g.push(
      `<g opacity="0">${vis(0.62, 1, D)}<circle cx="1350" cy="360" r="40" fill="none" stroke="var(--accent)" stroke-width="4">${pulseR(40, 52, 0.8, D)}</circle></g>`,
    );
    return { svg: g.join(''), dur: D, freeze: 0.9 };
  },

  // A case: the light says green, then the crack shows.
  case: () => {
    const D = 12;
    const g = [
      glow(1180, 460, 420, 'var(--brand)', 0.5),
      '<rect x="1100" y="200" width="160" height="420" rx="36" fill="var(--card)" stroke="var(--line)" stroke-width="3"/>',
      '<circle cx="1180" cy="290" r="46" fill="var(--dim)"/><circle cx="1180" cy="410" r="46" fill="var(--dim)"/><circle cx="1180" cy="530" r="46" fill="var(--dim)"/>',
      `<circle cx="1180" cy="530" r="46" fill="var(--ok)" opacity="0">${anim(
        'opacity',
        [
          [0, 0],
          [0.05, 0],
          [0.08, 1],
          [0.5, 1],
          [0.54, 0.25],
          [1, 0.25],
        ],
        D,
      )}</circle>`,
      `<path d="M1210 180 L1160 300 L1200 360 L1150 470 L1195 540 L1160 650" pathLength="1" stroke-dasharray="1" fill="none" stroke="var(--accent)" stroke-width="5" stroke-linejoin="round">${draw(D, 0.5, 0.66)}</path>`,
      `<circle cx="1180" cy="290" r="46" fill="var(--accent)" opacity="0">${vis(0.66, 1, D)}</circle>`,
    ];
    return { svg: g.join(''), dur: D, freeze: 0.92 };
  },

  boxes: (s) => {
    const D = 12;
    const bs = s.boxes ?? [];
    const w = Math.min(420, 1360 / bs.length - 24);
    const g = [glow(800, 640, 700, 'var(--brand)', 0.4)];
    bs.forEach((b, k) => {
      const x = 120 + k * (w + 24);
      const t = 0.05 + k * 0.12;
      g.push(
        `<g opacity="0">${vis(t, 1, D)}<rect x="${x}" y="470" width="${w}" height="220" rx="22" fill="var(--card)" stroke="${COL[k % 8]}" stroke-width="3"/>` +
          `<rect x="${x}" y="470" width="${w}" height="10" rx="5" fill="${COL[k % 8]}"/>` +
          T(x + 26, 540, clip(b.label, 22), 26, 'var(--white)', BOLD) +
          T(x + 26, 596, clip(b.detail, 34), 19, 'var(--c2)') +
          T(x + 26, 640, clip(b.note, 34), 17, 'var(--muted)') +
          '</g>',
      );
    });
    return { svg: g.join(''), dur: D, freeze: 0.9 };
  },

  // Two panels part and the light comes through.
  reveal: () => {
    const D = 12;
    return {
      svg:
        glow(800, 470, 520, 'var(--accent)', 0.6) +
        `<g opacity="0">${vis(0.3, 1, D)}${token('var(--c4)', 26)}</g>`.replace(
          '<g opacity="0">',
          '<g opacity="0" transform="translate(800 470)">',
        ) +
        `<rect x="0" y="0" width="800" height="900" fill="var(--ink)">${slideTr(
          [
            [0, '0 0'],
            [0.1, '0 0'],
            [0.34, '-620 0'],
            [0.95, '-620 0'],
            [1, '0 0'],
          ],
          D,
        )}</rect>` +
        `<rect x="800" y="0" width="800" height="900" fill="var(--ink)">${slideTr(
          [
            [0, '0 0'],
            [0.1, '0 0'],
            [0.34, '620 0'],
            [0.95, '620 0'],
            [1, '0 0'],
          ],
          D,
        )}</rect>`,
      dur: D,
      freeze: 0.9,
    };
  },

  // A challenge: a ring that fills like a timer, with the person who takes the stage.
  challenge: () => {
    const D = 14;
    return {
      svg:
        glow(1180, 460, 420, 'var(--brand)', 0.55) +
        '<circle cx="1180" cy="440" r="210" fill="none" stroke="var(--line)" stroke-width="14"/>' +
        `<circle cx="1180" cy="440" r="210" pathLength="1" stroke-dasharray="1" fill="none" stroke="var(--accent)" stroke-width="14" stroke-linecap="round" transform="rotate(-90 1180 440)">${draw(D, 0.02, 0.9, 0.96)}</circle>` +
        person(1180, 480, 1.6, 'var(--c4)'),
      dur: D,
      freeze: 0.9,
    };
  },

  scene: custom,

  zig: (s) => {
    const D = 12;
    const cx = (s.side ?? 'left') === 'left' ? 1170 : 430;
    return {
      svg:
        glow(cx, 460, 380, 'var(--brand)', 0.55) +
        (s.art_svg ? external(s, cx, 460, D) : ART[s.art ?? 'grid'](cx, 460, D, s.chain)),
      dur: D,
      freeze: 0.92,
    };
  },
};

export const DEFAULT_LAYOUT: Record<Slide['kind'], 'left' | 'top' | 'full'> = {
  cover: 'left',
  question: 'top',
  axis: 'left',
  section: 'left',
  statement: 'full',
  list: 'left',
  flow: 'top',
  cycle: 'left',
  stairs: 'left',
  cards: 'left',
  pipeline: 'top',
  terminal: 'left',
  metrics: 'top',
  timeline: 'top',
  close: 'left',
  quote: 'full',
  matrix: 'left',
  case: 'left',
  boxes: 'top',
  reveal: 'full',
  challenge: 'left',
  zig: 'left',
  scene: 'left',
};

export const scene = (s: Slide, t: TokensV1): Scene => {
  on = onFor(t);
  return S[s.kind](s);
};
