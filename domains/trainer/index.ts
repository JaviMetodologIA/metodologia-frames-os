// trainer: a course (course-v1) and its five artifacts, each a typed source the motion
// core renders: landing (playbook layout), masterclass (deck + PDF), workbook, playbook
// and prompt library. Frames' Trainer OS schemas supply every limit
// (02_proceso/workflows/trainer-os/*-contracts.ts, trainer-intake/route-spec/design-lock
// schemas); Frames compiled only a synthetic fixture and never ran its benchmark.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { z } from 'zod';
import {
  missingFrom,
  relTo,
  requestFromHost,
  type Handler,
  type HandlerCtx,
  type SchemaCheck,
} from '../../engine/handler-kit.ts';
import { capturePdf } from '../../engine/capture.ts';
import { loadTokens, parseDeck } from '../deck/index.ts';
import { deckHtmlGate, deckSourceGate } from '../deck/gates.ts';
import { renderDeck } from '../deck/render.ts';
import { renderPlaybook } from '../deck/playbook.ts';
import type { DeckV1 } from '../deck/schema.ts';
import { PromptsV1, promptsGate, renderLibrary } from '../content/prompts.ts';
import { deckSmoke } from '../../verify/visual/deck-smoke.ts';
import { scrollSmoke } from '../../verify/visual/scroll-smoke.ts';
import { librarySmoke } from '../../verify/visual/library-smoke.ts';

const Text = (max: number) => z.string().trim().min(1).max(max);

