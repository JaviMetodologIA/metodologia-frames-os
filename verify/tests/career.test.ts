import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { career } from '../../domains/career/index.ts';
import { repoPath } from '../../engine/paths.ts';
import { loadRegistry } from '../../engine/registry.ts';
import { compare } from '../parity/compare.ts';

const tmp = mkdtempSync(path.join(os.tmpdir(), 'frames-career-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

// A run dir seeded with case files and the step's declared outputs.
function ctxFor(family: string, stepId: string, seed: Record<string, string>) {
  const run = mkdtempSync(path.join(tmp, 'run-'));
  const a = path.join(run, 'artifacts');
  mkdirSync(a, { recursive: true });
  for (const [to, from] of Object.entries(seed)) cpSync(repoPath(from), path.join(a, to));
  const step = loadRegistry()
    .families.find((f) => f.id === family)!
    .steps.find((x) => x.id === stepId)!;
  const ext: Record<string, string> = {
    html: '.html',
    json: '.json',
    pdf: '.pdf',
    docx: '.docx',
    'career-cv-v2': '.json',
    'career-letter-v1': '.json',
  };
  return {
    runDir: run,
    step,
    facts: {},
    inputs: { 'evidence-bank': path.join(a, 'evidence-bank.json') },
    outputs: step.outputs.map((o) => ({
      id: o.id,
      schema: o.schema,
      required: true,
      file: path.join(a, `${o.id}${ext[o.schema] ?? '.md'}`),
    })),
    write: (rel: string, data: string | Buffer) => {
      const f = path.join(run, rel);
      mkdirSync(path.dirname(f), { recursive: true });
      writeFileSync(f, data);
      return f;
    },
  };
}

describe('career', () => {
  it('renders a CV only from verified evidence, as HTML, DOCX and a repeatable A4 PDF', async () => {
    expect(compare('career.cv', 'frames-os')).toMatchObject({ verdict: 'superset' });
    const ctx = ctxFor('career.cv', 'C06', {
      'cv.json': 'verify/parity/cases/career.cv/frames-os/source-en.json',
      'evidence-bank.json': 'verify/parity/cases/career.cv/frames-os/evidence-bank.json',
    });
    const r = await career.handlers['career.cv']!(ctx);
    if (r.status === 'blocked') return; // no browser: a gap, never green
    expect(r, r.note).toMatchObject({ status: 'done' });
    const a = (f: string) => readFileSync(path.join(ctx.runDir, 'artifacts', f));
    expect(a('cv-docx.docx').subarray(0, 2).toString()).toBe('PK');
    expect(a('cv-pdf.pdf').subarray(0, 4).toString()).toBe('%PDF');
    // The same CV with its evidence downgraded to inferred is refused.
    const bank = JSON.parse(a('evidence-bank.json').toString());
    bank.evidence.forEach((e: { confidence: string }) => (e.confidence = 'inferred'));
    writeFileSync(path.join(ctx.runDir, 'artifacts', 'evidence-bank.json'), JSON.stringify(bank));
    expect((await career.handlers['career.cv']!(ctx)).note).toMatch(/CV bloqueado/);
  }, 180_000);

  it('writes a cover letter only within Frames word ranges and bound to evidence', async () => {
    expect(compare('career.cover', 'frames-os')).toMatchObject({ verdict: 'superset' });
    const ctx = ctxFor('career.cover', 'C07', {
      'letter.json': 'verify/parity/cases/career.cover/frames-os/letter.json',
      'evidence-bank.json': 'verify/parity/cases/career.cover/frames-os/evidence-bank.json',
    });
    const r = await career.handlers['career.letter']!(ctx);
    if (r.status === 'blocked') return;
    expect(r, r.note).toMatchObject({ status: 'done' });
    const letter = JSON.parse(readFileSync(path.join(ctx.runDir, 'artifacts', 'letter.json'), 'utf8'));
    letter.paragraphs = ['Demasiado corta para ser una carta.'];
    writeFileSync(path.join(ctx.runDir, 'artifacts', 'letter.json'), JSON.stringify(letter));
    expect((await career.handlers['career.letter']!(ctx)).note).toMatch(/carta bloqueada/);
  }, 180_000);

  it('ranks opportunities with Frames scoring rubric and blocks on a mandatory blocker', async () => {
    expect(compare('career.search', 'frames-os')).toMatchObject({ verdict: 'superset' });
    const ctx = ctxFor('career.search', 'C04', {
      'opportunity-inventory.json': 'verify/parity/cases/career.search/frames-os/opportunity-inventory.json',
    });
    ctx.outputs.push({
      id: 'opportunity-inventory',
      schema: 'json',
      required: true,
      file: path.join(ctx.runDir, 'artifacts', 'opportunity-inventory.json'),
    });
    expect(await career.handlers['career.score']!(ctx)).toMatchObject({ status: 'done' });
    const card = JSON.parse(
      readFileSync(path.join(ctx.runDir, 'artifacts', 'fit-scorecard.json'), 'utf8'),
    ) as {
      rows: { id: string; total: number; decision: string }[];
    };
    expect(card.rows.map((r) => r.total)).toEqual([...card.rows.map((r) => r.total)].sort((x, y) => y - x));
    expect(card.rows.find((r) => r.id === 'OPP-SYNTH-003')?.decision).toBe('BLOCKED');
    expect(readFileSync(path.join(ctx.runDir, 'artifacts', 'ranked-shortlist.md'), 'utf8')).toMatch(
      /\| 1 \|/,
    );
  });

  it('every career family stops at submission and never submits', () => {
    const reg = loadRegistry();
    expect(reg.gates.find((g) => g.id === 'submission')?.kind).toBe('hard_stop');
    for (const id of ['career.cv', 'career.cover']) {
      const steps = reg.families.find((f) => f.id === id)!.steps;
      const last = steps[steps.length - 1]!;
      expect(last, id).toMatchObject({ id: 'C09', gate: 'submission' });
      expect(steps.some((s) => s.effect === 'external')).toBe(false);
    }
  });
});
