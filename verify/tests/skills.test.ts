import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installExtension } from '../../engine/extend.ts';
import { repoPath } from '../../engine/paths.ts';
import { loadRegistry } from '../../engine/registry.ts';
import {
  approve,
  artifactPath,
  holds,
  nextStep,
  runDir,
  startRun,
  type NextResult,
} from '../../engine/run.ts';
import { skills, staticFindings } from '../../domains/skills/index.ts';
import { evaluateSkillRunV1 } from '../../domains/skills/frames/skill-systems/governance.ts';
import { compare } from '../parity/compare.ts';

const CASE = repoPath('verify/parity/cases/skills.build/frames-os');
const sha = (b: string | Buffer) => createHash('sha256').update(b).digest('hex');
let work: string;
let repo: string;
beforeEach(() => {
  work = mkdtempSync(path.join(os.tmpdir(), 'frames-skills-work-'));
  repo = mkdtempSync(path.join(os.tmpdir(), 'frames-skills-repo-'));
  process.env.FRAMES_WORK = work;
});
afterEach(() => {
  delete process.env.FRAMES_WORK;
  rmSync(work, { recursive: true, force: true });
  rmSync(repo, { recursive: true, force: true });
});

const reg = loadRegistry();
const schemaOf = (out: string) =>
  reg.families
    .find((f) => f.id === 'skills.build')!
    .steps.flatMap((s) => s.outputs)
    .find((o) => o.id === out)!.schema;
// The host's part of a step: copy the case file to where the engine asked for it.
const author = (
  run: string,
  out: string,
  file = `${out}${path.extname(artifactPath(run, out, schemaOf(out)))}`,
) => cpSync(path.join(CASE, file), artifactPath(run, out, schemaOf(out)));
const next = async (run: string, want: NextResult['status'], step: string) => {
  const r = await nextStep(reg, run);
  expect({ step: r.step, status: r.status, note: r.note }).toMatchObject({ step, status: want });
  return r;
};