export const CourseV1 = z
  .object({
    schema: z.literal('course-v1'),
    meta: z
      .object({
        title: Text(160),
        locale: z.enum(['es', 'en', 'pt']),
        audience: Text(300),
        privacy_reviewed: z.literal(true),
      })
      .strict(),
    // Frames trainer-intake-v1
    intake: z
      .object({
        outcomes: z.array(Text(300)).min(1).max(12),
        constraints: z.array(Text(300)).max(12).default([]),
        sources: z.array(Text(300)).max(20).default([]),
        prompt_rounds: z
          .array(z.object({ question: Text(300), blocking: z.boolean() }).strict())
          .min(3)
          .max(5),
      })
      .strict(),
    // Frames trainer-route-spec-v1
    spec: z
      .object({
        modules: z
          .array(
            z
              .object({
                id: z.string().regex(/^[a-z0-9-]+$/),
                title: Text(160),
                outcome: Text(300),
                evidence: Text(300),
              })
              .strict(),
          )
          .min(1)
          .max(12),
        acceptance: z.array(Text(300)).min(1).max(20),
      })
      .strict(),
    // Frames trainer-design-lock-v1: two directions, the person (H01) picks one.
    design: z
      .object({
        directions: z
          .array(z.object({ id: z.string().regex(/^[a-z0-9-]+$/), summary: Text(300) }).strict())
          .length(2),
        chosen: z.string().optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (c.intake.prompt_rounds.filter((r) => r.blocking).length > 2)
      ctx.addIssue({ code: 'custom', message: 'intake: más de 2 rondas bloqueantes' });
    if (c.design.chosen && !c.design.directions.some((d) => d.id === c.design.chosen))
      ctx.addIssue({
        code: 'custom',
        message: `design.chosen ${c.design.chosen} no es una de las dos direcciones`,
      });
  });
export type CourseV1 = z.infer<typeof CourseV1>;

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

// Frames adapter-contracts.ts: a landing has exactly 8 sections and a CTA of up to 3
// words and 40 characters.
export function landingGate(d: DeckV1): string[] {
  const e: string[] = [];
  if (d.slides.length !== 8) e.push(`landing: ${d.slides.length} secciones, deben ser 8`);
  if (!d.meta.cta) e.push('landing: falta meta.cta');
  else if (words(d.meta.cta) > 3) e.push(`landing: CTA de ${words(d.meta.cta)} palabras, máximo 3`);
  if ((d.meta.cta?.length ?? 0) > 40) e.push(`landing: CTA de ${d.meta.cta!.length} caracteres, máximo 40`);
  return e;
}

// Frames masterclass-contracts.ts:70: 18 moments, 90 base minutes and exactly 30 extended.
export function masterclassGate(d: DeckV1): string[] {
  const e: string[] = [];
  if (d.slides.length !== 18) e.push(`masterclass: ${d.slides.length} momentos, deben ser 18`);
  const missing = d.slides.filter((s) => !s.minutes).map((s) => s.id);
  if (missing.length) e.push(`masterclass: momentos sin minutes: ${missing.join(', ')}`);
  const base = d.slides.filter((s) => !s.extended).reduce((a, s) => a + (s.minutes ?? 0), 0);
  const ext = d.slides.filter((s) => s.extended).reduce((a, s) => a + (s.minutes ?? 0), 0);
  if (base !== 90) e.push(`masterclass: ${base} minutos base, deben ser 90`);
  if (ext !== 30) e.push(`masterclass: ${ext} minutos extendidos, deben ser 30 (Frames: 90 + 30)`);
  return e;
}

// Frames adapter-contracts.ts: preparation of 1 to 8 steps, then exactly 3 routes of
// 1 to 12 steps. Acts are the parts; every slide is a step.
export function workbookGate(d: DeckV1): string[] {
  const e: string[] = [];
  if (d.acts.length !== 4) return [`workbook: ${d.acts.length} partes, deben ser preparación + 3 rutas`];
  d.acts.forEach((a, k) => {
    const n = d.slides.filter((s) => s.act === a.id).length;
    const max = k === 0 ? 8 : 12;
    if (n < 1 || n > max) e.push(`workbook: ${a.title} tiene ${n} pasos (de 1 a ${max})`);
  });
  if (!d.slides.some((s) => s.interactive)) e.push('workbook: ningún ejercicio (interactive)');
  return e;
}

// Frames adapter-extended-contracts.ts: 12 essential chapters and up to 7 optional,
// each with 1 to 8 steps (its items).
export function playbookGate(d: DeckV1): string[] {
  const e: string[] = [];
  const essential = d.slides.filter((s) => !s.optional).length;
  const optional = d.slides.length - essential;
  if (essential !== 12) e.push(`playbook: ${essential} capítulos esenciales, deben ser 12`);
  if (optional > 7) e.push(`playbook: ${optional} capítulos opcionales, máximo 7`);
  for (const s of d.slides) {
    const n = s.items?.length ?? 0;
    if (n < 1 || n > 8) e.push(`playbook: ${s.id} tiene ${n} pasos (de 1 a 8)`);
  }
  return e;
}

// Frames adapter-extended-contracts.ts: one prompt per playbook step, four levels each.
export function libraryGate(p: PromptsV1, playbook: DeckV1): string[] {
  const e: string[] = [];
  const steps = playbook.slides.flatMap((s) => (s.items ?? []).map((_, i) => `${s.id}#${i + 1}`));
  if (p.prompts.length > 152) e.push(`biblioteca: ${p.prompts.length} prompts, máximo 152`);
  const got = new Map(p.prompts.map((x) => [x.step, x]));
  const missing = steps.filter((st) => !got.has(st));
  if (missing.length)
    e.push(
      `biblioteca: pasos del playbook sin prompt: ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? '…' : ''}`,
    );
  const stray = p.prompts.filter((x) => !x.step || !steps.includes(x.step)).map((x) => x.id);
  if (stray.length) e.push(`biblioteca: prompts sin paso del playbook: ${stray.join(', ')}`);
  const flat = p.prompts.filter((x) => x.levels?.length !== 4).map((x) => x.id);
  if (flat.length) e.push(`biblioteca: prompts sin sus 4 niveles: ${flat.join(', ')}`);
  return e;
}

export function courseGate(c: CourseV1, requireChosen = false): string[] {
  return requireChosen && !c.design.chosen
    ? ['design.chosen: la persona elige una de las dos direcciones (H01)']
    : [];
}

type Loaded = {
  course: CourseV1;
  landing: DeckV1;
  masterclass: DeckV1;
  workbook: DeckV1;
  playbook: DeckV1;
  prompts: PromptsV1;
};
const FILES = {
  landing: 'landing.yml',
  masterclass: 'masterclass.yml',
  workbook: 'trainer-workbook.yml',
  playbook: 'trainer-playbook.yml',
  prompts: 'trainer-prompts.yml',
} as const;

// Load every source of a course folder and hold each to its profile.
export function loadCourse(dir: string): { loaded?: Loaded; errs: string[] } {
  const errs: string[] = [];
  const read = (f: string) => readFileSync(path.join(dir, f), 'utf8');
  const tryParse = <T>(what: string, fn: () => T): T | undefined => {
    try {
      return fn();
    } catch (e) {
      errs.push(`${what}: ${(e as Error).message.slice(0, 240)}`);
      return undefined;
    }
  };
  const course = tryParse('course.yml', () => CourseV1.parse(YAML.parse(read('course.yml'))));
  const decks = Object.fromEntries(
    (['landing', 'masterclass', 'workbook', 'playbook'] as const).map((k) => [
      k,
      tryParse(FILES[k], () => parseDeck(read(FILES[k]))),
    ]),
  ) as Record<'landing' | 'masterclass' | 'workbook' | 'playbook', DeckV1 | undefined>;
  const prompts = tryParse(FILES.prompts, () => PromptsV1.parse(YAML.parse(read(FILES.prompts))));
  if (!course || !decks.landing || !decks.masterclass || !decks.workbook || !decks.playbook || !prompts)
    return { errs };
  errs.push(
    ...deckSourceGate(decks.landing, { axis: false }).map((x) => `landing: ${x}`),
    ...landingGate(decks.landing),
    ...deckSourceGate(decks.masterclass).map((x) => `masterclass: ${x}`),
    ...masterclassGate(decks.masterclass),
    ...deckSourceGate(decks.workbook, { axis: false }).map((x) => `workbook: ${x}`),
    ...workbookGate(decks.workbook),
    ...deckSourceGate(decks.playbook, { axis: false }).map((x) => `playbook: ${x}`),
    ...playbookGate(decks.playbook),
    ...promptsGate(prompts).map((x) => `biblioteca: ${x}`),
    ...libraryGate(prompts, decks.playbook),
  );
  for (const [k, d] of Object.entries(decks))
    if (d!.meta.lang !== course.meta.locale)
      errs.push(`${k}: idioma ${d!.meta.lang} distinto del curso (${course.meta.locale})`);
  return { loaded: { course, ...(decks as Record<string, DeckV1>), prompts } as Loaded, errs };
}

const byId = (ctx: HandlerCtx, id: string) => ctx.outputs.find((o) => o.id === id);
const art = (ctx: HandlerCtx) => path.join(ctx.runDir, 'artifacts');

// T02: render the five artifacts, check each in a real browser, print the masterclass.
const build: Handler = async (ctx) => {
  const host = missingFrom(ctx).filter(
    (o) => !o.id.endsWith('-html') && o.id !== 'masterclass-pdf' && o.id !== 'build-report',
  );
  if (host.length) return requestFromHost(ctx, host);
  const { loaded, errs } = loadCourse(art(ctx));
  if (loaded) errs.push(...courseGate(loaded.course, true));
  if (errs.length || !loaded) return { status: 'needs_input', note: `gates del curso: ${errs.join('; ')}` };
  const t = loadTokens(typeof ctx.facts.brand_tokens === 'string' ? ctx.facts.brand_tokens : undefined);
  const pages: [string, string, 'deck' | 'playbook' | 'workbook' | 'library', DeckV1 | null][] = [
    ['landing-html', renderPlaybook(loaded.landing, t), 'playbook', loaded.landing],
    ['masterclass-html', renderDeck(loaded.masterclass, t), 'deck', loaded.masterclass],
    ['workbook-html', renderPlaybook(loaded.workbook, t, { workbook: true }), 'workbook', loaded.workbook],
    ['playbook-html', renderPlaybook(loaded.playbook, t), 'playbook', loaded.playbook],
    ['prompts-html', renderLibrary(loaded.prompts, t), 'library', null],
  ];
  const lines = ['# Build del curso', ''];
  let problems = 0;
  for (const [id, html, layout, d] of pages) {
    const out = byId(ctx, id);
    if (!out) continue;
    if (d) {
      const g = deckHtmlGate(html, d, t, () => false, layout === 'library' ? 'deck' : layout);
      if (g.length) return { status: 'needs_input', note: `${id}: ${g.join('; ')}` };
    }
    const file = ctx.write(relTo(ctx, out.file), html);
    const smoke =
      layout === 'deck'
        ? await deckSmoke(file)
        : layout === 'library'
          ? await librarySmoke(file)
          : await scrollSmoke(file, layout === 'workbook');
    if (!smoke) return { status: 'blocked', note: 'gate visual sin navegador' };
    lines.push(
      `## ${id}`,
      ...smoke.checked.map((c) => `- ok: ${c}`),
      ...smoke.problems.map((p) => `- rojo: ${p}`),
      '',
    );
    problems += smoke.problems.length;
  }
  const pdf = byId(ctx, 'masterclass-pdf');
  const mc = byId(ctx, 'masterclass-html');
  if (pdf && mc) await capturePdf({ html: mc.file, out: pdf.file });
  const report = byId(ctx, 'build-report');
  if (report) ctx.write(relTo(ctx, report.file), lines.join('\n') + '\n');
  return problems
    ? { status: 'needs_input', note: `gate visual: ${problems} problema(s), ver build-report` }
    : {
        status: 'done',
        note: 'landing, masterclass (HTML y PDF), workbook, playbook y biblioteca: gates y navegador ok',
      };
};

const sha = (f: string) => createHash('sha256').update(readFileSync(f)).digest('hex');

// T03 (Frames package + verify): every source and output bound by its sha256.
const pack: Handler = async (ctx) => {
  const files = [
    'course.yml',
    ...Object.values(FILES),
    'landing-html.html',
    'masterclass-html.html',
    'masterclass-pdf.pdf',
    'workbook-html.html',
    'playbook-html.html',
    'prompts-html.html',
  ];
  const missing = files.filter((f) => !existsSync(path.join(art(ctx), f)));
  if (missing.length) return { status: 'blocked', note: `faltan: ${missing.join(', ')}` };
  const out = byId(ctx, 'trainer-package');
  if (!out) return { status: 'blocked', note: 'el paso no declara trainer-package' };
  ctx.write(
    relTo(ctx, out.file),
    JSON.stringify(
      {
        schema: 'trainer-package-v1',
        files: Object.fromEntries(files.map((f) => [f, sha(path.join(art(ctx), f))])),
      },
      null,
      2,
    ) + '\n',
  );
  return { status: 'done', note: `${files.length} archivos del curso con su sha256` };
};

// T04: Frames' rubric (structure, pedagogy, brandEditorial, accessibility, privacy),
// four dimensions measured here and pedagogy signed by a reviewer.
const PRIVATE = [/\/Users\/|[A-Z]:\\Users\\/, /[\w.+-]+@[\w-]+\.[\w.]+/, /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/];
const benchmark: Handler = async (ctx) => {
  const host = missingFrom(ctx).filter((o) => o.id !== 'benchmark');
  if (host.length)
    return requestFromHost(ctx, host, [
      '## Pedagogía',
      '- `pedagogy-review` lleva una línea `score: 1..5` y su justificación.',
    ]);
  const score = /score\s*:\s*([1-5])\b/.exec(readFileSync(byId(ctx, 'pedagogy-review')!.file, 'utf8'))?.[1];
  if (!score) return { status: 'needs_input', note: 'pedagogy-review no declara `score: 1..5`' };
  const { loaded, errs } = loadCourse(art(ctx));
  const report = existsSync(path.join(art(ctx), 'build-report.md'))
    ? readFileSync(path.join(art(ctx), 'build-report.md'), 'utf8')
    : '';
  const t = loadTokens(typeof ctx.facts.brand_tokens === 'string' ? ctx.facts.brand_tokens : undefined);
  const allowed = new Set(
    [...Object.values(t.palette), ...t.accents, t.ok, '#000000', '#ffffff'].map((h) => h.toLowerCase()),
  );
  const html = ['landing-html', 'masterclass-html', 'workbook-html', 'playbook-html', 'prompts-html']
    .map((f) => path.join(art(ctx), `${f}.html`))
    .filter(existsSync)
    .map((f) => readFileSync(f, 'utf8'));
  const offBrand = html
    .flatMap((h) =>
      [...h.replace(/data:[^"')]+/g, '').matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0].toLowerCase()),
    )
    .filter((h) => !allowed.has(h));
  const sources = [...Object.values(FILES), 'course.yml']
    .map((f) => readFileSync(path.join(art(ctx), f), 'utf8'))
    .join('\n');
  const leaks = PRIVATE.filter((re) => re.test(sources)).length;
  const dims = {
    structure: {
      pass: !!loaded && !errs.length,
      evidence: errs.length ? errs.slice(0, 3) : ['los cinco perfiles cumplen los límites de Frames'],
    },
    accessibility: {
      pass: !!report && !/- rojo:/.test(report),
      evidence: [report ? 'build-report sin rojos' : 'sin build-report'],
    },
    brandEditorial: {
      pass: !offBrand.length,
      evidence: offBrand.length ? [...new Set(offBrand)].slice(0, 5) : ['solo colores de los tokens'],
    },
    privacy: {
      pass: !leaks,
      evidence: [
        leaks
          ? `${leaks} patrón(es) privado(s) en las fuentes`
          : 'sin rutas, correos ni teléfonos en las fuentes',
      ],
    },
    pedagogy: { pass: +score >= 3, evidence: [`revisión humana: ${score}/5`] },
  };
  const out = byId(ctx, 'benchmark');
  if (out)
    ctx.write(
      relTo(ctx, out.file),
      JSON.stringify({ schema: 'trainer-benchmark-v1', executed: true, dims }, null, 2) + '\n',
    );
  const failed = Object.entries(dims)
    .filter(([, d]) => !d.pass)
    .map(([k]) => k);
  return failed.length
    ? { status: 'needs_input', note: `benchmark: no pasan ${failed.join(', ')}` }
    : { status: 'done', note: 'benchmark ejecutado: las cinco dimensiones pasan' };
};

export const trainer: { handlers: Record<string, Handler>; schemas: Record<string, SchemaCheck> } = {
  handlers: { 'trainer.build': build, 'trainer.package': pack, 'trainer.benchmark': benchmark },
  schemas: {
    'course-v1': (c) => {
      try {
        CourseV1.parse(YAML.parse(c));
        return null;
      } catch (e) {
        return (e as Error).message.slice(0, 300);
      }
    },
    pdf: (c) => (c.startsWith('%PDF') ? null : 'no es un PDF'),
  },
};

export const courseFiles = FILES;
export const hasCourse = (dir: string) => existsSync(path.join(dir, 'course.yml'));
