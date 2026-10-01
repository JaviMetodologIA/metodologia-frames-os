// Languages for any rendered page (deck, playbook, workbook). Spec: ai-native-sdlc/
// class/i18n.py: a catalog keyed by the source text, a toggle inside the page, marker
// parity between languages. Here it runs on the finished HTML, so no renderer threads
// a translate() call: every visible text run and every accessible attribute is found,
// numbered and swapped with textContent/setAttribute (never innerHTML).
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const LANGS = ['es', 'en', 'pt', 'fr'] as const;
export type Lang = (typeof LANGS)[number];
export type Catalog = Record<string, string>;

const ATTRS = ['aria-label', 'aria-roledescription', 'alt', 'data-notes', 'data-act', 'placeholder'];
const LETTER = /\p{L}/u;
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const unesc = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

// Blocks whose content is not page text.
const OPAQUE = /<(script|style|title|textarea)\b[^>]*>[\s\S]*?<\/\1>/g;

type Walk = { html: string; texts: string[] };

// Number every translatable run; mark it with data-t (or data-ta for attributes).
function walk(html: string): Walk {
  const texts: string[] = [];
  const index = new Map<string, number>();
  const id = (s: string) => {
    if (!index.has(s)) index.set(s, texts.push(s) - 1);
    return index.get(s)!;
  };
  const head = html.slice(0, html.indexOf('<body'));
  let body = html.slice(html.indexOf('<body'));
  const kept: string[] = [];
  body = body.replace(OPAQUE, (m) => `\u0000${kept.push(m) - 1}\u0000`);
  const tokens = body.match(/<[^>]+>|[^<]+/g) ?? [];
  let svg = 0;
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i]!;
    if (tk.startsWith('<')) {
      if (/^<svg\b/.test(tk)) svg++;
      if (/^<\/svg>/.test(tk)) svg--;
      const marks: string[] = [];
      for (const a of ATTRS) {
        const m = new RegExp(`\\s${a}="([^"]*)"`).exec(tk);
        const v = m && norm(unesc(m[1]!));
        if (v && LETTER.test(v)) marks.push(`${a}:${id(v)}`);
      }
      if (marks.length) tokens[i] = tk.replace(/(\/?>)$/, ` data-ta="${marks.join(';')}"$1`);
      continue;
    }
    if (tk.includes('\u0000')) continue;
    const text = norm(unesc(tk));
    if (!text || !LETTER.test(text)) continue;
    const k = id(text);
    const prev = tokens[i - 1] ?? '';
    if (svg > 0) {
      // SVG text: the attribute goes on the <text>/<tspan> that holds the run.
      if (/^<(text|tspan)\b/.test(prev)) tokens[i - 1] = prev.replace(/>$/, ` data-t="${k}">`);
    } else {
      const lead = /^\s*/.exec(tk)![0];
      const trail = /\s*$/.exec(tk)![0];
      tokens[i] = `${lead}<x-t data-t="${k}">${tk.trim()}</x-t>${trail}`;
    }
  }
  const out = tokens.join('').replace(/\u0000(\d+)\u0000/g, (_, n) => kept[+n]!);
  return { html: head + out, texts };
}

// Every text the page shows, for `frames i18n` to seed catalogs and for the gate.
export function pageTexts(html: string): string[] {
  const title = /<title>([\s\S]*?)<\/title>/.exec(html)?.[1];
  const { texts } = walk(html);
  return [...new Set([...(title ? [norm(unesc(title))] : []), ...texts])];
}

// Strings that must survive translation unchanged: numbers, arrows, code in backticks.
const markers = (s: string) =>
  JSON.stringify([s.match(/\d+/g) ?? [], s.split('→').length, s.split('`').length]);

export function i18nGate(
  html: string,
  langs: readonly Lang[],
  catalogs: Partial<Record<Lang, Catalog>>,
): string[] {
  const errs: string[] = [];
  const texts = pageTexts(html);
  for (const l of langs.slice(1)) {
    const cat = catalogs[l] ?? {};
    const missing = texts.filter((t) => !cat[t]?.trim());
    if (missing.length)
      errs.push(`${l}: faltan ${missing.length} traducciones (ej. «${missing[0]!.slice(0, 60)}»)`);
    for (const t of texts)
      if (cat[t]?.trim() && markers(cat[t]!) !== markers(t))
        errs.push(`${l}: marcadores distintos en «${t.slice(0, 60)}»`);
  }
  return errs;
}

const LABEL: Record<Lang, string> = { es: 'ES', en: 'EN', pt: 'PT', fr: 'FR' };

const CSS = `.langs{position:fixed;z-index:9;top:14px;right:18px;display:inline-flex;gap:2px;padding:3px;border:1px solid var(--line);border-radius:999px;background:color-mix(in srgb,var(--ink) 80%,transparent);font:700 12px/1 ui-monospace,Menlo,monospace;letter-spacing:.06em}
#bar .langs{position:static}.langs button{border:0;background:none;color:var(--muted);font:inherit;padding:6px 8px;border-radius:999px;cursor:pointer}
.langs button[aria-pressed=true]{background:var(--c2);color:var(--ink)}x-t{display:contents}body.auto .langs{top:48px}@media print{.langs{display:none}}`;

