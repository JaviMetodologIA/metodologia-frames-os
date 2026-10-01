// Reconstructs the two reference decks from their own JSON sources into deck-v1 and
// renders them with their own palettes, to measure what the successor covers. Local
// only: the references carry Amaris and client brands, so everything goes to
// work/external (gitignored) and nothing of theirs enters the repo.
//   A · Puntos Colombia  clase-06/source/clase-06.json
//   B · Agentic SDLC     ai-native-sdlc/class/deck.json
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { workDir } from '../../../engine/paths.ts';
import { parseDeck } from '../../../domains/deck/index.ts';
import { deckHtmlGate, deckSourceGate } from '../../../domains/deck/gates.ts';
import { renderDeck } from '../../../domains/deck/render.ts';
import { TokensV1, type Slide } from '../../../domains/deck/schema.ts';
import { B_SCENES } from './b-scenes.ts';
import { deckSmoke } from '../../visual/deck-smoke.ts';

const HOME = os.homedir();
const A_SRC =
  process.env.REF_A ??
  path.join(
    HOME,
    'Documents/PuntosColombia/puntos-colombia-formacion-01-vibe-coding/clase-06/source/clase-06.json',
  );
const B_SRC = process.env.REF_B ?? path.join(HOME, 'Documents/Amaris/ai-native-sdlc/class/deck.json');
const B_TOKENS = path.join(path.dirname(B_SRC), 'brand/design-tokens.amaris-mantu.json');

type Fidelity = { slide: string; kind: string; scene: 'exact' | 'approx'; lost: string[] };
type Out = { yml: object; tokens: TokensV1; fidelity: Fidelity[] };
type Raw = Record<string, unknown> & { id: string };
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
const arr = (v: unknown) => (Array.isArray(v) ? (v as unknown[]) : undefined);
// The accessible name is visible text: it never carries an ascii slide id.
const label = (s: Raw, kind: string) => str(s.artLabel) ?? `Escena animada de tipo ${kind}`;

// ---- B · Agentic SDLC: scene names map to generic kinds; stage-specific art is approximated.
const B_STAGES = ['Plan', 'Design', 'Build', 'Test', 'Deploy', 'Maintain'];
const B_MAP: Record<string, { kind: Slide['kind']; exact: boolean; chain?: string[] }> = {
  cover: { kind: 'cover', exact: true, chain: B_STAGES },
  agenda: { kind: 'timeline', exact: true },
  question: { kind: 'question', exact: true },
  section: { kind: 'section', exact: true, chain: B_STAGES },
  loop: { kind: 'cycle', exact: true, chain: ['intent.md', 'spec.md', 'plan.md', 'diff + tests', 'PR'] },
  stairs: { kind: 'stairs', exact: true },
  traps: { kind: 'cards', exact: true },
  pipeline: { kind: 'pipeline', exact: true },
  // B's stage scenes, ported as motion-v1 data (b-scenes.ts).
  ...Object.fromEntries(Object.keys(B_SCENES).map((k) => [k, { kind: 'scene' as const, exact: true }])),
};

