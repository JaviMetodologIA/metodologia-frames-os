// Audit of any existing HTML page: the checks Frames OS holds its own pages to, applied
// to a file someone else made. Static findings from the markup, browser findings from
// a real page (overflow at three widths, script errors, text contrast). Each finding
// names what is wrong, where, and the fix.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { launch } from '../../engine/browser.ts';
import { spanishAccentSlips } from '../../domains/deck/gates.ts';
import { EVIDENCE_TAG } from '../../domains/deck/render.ts';

export type Finding = { id: string; severity: 'high' | 'medium' | 'low'; where: string; fix: string };

const visibleText = (html: string) =>
  html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');

export function auditStatic(html: string): Finding[] {
  const f: Finding[] = [];
  const add = (id: string, severity: Finding['severity'], where: string, fix: string) =>
    f.push({ id, severity, where, fix });
  if (
    /<script[^>]+src=/.test(html) ||
    /(?:src|href)\s*=\s*["']https?:|url\(\s*["']?https?:|@import/.test(html)
  )
    add(
      'network',
      'high',
      'recursos remotos',
      'inlinea scripts, estilos, fuentes e imágenes (data: URI) para que la página funcione offline',
    );
  if (!/<meta[^>]+http-equiv=["']Content-Security-Policy/i.test(html))
    add(
      'csp',
      'medium',
      '<head>',
      "agrega una CSP con default-src 'none' y solo lo inline que la página usa",
    );
  if (!/<html[^>]*\slang=/.test(html)) add('lang', 'medium', '<html>', 'declara el idioma: <html lang="es">');
  if (!/<meta[^>]+name=["']viewport/.test(html))
    add(
      'viewport',
      'medium',
      '<head>',
      'agrega <meta name="viewport" content="width=device-width,initial-scale=1">',
    );
  const h1 = (html.match(/<h1\b/g) ?? []).length;
  if (h1 === 0) add('h1', 'medium', 'estructura', 'la página necesita un h1 que diga de qué trata');
  const noAlt = (html.match(/<img\b(?![^>]*\balt=)[^>]*>/g) ?? []).length;
  if (noAlt) add('img-alt', 'high', `${noAlt} imagen(es)`, 'cada imagen lleva alt; si es decorativa, alt=""');
  const svgNoName = (html.match(/<svg\b(?![^>]*aria-(label|hidden))[^>]*>/g) ?? []).length;
  if (svgNoName)
    add(
      'svg-name',
      'medium',
      `${svgNoName} SVG`,
      'un SVG con significado lleva role="img" y aria-label; uno decorativo, aria-hidden="true"',
    );
  const animates = /@keyframes|<animate|\banimation\s*:/.test(html);
  if (animates && !/prefers-reduced-motion/.test(html))
    add(
      'reduced-motion',
      'high',
      'animaciones',
      'respeta @media (prefers-reduced-motion: reduce): sin movimiento, estado final visible',
    );
  const text = visibleText(html);
  if (EVIDENCE_TAG.test(text))
    add(
      'evidence-tags',
      'medium',
      'texto visible',
      'quita las etiquetas editoriales ([CÓDIGO], [DOC]…) del texto que ve la audiencia',
    );
  EVIDENCE_TAG.lastIndex = 0;
  if (/\/Users\/|[A-Z]:\\Users\\/.test(html))
    add('abs-path', 'high', 'rutas', 'reemplaza rutas locales absolutas por rutas relativas');
  if (/<html[^>]*\slang=["']es/.test(html)) {
    const slips = spanishAccentSlips(text);
    if (slips.length) add('accents', 'medium', slips.slice(0, 8).join(', '), 'corrige las tildes faltantes');
  }
  return f;
}

// WCAG contrast of rendered text against the nearest opaque background.
const CONTRAST = () => {
  const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number);
  const lum = ([r, g, b]: number[]) =>
    [r!, g!, b!]
      .map((v) => v / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i]!, 0);
  const bg = (el: Element | null): number[] => {
    for (let e = el; e; e = e.parentElement) {
      const c = rgb(getComputedStyle(e).backgroundColor);
      if (c.length >= 3 && (c[3] ?? 1) > 0.9) return c;
    }
    return [255, 255, 255];
  };
  const low: string[] = [];
  for (const el of document.querySelectorAll('p,li,h1,h2,h3,a,span,td,th,label,button')) {
    if (!el.textContent?.trim() || !(el as HTMLElement).offsetParent) continue;
    const st = getComputedStyle(el);
    const [a, b] = [lum(rgb(st.color)), lum(bg(el))].sort((x, y) => y - x);
    const ratio = (a! + 0.05) / (b! + 0.05);
    const big = parseFloat(st.fontSize) >= 24 || (parseFloat(st.fontSize) >= 18.66 && +st.fontWeight >= 700);
    if (ratio < (big ? 3 : 4.5))
      low.push(`${el.tagName.toLowerCase()} «${el.textContent.trim().slice(0, 24)}» ${ratio.toFixed(1)}:1`);
  }
  return low.slice(0, 6);
};

export async function auditBrowser(file: string): Promise<Finding[] | null> {
  const browser = await launch();
  if (!browser) return null;
  const f: Finding[] = [];
  try {
    for (const [w, h] of [
      [1920, 1080],
      [1366, 768],
      [390, 844],
    ] as const) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      const errs: string[] = [];
      page.on('pageerror', (e) => errs.push(e.message));
      await page.goto(pathToFileURL(file).href);
      await page.waitForTimeout(300);
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1))
        f.push({
          id: `overflow-${w}`,
          severity: 'high',
          where: `${w}x${h}`,
          fix: 'evita anchos fijos: max-width:100%, grid con minmax(0,1fr), sin overflow horizontal',
        });
      if (errs.length)
        f.push({
          id: `js-error-${w}`,
          severity: 'high',
          where: errs[0]!.slice(0, 80),
          fix: 'corrige el error de JavaScript',
        });
      if (w === 1366) {
        const low = await page.evaluate(CONTRAST);
        if (low.length)
          f.push({
            id: 'contrast',
            severity: 'high',
            where: low.join(' · '),
            fix: 'sube el contraste a 4,5:1 (3:1 en texto grande)',
          });
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
  return f;
}

export async function auditHtml(file: string): Promise<{ findings: Finding[]; browser: boolean }> {
  const s = auditStatic(readFileSync(file, 'utf8'));
  const b = await auditBrowser(file);
  return { findings: [...s, ...(b ?? [])], browser: b !== null };
}
