import { describe, expect, it } from 'vitest';
import { ART, ART_DATA } from '../../domains/motion/art.ts';
import { MotionV1, motionGate, renderMotion } from '../../domains/motion/custom.ts';
import { hasIcon, icon } from '../../domains/motion/icons.ts';
import { sanitizeSvg } from '../../domains/motion/sanitize.ts';

const scene = (elements: unknown[], freeze = 0.9) => MotionV1.parse({ dur: 10, freeze, elements });

describe('motion core', () => {
  it('renders a data scene with token colours only, and it passes its gate', () => {
    const m = scene([
      { type: 'icon', name: 'rocket', x: 800, y: 450, size: 200, stroke: 'accent', draw: [0.05, 0.3] },
      {
        type: 'circle',
        cx: 800,
        cy: 450,
        r: 40,
        fill: 'c4',
        origin: [800, 450],
        scale: [
          [0, 1],
          [0.5, 1.2],
          [1, 1],
        ],
      },
    ]);
    const svg = renderMotion(m);
    expect(motionGate(m, 's')).toEqual([]);
    expect(svg).toContain('repeatCount="indefinite"');
    expect(svg).not.toMatch(/#[0-9a-f]{6}/i);
    expect(svg).toContain('var(--accent)');
  });

  it('a scene without any track fails', () => {
    const m = scene([{ type: 'rect', x: 0, y: 0, w: 10, h: 10, fill: 'c2' }]);
    expect(motionGate(m, 's').join()).toMatch(/ninguna pista de movimiento/);
  });

  it('a scene that is blank at its freeze frame fails', () => {
    const m = scene(
      [
        {
          type: 'circle',
          cx: 1,
          cy: 1,
          r: 5,
          fill: 'c2',
          op: [
            [0, 1],
            [0.5, 1],
            [0.6, 0],
            [1, 0],
          ],
        },
      ],
      0.8,
    );
    expect(motionGate(m, 's').join()).toMatch(/congelamiento/);
  });

  it('an unknown icon and backwards keyTimes fail', () => {
    const m = scene([
      { type: 'icon', name: 'no-existe-este', x: 0, y: 0, size: 10, draw: [0.1, 0.2] },
      {
        type: 'circle',
        cx: 1,
        cy: 1,
        r: 5,
        op: [
          [0, 0],
          [0.6, 1],
          [0.4, 0],
          [1, 1],
        ],
      },
    ]);
    const errs = motionGate(m, 's').join();
    expect(errs).toMatch(/icono desconocido no-existe-este/);
    expect(errs).toMatch(/pista op tiene tiempos fuera de orden/);
  });

  it('the schema refuses raw SVG smuggled into a path or an unknown colour', () => {
    expect(() => scene([{ type: 'path', d: 'M0 0"/><script>alert(1)</script>', draw: [0, 1] }])).toThrow();
    expect(() =>
      scene([
        {
          type: 'rect',
          x: 0,
          y: 0,
          w: 1,
          h: 1,
          fill: '#ff00ff',
          op: [
            [0, 0],
            [1, 1],
          ],
        },
      ]),
    ).toThrow();
  });

  it('every data illustration, the six from reference A included, passes the motion gate', () => {
    for (const [name, els] of Object.entries(ART_DATA)) {
      const m = MotionV1.parse({ dur: 12, freeze: 0.9, elements: els(['UNO', 'DOS', 'TRES']) });
      expect(motionGate(m, name), name).toEqual([]);
      expect(ART[name as keyof typeof ART](800, 450, 12, ['UNO'])).toContain('<animate');
    }
    for (const a of ['precision', 'magnifier', 'budget', 'gateway', 'layers', 'migration'])
      expect(ART_DATA[a]).toBeDefined();
  });

  it('icons come from the pinned Lucide pack, inlined, with no script or remote reference', () => {
    expect(hasIcon('shield-check')).toBe(true);
    const svg = icon('shield-check', 100, 100, 48, 'var(--accent)');
    expect(svg).toMatch(/^<g transform="translate\(76 76\) scale\(2\)"/);
    expect(svg).not.toMatch(/<script|href=|xlink/);
  });

  it('an external SVG passes the allowlist and gets its ids namespaced', () => {
    const r = sanitizeSvg(
      '<svg viewBox="0 0 100 50"><defs><radialGradient id="glow"><stop offset="0" stop-color="#ffffff"/></radialGradient></defs><circle cx="50" cy="25" r="20" fill="url(#glow)"><animate attributeName="r" values="20;24;20" dur="3s" repeatCount="indefinite"/></circle></svg>',
      'fig',
    );
    expect(r.ok && r.box).toEqual([100, 50]);
    expect(r.ok && r.inner).toContain('id="fig-glow"');
    expect(r.ok && r.inner).toContain('url(#fig-glow)');
  });

  it('the sanitizer rejects script, event handlers, links, styles, foreign content and a missing viewBox', () => {
    const bad = (svg: string) => {
      const r = sanitizeSvg(svg);
      return r.ok ? '' : r.errors.join(' | ');
    };
    expect(bad('<svg viewBox="0 0 1 1"><script>alert(1)</script></svg>')).toMatch(
      /elemento no permitido: <script>/,
    );
    expect(bad('<svg viewBox="0 0 1 1" onload="alert(1)"></svg>')).toMatch(/manejador de evento: onload/);
    expect(
      bad('<svg viewBox="0 0 1 1"><a href="https://x.test"><rect width="1" height="1"/></a></svg>'),
    ).toMatch(/enlace no permitido: href/);
    expect(bad('<svg viewBox="0 0 1 1"><rect width="1" height="1" style="fill:red"/></svg>')).toMatch(
      /atributo no permitido: style/,
    );
    expect(bad('<svg viewBox="0 0 1 1"><foreignObject></foreignObject></svg>')).toMatch(/foreignObject/);
    expect(bad('<svg viewBox="0 0 1 1"><!-- x --><rect width="1" height="1"/></svg>')).toMatch(/comentario/);
    expect(bad('<svg><rect width="1" height="1"/></svg>')).toMatch(/viewBox/);
    expect(
      bad('<svg viewBox="0 0 1 1"><rect width="1" height="1" fill="url(https://x.test/a.svg#p)"/></svg>'),
    ).toMatch(/referencia externa/);
  });
});
