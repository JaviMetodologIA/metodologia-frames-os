// SMIL primitives for looping SVG scenes. Rewritten from the Agentic SDLC deck
// builder (ai-native-sdlc/class/immersive.py) as the spec: every scene loops with
// repeatCount="indefinite" and restarts from t=0 when its slide opens.

export const esc = (v: string) =>
  v.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

type Pt = [number, number | string];

// Normalise [(t, v)] into increasing keyTimes in [0, 1] with 0 and 1 present.
function times(input: Pt[]): [string, string] {
  const pts = [...input].sort((a, b) => a[0] - b[0]);
  if (pts[0]![0] > 0) pts.unshift([0, pts[0]![1]]);
  if (pts[pts.length - 1]![0] < 1) pts.push([1, pts[pts.length - 1]![1]]);
  let last = -1;
  const out = pts.map(([t, v]) => {
    const tt = Math.min(1, Math.max(t, last >= 0 ? last + 0.0005 : 0));
    last = tt;
    return [tt, v] as Pt;
  });
  out[out.length - 1] = [1, out[out.length - 1]![1]];
  return [out.map(([t]) => t.toFixed(4)).join(';'), out.map(([, v]) => String(v)).join(';')];
}

export const anim = (attr: string, pts: Pt[], D: number) => {
  const [kt, vs] = times(pts);
  return `<animate attributeName="${attr}" dur="${D}s" repeatCount="indefinite" keyTimes="${kt}" values="${vs}" calcMode="linear"/>`;
};

// Visible between fractions a and b of the loop, with a short fade.
export const vis = (a: number, b: number, D: number, f = 0.025) =>
  b >= 1
    ? anim(
        'opacity',
        [
          [0, 0],
          [a, 0],
          [a + f, 1],
          [0.96, 1],
          [1, 0],
        ],
        D,
      )
    : anim(
        'opacity',
        [
          [0, 0],
          [a, 0],
          [a + f, 1],
          [b, 1],
          [b + f, 0],
          [1, 0],
        ],
        D,
      );

export const move = (path: string, stops: [number, number][], D: number, begin = 0) => {
  const [kt, kp] = times(stops);
  return `<animateMotion begin="${begin.toFixed(2)}s" dur="${D}s" repeatCount="indefinite" path="${path}" keyTimes="${kt}" keyPoints="${kp}" calcMode="linear"/>`;
};

export const slideTr = (pts: [number, string][], D: number) => {
  const [kt, vs] = times(pts);
  return `<animateTransform attributeName="transform" type="translate" dur="${D}s" repeatCount="indefinite" keyTimes="${kt}" values="${vs}"/>`;
};

export const spin = (cx: number, cy: number, D: number, rev = false) => {
  const [a, b] = rev ? [360, 0] : [0, 360];
  return `<animateTransform attributeName="transform" type="rotate" from="${a} ${cx} ${cy}" to="${b} ${cx} ${cy}" dur="${D}s" repeatCount="indefinite"/>`;
};

export const pulseR = (r0: number, r1: number, t: number, D: number, w = 0.08) =>
  anim(
    'r',
    [
      [0, r0],
      [Math.max(t - w, 0), r0],
      [t, r1],
      [Math.min(t + w, 1), r0],
      [1, r0],
    ],
    D,
  );

// A stroke that draws itself between a and b (needs pathLength=1 and stroke-dasharray=1).
export const draw = (D: number, a: number, b: number, hold = 0.95) =>
  anim(
    'stroke-dashoffset',
    [
      [0, 1],
      [a, 1],
      [b, 0],
      [hold, 0],
      [1, 1],
    ],
    D,
  );

// ---- shapes
export const T = (
  x: number | string,
  y: number | string,
  s: string,
  size = 22,
  fill = 'var(--white)',
  extra = '',
) => `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" ${extra}>${esc(s)}</text>`;
export const TC = (
  x: number | string,
  y: number | string,
  s: string,
  size = 22,
  fill = 'var(--white)',
  extra = '',
) => T(x, y, s, size, fill, `text-anchor="middle" ${extra}`);
export const BOLD = 'font-weight="700"';
export const MONO = 'font-family="ui-monospace,Menlo,monospace"';

export const glow = (cx: number, cy: number, r: number, color = 'var(--brand)', op = 0.55) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#glow)" style="color:${color}" opacity="${op}"/>`;

export const person = (x: number, y: number, s = 1, color = 'var(--c2)') =>
  `<g transform="translate(${x} ${y}) scale(${s})"><circle cx="0" cy="-34" r="16" fill="${color}"/><path d="M-26 18 Q-26 -12 0 -12 Q26 -12 26 18 Z" fill="${color}"/></g>`;

export const check = (x: number, y: number, s = 1, color = 'var(--ok)') =>
  `<path transform="translate(${x} ${y}) scale(${s})" d="M-10 0 L-3 8 L11 -9" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`;

export const token = (color = 'var(--c4)', r = 13) =>
  `<circle r="${r * 2.4}" fill="url(#glow)" style="color:${color}" opacity=".9"/><circle r="${r}" fill="${color}"/>`;

export const lock = (x: number, y: number, D: number, openAt = 0.8) =>
  `<g><rect x="${x - 18}" y="${y}" width="36" height="30" rx="6" fill="var(--accent)"/><path d="M${x - 11} ${y + 1} v-9 a11 11 0 0 1 22 0 v9" fill="none" stroke="var(--accent)" stroke-width="5">${slideTr(
    [
      [0, '0 0'],
      [openAt, '0 0'],
      [openAt + 0.04, '0 -10'],
      [0.96, '0 -10'],
      [1, '0 0'],
    ],
    D,
  )}</path></g>`;

export const ringPath = (cx: number, cy: number, r: number) =>
  `M${cx} ${cy - r} A${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`;

// Deterministic twinkling background seeded by the slide id (sha-like byte walk).
export function stars(seed: string, n = 22): string {
  const bytes: number[] = [];
  let h = 2166136261;
  for (let i = 0; i < 160; i++) {
    h ^= seed.charCodeAt(i % seed.length) + i;
    h = Math.imul(h, 16777619) >>> 0;
    bytes.push(h & 255);
  }
  let out = '';
  for (let i = 0; i < n; i++) {
    const x = ((bytes[i] ?? 0) / 255) * 1600;
    const y = ((bytes[i + 50] ?? 0) / 255) * 900;
    const r = 0.8 + ((bytes[i + 100] ?? 0) / 255) * 1.6;
    out += `<circle class="star" cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(1)}" fill="var(--c2)" opacity=".35"><animate attributeName="opacity" values=".1;.6;.1" dur="${4 + ((bytes[i + 20] ?? 0) % 5)}s" begin="-${(bytes[i + 30] ?? 0) % 4}s" repeatCount="indefinite"/></circle>`;
  }
  return out;
}

export const DEFS =
  '<defs><radialGradient id="glow"><stop offset="0" stop-color="currentColor" stop-opacity=".9"/><stop offset=".45" stop-color="currentColor" stop-opacity=".25"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></radialGradient><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="var(--c2)"/></marker></defs>';