function fromB(): Out {
  const d = JSON.parse(readFileSync(B_SRC, 'utf8')) as { meta: Raw; slides: Raw[] };
  const acts = [...new Set(d.slides.map((s) => String(s.act)))];
  const fidelity: Fidelity[] = [];
  const slides = d.slides.map((s) => {
    const m = B_MAP[String(s.scene)] ?? { kind: 'statement' as const, exact: false };
    const lost: string[] = [];
    const items = arr(s.items)?.map(String);
    const chain =
      m.kind === 'timeline'
        ? (items ?? B_STAGES).slice(0, 8)
        : m.kind === 'stairs'
          ? arr(s.labels)?.map(String)
          : m.chain;

    const out: Record<string, unknown> = {
      id: s.id,
      act: `act-${acts.indexOf(String(s.act))}`,
      kind: m.kind,
      eyebrow: str(s.eyebrow),
      title: str(s.title),
      sub: str(s.sub),
      items: m.kind === 'timeline' ? undefined : items,
      chain: chain?.map((c) => c.slice(0, 40)),
      cols: arr(s.cols) as Slide['cols'],
      table: s.table as Slide['table'],
      takeaway: str(s.takeaway),
      disclaimer: str(s.disclaimer),
      notes: str(s.notes),
      num: str(s.num),
      layout: m.kind === 'statement' && s.table ? 'full' : m.kind === 'scene' ? str(s.layout) : undefined,
      highlight: arr(s.highlight)?.map(Number),
      badge: str(s.badge),
      scene: m.kind === 'scene' ? B_SCENES[String(s.scene)]!(s) : undefined,
      scene_label: label(s, m.kind),
    };
    if (m.kind === 'terminal' && !items) out.items = ['$ make check'];
    fidelity.push({ slide: s.id, kind: m.kind, scene: m.exact ? 'exact' : 'approx', lost });
    return out;
  });
  // B's deck has no axis slide: the idea lives in its loop slide, which is in the first third.
  const loop = slides.find((s) => s.kind === 'cycle');
  if (loop) loop.kind = 'axis';
  const t = JSON.parse(readFileSync(B_TOKENS, 'utf8')) as {
    palette: Record<string, string>;
    practiceAccents: string[];
    brand: string;
  };
  const tokens = TokensV1.parse({
    name: t.brand,
    source: 'externo: ai-native-sdlc/class/brand (no versionado)',
    palette: {
      brand: t.palette.brand,
      accent: t.palette.accent,
      ink: t.palette.ink,
      surface: t.palette.surface,
    },
    accents: t.practiceAccents,
    ok: '#19C29B',
    fonts: {
      heading: '"Franklin Gothic Medium", Arial, sans-serif',
      body: '"Franklin Gothic Book", Arial, sans-serif',
    },
    wordmark: 'Amaris Consulting · Part of Mantu',
  });
  return {
    yml: {
      schema: 'deck-v1',
      meta: {
        title: str(d.meta.title),
        subtitle: str(d.meta.subtitle),
        lang: 'es',
        hold: d.meta.hold ?? 14,
        axis: 'Cada etapa termina en un archivo que la siguiente lee.',
        forbidden_terms: ['Claude', 'Vercel', 'vercel', 'VERCEL'],
      },
      acts: acts.map((a, i) => ({ id: `act-${i}`, title: a })),
      slides,
    },
    tokens,
    fidelity,
  };
}

// ---- A · Puntos Colombia: its kinds now exist as deck-v1 kinds, and its six bespoke
// drawings are ported to motion-v1 data in domains/motion/art.ts.
const A_ART: Record<string, { art: NonNullable<Slide['art']>; chain?: string[] }> = {
  'geo-precision': { art: 'precision' },
  'iso-proceso': { art: 'layers', chain: ['OBSERVAR', 'DECIDIR', 'CONSTRUIR'] },
  'geo-lupa': { art: 'magnifier' },
  'geo-presupuesto': { art: 'budget' },
  'iso-migracion': { art: 'migration' },
  'geo-puerta': { art: 'gateway' },
};

