import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deck as deckDomain } from '../../domains/deck/index.ts';
import { decide } from '../../engine/guard/policy.ts';
import { repoPath } from '../../engine/paths.ts';
import { loadRegistry } from '../../engine/registry.ts';
import { approve, nextStep, runDir, startRun } from '../../engine/run.ts';
import { compare } from '../parity/compare.ts';

const CASE = repoPath('verify/parity/cases/nlm/frames-os');
let work = '';
beforeAll(() => {
  work = mkdtempSync(path.join(os.tmpdir(), 'frames-nlm-'));
  process.env.FRAMES_WORK = work;
});
afterAll(() => {
  delete process.env.FRAMES_WORK;
  rmSync(work, { recursive: true, force: true });
});

const mcp = (tool: string) => decide({ kind: 'mcp', tool }).decision;
const put = (run: string, file: string, body: string) =>
  writeFileSync(path.join(runDir(run), 'artifacts', file), body);

describe('nlm', () => {
  it('an MCP call that changes NotebookLM is denied before its gate and allowed only inside its window', async () => {
    const reg = loadRegistry();
    const run = startRun(reg, 'nlm').id;
    const step = async () => nextStep(reg, run);
    const create = 'mcp__notebooklm__notebook_create';
    expect(mcp(create)).toBe('deny'); // nothing open yet
    expect(mcp('mcp__notebooklm__notebook_list')).toBe('allow'); // read-only, in mcp_allow
    cpSync(
      path.join(CASE, 'notebook-intent.json'),
      path.join(runDir(run), 'artifacts', 'notebook-intent.json'),
    );
    put(run, 'notebook-audit.md', '# Auditoría\n\nNo hay cuadernos previos para este dominio.\n');
    cpSync(
      path.join(CASE, 'notebook-profile.json'),
      path.join(runDir(run), 'artifacts', 'notebook-profile.json'),
    );
    cpSync(
      path.join(CASE, 'notebook-plan-draft.json'),
      path.join(runDir(run), 'artifacts', 'notebook-plan-draft.json'),
    );
    let r = await step();
    for (let i = 0; i < 8 && r.status !== 'awaiting_gate'; i++) r = await step();
    expect(r).toMatchObject({ step: 'N03', status: 'awaiting_gate', gate: 'external-effect' });
    expect(mcp(create)).toBe('deny'); // the plan exists, its gate is not consumed
    approve(reg, run, 'external-effect');
    r = await step(); // consumes the gate
    for (let i = 0; i < 3 && r.step !== 'N04'; i++) r = await step();
    expect(r).toMatchObject({ step: 'N04', status: 'needs_input' });
    expect(mcp(create)).toBe('allow');
    expect(mcp('mcp__notebooklm__notebook_share_invite')).toBe('deny'); // not this stage's tool
    put(
      run,
      'materialize-receipt.json',
      JSON.stringify({ operations: [{ operationId: 'create-private', status: 'done' }] }),
    );
    r = await step();
    expect(r).toMatchObject({ step: 'N04', status: 'needs_input' });
    expect(r.note).toMatch(/sin readback para: create-private/);
    put(
      run,
      'materialize-receipt.json',
      JSON.stringify({
        operations: [
          { operationId: 'create-private', status: 'done', readback: 'notebook_get: título y 0 fuentes' },
        ],
      }),
    );
    r = await step();
    expect(r).toMatchObject({ step: 'N04', status: 'done' });
    expect(mcp(create)).toBe('deny'); // window closed with the receipt
    const open = JSON.parse(readFileSync(path.join(runDir(run), 'effects', 'open.json'), 'utf8')) as {
      closed: boolean;
    };
    expect(open.closed).toBe(true);
  });

  it('an agent cannot open a window by writing it', () => {
    const w = decide({
      kind: 'write',
      file: 'work/runs/x/effects/open.json',
      content: '{"tools":["mcp__notebooklm__notebook_create"]}',
    });
    expect(w.decision).toBe('deny');
  });

  it('renders the study guide as a verified scroll page', async () => {
    expect(compare('nlm', 'frames-os')).toMatchObject({ verdict: 'superset' });
    const run = mkdtempSync(path.join(work, 'guide-'));
    mkdirSync(path.join(run, 'artifacts'), { recursive: true });
    cpSync(
      repoPath('verify/parity/cases/content.campaign/frames-os/landing.yml'),
      path.join(run, 'artifacts', 'study-guide.yml'),
    );
    const step = loadRegistry()
      .families.find((f) => f.id === 'nlm')!
      .steps.find((x) => x.id === 'N08')!;
    const ext: Record<string, string> = { html: '.html', 'deck-v1': '.yml' };
    const ctx = {
      runDir: run,
      step,
      facts: {},
      inputs: {},
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
    const r = await deckDomain.handlers['nlm.guide']!(ctx);
    if (r.status === 'blocked') return; // no browser: a gap, never green
    expect(r, r.note).toMatchObject({ status: 'done' });
    expect(readFileSync(path.join(run, 'artifacts', 'guide-html.html'), 'utf8')).toContain(
      'IntersectionObserver',
    );
  }, 180_000);
});
