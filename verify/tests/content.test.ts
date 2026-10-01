import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadRegistry } from '../../engine/registry.ts';
import { approve, artifactPath, nextStep, startRun } from '../../engine/run.ts';
import { repoPath } from '../../engine/paths.ts';
import { createFramesBriefMarkdown, type FramesBriefDraftV1 } from '../../domains/content/brief/model.ts';
import type { FramesBriefV1 } from '../../domains/content/brief/schema.ts';
import { documentParity, htmlCheck } from '../../domains/content/html.ts';
import { parityReport } from '../parity/run.ts';
import { renderFramesBriefHtml } from '../../domains/content/brief/renderer.ts';
import { briefParity, patchBriefHtml } from '../../domains/content/index.ts';
import { auditHtml } from '../visual/audit.ts';

const CASE = JSON.parse(
  readFileSync(repoPath('verify/parity/cases/content.piece/brief-basic/input.json'), 'utf8'),
) as { draft: FramesBriefDraftV1; sections: FramesBriefV1['sections'] };

let work: string;
beforeEach(() => {
  work = mkdtempSync(path.join(os.tmpdir(), 'frames-content-'));
  process.env.FRAMES_WORK = work;
});
afterEach(() => {
  rmSync(work, { recursive: true, force: true });
  delete process.env.FRAMES_WORK;
});

const reg = loadRegistry();
const put = (run: string, id: string, body: string, schema = 'markdown') => {
  const f = artifactPath(run, id, schema);
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, body);
};
const doc = (title: string) => `# ${title}\n\nContenido real y verificable.\n`;
const briefMd = (objective = CASE.draft.objective) =>
  createFramesBriefMarkdown({ ...CASE.draft, objective }, CASE.sections);

// Drive a run to the direction gate on P03 with a valid brief.
async function toBriefGate() {
  const run = startRun(reg, 'content.piece', { brand_ready: true });
  expect(await nextStep(reg, run.id)).toMatchObject({ step: 'P03', status: 'needs_input' });
  put(run.id, 'brief', briefMd());
  put(run.id, 'ab-concepts-v1', doc('Conceptos A/B'));
  put(run.id, 'definition-of-ready-v1', doc('Definition of Ready'));
  return run.id;
}

