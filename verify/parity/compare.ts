// Case comparators per family: the successor's output vs Frames' golden projection.
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { repoPath } from '../../engine/paths.ts';
import { createFramesBriefMarkdown, type FramesBriefDraftV1 } from '../../domains/content/brief/model.ts';
import { renderFramesBriefHtml } from '../../domains/content/brief/renderer.ts';
import type { FramesBriefV1 } from '../../domains/content/brief/schema.ts';
import { loadTokens, parseDeck } from '../../domains/deck/index.ts';
import { deckHtmlGate, deckSourceGate } from '../../domains/deck/gates.ts';
import { renderDeck } from '../../domains/deck/render.ts';
import { FORMATS, carouselGate } from '../../domains/deck/frames.ts';
import { VIDEO, videoGate } from '../../domains/deck/video.ts';
import { renderPlaybook } from '../../domains/deck/playbook.ts';
import { deliverableCheck } from '../../domains/content/index.ts';
import { PromptsV1, promptsGate } from '../../domains/content/prompts.ts';
import { buildNotebookPlan } from '../../domains/nlm/frames/runtime/index.ts';
import { loadRegistry } from '../../engine/registry.ts';
import { loadCourse } from '../../domains/trainer/index.ts';
import { assertCareerEvidence } from '../../domains/career/frames/_runner/evidence-gate.ts';
import {
  calculateCareerDocumentHash,
  parseCareerLetter,
} from '../../domains/career/frames/_runner/document-model.ts';
import { CAREER_SCORE_WEIGHTS, scoreCareerOpportunity } from '../../domains/career/frames/_runner/scoring.ts';
import { auditStatic } from '../visual/audit.ts';
import { skills } from '../../domains/skills/index.ts';
import {
  badRef,
  blockingQuestions,
  checkDiff,
  maintain,
  MAX_CHURN,
  MAX_FILES,
} from '../../domains/maintain/index.ts';
import {
  decideSmallestComponentV1,
  evaluateSkillRunV1,
} from '../../domains/skills/frames/skill-systems/governance.ts';
import YAML from 'yaml';
import { z } from 'zod';
import { aulaBuild } from '../../engine/aula/bridge.ts';
import { AulaKind, Edition, digest, loadAulaCatalog, type AulaCatalog } from '../../engine/aula/catalog.ts';

export type CaseResult = { verdict: 'equal' | 'superset' | 'red'; detail: string };

const COMPARATORS: Record<string, (caseDir: string, goldenDir: string) => CaseResult> = {
  // The brief is ported as-is, so the projection compared is the bytes themselves.
  'content.piece': (caseDir, goldenDir) => {
    const input = JSON.parse(readFileSync(path.join(caseDir, 'input.json'), 'utf8')) as {
      draft: FramesBriefDraftV1;
      sections: FramesBriefV1['sections'];
    };
    const md = createFramesBriefMarkdown(input.draft, input.sections);
    const html = renderFramesBriefHtml(md);
    if (md !== readFileSync(path.join(goldenDir, 'brief.md'), 'utf8'))
      return { verdict: 'red', detail: 'brief.md difiere de Frames' };
    if (html !== readFileSync(path.join(goldenDir, 'brief.html'), 'utf8'))
      return { verdict: 'red', detail: 'brief.html difiere de Frames' };
    return { verdict: 'equal', detail: 'brief.md y brief.html identicos a Frames' };
  },
};

// Frames never materialized a deck: the successor must render one that passes both
// reference gate sets. Its visual gate runs in verify:decks (it needs a browser).
COMPARATORS['deck.immersive'] = (caseDir, goldenDir) => {
  const frames = JSON.parse(readFileSync(path.join(goldenDir, 'frames-projection.json'), 'utf8')) as {
    deck_materialized: boolean;
  };
  const deck = parseDeck(readFileSync(path.join(caseDir, 'deck.yml'), 'utf8'));
  const tokens = loadTokens();
  const errs = [...deckSourceGate(deck), ...deckHtmlGate(renderDeck(deck, tokens), deck, tokens)];
  if (errs.length) return { verdict: 'red', detail: errs.join('; ') };
  return frames.deck_materialized
    ? { verdict: 'equal', detail: 'Frames también materializaba decks' }
    : {
        verdict: 'superset',
        detail: `Frames no materializaba decks; aquí ${deck.slides.length} láminas pasan ambos gates`,
      };
};

