// motion-v1: a scene written as data, never as raw SVG. Shapes, text, icons and
// people, each with optional tracks (draw, opacity, move, rotate, scale) on a loop of
// `dur` seconds. Colours are token names, so a scene cannot carry an off-brand hex.
// Rendered with the same SMIL primitives as the built-in scenes.
import { z } from 'zod';
import { hasIcon, icon } from './icons.ts';
import { anim, esc, move, person, slideTr } from './smil.ts';

export const COLORS = [
  'brand',
  'accent',
  'ink',
  'white',
  'ok',
  'c1',
  'c2',
  'c3',
  'c4',
  'c5',
  'muted',
  'line',
  'card',
  'dim',
] as const;
const Color = z.enum(COLORS);
const cssColor = (c?: (typeof COLORS)[number]) => (c ? `var(--${c})` : undefined);

const T01 = z.number().min(0).max(1);
const Keys = z.array(z.tuple([T01, z.number()])).min(2);
const Tracks = {
  // The stroke draws itself between fractions a and b of the loop, then holds.
  draw: z.tuple([T01, T01]).optional(),
  op: Keys.optional(),
  move: z
    .array(z.tuple([T01, z.number(), z.number()]))
    .min(2)
    .optional(),
  rotate: Keys.optional(),
  scale: Keys.optional(),
  // Follow a path: keys are [time, fraction of the path].
  along: z
    .object({ d: z.string().regex(/^[MmLlHhVvCcSsQqTtAaZz0-9 ,.\-eE\n]+$/), keys: Keys })
    .strict()
    .optional(),
  // Animate one numeric attribute of the shape (a bar that grows, a radius that pulses).
  attr: z
    .object({ name: z.enum(['width', 'height', 'r', 'x', 'y', 'cx', 'cy']), keys: Keys })
    .strict()
    .optional(),
  // Pivot of rotate and scale, in the element's own coordinates.
  origin: z.tuple([z.number(), z.number()]).optional(),
};
const Paint = {
  fill: Color.optional(),
  stroke: Color.optional(),
  width: z.number().positive().max(40).optional(),
  opacity: z.number().min(0).max(1).optional(),
  dash: z
    .string()
    .regex(/^[\d.]+( [\d.]+)*$/)
    .optional(),
};
const PathD = z.string().regex(/^[MmLlHhVvCcSsQqTtAaZz0-9 ,.\-eE\n]+$/, 'd de path inválido');

type El =
  | ({ type: 'path'; d: string; arrow?: boolean | undefined } & Common)
  | ({ type: 'rect'; x: number; y: number; w: number; h: number; rx?: number | undefined } & Common)
  | ({ type: 'circle'; cx: number; cy: number; r: number } & Common)
  | ({ type: 'line'; x1: number; y1: number; x2: number; y2: number; arrow?: boolean | undefined } & Common)
  | ({
      type: 'text';
      x: number;
      y: number;
      text: string;
      size?: number | undefined;
      anchor?: 'start' | 'middle' | 'end' | undefined;
      bold?: boolean | undefined;
      mono?: boolean | undefined;
    } & Common)
  | ({ type: 'icon'; name: string; x: number; y: number; size: number } & Common)
  | ({ type: 'glow'; cx: number; cy: number; r: number } & Common)
  | ({ type: 'person'; x: number; y: number; s?: number | undefined } & Common)
  | ({
      type: 'group';
      x?: number | undefined;
      y?: number | undefined;
      k?: number | undefined;
      skewY?: number | undefined;
      turn?: number | undefined;
      children: El[];
    } & Common);
type Common = {
  fill?: (typeof COLORS)[number] | undefined;
  stroke?: (typeof COLORS)[number] | undefined;
  width?: number | undefined;
  opacity?: number | undefined;
  dash?: string | undefined;
  draw?: [number, number] | undefined;
  op?: [number, number][] | undefined;
  move?: [number, number, number][] | undefined;
  rotate?: [number, number][] | undefined;
  scale?: [number, number][] | undefined;
  along?: { d: string; keys: [number, number][] } | undefined;
  attr?: { name: 'width' | 'height' | 'r' | 'x' | 'y' | 'cx' | 'cy'; keys: [number, number][] } | undefined;
  origin?: [number, number] | undefined;
};