function fromA(): Out {
  const d = JSON.parse(readFileSync(A_SRC, 'utf8')) as {
    title: string;
    axis: string;
    acts: { n: string; nombre: string; slides: string[] }[];
    slides: Raw[];
  };
  const actOf = (id: string) => d.acts.find((a) => a.slides.includes(id))?.n ?? d.acts[0]!.n;
  const fidelity: Fidelity[] = [];
  const slides = d.slides.map((s) => {
    const kind = String(s.kind) as Slide['kind'];
    const lost: string[] = [];
    const out: Record<string, unknown> = {
      id: s.id,
      act: actOf(s.id),
      kind,
      eyebrow: str(s.eyebrow),
      title: str(s.title),
      sub: str(s.subtitle),
      scene_label: label(s, kind),
      lesson: str(s.lesson),
    };
    let exact = true;
    if (kind === 'zig') {
      out.side = s.side;
      const a = A_ART[String(s.art)];
      out.art = a?.art ?? 'grid';
      if (a?.chain) out.chain = a.chain;
      if (!a) {
        exact = false;
        lost.push(`ilustración ${String(s.art)} sin port → grid genérica`);
      }
    }
    if (kind === 'axis') out.chain = arr(s.chain)?.map(String);
    if (kind === 'cycle') out.chain = arr(s.steps)?.map((x) => String(x).slice(0, 40));
    if (kind === 'boxes')
      out.boxes = (arr(s.boxes) as string[][]).map(([l = '', a = '', b = '']) => ({
        label: l.slice(0, 24),
        detail: a.slice(0, 60),
        note: b.slice(0, 60),
      }));
    if (kind === 'matrix') out.axes = arr(s.axes)?.map((x) => String(x).slice(0, 60));
    if (kind === 'metrics') {
      out.metrics = (arr(s.metrics) as string[][])
        .slice(0, 4)
        .map(([v = '', l = '']) => ({ value: v, label: l, source: 'registro de fuentes de la clase' }));
      lost.push('metrics: la fuente por cifra no existe en el origen; queda la del taller');
    }
    if (kind === 'timeline')
      out.chain = (arr(s.items) as string[][]).map((i) => String(i[1] ?? '')).slice(0, 8);
    if (kind === 'challenge') out.items = arr(s.rules)?.map(String).slice(0, 8);
    fidelity.push({ slide: s.id, kind, scene: exact ? 'exact' : 'approx', lost });
    return out;
  });
  const tokens = TokensV1.parse({
    name: 'Puntos Colombia × Amaris',
    source: 'externo: variables CSS de build_class6.py (no versionado)',
    palette: { brand: '#272674', accent: '#ffd166', ink: '#141338', surface: '#f3f1ff' },
    accents: ['#4182ff', '#b5b1dd', '#eac3b3', '#ffd166', '#4fd1ad'],
    ok: '#4fd1ad',
    fonts: {
      heading: '"Futura PT", Futura, "Avenir Next", system-ui, sans-serif',
      body: '"Futura PT", Futura, "Avenir Next", system-ui, sans-serif',
    },
    wordmark: 'Puntos Colombia × Amaris',
  });
  return {
    yml: {
      schema: 'deck-v1',
      meta: { title: d.title, lang: 'es', axis: d.axis, hold: 14 },
      acts: d.acts.map((a) => ({ id: a.n, title: a.nombre })),
      slides,
    },
    tokens,
    fidelity,
  };
}

const drop = (o: unknown): unknown =>
  Array.isArray(o)
    ? o.map(drop)
    : o && typeof o === 'object'
      ? Object.fromEntries(
          Object.entries(o)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => [k, drop(v)]),
        )
      : o;

const report: Record<string, unknown> = {};
for (const [name, src, build] of [
  ['a-puntos', A_SRC, fromA],
  ['b-agentic-sdlc', B_SRC, fromB],
] as const) {
  if (!existsSync(src)) {
    report[name] = { status: 'gap', detail: `no está ${src}` };
    continue;
  }
  const out = build();
  const dir = path.join(workDir(), 'external', name);
  mkdirSync(dir, { recursive: true });
  const yml = YAML.stringify(drop(out.yml), { lineWidth: 0 });
  writeFileSync(path.join(dir, 'deck.yml'), yml);
  writeFileSync(path.join(dir, 'tokens.json'), JSON.stringify(out.tokens, null, 2));
  let errs: string[];
  let slides = 0;
  try {
    const deck = parseDeck(yml);
    slides = deck.slides.length;
    const html = renderDeck(deck, out.tokens);
    writeFileSync(path.join(dir, 'deck.html'), html);
    errs = [...deckSourceGate(deck), ...deckHtmlGate(html, deck, out.tokens)];
  } catch (e) {
    errs = [(e as Error).message.slice(0, 600)];
  }
  const smoke = errs.length ? null : await deckSmoke(path.join(dir, 'deck.html'));
  const exact = out.fidelity.filter((f) => f.scene === 'exact').length;
  report[name] = {
    slides,
    gates: errs,
    visual: smoke ? { problems: smoke.problems, checked: smoke.checked } : 'no corrió',
    scene_exact: `${exact}/${out.fidelity.length}`,
    lost: out.fidelity.flatMap((f) => f.lost.map((l) => `${f.slide}: ${l}`)),
  };
}
writeFileSync(path.join(workDir(), 'external', 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
