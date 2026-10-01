// career: CV, cover letter and job search on Frames' own career code (ported as-is in
// domains/career/frames, its tests in verify/tests/career-frames). Frames ran only the
// brief-first step; the compiler, evidence gate, renderers, DOCX, PDF and scoring were
// library code its tests called. Here each is a step of a run, and submission (C09)
// stays a hard stop: the person applies, outside the engine.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  missingFrom,
  relTo,
  requestFromHost,
  type Handler,
  type HandlerCtx,
  type SchemaCheck,
} from '../../engine/handler-kit.ts';
import { printPdf } from '../../engine/capture.ts';
import { assertCareerEvidence } from './frames/_runner/evidence-gate.ts';
import { parseCareerCv, parseCareerLetter } from './frames/_runner/document-model.ts';
import {
  renderCareerCvAtsHtml,
  renderCareerCvExecutiveHtml,
  renderCareerLetterHtml,
  verifyCareerDocumentParity,
} from './frames/_runner/document-renderer.ts';
import { renderCareerCvAtsDocx } from './frames/_runner/cv-docx.ts';
import { scoreCareerOpportunity } from './frames/_runner/scoring.ts';
import { EvidenceBankV1Schema } from './frames/_schema/index.ts';

const byId = (ctx: HandlerCtx, id: string) => ctx.outputs.find((o) => o.id === id);
const json = (f: string) => JSON.parse(readFileSync(f, 'utf8')) as unknown;
const inputFile = (ctx: HandlerCtx, id: string) =>
  ctx.inputs[id] ?? path.join(ctx.runDir, 'artifacts', `${id}.json`);
const fail = (e: unknown) => (e as Error).message.slice(0, 400);

// C06: evidence gate, then HTML (ATS or executive by the CV's design profile), parity,
// DOCX for the ATS profile, and an A4 PDF printed twice to prove it is deterministic.
const cv: Handler = async (ctx) => {
  const host = missingFrom(ctx).filter((o) => o.id === 'cv');
  if (host.length)
    return requestFromHost(ctx, host, [
      '## CV',
      '- `cv` es un career-cv-v2: cada texto visible ligado a evidencia del banco.',
    ]);
  const doc = json(byId(ctx, 'cv')!.file);
  const bank = json(inputFile(ctx, 'evidence-bank'));
  let html: string;
  try {
    assertCareerEvidence(doc, bank);
    const parsed = parseCareerCv(doc);
    html =
      parsed.design_profile === 'candidate-neutral-ats'
        ? renderCareerCvAtsHtml(doc, bank)
        : renderCareerCvExecutiveHtml(doc, bank);
    // Frames' parity re-renders with the default template only; for either variant the
    // semantic model must match and a second render with the same template must be equal.
    const again =
      parsed.design_profile === 'candidate-neutral-ats'
        ? renderCareerCvAtsHtml(doc, bank)
        : renderCareerCvExecutiveHtml(doc, bank);
    const parity = [
      ...verifyCareerDocumentParity(doc, bank, html).filter((i) => i !== 'HTML_PROJECTION_NOT_DETERMINISTIC'),
      ...(again === html ? [] : ['HTML_PROJECTION_NOT_DETERMINISTIC']),
    ];
    if (parity.length) return { status: 'needs_input', note: `paridad documento/HTML: ${parity.join(', ')}` };
    const htmlOut = byId(ctx, 'cv-html');
    if (!htmlOut) return { status: 'blocked', note: 'el paso no declara cv-html' };
    const file = ctx.write(relTo(ctx, htmlOut.file), html);
    const docx = byId(ctx, 'cv-docx');
    if (docx && parsed.design_profile === 'candidate-neutral-ats')
      ctx.write(relTo(ctx, docx.file), await renderCareerCvAtsDocx(doc, bank));
    const pdf = byId(ctx, 'cv-pdf');
    if (pdf) {
      const r = await printPdf({ html: file, out: pdf.file });
      return {
        status: 'done',
        note: `CV con evidencia verificada · HTML, DOCX y PDF A4 de ${r.pages} página(s), impresión repetible`,
      };
    }
    return { status: 'done', note: 'CV con evidencia verificada' };
  } catch (e) {
    return { status: 'needs_input', note: `CV bloqueado: ${fail(e)}` };
  }
};