// Frames' carousel rules, probed: the case passes, and a variant that breaks each rule
// Frames enforced is rejected here too (by the schema or by carouselGate). Frames'
// renderer defects (count hard-coded, safe zone unread) make the verdict a superset.
COMPARATORS['content.carousel'] = (caseDir, goldenDir) => {
  type P = {
    cards: [number, number];
    title_max: number;
    bullets: [number, number];
    alt: [number, number];
    caption: [number, number];
    cta: [number, number];
    cta_min_position: number;
    count_hard_coded: boolean;
    safe_zone_read: boolean;
  };
  const g = JSON.parse(readFileSync(path.join(goldenDir, 'frames-projection.json'), 'utf8')) as P;
  const src = readFileSync(path.join(caseDir, 'deck.yml'), 'utf8');
  const errsOf = (mut: (d: Record<string, any>) => void) => {
    const raw = YAML.parse(src) as Record<string, any>;
    mut(raw);
    try {
      const d = parseDeck(YAML.stringify(raw));
      return carouselGate(d);
    } catch (e) {
      return [(e as Error).message];
    }
  };
  const base = errsOf(() => {});
  if (base.length) return { verdict: 'red', detail: `el caso no pasa: ${base.join('; ')}` };
  const probes: [string, (d: Record<string, any>) => void][] = [
    [
      `más de ${g.cards[1]} tarjetas`,
      (d) => {
        while (d.slides.length <= g.cards[1])
          d.slides.splice(1, 0, { ...d.slides[1], id: `x${d.slides.length}` });
      },
    ],
    [
      `menos de ${g.cards[0]} tarjetas`,
      (d) => {
        d.slides = [d.slides[0], d.slides.at(-1)];
      },
    ],
    [
      `título de ${g.title_max + 1}`,
      (d) => {
        d.slides[1].title = 'a'.repeat(g.title_max + 1);
      },
    ],
    [
      `${g.bullets[0] + 1} viñetas`,
      (d) => {
        d.slides[1].items = Array(g.bullets[0] + 1).fill('viñeta');
      },
    ],
    [
      `viñeta de ${g.bullets[1] + 1}`,
      (d) => {
        d.slides[1].items = ['v'.repeat(g.bullets[1] + 1)];
      },
    ],
    [
      'sin conclusión al abrir',
      (d) => {
        d.slides[0].role = 'tension';
      },
    ],
    [
      'sin cta al cerrar',
      (d) => {
        d.slides.at(-1).role = 'action';
      },
    ],
    [
      `cta antes de ${g.cta_min_position}`,
      (d) => {
        d.slides = [d.slides[0], d.slides.at(-1), d.slides[1]];
        d.slides[2].role = 'cta';
      },
    ],
    [
      'support sin pillar',
      (d) => {
        delete d.slides.find((c: any) => c.role === 'support').pillar;
      },
    ],
    [
      'tarjeta sin fuentes',
      (d) => {
        delete d.slides[1].sources;
      },
    ],
    [
      `alt de ${g.alt[0] - 1}`,
      (d) => {
        d.slides[1].alt = 'a'.repeat(g.alt[0] - 1);
      },
    ],
    [
      `caption de ${g.caption[0] - 1}`,
      (d) => {
        d.meta.caption = 'a'.repeat(g.caption[0] - 1);
      },
    ],
    [
      `cta de ${g.cta[0] - 1}`,
      (d) => {
        d.meta.cta = 'a'.repeat(g.cta[0] - 1);
      },
    ],
  ];
  const missed = probes.filter(([, mut]) => !errsOf(mut).length).map(([what]) => what);
  if (missed.length) return { verdict: 'red', detail: `reglas de Frames sin cumplir: ${missed.join(', ')}` };
  const fixed = [
    g.count_hard_coded && 'numeración por el total real',
    !g.safe_zone_read && 'margen de seguridad medido',
  ].filter(Boolean);
  return fixed.length
    ? {
        verdict: 'superset',
        detail: `${probes.length} reglas de Frames cumplidas; corrige: ${fixed.join(', ')}`,
      }
    : { verdict: 'equal', detail: `${probes.length} reglas de Frames cumplidas` };
};

// Frames declared these deliverables' fields and no code filled them. The successor
// ports the templates with the same fields and rejects them unfilled.
type FieldsGolden = { producing_code: boolean; fields: Record<string, string[] | null> };
function templatesMatch(g: FieldsGolden): string[] {
  const errs: string[] = [];
  for (const [id, want] of Object.entries(g.fields)) {
    const tpl = repoPath('domains/content/templates', `${id}.template.md`);
    if (!existsSync(tpl)) {
      errs.push(`${id}: plantilla sin portar`);
      continue;
    }
    const body = readFileSync(tpl, 'utf8');
    const got = [...body.matchAll(/field_id: ([\w-]+)/g)].map((m) => m[1]);
    if (JSON.stringify(got) !== JSON.stringify(want))
      errs.push(`${id}: campos ${got.join(',')} ≠ Frames ${want?.join(',')}`);
    if (!deliverableCheck(body)) errs.push(`${id}: la plantilla sin llenar pasa el gate`);
  }
  return errs;
}

// universal-prompts-v1's fields, each carried by a prompts-v1 key.
const PROMPT_FIELDS: Record<string, string> = {
  'piece-family': 'family',
  objective: 'objective',
  'input-refs': 'inputs',
  prompt: 'prompt',
  'negative-constraints': 'negative',
  parameters: 'params',
  'expected-output': 'expected',
  acceptance: 'acceptance',
};

COMPARATORS['content.prompts'] = (caseDir, goldenDir) => {
  const g = JSON.parse(readFileSync(path.join(goldenDir, 'frames-projection.json'), 'utf8')) as FieldsGolden;
  const errs = templatesMatch(g);
  const unmapped = (g.fields['universal-prompts-v1'] ?? []).filter((f) => !PROMPT_FIELDS[f]);
  if (unmapped.length) errs.push(`campos de Frames sin clave en prompts-v1: ${unmapped.join(', ')}`);
  try {
    const pack = PromptsV1.parse(YAML.parse(readFileSync(path.join(caseDir, 'prompts.yml'), 'utf8')));
    errs.push(...promptsGate(pack));
  } catch (e) {
    errs.push((e as Error).message.slice(0, 200));
  }
  if (errs.length) return { verdict: 'red', detail: errs.join('; ') };
  return g.producing_code
    ? { verdict: 'equal', detail: 'Frames también producía prompts' }
    : {
        verdict: 'superset',
        detail: 'Frames no producía prompts; aquí la biblioteca se genera y se verifica',
      };
};