const n = z.number();
export const Element: z.ZodType<El> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z
      .object({ type: z.literal('path'), d: PathD, arrow: z.boolean().optional(), ...Paint, ...Tracks })
      .strict(),
    z
      .object({
        type: z.literal('rect'),
        x: n,
        y: n,
        w: n.positive(),
        h: n.positive(),
        rx: n.optional(),
        ...Paint,
        ...Tracks,
      })
      .strict(),
    z.object({ type: z.literal('circle'), cx: n, cy: n, r: n.positive(), ...Paint, ...Tracks }).strict(),
    z
      .object({
        type: z.literal('line'),
        x1: n,
        y1: n,
        x2: n,
        y2: n,
        arrow: z.boolean().optional(),
        ...Paint,
        ...Tracks,
      })
      .strict(),
    // A soft radial light in a token colour (the page's #glow gradient).
    z.object({ type: z.literal('glow'), cx: n, cy: n, r: n.positive(), ...Paint, ...Tracks }).strict(),
    z
      .object({
        type: z.literal('text'),
        x: n,
        y: n,
        text: z.string().min(1).max(60),
        size: n.positive().max(120).optional(),
        anchor: z.enum(['start', 'middle', 'end']).optional(),
        bold: z.boolean().optional(),
        mono: z.boolean().optional(),
        ...Paint,
        ...Tracks,
      })
      .strict(),
    z
      .object({
        type: z.literal('icon'),
        name: z.string().regex(/^[a-z0-9-]+$/),
        x: n,
        y: n,
        size: n.positive().max(900),
        ...Paint,
        ...Tracks,
      })
      .strict(),
    z
      .object({
        type: z.literal('person'),
        x: n,
        y: n,
        s: n.positive().max(6).optional(),
        ...Paint,
        ...Tracks,
      })
      .strict(),
    z
      .object({
        type: z.literal('group'),
        x: n.optional(),
        y: n.optional(),
        k: n.positive().max(20).optional(),
        skewY: n.min(-45).max(45).optional(),
        // A fixed rotation of the group about its own origin, in degrees.
        turn: n.min(-360).max(360).optional(),
        children: z.array(Element).min(1).max(40),
        ...Paint,
        ...Tracks,
      })
      .strict(),
  ]),
);

export const MotionV1 = z
  .object({
    dur: z.number().min(3).max(60),
    // Where reduced motion freezes the loop: a meaningful end state, never a blank.
    freeze: T01,
    elements: z.array(Element).min(1).max(80),
  })
  .strict();
export type MotionV1 = z.infer<typeof MotionV1>;

const f = (v: number) => +v.toFixed(2);

function shape(e: El, D: number, draw?: [number, number]): string {
  const d = e.draw ?? draw;
  const dashed = d ? ' pathLength="1" stroke-dasharray="1"' : '';
  const drawAnim = d
    ? anim(
        'stroke-dashoffset',
        [
          [0, 1],
          [d[0], 1],
          [d[1], 0],
          [0.97, 0],
          [1, 1],
        ],
        D,
      )
    : '';
  const own = e.attr ? anim(e.attr.name, e.attr.keys, D) : '';
  const inner = drawAnim + own;
  const paint = [
    `fill="${cssColor(e.fill) ?? 'none'}"`,
    e.stroke ? `stroke="${cssColor(e.stroke)}" stroke-width="${e.width ?? 2}"` : '',
    e.dash && !d ? `stroke-dasharray="${e.dash}"` : '',
    e.opacity !== undefined && !e.op ? `opacity="${e.opacity}"` : '',
    'stroke-linecap="round" stroke-linejoin="round"',
  ].join(' ');
  switch (e.type) {
    case 'path':
      return `<path d="${e.d.replace(/\s+/g, ' ').trim()}" ${paint}${dashed}${e.arrow ? ' marker-end="url(#arrow)"' : ''}>${inner}</path>`;
    case 'rect':
      return `<rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" rx="${e.rx ?? 0}" ${paint}${dashed}>${inner}</rect>`;
    case 'circle':
      return `<circle cx="${e.cx}" cy="${e.cy}" r="${e.r}" ${paint}${dashed}>${inner}</circle>`;
    case 'line':
      return `<line x1="${e.x1}" y1="${e.y1}" x2="${e.x2}" y2="${e.y2}" ${paint}${dashed}${e.arrow ? ' marker-end="url(#arrow)"' : ''}>${inner}</line>`;
    case 'glow':
      return `<circle cx="${e.cx}" cy="${e.cy}" r="${e.r}" fill="url(#glow)" style="color:${cssColor(e.fill) ?? 'var(--brand)'}" opacity="${e.opacity ?? 0.55}">${inner}</circle>`;
    case 'text':
      return `<text x="${e.x}" y="${e.y}" font-size="${e.size ?? 22}" fill="${cssColor(e.fill) ?? 'var(--white)'}" text-anchor="${e.anchor ?? 'start'}"${e.bold ? ' font-weight="700"' : ''}${e.mono ? ' font-family="ui-monospace,Menlo,monospace"' : ''}${e.opacity !== undefined && !e.op ? ` opacity="${e.opacity}"` : ''}>${esc(e.text)}</text>`;
    case 'icon':
      return icon(e.name, e.x, e.y, e.size, cssColor(e.stroke) ?? 'var(--white)', drawAnim);
    case 'person':
      return person(e.x, e.y, e.s ?? 1, cssColor(e.fill) ?? 'var(--c2)');
    case 'group': {
      const tf = [
        e.x !== undefined || e.y !== undefined ? `translate(${e.x ?? 0} ${e.y ?? 0})` : '',
        e.k ? `scale(${e.k})` : '',
        e.skewY ? `skewY(${e.skewY})` : '',
        e.turn ? `rotate(${e.turn})` : '',
      ]
        .filter(Boolean)
        .join(' ');
      const inner = e.children.map((c) => element(inheritPaint(c, e), D, d)).join('');
      return `<g${tf ? ` transform="${tf}"` : ''}${e.opacity !== undefined && !e.op ? ` opacity="${e.opacity}"` : ''}>${inner}</g>`;
    }
  }
}

