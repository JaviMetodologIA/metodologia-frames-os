import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, cpSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { invariants, loadRegistry } from '../../engine/registry.ts';
import { handlers, schemas } from '../../engine/handlers.ts';
import {
  EXT,
  approvalPath,
  approve,
  artifactPath,
  capsule,
  nextStep,
  runDir,
  startRun,
} from '../../engine/run.ts';
import { within } from '../../engine/paths.ts';

const FIXTURE = path.join(import.meta.dirname, 'fixtures/registry-echo');
const known = { handlers: handlers.keys(), schemas: schemas.keys() };
let work: string;

beforeEach(() => {
  work = mkdtempSync(path.join(os.tmpdir(), 'frames-work-'));
  process.env.FRAMES_WORK = work;
});
afterEach(() => {
  rmSync(work, { recursive: true, force: true });
  delete process.env.FRAMES_WORK;
});

const echo = () => loadRegistry(FIXTURE);
const write = (runId: string, output: string, body = `# ${output}\n\ncontenido real\n`) => {
  mkdirSync(path.dirname(artifactPath(runId, output)), { recursive: true });
  writeFileSync(artifactPath(runId, output), body);
};

describe('registry', () => {
  it('the real registry loads with no red invariant', () => {
    const f = invariants(loadRegistry(), known);
    expect(f.filter((x) => x.level === 'red')).toEqual([]);
  });

  it('a handler with no code is red: declared must be executed', () => {
    const reg = echo();
    const fam = reg.families[0]!;
    fam.steps[0] = { ...fam.steps[0]!, handler: 'ghost' };
    expect(invariants(reg, known).some((x) => x.level === 'red' && /ghost/.test(x.msg))).toBe(true);
  });

  it('an external effect without a human gate before it is red', () => {
    const reg = echo();
    const fam = reg.families[0]!;
    fam.steps = [{ ...fam.steps[1]!, effect: 'external' }];
    expect(invariants(reg, known).some((x) => /external effect/.test(x.msg))).toBe(true);
  });

  it('a family file must be named after its id', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'frames-reg-'));
    cpSync(FIXTURE, dir, { recursive: true });
    writeFileSync(path.join(dir, 'families/otro.yml'), readFileSync(path.join(FIXTURE, 'families/echo.yml')));
    expect(() => loadRegistry(dir)).toThrow(/file name must be/);
    rmSync(dir, { recursive: true, force: true });
  });

  it('a new run already has the artifacts dir the host writes into', () => {
    const run = startRun(echo(), 'echo');
    expect(existsSync(path.join(runDir(run.id), 'artifacts'))).toBe(true);
  });

  it('every run event rewrites the session record a new session reads first', () => {
    const run = startRun(echo(), 'echo');
    const session = JSON.parse(readFileSync(path.join(work, 'session.json'), 'utf8'));
    expect(session).toMatchObject({ run: run.id, active_feature: 'echo', turns: 1, last_gate: null });
  });

  it('every output schema the handlers read as a file maps to that file extension', () => {
    // The handlers open artifacts/<id>.<ext> by these extensions: a markdown default here
    // would ask the host for storyboard.md while the renderer reads storyboard.yml.
    const want: Record<string, string> = {
      'deck-v1': '.yml',
      'carousel-v1': '.yml',
      'prompts-v1': '.yml',
      'storyboard-v1': '.yml',
      mp4: '.mp4',
      vtt: '.vtt',
      json: '.json',
      'notebook-intent-v1': '.json',
      'notebook-profile-v1': '.json',
      'notebook-plan-draft': '.json',
      'studio-brief-v1': '.json',
    };
    for (const [schema, ext] of Object.entries(want)) expect(EXT[schema], schema).toBe(ext);
    const used = new Set(
      loadRegistry().families.flatMap((f) => f.steps.flatMap((s) => s.outputs.map((o) => o.schema))),
    );
    const text = new Set(['markdown', 'html', 'frames-brief-v1', 'deliverable-v1']);
    for (const schema of used)
      if (!text.has(schema)) expect(EXT[schema], `${schema} sin extensión declarada`).toBeDefined();
  });

  it('a planned family cannot start', () => {
    // Any family marked planned refuses to start, whichever families are still planned.
    const reg = loadRegistry();
    reg.families[0] = { ...reg.families[0]!, status: 'planned' };
    expect(() => startRun(reg, reg.families[0]!.id)).toThrow(/FAMILY-PLANNED/);
  });
});