COMPARATORS['content.campaign'] = (caseDir, goldenDir) => {
  const g = JSON.parse(readFileSync(path.join(goldenDir, 'frames-projection.json'), 'utf8')) as FieldsGolden;
  const errs = templatesMatch(g);
  let slides = 0;
  try {
    const deck = parseDeck(readFileSync(path.join(caseDir, 'landing.yml'), 'utf8'));
    const tokens = loadTokens();
    const pb = renderPlaybook(deck, tokens);
    errs.push(...deckSourceGate(deck), ...deckHtmlGate(pb, deck, tokens, () => false, 'playbook'));
    slides = deck.slides.length;
  } catch (e) {
    errs.push(`landing.yml inválido: ${(e as Error).message.slice(0, 200)}`);
  }
  if (errs.length) return { verdict: 'red', detail: errs.join('; ') };
  return {
    verdict: 'superset',
    detail: `${Object.keys(g.fields).length} entregables con los campos de Frames, rechazados sin llenar; landing de ${slides} secciones`,
  };
};

// Frames' method-explainer contract, probed like the carousel's: the storyboard
// passes, a variant breaking each limit is rejected, and the size and fps match.
COMPARATORS['video.method'] = (caseDir, goldenDir) => {
  type G = {
    size: number[];
    fps: number;
    seconds: number[];
    beats_max: number;
    voiceover_max: number;
    words_per_second_max: number;
    screen_items_max: number;
    screen_text_max: number;
    renders: boolean;
  };
  const g = JSON.parse(readFileSync(path.join(goldenDir, 'frames-projection.json'), 'utf8')) as G;
  const src = readFileSync(path.join(caseDir, 'storyboard.yml'), 'utf8');
  const errsOf = (mut: (d: Record<string, any>) => void) => {
    const raw = YAML.parse(src) as Record<string, any>;
    mut(raw);
    try {
      const d = parseDeck(YAML.stringify(raw));
      return [...deckSourceGate(d, { axis: false }), ...videoGate(d)];
    } catch (e) {
      return [(e as Error).message];
    }
  };
  const base = errsOf(() => {});
  if (base.length) return { verdict: 'red', detail: `el storyboard no pasa: ${base.join('; ')}` };
  const mismatch = [
    FORMATS.story.w !== g.size[0] || FORMATS.story.h !== g.size[1] ? 'tamaño 9:16' : '',
    VIDEO.fps !== g.fps ? 'fps' : '',
  ].filter(Boolean);
  const probes: [string, (d: Record<string, any>) => void][] = [
    [
      `más de ${g.beats_max} beats`,
      (d) => {
        while (d.slides.length <= g.beats_max)
          d.slides.push({ ...d.slides[0], id: `b${d.slides.length}`, hold: 3 });
      },
    ],
    [
      `menos de ${g.seconds[0]} s`,
      (d) => {
        d.slides.forEach((x: any) => (x.hold = 3));
        d.slides = d.slides.slice(0, 3);
      },
    ],
    [
      `más de ${g.seconds[1]} s`,
      (d) => {
        d.slides.forEach((x: any) => (x.hold = 40));
      },
    ],
    [
      `voz de ${g.voiceover_max + 1}`,
      (d) => {
        d.slides[0].voiceover = 'a'.repeat(g.voiceover_max + 1);
      },
    ],
    [
      `más de ${g.words_per_second_max} palabras por segundo`,
      (d) => {
        d.slides[0].voiceover = Array(40).fill('palabra').join(' ');
      },
    ],
    [
      `${g.screen_items_max + 1} elementos en pantalla`,
      (d) => {
        d.slides[0].items = Array(g.screen_items_max + 1).fill('uno');
      },
    ],
    [
      `texto en pantalla de ${g.screen_text_max + 1}`,
      (d) => {
        d.slides[0].sub = 'a'.repeat(g.screen_text_max + 1);
      },
    ],
    [
      'beat sin voz',
      (d) => {
        delete d.slides[1].voiceover;
      },
    ],
  ];
  const missed = probes.filter(([, mut]) => !errsOf(mut).length).map(([what]) => what);
  if (missed.length || mismatch.length)
    return {
      verdict: 'red',
      detail: `contrato de Frames sin cumplir: ${[...missed, ...mismatch].join(', ')}`,
    };
  return g.renders
    ? { verdict: 'equal', detail: `${probes.length} límites cumplidos` }
    : {
        verdict: 'superset',
        detail: `${probes.length} límites de Frames cumplidos; Frames no renderizaba, aquí sale el MP4 con subtítulos`,
      };
};

