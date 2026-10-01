// Colour maths shared by every layout: text drawn on a token fill picks ink or white
// by real WCAG contrast against that token.
import type { TokensV1 } from '../deck/schema.ts';

// WCAG relative luminance and contrast: text drawn ON a solid fill takes whichever of
// ink or white reads better against that fill's real token colour.
const lum = (hex: string) => {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
export const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};
export type On = (fill: string) => 'var(--ink)' | 'var(--white)';
export function onFor(t: TokensV1): On {
  const hex: Record<string, string> = {
    'var(--brand)': t.palette.brand,
    'var(--accent)': t.palette.accent,
    'var(--ok)': t.ok,
  };
  t.accents.forEach((h, i) => (hex[`var(--c${i + 1})`] = h));
  return (fill) => {
    const h = hex[fill] ?? t.palette.ink;
    return contrast(h, t.palette.ink) >= contrast(h, '#ffffff') ? 'var(--ink)' : 'var(--white)';
  };
}