describe('run lifecycle', () => {
  it('start → needs_input → gate → approve → skip by predicate → hard stop', async () => {
    const reg = echo();
    const run = startRun(reg, 'echo');
    let r = await nextStep(reg, run.id);
    expect(r).toMatchObject({ step: 'E01', status: 'needs_input' });
    write(run.id, 'note');
    r = await nextStep(reg, run.id);
    expect(r).toMatchObject({ step: 'E01', status: 'awaiting_gate', gate: 'direction' });
    expect((await nextStep(reg, run.id)).status).toBe('awaiting_gate');
    approve(reg, run.id, 'direction');
    r = await nextStep(reg, run.id);
    expect(r).toMatchObject({ step: 'E01', status: 'done' });
    r = await nextStep(reg, run.id); // E02 skipped (no `extra` fact), E03 asks for its output
    expect(r).toMatchObject({ step: 'E03', status: 'needs_input' });
    write(run.id, 'final');
    expect((await nextStep(reg, run.id)).status).toBe('awaiting_gate');
    expect((await nextStep(reg, run.id)).status).toBe('hard_stop');
    expect(() => approve(reg, run.id, 'publish')).toThrow(/NOT-HUMAN-GATE/);
    expect(capsule(reg, run.id).length / 4).toBeLessThanOrEqual(1800);
  });

  it('an output that fails its schema is not accepted', async () => {
    const reg = echo();
    const run = startRun(reg, 'echo');
    await nextStep(reg, run.id);
    write(run.id, 'note', 'TODO: completar\n');
    expect(await nextStep(reg, run.id)).toMatchObject({ status: 'needs_input' });
  });

  it('approval is one-use, bound to artifact shas, and cannot be forged', async () => {
    const reg = echo();
    const run = startRun(reg, 'echo');
    await nextStep(reg, run.id);
    write(run.id, 'note');
    await nextStep(reg, run.id);

    // forged: a hand-written token with made-up shas
    const file = approvalPath(run.id, 'direction');
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(
      file,
      JSON.stringify({
        gate: 'direction',
        step: 'E01',
        artifact_shas: { note: 'f'.repeat(64) },
        nonce: 'x',
        consumed: false,
      }),
    );
    expect((await nextStep(reg, run.id)).status).toBe('awaiting_gate');

    // stale: approved, then the artifact changes
    approve(reg, run.id, 'direction');
    write(run.id, 'note', '# note\n\notro contenido\n');
    expect((await nextStep(reg, run.id)).status).toBe('awaiting_gate'); // step reopened and re-validated
    expect((await nextStep(reg, run.id)).note).toMatch(/cambiaron/); // the old approval never passes

    // valid, then reused
    approve(reg, run.id, 'direction');
    expect((await nextStep(reg, run.id)).status).toBe('done');
    const tok = JSON.parse(readFileSync(file, 'utf8')) as { consumed: boolean };
    expect(tok.consumed).toBe(true);
  });

  it('a step waits for its inputs', async () => {
    const reg = echo();
    const fam = reg.families[0]!;
    fam.steps = [fam.steps[2]!];
    const run = startRun(reg, 'echo');
    expect(await nextStep(reg, run.id)).toMatchObject({ status: 'blocked' });
  });
});

describe('paths', () => {
  it('refuses to escape its base', () => {
    expect(() => within('/tmp/base', '../etc/passwd')).toThrow(/PATH-ESCAPE/);
    expect(() => runDir('../../x')).toThrow(/RUN-ID-INVALID/);
  });
});

describe('fixture is honest', () => {
  it('the echo fixture is not in the real registry', () => {
    expect(loadRegistry().families.some((f) => f.id === 'echo')).toBe(false);
    expect(YAML.parse(readFileSync(path.join(FIXTURE, 'families/echo.yml'), 'utf8')).status).toBe('active');
  });
});
