// An external illustration enters as SVG markup and is held to an allowlist: known
// drawing and SMIL elements, known presentation attributes, no event handlers, no
// links, no scripts, no styles, no foreign content. Anything else rejects the file
// (fail closed): stripping would ship a drawing different from the one reviewed.
const ELEMENTS = new Set([
  'svg',
  'g',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'title',
  'desc',
  'defs',
  'lineargradient',
  'radialgradient',
  'stop',
  'animate',
  'animatetransform',
  'animatemotion',
]);
const ATTRS = new Set(
  (
    'viewbox xmlns width height x y x1 y1 x2 y2 cx cy r rx ry d points transform fill stroke ' +
    'stroke-width stroke-linecap stroke-linejoin stroke-dasharray stroke-dashoffset stroke-opacity ' +
    'fill-opacity fill-rule clip-rule opacity font-size font-weight font-family text-anchor ' +
    'dominant-baseline letter-spacing offset stop-color stop-opacity gradientunits gradienttransform ' +
    'fx fy id pathlength preserveaspectratio attributename type from to by values keytimes keysplines ' +
    'keypoints calcmode dur begin end repeatcount additive accumulate path rotate class'
  ).split(' '),
);
const TAG = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
const ATTR = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

export type Sanitized = { ok: true; inner: string; box: [number, number] } | { ok: false; errors: string[] };

// `prefix` namespaces every id and url(#id) so a drawing cannot restyle the rest of
// the page by reusing an id the page already defines.
export function sanitizeSvg(src: string, prefix = 'x'): Sanitized {
  const errors: string[] = [];
  const body = src.replace(/^\s*<\?xml[^>]*\?>/, '').trim();
  const leftover = body.replace(TAG, '');
  if (/[<>]/.test(leftover))
    errors.push('marcado que no es un elemento permitido (comentario, CDATA, doctype o tag roto)');
  let root: string | null = null;
  let viewBox: string | undefined;
  for (const m of body.matchAll(TAG)) {
    const [, close, rawName, attrs] = m;
    const name = rawName!.toLowerCase();
    if (!ELEMENTS.has(name)) errors.push(`elemento no permitido: <${rawName}>`);
    if (!close && !root) root = name;
    for (const a of attrs!.matchAll(ATTR)) {
      const key = a[1]!.toLowerCase();
      const val = a[2] ?? a[3] ?? '';
      if (key.startsWith('on')) errors.push(`manejador de evento: ${a[1]}`);
      else if (key.includes('href')) errors.push(`enlace no permitido: ${a[1]}`);
      else if (!ATTRS.has(key)) errors.push(`atributo no permitido: ${a[1]}`);
      if (/url\(\s*['"]?(?!#)|javascript:|expression\(/i.test(val))
        errors.push(`valor con referencia externa en ${a[1]}`);
      if (name === 'svg' && key === 'viewbox') viewBox = val;
    }
  }
  if (root !== 'svg') errors.push('la raíz debe ser <svg>');
  const vb = viewBox
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if (!vb || vb.length !== 4 || vb.some((v) => !Number.isFinite(v)) || vb[2]! <= 0 || vb[3]! <= 0)
    errors.push('falta un viewBox válido');
  if (errors.length) return { ok: false, errors: [...new Set(errors)] };
  const inner = body
    .replace(/^<svg\b[^>]*>/i, '')
    .replace(/<\/svg>\s*$/i, '')
    .replace(/\bid="([^"]+)"/g, `id="${prefix}-$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#${prefix}-$1)`);
  const [minX, minY, w, h] = vb!;
  return {
    ok: true,
    inner: minX || minY ? `<g transform="translate(${-minX!} ${-minY!})">${inner}</g>` : inner,
    box: [w!, h!],
  };
}