describe('content.piece', () => {
  it('the brief page passes the visual audit that the Frames page failed', async () => {
    const html = renderFramesBriefHtml(briefMd());
    const audit = async (page: string) => {
      const f = path.join(work, 'brief.html');
      writeFileSync(f, page);
      return auditHtml(f);
    };
    const frames = await audit(html);
    if (!frames.browser) return; // no browser: a gap, never green
    const high = (r: Awaited<ReturnType<typeof audit>>) =>
      r.findings.filter((x) => x.severity === 'high').map((x) => x.id);
    expect(high(frames)).toEqual(['contrast', 'overflow-390']);
    expect(high(await audit(patchBriefHtml(html)))).toEqual([]);
    expect(briefParity(briefMd(), patchBriefHtml(html)).status).toBe('PASS');
    expect(briefParity(briefMd(), html).status).toBe('FAIL'); // the layer is required, not optional
  }, 60_000);

  it('renders brief.html in parity inside P03', async () => {
    const id = await toBriefGate();
    expect(await nextStep(reg, id)).toMatchObject({
      step: 'P03',
      status: 'awaiting_gate',
      gate: 'direction',
    });
    const html = readFileSync(artifactPath(id, 'brief-html', 'html'), 'utf8');
    expect(briefParity(briefMd(), html).status).toBe('PASS');
  });

  it('brief approval is invalidated when the brief changes', async () => {
    const id = await toBriefGate();
    await nextStep(reg, id);
    approve(reg, id, 'direction');
    put(id, 'brief', briefMd('Otro objetivo, cambiado despues de aprobar.'));
    expect((await nextStep(reg, id)).status).toBe('awaiting_gate');
    expect((await nextStep(reg, id)).note).toMatch(/cambiaron/);
  });

  it('editing the brief while it waits at its gate re-renders the HTML', async () => {
    const id = await toBriefGate();
    await nextStep(reg, id);
    const changed = briefMd('Objetivo corregido mientras esperaba el gate.');
    put(id, 'brief', changed);
    expect(await nextStep(reg, id)).toMatchObject({ step: 'P03', status: 'awaiting_gate' });
    const html = readFileSync(artifactPath(id, 'brief-html', 'html'), 'utf8');
    expect(briefParity(changed, html).status).toBe('PASS');
  });

  it('rejects a deliverable with an unfilled template token', async () => {
    const id = await toBriefGate();
    await nextStep(reg, id);
    approve(reg, id, 'direction');
    await nextStep(reg, id); // P03 done
    expect(await nextStep(reg, id)).toMatchObject({ step: 'P05', status: 'needs_input' });
    const tpl = repoPath('domains/content/templates/creative-spec-v1.template.md');
    copyFileSync(tpl, artifactPath(id, 'creative-spec-v1'));
    const r = await nextStep(reg, id);
    expect(r).toMatchObject({ step: 'P05', status: 'needs_input' });
    expect(r.note).toMatch(/placeholder/);
  });

  it('delivers the written piece and its offline HTML twin', async () => {
    const id = await toBriefGate();
    await nextStep(reg, id);
    approve(reg, id, 'direction');
    await nextStep(reg, id);
    await nextStep(reg, id); // P05 asks
    put(id, 'creative-spec-v1', doc('Especificacion creativa'));
    expect(await nextStep(reg, id)).toMatchObject({ step: 'P05', status: 'done' });
    expect(await nextStep(reg, id)).toMatchObject({ step: 'CP01', status: 'needs_input' });
    const piece = '# Cinco errores de datos\n\n## Por que importa\n\nTexto de la pieza.\n';
    put(id, 'piece', piece);
    expect(await nextStep(reg, id)).toMatchObject({ step: 'CP01', status: 'done' });
    const html = readFileSync(artifactPath(id, 'piece-html', 'html'), 'utf8');
    expect(htmlCheck(html)).toBeNull();
    expect(documentParity(piece, html)).toEqual([]);

    await nextStep(reg, id); // P07 asks
    put(id, 'review-report-v1', doc('Revision'));
    put(id, 'verdict-v1', '# Veredicto\n\nverdict: PASS\n');
    put(id, 'top5-changes-v1', doc('Cambios'));
    expect(await nextStep(reg, id)).toMatchObject({ step: 'P07', status: 'done' });
    // P08 skipped on PASS; CP02 renders the final version and waits for acceptance
    expect(await nextStep(reg, id)).toMatchObject({
      step: 'CP02',
      status: 'awaiting_gate',
      gate: 'acceptance',
    });
    expect(existsSync(artifactPath(id, 'final-html', 'html'))).toBe(true);
  });

  it('a REVISE verdict runs the edit step and the final version is the edit', async () => {
    const id = await toBriefGate();
    await nextStep(reg, id);
    approve(reg, id, 'direction');
    await nextStep(reg, id);
    await nextStep(reg, id);
    put(id, 'creative-spec-v1', doc('Spec'));
    await nextStep(reg, id);
    await nextStep(reg, id);
    put(id, 'piece', doc('Pieza v1'));
    await nextStep(reg, id);
    await nextStep(reg, id);
    put(id, 'review-report-v1', doc('Revision'));
    put(id, 'verdict-v1', 'verdict: REVISE\n');
    put(id, 'top5-changes-v1', doc('Cambios'));
    await nextStep(reg, id);
    expect(await nextStep(reg, id)).toMatchObject({ step: 'P08', status: 'needs_input' });
    put(id, 'edit-candidate-v1', '# Pieza v2\n\nVersion editada.\n');
    put(id, 'edl-v1', doc('EDL'));
    expect(await nextStep(reg, id)).toMatchObject({ step: 'P08', status: 'done' });
    await nextStep(reg, id);
    expect(readFileSync(artifactPath(id, 'final-html', 'html'), 'utf8')).toContain('Pieza v2');
  });

  it('succession: no Frames deliverable lost, case equal to Frames, improvements backed by tests', () => {
    const [r] = parityReport('content.piece');
    expect(r?.problems).toEqual([]);
    expect(r).toMatchObject({ status: 'ok', verdict: 'superset' });
  });
});