// Every command Frames declares as an external mutation must land on a successor step
// with effect: external behind a human gate; the plan draft must build with Frames' code.
// Frames' sync (N05) runs inside the successor's N04 window (import and sync sources).
const NLM_STEP: Record<string, string> = { create: 'N04', sync: 'N04', studio: 'N07', share: 'N09' };
COMPARATORS['nlm'] = (caseDir, goldenDir) => {
  const g = JSON.parse(readFileSync(path.join(goldenDir, 'frames-projection.json'), 'utf8')) as {
    external: Record<string, { stage: string; gate: string }>;
    calls_notebooklm: boolean;
  };
  const fam = loadRegistry().families.find((f) => f.id === 'nlm')!;
  const errs: string[] = [];
  for (const cmd of Object.keys(g.external)) {
    const at = fam.steps.findIndex((s) => s.id === NLM_STEP[cmd]);
    const step = fam.steps[at];
    if (!step) errs.push(`${cmd}: sin paso en el sucesor`);
    else if (step.effect !== 'external') errs.push(`${cmd}: ${step.id} no es un efecto externo`);
    else if (fam.steps[at - 1]?.gate !== 'external-effect')
      errs.push(`${cmd}: ${step.id} sin gate external-effect justo antes`);
  }
  try {
    buildNotebookPlan(JSON.parse(readFileSync(path.join(caseDir, 'notebook-plan-draft.json'), 'utf8')));
  } catch (e) {
    errs.push(`plan: ${(e as Error).message.slice(0, 200)}`);
  }
  if (errs.length) return { verdict: 'red', detail: errs.join('; ') };
  return g.calls_notebooklm
    ? { verdict: 'equal', detail: 'Frames también llamaba a NotebookLM' }
    : {
        verdict: 'superset',
        detail: `${Object.keys(g.external).length} efectos externos de Frames detrás de su gate; Frames no los ejecutaba desde código`,
      };
};

// Frames' Trainer OS limits, probed on the sample course: it passes as written, and a
// copy that breaks each limit is rejected by loadCourse.
COMPARATORS['trainer'] = (caseDir, goldenDir) => {
  type G = {
    landing_sections: number;
    cta_words: number;
    preparation: [number, number];
    routes: number;
    route_steps_max: number;
    essential_chapters: number;
    optional_chapters_max: number;
    chapter_steps: [number, number];
    prompt_levels: number;
    masterclass_moments: number;
    masterclass_minutes: [number, number];
    benchmark_executed: boolean;
  };
  const g = JSON.parse(readFileSync(path.join(goldenDir, 'frames-projection.json'), 'utf8')) as G;
  const base = loadCourse(caseDir);
  if (base.errs.length)
    return { verdict: 'red', detail: `el curso no pasa: ${base.errs.slice(0, 4).join('; ')}` };
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'frames-trainer-probe-'));
  const probe = (file: string, mut: (d: Record<string, any>) => void) => {
    cpSync(caseDir, tmp, { recursive: true });
    const raw = YAML.parse(readFileSync(path.join(tmp, file), 'utf8')) as Record<string, any>;
    mut(raw);
    writeFileSync(path.join(tmp, file), YAML.stringify(raw));
    return loadCourse(tmp).errs.length > 0;
  };
  const dup = (d: Record<string, any>) => d.slides.push({ ...d.slides[1], id: `extra-${d.slides.length}` });
  const probes: [string, string, (d: Record<string, any>) => void][] = [
    [`landing ≠ ${g.landing_sections} secciones`, 'landing.yml', dup],
    [`CTA de ${g.cta_words + 1} palabras`, 'landing.yml', (d) => (d.meta.cta = 'una dos tres cuatro')],
    [`masterclass ≠ ${g.masterclass_moments} momentos`, 'masterclass.yml', (d) => d.slides.splice(-1, 1)],
    [
      `masterclass ≠ ${g.masterclass_minutes[0]} min base`,
      'masterclass.yml',
      (d) => (d.slides.find((x: any) => !x.extended).minutes += 1),
    ],
    [
      `masterclass ≠ ${g.masterclass_minutes[1]} min extendidos`,
      'masterclass.yml',
      (d) => d.slides.forEach((x: any) => delete x.extended),
    ],
    [
      `workbook ≠ ${g.routes} rutas`,
      'trainer-workbook.yml',
      (d) => {
        const last = d.acts.pop();
        d.slides = d.slides.filter((x: any) => x.act !== last.id);
      },
    ],
    [
      `preparación de ${g.preparation[1] + 1}`,
      'trainer-workbook.yml',
      (d) => {
        const prep = d.acts[0].id;
        const s0 = d.slides.find((x: any) => x.act === prep);
        for (let i = 0; i < g.preparation[1] + 1; i++)
          d.slides.push({ ...s0, id: `prep-extra-${i}`, interactive: undefined });
      },
    ],
    [
      `playbook ≠ ${g.essential_chapters} capítulos`,
      'trainer-playbook.yml',
      (d) =>
        d.slides.splice(
          d.slides.findIndex((x: any) => !x.optional),
          1,
        ),
    ],
    [
      `capítulo con ${g.chapter_steps[1] + 1} pasos`,
      'trainer-playbook.yml',
      (d) => (d.slides[0].items = Array(g.chapter_steps[1] + 1).fill('paso')),
    ],
    [
      `prompt sin sus ${g.prompt_levels} niveles`,
      'trainer-prompts.yml',
      (d) => (d.prompts[0].levels = d.prompts[0].levels.slice(0, g.prompt_levels - 1)),
    ],
    ['paso del playbook sin prompt', 'trainer-prompts.yml', (d) => d.prompts.splice(0, 1)],
  ];
  const missed = probes.filter(([, file, mut]) => !probe(file, mut)).map(([what]) => what);
  rmSync(tmp, { recursive: true, force: true });
  if (missed.length) return { verdict: 'red', detail: `límites de Frames sin cumplir: ${missed.join(', ')}` };
  return {
    verdict: 'superset',
    detail: `${probes.length} límites de Trainer OS cumplidos; Frames compilaba solo un fixture sintético${g.benchmark_executed ? '' : ' y no ejecutaba el benchmark'}`,
  };
};

