// deck-v1: the typed source of an immersive HTML deck, and the brand tokens it
// renders with. One source yields the deck and the scroll playbook.
import { z } from 'zod';

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const TokensV1 = z
  .object({
    name: z.string().min(1),
    source: z.string().min(1),
    palette: z.object({ brand: Hex, accent: Hex, ink: Hex, surface: Hex }).strict(),
    accents: z.array(Hex).length(5),
    ok: Hex,
    fonts: z.object({ heading: z.string(), body: z.string() }).strict(),
    wordmark: z.string().min(1),
    // Optional logo, already a data: URI (an external brand supplies it; never versioned here).
    logo: z.string().startsWith('data:image/').optional(),
    // Small mark for the persistent bar; authorized local identity only.
    mark: z.string().startsWith('data:image/').optional(),
  })
  .strict();
export type TokensV1 = z.infer<typeof TokensV1>;

export const KINDS = [
  'cover',
  'question',
  'axis',
  'section',
  'statement',
  'list',
  'flow',
  'cycle',
  'stairs',
  'cards',
  'pipeline',
  'terminal',
  'metrics',
  'timeline',
  'close',
  // from the Puntos Colombia reference
  'quote',
  'matrix',
  'case',
  'boxes',
  'reveal',
  'challenge',
  'zig',
  // a scene written as motion-v1 data
  'scene',
] as const;

// How a slide enters (View Transitions API; instant without it or with reduced motion).
export const TRANSITIONS = ['fade', 'push', 'zoom', 'morph', 'none'] as const;

import { ARTS } from '../motion/art.ts';
import { MotionV1 } from '../motion/custom.ts';
import { LANGS } from '../motion/i18n.ts';
export { ARTS };

// A workbook exercise attached to a slide. The deck and the playbook leave it out; the
// workbook renders it as a widget whose state lives in the reader's browser.
const Str = (max: number) => z.string().min(1).max(max);
export const Interactive = z.discriminatedUnion('kind', [
  z
    .object({ kind: z.literal('checklist'), title: Str(80), items: z.array(Str(160)).min(1).max(10) })
    .strict(),
  z
    .object({
      kind: z.literal('rubric'),
      title: Str(80),
      rows: z.array(Str(140)).min(1).max(8),
      scale: z.array(Str(24)).min(2).max(5),
    })
    .strict(),
  z
    .object({
      kind: z.literal('quiz'),
      question: Str(200),
      options: z.array(Str(120)).min(2).max(5),
      answer: z.number().int().min(0),
      explain: Str(260),
    })
    .strict(),
  z.object({ kind: z.literal('notes'), prompt: Str(200) }).strict(),
]);
export type Interactive = z.infer<typeof Interactive>;

const Slide = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    act: z.string().min(1),
    kind: z.enum(KINDS),
    eyebrow: z.string().optional(),
    title: z.string().min(1).max(140),
    sub: z.string().max(260).optional(),
    items: z.array(z.string().min(1)).max(8).optional(),
    // Nodes a scene draws: the chain of the axis, the stages of a flow or cycle...
    chain: z.array(z.string().min(1).max(40)).max(8).optional(),
    // A pipeline node that is a human gate (drawn with a lock).
    gate: z.number().int().min(0).optional(),
    cards: z
      .array(z.object({ title: z.string(), fix: z.string() }).strict())
      .max(4)
      .optional(),
    // Numbers are shown, never animated (they carry their source).
    metrics: z
      .array(z.object({ value: z.string(), label: z.string(), source: z.string().min(1) }).strict())
      .max(4)
      .optional(),
    num: z.string().max(3).optional(),
    // Ring nodes that stay lit on a section or cover slide (0-based); the rest dim.
    highlight: z.array(z.number().int().min(0)).max(8).optional(),
    // A short tag under the first steps of a stairs scene.
    badge: z.string().max(40).optional(),
    // Columns and a table in the copy (from the Agentic SDLC reference).
    cols: z
      .array(z.object({ label: z.string(), items: z.array(z.string()).min(1).max(5) }).strict())
      .max(3)
      .optional(),
    table: z
      .object({
        head: z.array(z.string()).min(2).max(4),
        rows: z.array(z.array(z.string()).min(2).max(4)).min(1).max(6),
      })
      .strict()
      .optional(),
    disclaimer: z.string().max(260).optional(),
    // A case's lesson, called out under the story (from the Puntos Colombia reference).
    lesson: z.string().max(200).optional(),
    boxes: z
      .array(
        z
          .object({ label: z.string().max(24), detail: z.string().max(60), note: z.string().max(60) })
          .strict(),
      )
      .max(4)
      .optional(),
    axes: z.array(z.string().max(60)).min(2).max(3).optional(),
    // zig: which side the text sits on; the illustration takes the other one.
    side: z.enum(['left', 'right']).optional(),
    art: z.enum(ARTS).optional(),
    // Or an external illustration as SVG markup, held to the sanitizer's allowlist.
    art_svg: z.string().max(60000).optional(),
    scene: MotionV1.optional(),
    transition: z.enum(TRANSITIONS).optional(),
    interactive: Interactive.optional(),
    // video.method: the narration of this beat (its captions are this text, cue by cue).
    voiceover: z.string().min(1).max(1000).optional(),
    // trainer: a masterclass moment's minutes (extended ones add to the base time), and
    // an optional playbook chapter.
    minutes: z.number().int().min(1).max(60).optional(),
    extended: z.boolean().optional(),
    optional: z.boolean().optional(),
    // Social frames (content.carousel): the card's role, its alt text, its pillar and
    // the sources an evidence card cites. Limits follow Frames' carousel schema.
    role: z.enum(['conclusion', 'tension', 'support', 'evidence', 'action', 'cta']).optional(),
    alt: z.string().min(20).max(700).optional(),
    pillar: z.enum(['P1', 'P2', 'P3']).optional(),
    sources: z.array(z.string().min(1)).min(1).max(8).optional(),
    takeaway: z.string().max(200).optional(),
    notes: z.string().optional(),
    hold: z.number().int().min(3).max(120).optional(),
    layout: z.enum(['left', 'right', 'top', 'full']).optional(),
    scene_label: z.string().min(3),
    // Links inside the deck must resolve (#slide-id or a sibling file declared in meta.files).
    links: z
      .array(z.object({ label: z.string(), href: z.string() }).strict())
      .max(4)
      .optional(),
  })
  .strict();