// C07: the letter, held to Frames' word ranges (letter 180–280, form 80–140, message 40–70)
// and to the evidence gate, then HTML and PDF.
const letter: Handler = async (ctx) => {
  const host = missingFrom(ctx).filter((o) => o.id === 'letter');
  if (host.length)
    return requestFromHost(ctx, host, [
      '## Carta',
      '- `letter` es un career-letter-v1 con cada párrafo ligado a evidencia.',
    ]);
  const doc = json(byId(ctx, 'letter')!.file);
  const bank = json(inputFile(ctx, 'evidence-bank'));
  try {
    parseCareerLetter(doc);
    assertCareerEvidence(doc, bank);
    const htmlOut = byId(ctx, 'letter-html');
    if (!htmlOut) return { status: 'blocked', note: 'el paso no declara letter-html' };
    const file = ctx.write(relTo(ctx, htmlOut.file), renderCareerLetterHtml(doc, bank));
    const pdf = byId(ctx, 'letter-pdf');
    if (pdf) await printPdf({ html: file, out: pdf.file });
    return { status: 'done', note: 'carta con evidencia verificada · HTML y PDF' };
  } catch (e) {
    return { status: 'needs_input', note: `carta bloqueada: ${fail(e)}` };
  }
};

type Opportunity = {
  id: string;
  title: string;
  inputs: Record<string, number>;
  mandatory_blockers?: string[];
};

// C04: Frames' rubric (evidence 30, requirements 20, constraints 15, transferability 10,
// quality 10, sector 5, friction 5, contact 5) ranks the inventory; a blocker blocks.
const score: Handler = async (ctx) => {
  const host = missingFrom(ctx).filter((o) => o.id === 'opportunity-inventory');
  if (host.length) return requestFromHost(ctx, host);
  let rows: { id: string; title: string; total: number; decision: string }[];
  try {
    const inv = json(byId(ctx, 'opportunity-inventory')!.file) as { opportunities: Opportunity[] };
    rows = inv.opportunities
      .map((o) => {
        const r = scoreCareerOpportunity({
          ...o.inputs,
          mandatory_blockers: o.mandatory_blockers ?? [],
        } as never);
        return { id: o.id, title: o.title, total: r.score, decision: r.decision };
      })
      .sort((a, b) => b.total - a.total);
  } catch (e) {
    return { status: 'needs_input', note: `inventario inválido: ${fail(e)}` };
  }
  const card = byId(ctx, 'fit-scorecard');
  if (card)
    ctx.write(relTo(ctx, card.file), JSON.stringify({ schema: 'fit-scorecard-v1', rows }, null, 2) + '\n');
  const list = byId(ctx, 'ranked-shortlist');
  if (list)
    ctx.write(
      relTo(ctx, list.file),
      [
        '# Shortlist',
        '',
        '| # | Oportunidad | Puntaje | Decisión |',
        '| --- | --- | --- | --- |',
        ...rows.map((r, i) => `| ${i + 1} | ${r.title} | ${r.total} | ${r.decision} |`),
      ].join('\n') + '\n',
    );
  return { status: 'done', note: `${rows.length} oportunidades puntuadas con la rúbrica de Frames` };
};

export const career: { handlers: Record<string, Handler>; schemas: Record<string, SchemaCheck> } = {
  handlers: { 'career.cv': cv, 'career.letter': letter, 'career.score': score },
  schemas: {
    'evidence-bank-v1': (c) => {
      try {
        EvidenceBankV1Schema.parse(JSON.parse(c));
        return null;
      } catch (e) {
        return fail(e);
      }
    },
    'career-cv-v2': (c) => {
      try {
        parseCareerCv(JSON.parse(c));
        return null;
      } catch (e) {
        return fail(e);
      }
    },
    'career-letter-v1': (c) => {
      try {
        parseCareerLetter(JSON.parse(c));
        return null;
      } catch (e) {
        return fail(e);
      }
    },
    docx: (c) => (c.startsWith('PK') ? null : 'no es un DOCX (zip)'),
  },
};