// Career: the successor runs Frames' own gate code; the probes prove the rule still
// bites inside a run (an unverified or unbound claim is rejected), and a step that
// Frames only had as library code now executes.
const careerEvidenceProbes = (doc: Record<string, any>, bank: Record<string, any>) => {
  const rejected = (d: unknown, b: unknown) => {
    try {
      assertCareerEvidence(d, b);
      return false;
    } catch {
      return true;
    }
  };
  const weak = structuredClone(bank);
  weak.evidence[0].confidence = 'inferred';
  return [
    ['el documento del caso pasa el gate', !rejected(doc, bank)],
    ['evidencia inferida se rechaza', rejected(doc, weak)],
  ] as const;
};
COMPARATORS['career.cv'] = (caseDir, goldenDir) => {
  const g = JSON.parse(readFileSync(path.join(goldenDir, 'frames-projection.json'), 'utf8')) as {
    run_writes_only_brief: boolean;
    submission_decision: string;
  };
  const doc = JSON.parse(readFileSync(path.join(caseDir, 'source-en.json'), 'utf8'));
  const bank = JSON.parse(readFileSync(path.join(caseDir, 'evidence-bank.json'), 'utf8'));
  const failed: string[] = careerEvidenceProbes(doc, bank)
    .filter(([, ok]) => !ok)
    .map(([w]) => w);
  if (g.submission_decision !== 'PREPARED_STOP') failed.push('Frames cambió la regla de postulación');
  if (failed.length) return { verdict: 'red', detail: failed.join('; ') };
  return g.run_writes_only_brief
    ? {
        verdict: 'superset',
        detail:
          'el gate de evidencia de Frames se cumple; aquí el CV se compila y renderiza en el run (Frames solo escribía el brief)',
      }
    : { verdict: 'equal', detail: 'mismo alcance que Frames' };
};
COMPARATORS['career.cover'] = (caseDir, goldenDir) => {
  const g = JSON.parse(readFileSync(path.join(goldenDir, 'frames-projection.json'), 'utf8')) as {
    words: { letter: [number, number] };
    run_writes_only_brief: boolean;
  };
  const letter = JSON.parse(readFileSync(path.join(caseDir, 'letter.json'), 'utf8'));
  const bank = JSON.parse(readFileSync(path.join(caseDir, 'evidence-bank.json'), 'utf8'));
  const failed: string[] = careerEvidenceProbes(letter, bank)
    .filter(([, ok]) => !ok)
    .map(([w]) => w);
  const short = structuredClone(letter);
  short.paragraphs = [
    short.paragraphs[0]
      .split(' ')
      .slice(0, g.words.letter[0] - 60)
      .join(' '),
    'Gracias por su tiempo y su lectura atenta.',
  ];
  short.content_sha256 = calculateCareerDocumentHash(
    Object.fromEntries(Object.entries(short).filter(([k]) => k !== 'content_sha256')) as never,
  );
  let shortRejected = false;
  try {
    parseCareerLetter(short);
  } catch {
    shortRejected = true;
  }
  if (!shortRejected) failed.push(`una carta de menos de ${g.words.letter[0]} palabras pasa`);
  if (failed.length) return { verdict: 'red', detail: failed.join('; ') };
  return {
    verdict: 'superset',
    detail: `rangos de palabras y evidencia de Frames cumplidos; la carta se renderiza en el run`,
  };
};
COMPARATORS['career.search'] = (caseDir, goldenDir) => {
  const g = JSON.parse(readFileSync(path.join(goldenDir, 'frames-projection.json'), 'utf8')) as {
    weights: Record<string, number>;
    runner_for_c04: boolean;
  };
  if (JSON.stringify(g.weights) !== JSON.stringify(CAREER_SCORE_WEIGHTS))
    return { verdict: 'red', detail: 'los pesos difieren de Frames' };
  const inv = JSON.parse(readFileSync(path.join(caseDir, 'opportunity-inventory.json'), 'utf8')) as {
    opportunities: { inputs: Record<string, number>; mandatory_blockers?: string[] }[];
  };
  const decisions = inv.opportunities.map(
    (o) =>
      scoreCareerOpportunity({ ...o.inputs, mandatory_blockers: o.mandatory_blockers ?? [] } as never)
        .decision,
  );
  if (!decisions.includes('BLOCKED')) return { verdict: 'red', detail: 'el bloqueo obligatorio no bloquea' };
  return g.runner_for_c04
    ? { verdict: 'equal', detail: 'Frames también puntuaba en un run' }
    : { verdict: 'superset', detail: 'la rúbrica de Frames, sin cambios, ahora corre como paso C04' };
};
COMPARATORS['improve'] = (caseDir, goldenDir) => {
  const g = JSON.parse(readFileSync(path.join(goldenDir, 'frames-projection.json'), 'utf8')) as {
    reads_existing: boolean;
  };
  const before = auditStatic(readFileSync(path.join(caseDir, 'existing.html'), 'utf8')).map((f) => f.id);
  const after = auditStatic(readFileSync(path.join(caseDir, 'improved.html'), 'utf8')).map((f) => f.id);
  const seeded = [
    'network',
    'csp',
    'lang',
    'viewport',
    'h1',
    'img-alt',
    'svg-name',
    'reduced-motion',
    'evidence-tags',
  ];
  const missed = seeded.filter((id) => !before.includes(id));
  if (missed.length || after.length)
    return {
      verdict: 'red',
      detail: `sin detectar: ${missed.join(', ')}; quedan en la mejorada: ${after.join(', ')}`,
    };
  return g.reads_existing
    ? { verdict: 'equal', detail: 'Frames también leía la página' }
    : {
        verdict: 'superset',
        detail: `${seeded.length} defectos sembrados detectados sin navegador; Frames no leía la página existente`,
      };
};

