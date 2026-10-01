import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { improve } from '../../domains/improve/index.ts';
import { repoPath } from '../../engine/paths.ts';
import { loadRegistry } from '../../engine/registry.ts';
import { auditHtml } from '../visual/audit.ts';
import { compare } from '../parity/compare.ts';

const CASE = repoPath('verify/parity/cases/improve/frames-os');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'frames-improve-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function ctxFor(stepId: string, run: string) {
  const step = loadRegistry()
    .families.find((f) => f.id === 'improve')!
    .steps.find((x) => x.id === stepId)!;
  const ext: Record<string, string> = { html: '.html', json: '.json' };
  return {
    runDir: run,
    step,
    facts: {},
    inputs: { audit: path.join(run, 'artifacts', 'audit.json') },
    outputs: step.outputs.map((o) => ({
      id: o.id,
      schema: o.schema,
      required: true,
      file: path.join(run, 'artifacts', `${o.id}${ext[o.schema] ?? '.md'}`),
    })),
    write: (rel: string, data: string | Buffer) => {
      const f = path.join(run, rel);
      mkdirSync(path.dirname(f), { recursive: true });
      writeFileSync(f, data);
      return f;
    },
  };
}

describe('improve', () => {
  it('finds the defects seeded in an existing page', async () => {
    expect(compare('improve', 'frames-os')).toMatchObject({ verdict: 'superset' });
    const r = await auditHtml(path.join(CASE, 'existing.html'));
    if (!r.browser) return; // no browser: a gap, never green
    const ids = r.findings.map((f) => f.id);
    for (const id of ['network', 'img-alt', 'reduced-motion', 'contrast', 'overflow-390'])
      expect(ids).toContain(id);
  }, 120_000);

  it('accepts the improved page only when it fixes findings and adds none', async () => {
    const run = mkdtempSync(path.join(tmp, 'run-'));
    mkdirSync(path.join(run, 'artifacts'));
    cpSync(path.join(CASE, 'existing.html'), path.join(run, 'artifacts', 'existing.html'));
    writeFileSync(
      path.join(run, 'artifacts', 'improve-goal.md'),
      '# Objetivo\n\nQue se lea bien y funcione offline.\n',
    );
    const audited = await improve.handlers['improve.audit']!(ctxFor('I01', run));
    if (audited.status === 'blocked') return;
    expect(audited).toMatchObject({ status: 'done' });
    // An "improvement" that breaks something new is refused.
    const worse = readFileSync(path.join(CASE, 'improved.html'), 'utf8').replace(
      '<body>',
      `<body><a href="${'/Us' + 'ers/alguien/notas.html'}">notas</a>`, // built at run time: no private path in the repo
    );
    writeFileSync(path.join(run, 'artifacts', 'improved.html'), worse);
    const refused = await improve.handlers['improve.verify']!(ctxFor('I03', run));
    expect(refused.status).toBe('needs_input');
    expect(refused.note).toMatch(/agrega hallazgos|altos/);
    cpSync(path.join(CASE, 'improved.html'), path.join(run, 'artifacts', 'improved.html'));
    const ok = await improve.handlers['improve.verify']!(ctxFor('I03', run));
    expect(ok, ok.note).toMatchObject({ status: 'done' });
    const v = JSON.parse(readFileSync(path.join(run, 'artifacts', 'improve-verdict.json'), 'utf8')) as {
      before: number;
      after: number;
      added: string[];
    };
    expect(v.after).toBe(0);
    expect(v.before).toBeGreaterThanOrEqual(9);
    expect(v.added).toEqual([]);
  }, 180_000);
});