const JS = `(function(){var C=JSON.parse(document.getElementById('i18n').textContent),L=C.langs,K='frames:lang',cur=L[0];
try{var s=localStorage.getItem(K);if(L.indexOf(s)>=0)cur=s}catch(e){}
function set(l){var j=L.indexOf(l);if(j<0)return;cur=l;document.documentElement.lang=l;document.title=C.title[j];
 [].forEach.call(document.querySelectorAll('[data-t]'),function(e){e.textContent=C.t[+e.getAttribute('data-t')][j]});
 [].forEach.call(document.querySelectorAll('[data-ta]'),function(e){e.getAttribute('data-ta').split(';').forEach(function(p){var a=p.split(':');e.setAttribute(a[0],C.t[+a[1]][j])})});
 [].forEach.call(document.querySelectorAll('.langs button'),function(b){b.setAttribute('aria-pressed',String(b.dataset.lang===l))});
 try{localStorage.setItem(K,l)}catch(e){}document.dispatchEvent(new CustomEvent('langchange',{detail:l}))}
document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('.langs button');if(b){e.stopPropagation();set(b.dataset.lang)}},true);
document.addEventListener('keydown',function(e){if((e.key==='l'||e.key==='L')&&!e.metaKey&&!e.ctrlKey&&!(e.target.closest&&e.target.closest('input,textarea')))set(L[(L.indexOf(cur)+1)%L.length])});
if(cur!==L[0])set(cur)})();`;

// One page, every language: the source stays in the markup; the others ride in a JSON
// payload the toggle swaps in. Throws if a catalog is incomplete (the gate says which).
export function localize(
  html: string,
  langs: readonly Lang[],
  catalogs: Partial<Record<Lang, Catalog>>,
): string {
  if (langs.length < 2) return html;
  const errs = i18nGate(html, langs, catalogs);
  if (errs.length) throw new Error(`i18n incompleto: ${errs.join('; ')}`);
  const title = norm(unesc(/<title>([\s\S]*?)<\/title>/.exec(html)?.[1] ?? ''));
  const { html: marked, texts } = walk(html);
  const tr = (s: string, l: Lang) => (l === langs[0] ? s : catalogs[l]![s]!);
  const payload = JSON.stringify({
    langs,
    title: langs.map((l) => tr(title, l)),
    t: texts.map((s) => langs.map((l) => tr(s, l))),
  }).replace(/</g, '\\u003c');
  const toggle = `<div class="langs" role="group" aria-label="Idioma · Language · Idioma · Langue">${langs
    .map((l, i) => `<button type="button" data-lang="${l}" aria-pressed="${i === 0}">${LABEL[l]}</button>`)
    .join('')}</div>`;
  let out = marked.replace('</style>', `${CSS}</style>`);
  // In a scroll layout the toggle sits in the top bar; in the deck it floats top right.
  out = out.includes('<button type="button" id="motion"')
    ? out.replace('<button type="button" id="motion"', `${toggle}<button type="button" id="motion"`)
    : out.replace(/(<body[^>]*>)/, `$1${toggle}`);
  return out.replace(
    '</body>',
    `<script type="application/json" id="i18n">${payload}</script><script>${JS}</script>\n</body>`,
  );
}

// Catalogs live beside the deck: i18n/<lang>.json, keyed by the source text.
export function loadCatalogs(dir: string, langs: readonly Lang[]): Partial<Record<Lang, Catalog>> {
  const out: Partial<Record<Lang, Catalog>> = {};
  for (const l of langs.slice(1)) {
    const f = path.join(dir, `${l}.json`);
    out[l] = existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as Catalog) : {};
  }
  return out;
}

// Code, paths and brand names read the same in every language: seeded as themselves.
const CODE_LIKE = /^(\$ |[\w.-]+\/|[\w-]+\.(ya?ml|json|md|ts|html)$|[A-Z]{2,}[\w-]*$)/;

// Every text the pages show, per language: existing translations kept, the rest empty
// (or themselves when they are code). The caller writes the result.
export function seedCatalogs(
  pages: string[],
  langs: readonly Lang[],
  existing: Partial<Record<Lang, Catalog>>,
): { catalogs: Partial<Record<Lang, Catalog>>; report: string[] } {
  const texts = [...new Set(pages.flatMap(pageTexts))];
  const catalogs: Partial<Record<Lang, Catalog>> = {};
  const report: string[] = [];
  for (const l of langs.slice(1)) {
    const cat = existing[l] ?? {};
    catalogs[l] = Object.fromEntries(texts.map((t) => [t, cat[t] ?? (CODE_LIKE.test(t) ? t : '')]));
    report.push(`${l}: ${texts.filter((t) => !catalogs[l]![t]).length} de ${texts.length} por traducir`);
  }
  return { catalogs, report };
}