describe('skills.build', () => {
  it('scores each eval case with the engine classifier and applies the Frames verdict rule', async () => {
    expect(compare('skills.build', 'frames-os')).toMatchObject({ verdict: 'superset' });
    const run = startRun(reg, 'skills.build', { track: 'system', repo }).id;
    await next(run, 'needs_input', 'S00');
    author(run, 'skill-system-case-v1');
    await next(run, 'awaiting_gate', 'S00');
    approve(reg, run, 'sources-and-spec');
    await next(run, 'done', 'S00');
    await next(run, 'needs_input', 'S01');
    author(run, 'demotion-input');
    author(run, 'discovery-report');
    await next(run, 'done', 'S01');
    await next(run, 'needs_input', 'S02');
    author(run, 'capability-map-v1');
    author(run, 'architecture-decision-v1');
    await next(run, 'awaiting_gate', 'S02');
    approve(reg, run, 'direction');
    await next(run, 'done', 'S02');
    await next(run, 'needs_input', 'S03');
    author(run, 'component-contract-v1');
    author(run, 'skill-eval-plan');
    await next(run, 'done', 'S03');
    await next(run, 'needs_input', 'S04');
    author(run, 'skill-candidate');
    author(run, 'authoring-handoff');
    await next(run, 'done', 'S04');
    await next(run, 'done', 'S05');
    const s06 = await next(run, 'done', 'S06');
    expect(s06.note).toMatch(/^PASS: candidato 4\/5 frente a base 2\/5/);
    // The candidate misses one held-out positive: the classifier scores, it does not flatter.
    const evalRun = JSON.parse(readFileSync(artifactPath(run, 'skill-eval-run-v1', 'json'), 'utf8')) as {
      cases: { eval_case_id: string; candidate_pass: boolean; baseline_pass: boolean }[];
    };
    expect(evalRun.cases.find((c) => c.eval_case_id === 'POS-03')?.candidate_pass).toBe(false);
    // Frames' rule, not a threshold of our own: too few eligible cases is UNKNOWN, a tie is REVISE.
    const unknown = evaluateSkillRunV1({
      ...evalRun,
      coverage_policy: { minimum_eligible_cases: 6, maximum_infrastructure_failure_ratio: 0 },
    });
    expect(unknown.verdict).toBe('UNKNOWN');
    const tie = evaluateSkillRunV1({
      ...evalRun,
      cases: evalRun.cases.map((c) => ({ ...c, candidate_pass: c.baseline_pass })),
    });
    expect(tie.verdict).toBe('REVISE');
    // S07: an authored review that names another sha does not pass.
    const cand = sha(readFileSync(artifactPath(run, 'skill-candidate', 'skill-md-v1')));
    for (const out of ['skill-review-report-v1', 'skill-change-proposal-v1'])
      writeFileSync(
        artifactPath(run, out, schemaOf(out)),
        readFileSync(path.join(CASE, `${out}.json`), 'utf8').replace('SHA_DEL_CANDIDATO', 'a'.repeat(64)),
      );
    await next(run, 'needs_input', 'S07');
    for (const out of ['skill-review-report-v1', 'skill-change-proposal-v1'])
      writeFileSync(
        artifactPath(run, out, schemaOf(out)),
        readFileSync(path.join(CASE, `${out}.json`), 'utf8').replace('SHA_DEL_CANDIDATO', cand),
      );
    await next(run, 'awaiting_gate', 'S07');
    approve(reg, run, 'acceptance');
    await next(run, 'done', 'S07');
    const s08 = await next(run, 'done', 'S08');
    expect(s08.note).toMatch(/3 aprobaciones/);
    const capsule = JSON.parse(
      readFileSync(artifactPath(run, 'skill-release-capsule-v1', 'json'), 'utf8'),
    ) as {
      files: { ref: string; sha256: string }[];
      approvals: { gate: string }[];
    };
    expect(capsule.approvals.map((a) => a.gate)).toEqual(['sources-and-spec', 'direction', 'acceptance']);
    for (const f of capsule.files) expect(sha(readFileSync(path.join(runDir(run), f.ref)))).toBe(f.sha256);
    await next(run, 'awaiting_gate', 'S09');
    const delta = JSON.parse(readFileSync(artifactPath(run, 'inventory-delta', 'json'), 'utf8'));
    expect(delta).toMatchObject({ added: ['revisor-propuestas'], changed: [] });
  }, 60_000);

  it('rejects a candidate with a private path, an unpinned npx or an effect above its ceiling', () => {
    const md = readFileSync(path.join(CASE, 'skill-candidate.md'), 'utf8');
    expect(staticFindings(md, 'E1', false).findings).toEqual([]);
    const home = ['', 'Us' + 'ers', 'alguien', 'notas.md'].join('/'); // built at run time: no private path in the repo
    expect(staticFindings(`${md}\nVer ${home}\n`, 'E1', false).findings).toContain('ruta local absoluta');
    expect(staticFindings(`${md}\nCorre npx cowsay hola\n`, 'E1', false).findings).toContain(
      'cadena de suministro: npx sin versión fijada',
    );
    expect(staticFindings(`${md}\nCorre npx cowsay@1.6.0 hola\n`, 'E1', false).findings).toEqual([]);
    expect(staticFindings(md, 'E3', true).findings.join()).toMatch(/E3: VALIDATED_NOT_RUNNABLE/);
  });

  it('a request that does not need a skill ends at the demotion decision', async () => {
    const run = startRun(reg, 'skills.build', { track: 'system', repo }).id;
    await next(run, 'needs_input', 'S00');
    author(run, 'skill-system-case-v1');
    await next(run, 'awaiting_gate', 'S00');
    approve(reg, run, 'sources-and-spec');
    await next(run, 'done', 'S00');
    await next(run, 'needs_input', 'S01');
    author(run, 'demotion-input', 'demotion-input-demoted.json');
    author(run, 'discovery-report');
    const r = await next(run, 'done', 'S01');
    expect(r.note).toBe('no hace falta una skill: basta INSTRUCTION');
    expect((await nextStep(reg, run)).status).toBe('complete');
    const s02 = reg.families.find((f) => f.id === 'skills.build')!.steps.find((s) => s.id === 'S02')!;
    expect(holds(s02.when, { track: 'system', demoted: true })).toBe(false);
    expect(Object.keys(skills.handlers)).toContain('skills.demotion');
  });

  it('installs a local extension only after its gate and proves the hash check on a tampered copy', async () => {
    const run = startRun(reg, 'skills.build', { repo }).id;
    await next(run, 'needs_input', 'L00');
    author(run, 'local-extension-brief-v1');
    await next(run, 'awaiting_gate', 'L00');
    approve(reg, run, 'direction');
    await next(run, 'done', 'L00');
    await next(run, 'needs_input', 'L01');
    author(run, 'local-extension-design-v1');
    author(run, 'documentation-impact-plan-v1');
    await next(run, 'done', 'L01');
    await next(run, 'done', 'L02');
    await next(run, 'done', 'L03');
    const probe = JSON.parse(readFileSync(artifactPath(run, 'sandbox-probe-v1', 'json'), 'utf8'));
    expect(probe).toMatchObject({ tamper_detected: true, tamper_reason_codes: ['CONTENT_HASH_MISMATCH'] });
    await next(run, 'awaiting_gate', 'L04');
    expect(() => installExtension(run, repo)).toThrow(/EXTEND-GATE/);
    approve(reg, run, 'acceptance');
    await next(run, 'done', 'L04');
    await next(run, 'needs_input', 'L05');
    // A package edited after its receipt is refused and removed again.
    const doc = path.join(runDir(run), 'local/extensions/revisor/propuestas/documentation.md');
    const original = readFileSync(doc);
    writeFileSync(doc, `${original}\nañadido después del recibo\n`);
    expect(() => installExtension(run, repo)).toThrow(/EXTEND-ACTIVATION: BLOCKED/);
    writeFileSync(doc, original);
    expect(installExtension(run, repo)).toEqual({
      id: 'local.revisor.propuestas',
      ref: 'local/extensions/revisor/propuestas',
    });
    expect(() => installExtension(run, repo)).toThrow(/EXTEND-COLLISION/);
    await next(run, 'awaiting_gate', 'L05');
    const closure = JSON.parse(
      readFileSync(artifactPath(run, 'documentation-closure-receipt-v1', 'json'), 'utf8'),
    );
    expect(closure).toMatchObject({ status: 'PASS', missing: [] });
    expect(closure.sources).toHaveLength(3);
  }, 60_000);
});