// Frames' skill rules, probed on the ported code: the verdict on three synthetic runs,
// the coverage floor, the demotion order, the hash check. Where Frames required four
// actors to release, the successor binds the release to its human gates: ADR 0006 must
// say so, or the dropped rule reads as red.
COMPARATORS['skills.build'] = (caseDir, goldenDir) => {
  const g = JSON.parse(readFileSync(path.join(goldenDir, 'frames-projection.json'), 'utf8')) as {
    verdict_rule: boolean;
    minimum_eligible_floor: number;
    demotion_kinds: string[];
    passes_declared: boolean;
    scaffold_applies: boolean;
    loader_detects_hash: boolean;
    release_actor_separation: number;
  };
  const errs: string[] = [];
  const kase = (id: string, candidate: boolean, baseline: boolean) => ({
    eval_case_id: id,
    infrastructure_status: 'PASS',
    candidate_pass: candidate,
    baseline_pass: baseline,
    evidence_refs: [],
  });
  const run = (cases: ReturnType<typeof kase>[], min = 2) => ({
    schema_version: 'skill-eval-run-v1',
    run_id: 'EVAL-PROBE',
    candidate_ref: 'a.md',
    candidate_sha256: 'a'.repeat(64),
    cases,
    replay_ref: 'b.json',
    replay_sha256: 'b'.repeat(64),
    actor_id: 'probe',
    coverage_policy: { minimum_eligible_cases: min, maximum_infrastructure_failure_ratio: 0 },
  });
  const verdicts = [
    evaluateSkillRunV1(run([kase('CASE-A', true, false), kase('CASE-B', true, true)])).verdict,
    evaluateSkillRunV1(run([kase('CASE-A', true, true), kase('CASE-B', false, false)])).verdict,
    evaluateSkillRunV1(run([kase('CASE-A', true, false)], 3)).verdict,
  ];
  if (!g.verdict_rule || verdicts.join() !== 'PASS,REVISE,UNKNOWN')
    errs.push(`veredictos ${verdicts.join()} frente a la regla de Frames`);
  const plan = JSON.parse(readFileSync(path.join(caseDir, 'skill-eval-plan.json'), 'utf8')) as {
    coverage_policy: { minimum_eligible_cases: number };
  };
  const planCheck = skills.schemas['skill-eval-plan-v1']!;
  if (planCheck(JSON.stringify(plan))) errs.push('el plan del caso no valida');
  plan.coverage_policy.minimum_eligible_cases = g.minimum_eligible_floor - 1;
  if (!planCheck(JSON.stringify(plan)))
    errs.push(`acepta menos de ${g.minimum_eligible_floor} casos elegibles`);
  const b = (x: number) => Boolean(x);
  const kinds = [
    [0, 1, 1, 1, 1],
    [1, 0, 0, 1, 0],
    [1, 0, 0, 0, 1],
    [1, 0, 1, 0, 0],
    [1, 1, 0, 0, 0],
  ].map(
    ([repeatable, needsSpecializedJudgment, instructionSufficient, referenceSufficient, toolSufficient]) =>
      decideSmallestComponentV1({
        repeatable: b(repeatable!),
        needsSpecializedJudgment: b(needsSpecializedJudgment!),
        instructionSufficient: b(instructionSufficient!),
        referenceSufficient: b(referenceSufficient!),
        toolSufficient: b(toolSufficient!),
      }).kind,
  );
  if (kinds.join() !== g.demotion_kinds.join())
    errs.push(`demotion ${kinds.join()} ≠ ${g.demotion_kinds.join()}`);
  for (const [f, schema] of [
    ['local-extension-brief-v1.json', 'local-extension-brief-v1'],
    ['documentation-impact-plan-v1.json', 'documentation-impact-plan-v1'],
    ['skill-system-case-v1.json', 'skill-system-case-v1'],
    ['skill-candidate.md', 'skill-md-v1'],
  ] as const) {
    const e = skills.schemas[schema]!(readFileSync(path.join(caseDir, f), 'utf8'));
    if (e) errs.push(`${f}: ${e}`);
  }
  if (
    g.loader_detects_hash &&
    !/CONTENT_HASH_MISMATCH/.test(
      ['loader', 'dependencies']
        .map((f) => readFileSync(repoPath(`domains/skills/frames/local-extensions/${f}.ts`), 'utf8'))
        .join(''),
    )
  )
    errs.push('el loader portado perdió el chequeo de hash');
  const adr = repoPath('docs/adr/0006-skills-y-mantenimiento.md');
  if (g.release_actor_separation && !(existsSync(adr) && /cuatro actores/.test(readFileSync(adr, 'utf8'))))
    errs.push(`Frames exige ${g.release_actor_separation} actores para liberar y no hay waiver`);
  if (errs.length) return { verdict: 'red', detail: errs.join('; ') };
  return g.passes_declared && !g.scaffold_applies
    ? {
        verdict: 'superset',
        detail:
          'regla de veredicto, piso y demotion de Frames sin cambios; los aciertos se calculan y la extensión se instala tras su gate',
      }
    : { verdict: 'equal', detail: 'Frames también calculaba los casos' };
};