// Children inherit the group's stroke, fill and width unless they set their own.
const inheritPaint = (c: El, g: El): El => ({
  ...c,
  stroke: c.stroke ?? g.stroke,
  fill: c.fill ?? (c.type === 'text' ? undefined : g.fill),
  width: c.width ?? g.width,
  dash: c.dash ?? g.dash,
});

function element(e: El, D: number, draw?: [number, number]): string {
  let out = shape(e, D, draw);
  const [ox, oy] = e.origin ?? [0, 0];
  const pivot = (animTag: string) =>
    `<g transform="translate(${ox} ${oy})"><g>${animTag}<g transform="translate(${-ox} ${-oy})">${out}</g></g></g>`;
  if (e.scale)
    out = pivot(
      `<animateTransform attributeName="transform" type="scale" dur="${D}s" repeatCount="indefinite" keyTimes="${keyTimes(e.scale)}" values="${e.scale.map(([, v]) => v).join(';')}"/>`,
    );
  if (e.rotate)
    out = pivot(
      `<animateTransform attributeName="transform" type="rotate" dur="${D}s" repeatCount="indefinite" keyTimes="${keyTimes(e.rotate)}" values="${e.rotate.map(([, v]) => v).join(';')}"/>`,
    );
  if (e.along)
    out = `<g>${move(
      e.along.d.replace(/\s+/g, ' ').trim(),
      e.along.keys.map(([t, p]) => [t, p] as [number, number]),
      D,
    )}${out}</g>`;
  if (e.move)
    out = `<g>${slideTr(
      e.move.map(([t, x, y]) => [t, `${f(x)} ${f(y)}`] as [number, string]),
      D,
    )}${out}</g>`;
  if (e.op) out = `<g opacity="${e.op[0]![1]}">${anim('opacity', e.op, D)}${out}</g>`;
  return out;
}

// keyTimes for animateTransform must start at 0 and end at 1, like anim() normalises.
function keyTimes(keys: [number, number][]): string {
  if (keys[0]![0] !== 0) keys.unshift([0, keys[0]![1]]);
  if (keys[keys.length - 1]![0] !== 1) keys.push([1, keys[keys.length - 1]![1]]);
  return keys.map(([t]) => t.toFixed(4)).join(';');
}

export function renderMotion(m: MotionV1): string {
  return m.elements.map((e) => element(structuredClone(e), m.dur)).join('');
}

// ---- checks the schema cannot express

const moves = (e: El): boolean =>
  !!(e.draw || e.op || e.move || e.rotate || e.scale || e.along || e.attr) ||
  (e.type === 'group' && e.children.some(moves));

// Opacity of an op track at fraction t (linear, like calcMode="linear").
const opAt = (keys: [number, number][], t: number) => {
  const k = [...keys].sort((a, b) => a[0] - b[0]);
  if (t <= k[0]![0]) return k[0]![1];
  for (let i = 1; i < k.length; i++)
    if (t <= k[i]![0]) {
      const [t0, v0] = k[i - 1]!;
      const [t1, v1] = k[i]!;
      return t1 === t0 ? v1 : v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
    }
  return k[k.length - 1]![1];
};
const visibleAt = (e: El, t: number): boolean =>
  (e.op ? opAt(e.op, t) > 0.05 : true) &&
  (e.opacity ?? 1) > 0.05 &&
  (e.type !== 'group' || e.children.some((c) => visibleAt(c, t)));

const walk = (e: El, fn: (x: El) => void) => {
  fn(e);
  if (e.type === 'group') e.children.forEach((c) => walk(c, fn));
};

export function motionTexts(m: MotionV1): string[] {
  const out: string[] = [];
  m.elements.forEach((e) => walk(e, (x) => x.type === 'text' && out.push(x.text)));
  return out;
}

export function motionGate(m: MotionV1, where: string): string[] {
  const errs: string[] = [];
  if (!m.elements.some(moves)) errs.push(`${where}: la escena no tiene ninguna pista de movimiento`);
  if (!m.elements.some((e) => visibleAt(e, m.freeze)))
    errs.push(`${where}: en el cuadro de congelamiento (${m.freeze}) no se ve nada`);
  m.elements.forEach((e) =>
    walk(e, (x) => {
      if (x.type === 'icon' && !hasIcon(x.name)) errs.push(`${where}: icono desconocido ${x.name}`);
      // SMIL drops an animation whose keyTimes go backwards, silently: say it here.
      for (const [name, keys] of [
        ['op', x.op],
        ['move', x.move],
        ['rotate', x.rotate],
        ['scale', x.scale],
        ['along', x.along?.keys],
        ['attr', x.attr?.keys],
      ] as const)
        if (keys && keys.some((k, i) => i > 0 && k[0] < keys[i - 1]![0]))
          errs.push(`${where}: la pista ${name} tiene tiempos fuera de orden`);
      if (x.draw && x.draw[1] <= x.draw[0]) errs.push(`${where}: draw termina antes de empezar`);
    }),
  );
  return errs;
}
