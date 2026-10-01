// Content and HTML gates of an immersive deck: the union of both references.
//   from A (Puntos Colombia): axis in the first third, every act covered, no visible
//     evidence tags, no absolute paths, no remote resources, keyboard + touch +
//     reduced motion present, accessible names on every visual;
//   from B (Agentic SDLC): every hex comes from the tokens, one h1 per slide, every
//     scene loops, forbidden on-screen terms, size budget;
//   new: every link resolves (A/B shipped a masterclass pointing at 02_Workshop.html
//     while the file was workshop.html).
import type { DeckV1, TokensV1 } from './schema.ts';
import { EVIDENCE_TAG } from './render.ts';
import { motionGate, motionTexts } from '../motion/custom.ts';
import { sanitizeSvg } from '../motion/sanitize.ts';

const visibleText = (html: string) =>
  html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/g, ' ')
    .replace(/data-notes="[^"]*"/g, '')
    .replace(/<[^>]+>/g, ' ');

// Spanish words that are misspelled without their accent in any context: singular
// -ción/-sión, and a short list with no unaccented homograph. A heuristic, not a
// spell checker: it catches the typical ASCII-only authoring slip. Letter lookarounds, not
// \b: in JS \b is ASCII-only, so it would split «funcionó» into «funcion» + «ó».
const ES_UNACCENTED =
  /(?<!\p{L})(\p{L}+[cs]ion|metodo|metodos|analisis|tecnico|tecnica|tecnicos|tecnicas|rapido|rapida|facil|dificil|automatico|automatica|agentico|agentica|basico|basica|codigo|codigos|arbol|lineas|numeros)(?!\p{L})/giu;
// Left out on purpose: words whose unaccented form is a valid verb (publica, practica,
// critica, ultimo, pagina, numero): flagging them would make the gate cry wolf.

export function spanishAccentSlips(text: string): string[] {
  return [...new Set([...text.matchAll(ES_UNACCENTED)].map((m) => m[0].toLowerCase()))];
}

function visibleSource(deck: DeckV1): string {
  const parts = [
    deck.meta.title,
    deck.meta.subtitle,
    deck.meta.axis,
    deck.meta.caption ?? '',
    deck.meta.alt ?? '',
    deck.meta.cta ?? '',
    ...deck.acts.map((a) => a.title),
  ];
  for (const s of deck.slides)
    parts.push(
      s.eyebrow ?? '',
      s.title,
      s.sub ?? '',
      s.takeaway ?? '',
      s.notes ?? '',
      s.scene_label,
      ...(s.items ?? []),
      ...(s.chain ?? []),
      ...(s.cards ?? []).flatMap((c) => [c.title, c.fix]),
      ...(s.metrics ?? []).flatMap((m) => [m.label, m.source]),
      ...(s.links ?? []).map((l) => l.label),
      ...(s.scene ? motionTexts(s.scene) : []),
      s.badge ?? '',
      s.alt ?? '',
      s.voiceover ?? '',
    );
  return parts.join('\n');
}