// Frames' maintenance rules, probed: each work-order limit Frames enforced is broken on
// the case and must be refused here, the path rules reject the same refs, and the diff
// rule at handoff (changed paths = write set) holds in checkDiff.
COMPARATORS['meta.maintain'] = (caseDir, goldenDir) => {
  const g = JSON.parse(readFileSync(path.join(goldenDir, 'frames-projection.json'), 'utf8')) as {
    max_files: number;
    hard_max_churn: number;
    tools: string[];
    questions: string[];
    changed_equals_write_set: boolean;
    churn_vs_order_target: boolean;
    runs_doctor: boolean;
    docs_against_diff: boolean;
  };
  const errs: string[] = [];
  const order = JSON.parse(readFileSync(path.join(caseDir, 'work-order.json'), 'utf8'));
  const check = maintain.schemas['work-order-v1']!;
  const own = check(JSON.stringify(order));
  if (own) errs.push(`la orden del caso no valida: ${own}`);
  const many = Array.from({ length: g.max_files + 1 }, (_, i) => `docs/f${i}.md`);
  const upper = [...order.write_set.slice(1), order.write_set[0].toUpperCase()];
  const probes: [string, object][] = [
    [
      `${g.max_files + 1} archivos`,
      {
        write_set: many,
        expected_outputs: many,
        budget: { ...order.budget, target_files: many.length, max_files: many.length },
      },
    ],
    [`churn ${g.hard_max_churn + 1}`, { budget: { ...order.budget, max_churn: g.hard_max_churn + 1 } }],
    ['write_set ≠ expected_outputs', { expected_outputs: order.write_set.slice(1) }],
    ['herramienta fuera de lista', { tools: [...g.tools, 'curl'] }],
    [
      'alias por mayúsculas',
      {
        write_set: [...order.write_set, upper.at(-1)],
        expected_outputs: [...order.write_set, upper.at(-1)],
        budget: {
          ...order.budget,
          target_files: order.write_set.length + 1,
          max_files: order.write_set.length + 1,
        },
      },
    ],
  ];
  for (const [what, patch] of probes)
    if (!check(JSON.stringify({ ...order, ...patch }))) errs.push(`acepta ${what}`);
  const refs = ['../fuera.md', '/abs.md', 'a\\b.md', 'docs/con.md', 'docs/*.md', 'docs/x.', 'docs/a:b.md'];
  for (const ref of refs) if (!badRef(ref)) errs.push(`acepta la ruta ${ref}`);
  const req = JSON.parse(readFileSync(path.join(caseDir, 'maintenance-request.json'), 'utf8'));
  const asked = blockingQuestions({
    ...req,
    change_summary: undefined,
    target_surface: undefined,
    expected_outcome: undefined,
  });
  if (asked.join('|') !== g.questions.join('|')) errs.push('las preguntas de ruteo difieren de Frames');
  const ch = (p: string) => ({ path: p, added: 1, removed: 0, deleted: false });
  if (g.changed_equals_write_set) {
    if (checkDiff(order, order.write_set.map(ch)).length) errs.push('rechaza un diff igual al write set');
    if (!checkDiff(order, [...order.write_set, 'otro.md'].map(ch)).length)
      errs.push('acepta un archivo fuera del write set');
    if (!checkDiff(order, order.write_set.slice(1).map(ch)).length)
      errs.push('acepta un write set sin cambiar');
  }
  if (MAX_FILES !== g.max_files || MAX_CHURN !== g.hard_max_churn) errs.push('los topes difieren de Frames');
  if (errs.length) return { verdict: 'red', detail: errs.join('; ') };
  const extra = [
    !g.churn_vs_order_target && 'presupuesto de líneas de la orden',
    !g.runs_doctor && 'doctor sobre la copia',
    !g.docs_against_diff && 'documentación contra el diff',
  ].filter(Boolean);
  return extra.length
    ? {
        verdict: 'superset',
        detail: `${probes.length} límites y ${refs.length} reglas de ruta de Frames cumplidos; suma: ${extra.join(', ')}`,
      }
    : { verdict: 'equal', detail: 'mismas reglas que Frames' };
};

const AULA_BASELINE_SHA256 = '6c691379b76842ed4ee9d23141a7b722ab9f078553521664954a47ce6228c84d';
const AulaCaseHash = z.string().regex(/^[a-f0-9]{64}$/);
const CompanionName = z.string().regex(/^[a-z][a-z0-9-]*\.html$/);
const AulaCaseCapability = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    kind: AulaKind,
    edition: Edition,
    inputSha256: AulaCaseHash,
  })
  .strict();
