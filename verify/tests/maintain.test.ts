// One maintenance run over a scratch git repo, step by step: the three tests share it and
// run in order (vitest runs a file's tests sequentially).
import { execFileSync } from 'node:child_process';
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkDiff, docsProblems, maintain } from '../../domains/maintain/index.ts';
import { repoPath } from '../../engine/paths.ts';
import { loadRegistry } from '../../engine/registry.ts';
import { approve, artifactPath, nextStep, startRun, type NextResult } from '../../engine/run.ts';
import { compare } from '../parity/compare.ts';

const CASE = repoPath('verify/parity/cases/meta.maintain/frames-os');
const reg = loadRegistry();
let work: string;
let repo: string;
let run: string;
const git = (...a: string[]) =>
  execFileSync('git', ['-c', 'user.name=Prueba', '-c', 'user.email=prueba@example.invalid', ...a], {
    cwd: repo,
    stdio: 'pipe',
  });
const next = async (want: NextResult['status'], step: string) => {
  const r = await nextStep(reg, run);
  expect({ step: r.step, status: r.status, note: r.note }).toMatchObject({ step, status: want });
  return r;
};
const author = (out: string, ext: string) =>
  cpSync(path.join(CASE, `${out}.${ext}`), artifactPath(run, out, `${out}-v1`));
const file = (rel: string) => path.join(repo, rel);

beforeAll(() => {
  work = mkdtempSync(path.join(os.tmpdir(), 'frames-maintain-work-'));
  repo = mkdtempSync(path.join(os.tmpdir(), 'frames-maintain-repo-'));
  process.env.FRAMES_WORK = work;
  cpSync(repoPath('registry'), file('registry'), { recursive: true });
  mkdirSync(file('docs'));
  writeFileSync(file('docs/guia.md'), '# Guía\n\nLos gates humanos se aprueban en la terminal.\n');
  writeFileSync(file('CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n');
  git('init', '-q');
  git('add', '-A');
  git('commit', '-qm', 'base');
});
afterAll(() => {
  delete process.env.FRAMES_WORK;
  rmSync(work, { recursive: true, force: true });
  rmSync(repo, { recursive: true, force: true });
});

describe('meta.maintain', () => {
  it('refuses a change that touches a file outside its work order or exceeds its budget', async () => {
    expect(compare('meta.maintain', 'frames-os')).toMatchObject({ verdict: 'superset' });
    run = startRun(reg, 'meta.maintain', { repo }).id;
    writeFileSync(file('suelto.md'), 'sin commit\n');
    await next('blocked', 'M00');
    rmSync(file('suelto.md'));
    await next('done', 'M00');
    await next('needs_input', 'M01');
    const req = JSON.parse(readFileSync(path.join(CASE, 'maintenance-request.json'), 'utf8'));
    writeFileSync(
      artifactPath(run, 'maintenance-request', 'maintenance-request-v1'),
      JSON.stringify({ ...req, expected_outcome: undefined }),
    );
    expect((await nextStep(reg, run)).note).toMatch(/¿Qué resultado observable confirmará el cambio\?/);
    author('maintenance-request', 'json');
    await next('done', 'M01');
    await next('needs_input', 'M02');
    // Frames' limit: more than 12 files is refused before anyone edits anything.
    const order = JSON.parse(readFileSync(path.join(CASE, 'work-order.json'), 'utf8'));
    const big = Array.from({ length: 13 }, (_, i) => `docs/f${i}.md`);
    const tooBig = {
      ...order,
      write_set: big,
      expected_outputs: big,
      budget: { ...order.budget, target_files: 13, max_files: 13 },
    };
    expect(maintain.schemas['work-order-v1']!(JSON.stringify(tooBig))).toMatch(/write_set/);
    author('work-order', 'json');
    await next('awaiting_gate', 'M02');
    approve(reg, run, 'direction');
    await next('done', 'M02');
    await next('needs_input', 'M03');
    writeFileSync(
      artifactPath(run, 'implementation-notes'),
      '# Notas\n\nGate review-legal agregado y documentado.\n',
    );
    appendFileSync(
      file('registry/gates.yml'),
      '  - id: review-legal\n    kind: human\n    checkpoint: null\n    summary: Revisión legal de claims regulados.\n',
    );
    appendFileSync(file('docs/guia.md'), '\nUsa `review-legal` cuando la pieza tenga claims regulados.\n');
    appendFileSync(file('CHANGELOG.md'), '\n- Gate `review-legal` para claims regulados.\n');
    writeFileSync(file('notas.md'), 'borrador que no está en la orden\n');
    await next('done', 'M03');
    expect((await next('needs_input', 'M04')).note).toMatch(/fuera del write set: notas\.md/);
    rmSync(file('notas.md'));
    // The budget is the order's, not a default: 40 lines is the ceiling this order set.
    const churned = [
      { path: 'docs/guia.md', added: 41, removed: 0, deleted: false },
      ...['CHANGELOG.md', 'registry/gates.yml'].map((p) => ({
        path: p,
        added: 1,
        removed: 0,
        deleted: false,
      })),
    ];
    expect(checkDiff(order, churned).join()).toMatch(/43 líneas de cambio > max_churn 40/);
    await next('awaiting_gate', 'M04');
  }, 60_000);

  it('closes documentation only when the required docs changed and the inventory drift is in the changelog', async () => {
    approve(reg, run, 'acceptance');
    await next('done', 'M04');
    const r = await next('done', 'M05');
    expect(r.note).toMatch(/inventario: \+1/);
    const delta = JSON.parse(readFileSync(artifactPath(run, 'inventory-delta', 'json'), 'utf8'));
    expect(delta.added).toEqual(['GATE:review-legal']);
    const order = JSON.parse(readFileSync(path.join(CASE, 'work-order.json'), 'utf8'));
    expect(docsProblems(order, ['registry/gates.yml', 'docs/guia.md'], delta)).toEqual([
      'CHANGELOG_COMPATIBILITY sin actualizar: CHANGELOG.md',
      'el inventario cambió (1) y CHANGELOG.md no',
    ]);
  });

  it('hands off a candidate bound to its sha and refuses one edited after verify', async () => {
    const guia = readFileSync(file('docs/guia.md'));
    appendFileSync(file('docs/guia.md'), 'otra línea después de verificar\n');
    expect((await next('needs_input', 'M06')).note).toMatch(/cambió desde M04/);
    writeFileSync(file('docs/guia.md'), guia);
    await next('awaiting_gate', 'M06');
    const handoff = JSON.parse(readFileSync(artifactPath(run, 'handoff', 'json'), 'utf8'));
    const verify = JSON.parse(readFileSync(artifactPath(run, 'verify', 'json'), 'utf8'));
    expect(handoff.candidate_sha256).toBe(verify.candidate_sha256);
    expect(handoff.files).toEqual(['CHANGELOG.md', 'docs/guia.md', 'registry/gates.yml']);
    expect(verify.doctor.find((c: { id: string }) => c.id === 'registry').status).toBe('pass');
  });
});