// `axis: false` for social frames: a carousel opens on its conclusion, not on an axis.
export function deckSourceGate(deck: DeckV1, opts: { axis?: boolean } = {}): string[] {
  const errs: string[] = [];
  if (deck.meta.lang === 'es') {
    const slips = spanishAccentSlips(visibleSource(deck));
    if (slips.length) errs.push(`tildes faltantes: ${slips.join(', ')}`);
  }
  const ids = deck.slides.map((s) => s.id);
  const axis = deck.slides.findIndex((s) => s.kind === 'axis');
  if (opts.axis === false) {
    // social frames: no axis rule
  } else if (axis < 0) errs.push('no hay diapositiva de eje (kind: axis)');
  else if (axis + 1 > deck.slides.length / 3)
    errs.push(`el eje llega en la posición ${axis + 1} de ${ids.length}: debe estar en el primer tercio`);
  for (const s of deck.slides) {
    if (s.scene) errs.push(...motionGate(s.scene, s.id));
    if (s.art_svg) {
      const r = sanitizeSvg(s.art_svg, s.id);
      if (!r.ok) errs.push(...r.errors.map((e) => `${s.id}: art_svg ${e}`));
    }
  }
  for (const s of deck.slides)
    for (const l of s.links ?? [])
      if (/^https?:|^\/\//.test(l.href)) errs.push(`${s.id}: enlace externo ${l.href} (el deck es offline)`);
  return errs;
}

export type Layout = 'deck' | 'playbook' | 'workbook';

export function deckHtmlGate(
  html: string,
  deck: DeckV1,
  tokens: TokensV1,
  siblingExists: (name: string) => boolean = () => false,
  layout: Layout = 'deck',
): string[] {
  const errs: string[] = [];
  if (
    /<script[^>]+src=/.test(html) ||
    /(?:src|href)\s*=\s*["']https?:|url\(\s*["']?https?:|@import/.test(html)
  )
    errs.push('carga de red');
  const allowed = new Set(
    [...Object.values(tokens.palette), ...tokens.accents, tokens.ok, '#000000', '#ffffff'].map((h) =>
      h.toLowerCase(),
    ),
  );
  const hexes = new Set(
    [...html.replace(/data:[^"')]+/g, '').matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0].toLowerCase()),
  );
  const off = [...hexes].filter((h) => !allowed.has(h)).sort();
  if (off.length) errs.push(`hex fuera de tokens: ${off.join(', ')}`);
  const cls = layout === 'deck' ? 'slide' : 'sec';
  const sections = [...html.matchAll(new RegExp(`<section class="${cls}"[\\s\\S]*?<\\/section>`, 'g'))].map(
    (m) => m[0],
  );
  if (sections.length !== deck.slides.length)
    errs.push(`${sections.length} láminas en el HTML, ${deck.slides.length} en la fuente`);
  sections.forEach((body, k) => {
    const h1 = (body.match(/<h1\b/g) ?? []).length;
    if (h1 !== 1) errs.push(`lámina ${k + 1}: ${h1} h1`);
    if (!body.includes('repeatCount="indefinite"')) errs.push(`lámina ${k + 1}: la escena no hace loop`);
    if (!/<svg class="scene"[^>]*role="img"[^>]*aria-label="[^"]{3,}"/.test(body))
      errs.push(`lámina ${k + 1}: visual sin nombre accesible`);
  });
  const text = visibleText(html);
  if (EVIDENCE_TAG.test(text)) errs.push('etiquetas editoriales visibles');
  EVIDENCE_TAG.lastIndex = 0;
  if (/\/Users\/|[A-Z]:\\Users\\/.test(html)) errs.push('ruta absoluta en el deck');
  for (const term of deck.meta.forbidden_terms)
    // Case as written: "Claude" forbids the name, not the CLAUDE.md file (reference B's rule).
    if (new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text))
      errs.push(`término prohibido en pantalla: ${term}`);
  const needs =
    layout === 'deck'
      ? ['ArrowRight', 'ArrowLeft', 'touchstart', 'prefers-reduced-motion', '@media print']
      : ['IntersectionObserver', 'prefers-reduced-motion', '@media print', 'id="motion"'];
  for (const need of needs) if (!html.includes(need)) errs.push(`falta ${need}`);
  if (layout === 'workbook') {
    for (const sl of deck.slides)
      if (sl.interactive && !html.includes(`data-w="w-${sl.id}"`))
        errs.push(`${sl.id}: el ejercicio no llegó al workbook`);
    if (!/data-store="frames:[a-z0-9-]+:workbook"/.test(html)) errs.push('workbook sin clave de estado');
  }
  const ids = new Set(deck.slides.map((s) => s.id));
  for (const m of html.matchAll(/<a href="([^"]+)"/g)) {
    const href = m[1]!;
    if (href.startsWith('#')) {
      if (!ids.has(href.slice(1))) errs.push(`enlace roto: ${href} no es una lámina`);
    } else if (!deck.meta.files.includes(href) || !siblingExists(href)) errs.push(`enlace roto: ${href}`);
  }
  const bytes = Buffer.byteLength(html);
  if (bytes > deck.meta.budget_kb * 1000) errs.push(`tamaño ${bytes} B > ${deck.meta.budget_kb} KB`);
  return errs;
}

// Visible copy of each slide, by id: the section's text without its scene, figure or
// workbook widget. Spec: visible_text() in ai-native-sdlc/class/playbook.py.
export function copyTexts(html: string, layout: Layout): Map<string, string> {
  const cls = layout === 'deck' ? 'slide' : 'sec';
  const out = new Map<string, string>();
  for (const m of html.matchAll(
    new RegExp(`<section class="${cls}" id="([^"]+)"[^>]*>([\\s\\S]*?)</section>`, 'g'),
  ))
    out.set(
      m[1]!,
      m[2]!
        .replace(/<svg\b[\s\S]*?<\/svg>/g, ' ')
        .replace(/<figure\b[\s\S]*?<\/figure>/g, ' ')
        .replace(/<(fieldset|div) class="w"[\s\S]*?<\/\1>/g, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    );
  return out;
}

// The deck, the playbook and the workbook must say the same thing on every slide.
export function layoutParity(deckHtml: string, other: string, layout: Layout): string[] {
  const a = copyTexts(deckHtml, 'deck');
  const b = copyTexts(other, layout);
  const errs: string[] = [];
  for (const [id, text] of a)
    if (!b.has(id)) errs.push(`${layout}: falta la lámina ${id}`);
    else if (b.get(id) !== text) errs.push(`${layout}: el texto de ${id} difiere del deck`);
  for (const id of b.keys()) if (!a.has(id)) errs.push(`${layout}: lámina ${id} que el deck no tiene`);
  return errs;
}