const AulaBaseline = z
  .object({
    schema: z.literal('aula-succession-case-v1'),
    origin: z.string().min(1),
    capabilities: z.array(AulaCaseCapability).length(18),
  })
  .strict();
const AulaSuccessor = z
  .object({
    schema: z.literal('aula-succession-case-v2'),
    version: z.literal('1.1.0'),
    supersedes: z
      .object({
        ref: z.literal('verify/parity/cases/aula/frames-os/cases.json'),
        sha256: z.literal(AULA_BASELINE_SHA256),
      })
      .strict(),
    catalog: z
      .object({
        ref: z.literal('registry/aula-capabilities.json'),
        sha256: AulaCaseHash,
      })
      .strict(),
    capabilities: z
      .array(
        AulaCaseCapability.extend({
          version: z.literal('1.1.0'),
          companions: z.record(CompanionName, AulaCaseHash),
        }).strict(),
      )
      .length(18),
  })
  .strict();

// The historical capture is immutable; new inputs require this explicit successor.
// Runtime catalog/bridge checks still verify complete trees and confined attachments.
export function validateAulaParitySuccession(
  baselineBody: string,
  successorBody: string,
  catalogBody: string,
) {
  const baseline = AulaBaseline.parse(JSON.parse(baselineBody) as unknown);
  const current = AulaSuccessor.parse(JSON.parse(successorBody) as unknown);
  const catalog = JSON.parse(catalogBody) as AulaCatalog;
  if (digest(baselineBody) !== current.supersedes.sha256)
    throw new Error('AULA-PARITY-HISTORICAL-BASELINE-CHANGED');
  if (digest(catalogBody) !== current.catalog.sha256) throw new Error('AULA-PARITY-CATALOG-STALE');
  for (const cases of [baseline.capabilities, current.capabilities])
    if (new Set(cases.map((skill) => skill.id)).size !== 18)
      throw new Error('AULA-PARITY-REQUIRES-EIGHTEEN-UNIQUE-CAPABILITIES');
  for (const expected of current.capabilities) {
    const original = baseline.capabilities.find((skill) => skill.id === expected.id);
    const skill = catalog.capabilities.find((skill) => skill.id === expected.id);
    if (
      !original ||
      !skill ||
      original.kind !== expected.kind ||
      original.edition !== expected.edition ||
      skill.kind !== expected.kind ||
      skill.edition !== expected.edition ||
      skill.version !== expected.version
    )
      throw new Error(`AULA-PARITY-CAPABILITY-CHANGED: ${expected.id}`);
    if (skill.files['examples/input.json'] !== expected.inputSha256)
      throw new Error(`AULA-PARITY-INPUT-CHANGED: ${expected.id}`);
    const names =
      skill.kind === 'index'
        ? Object.keys(skill.files)
            .filter((ref) => /^examples\/[^/]+\.html$/.test(ref))
            .map((ref) => ref.slice(9))
            .sort()
        : [];
    if (names.join('\n') !== Object.keys(expected.companions).sort().join('\n'))
      throw new Error(`AULA-PARITY-COMPANION-SET: ${expected.id}`);
    for (const name of names)
      if (skill.files[`examples/${name}`] !== expected.companions[name])
        throw new Error(`AULA-PARITY-COMPANION-HASH: ${expected.id}/${name}`);
  }
  return current;
}

export function compare(family: string, name: string): CaseResult {
  if (family === 'aula') {
    try {
      const catalog = loadAulaCatalog();
      const frozen = validateAulaParitySuccession(
        readFileSync(repoPath('verify/parity/cases/aula', name, 'cases.json'), 'utf8'),
        readFileSync(repoPath('verify/parity/cases/aula', name, 'cases-1.1.0.json'), 'utf8'),
        readFileSync(repoPath('registry/aula-capabilities.json'), 'utf8'),
      );
      const errors: string[] = [];
      for (const expected of frozen.capabilities) {
        const skill = catalog.capabilities.find((skill) => skill.id === expected.id)!;
        const source = readFileSync(repoPath(skill.source, 'examples/input.json'), 'utf8');
        if (digest(source) !== expected.inputSha256) errors.push(`successor input changed: ${expected.id}`);
        try {
          const assets = Object.fromEntries(
            Object.entries(expected.companions).map(([name, hash]) => {
              const bytes = readFileSync(repoPath(skill.source, 'examples', name));
              if (digest(bytes) !== hash)
                throw new Error(`AULA-PARITY-COMPANION-HASH: ${expected.id}/${name}`);
              return [name, bytes];
            }),
          );
          aulaBuild(source, skill.kind, skill.edition, false, assets);
        } catch (e) {
          errors.push((e as Error).message);
        }
      }
      return errors.length
        ? { verdict: 'red', detail: errors.join('; ') }
        : {
            verdict: 'superset',
            detail:
              '18 versioned1.1.0 Aula/deck sources and linked HTML resolve to native hash-bound handlers; historical case preserved',
          };
    } catch (e) {
      return { verdict: 'red', detail: (e as Error).message };
    }
  }
  const cmp = COMPARATORS[family];
  if (!cmp) return { verdict: 'red', detail: `sin comparador para ${family}` };
  const golden = repoPath('verify/parity/golden', family, name);
  if (!existsSync(golden)) return { verdict: 'red', detail: 'sin golden capturado de Frames' };
  return cmp(repoPath('verify/parity/cases', family, name), golden);
}
