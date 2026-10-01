// Lucide icons (ISC), pinned in package.json and registry/vendor.lock.json, inlined as
// SVG at build time: the output stays offline and carries no icon font or script.
import { createRequire } from 'node:module';

type Node = [string, Record<string, string>];
let nodes: Record<string, Node[]> | null = null;

function all(): Record<string, Node[]> {
  nodes ??= createRequire(import.meta.url)('lucide-static/icon-nodes.json') as Record<string, Node[]>;
  return nodes;
}

export const hasIcon = (name: string) => Object.hasOwn(all(), name);

const attr = (a: Record<string, string>, extra: string) =>
  Object.entries(a)
    .filter(([k]) => /^[a-z][a-z0-9-]*$/.test(k) && k !== 'key')
    .map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`)
    .join(' ') + extra;

// An icon centred on (x, y), `size` px wide, stroked with a token colour. `inner` is
// appended to every drawn node (a SMIL child, e.g. the stroke drawing itself).
export function icon(name: string, x: number, y: number, size: number, color: string, inner = ''): string {
  const n = all()[name];
  if (!n) throw new Error(`icono desconocido: ${name}`);
  const s = size / 24;
  const draw = inner ? ' pathLength="1" stroke-dasharray="1"' : '';
  const body = n.map(([tag, a]) => `<${tag} ${attr(a, draw)}>${inner}</${tag}>`).join('');
  return `<g transform="translate(${x - size / 2} ${y - size / 2}) scale(${s})" fill="none" stroke="${color}" stroke-width="${(2 / Math.max(s, 1)) * 1.4}" stroke-linecap="round" stroke-linejoin="round">${body}</g>`;
}