export type Slide = z.infer<typeof Slide>;

export const DeckV1 = z
  .object({
    schema: z.literal('deck-v1'),
    meta: z
      .object({
        title: z.string().min(1),
        subtitle: z.string().default(''),
        lang: z.enum(LANGS).default('es'),
        // Languages of the toggle, source first; each other one needs a complete catalog.
        langs: z.array(z.enum(LANGS)).default([]),
        hold: z.number().int().min(3).max(120).default(14),
        transition: z.enum(TRANSITIONS).default('fade'),
        // The idea the deck stands on; its slide must land in the first third.
        axis: z.string().min(10),
        forbidden_terms: z.array(z.string()).default([]),
        budget_kb: z.number().int().max(400).default(400),
        files: z.array(z.string()).default([]),
        // Social copy that travels with the frames (caption, whole-set alt text, call to action).
        caption: z.string().min(40).max(2200).optional(),
        alt: z.string().min(40).max(2200).optional(),
        cta: z.string().min(8).max(180).optional(),
      })
      .strict(),
    acts: z.array(z.object({ id: z.string(), title: z.string() }).strict()).min(2),
    slides: z.array(Slide).min(3),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.meta.langs.length && d.meta.langs[0] !== d.meta.lang)
      ctx.addIssue({ code: 'custom', message: `meta.langs must start with meta.lang (${d.meta.lang})` });
    const acts = new Set(d.acts.map((a) => a.id));
    const ids = d.slides.map((s) => s.id);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: 'custom', message: 'slide ids must be unique' });
    for (const s of d.slides) {
      if (!acts.has(s.act)) ctx.addIssue({ code: 'custom', message: `${s.id}: act ${s.act} not declared` });
      if (
        ['axis', 'flow', 'cycle', 'stairs', 'pipeline', 'timeline'].includes(s.kind) &&
        !(s.chain?.length ?? 0)
      )
        ctx.addIssue({ code: 'custom', message: `${s.id}: kind ${s.kind} needs chain` });
      if (s.kind === 'metrics' && !(s.metrics?.length ?? 0))
        ctx.addIssue({ code: 'custom', message: `${s.id}: metrics needs metrics` });
      if (s.kind === 'boxes' && !(s.boxes?.length ?? 0))
        ctx.addIssue({ code: 'custom', message: `${s.id}: boxes needs boxes` });
      if (s.kind === 'matrix' && !(s.axes?.length ?? 0))
        ctx.addIssue({ code: 'custom', message: `${s.id}: matrix needs axes` });
      if (s.interactive?.kind === 'quiz' && s.interactive.answer >= s.interactive.options.length)
        ctx.addIssue({ code: 'custom', message: `${s.id}: quiz answer out of range` });
      if (s.kind === 'scene' && !s.scene)
        ctx.addIssue({ code: 'custom', message: `${s.id}: scene needs scene` });
      if (s.kind === 'zig' && !s.art && !s.art_svg)
        ctx.addIssue({ code: 'custom', message: `${s.id}: zig needs art or art_svg` });
      if (s.kind === 'cards' && !(s.cards?.length ?? 0))
        ctx.addIssue({ code: 'custom', message: `${s.id}: cards needs cards` });
    }
    for (const a of d.acts)
      if (!d.slides.some((s) => s.act === a.id))
        ctx.addIssue({ code: 'custom', message: `act ${a.id} has no slides` });
  });
export type DeckV1 = z.infer<typeof DeckV1>;
