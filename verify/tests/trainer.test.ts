import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { loadTokens, parseDeck } from '../../domains/deck/index.ts';
import { renderDeck } from '../../domains/deck/render.ts';
import { renderPlaybook } from '../../domains/deck/playbook.ts';
import { PromptsV1, renderLibrary } from '../../domains/content/prompts.ts';
import { CourseV1, courseGate, loadCourse, trainer } from '../../domains/trainer/index.ts';
import { repoPath } from '../../engine/paths.ts';
import { loadRegistry } from '../../engine/registry.ts';
import { compare } from '../parity/compare.ts';

const CASE = repoPath('verify/parity/cases/trainer/frames-os');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'frames-trainer-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

// A run dir whose artifacts are the sample course, plus the step's declared outputs.
function ctxFor(stepId: string) {
  const run = mkdtempSync(path.join(tmp, 'run-'));
  cpSync(CASE, path.join(run, 'artifacts'), { recursive: true });
  const step = loadRegistry()
    .families.find((f) => f.id === 'trainer')!
    .steps.find((x) => x.id === stepId)!;
  const ext: Record<string, string> = { html: '.html', json: '.json', pdf: '.pdf' };
  return {
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
}

describe('trainer', () => {
  it('holds every artifact to Frames Trainer OS limits and rejects each broken one', () => {
    expect(loadCourse(CASE).errs).toEqual([]);
    expect(compare('trainer', 'frames-os')).toMatchObject({ verdict: 'superset' });
  });

  it('does not build before the person picks one of the two directions', async () => {
    const course = CourseV1.parse(YAML.parse(readFileSync(path.join(CASE, 'course.yml'), 'utf8')));
    delete course.design.chosen;
    expect(courseGate(course, true).join()).toMatch(/H01/);
    const ctx = ctxFor('T02');
    writeFileSync(path.join(ctx.runDir, 'artifacts', 'course.yml'), YAML.stringify(course));
    const r = await trainer.handlers['trainer.build']!(ctx);
    expect(r.status).toBe('needs_input');
    expect(r.note).toMatch(/elige una de las dos direcciones/);
  });

  it('runs the benchmark with four measured dimensions and a signed one', async () => {
    const ctx = ctxFor('T04');
    const a = (f: string) => path.join(ctx.runDir, 'artifacts', f);
    const t = loadTokens();
    const deck = (f: string) => parseDeck(readFileSync(a(f), 'utf8'));
    writeFileSync(a('landing-html.html'), renderPlaybook(deck('landing.yml'), t));
    writeFileSync(a('masterclass-html.html'), renderDeck(deck('masterclass.yml'), t));
    writeFileSync(
      a('workbook-html.html'),
      renderPlaybook(deck('trainer-workbook.yml'), t, { workbook: true }),
    );
    writeFileSync(a('playbook-html.html'), renderPlaybook(deck('trainer-playbook.yml'), t));
    writeFileSync(
      a('prompts-html.html'),
      renderLibrary(PromptsV1.parse(YAML.parse(readFileSync(a('trainer-prompts.yml'), 'utf8'))), t),
    );
    writeFileSync(a('build-report.md'), '# Build del curso\n\n- ok: todo verificado\n');
    const asked = await trainer.handlers['trainer.benchmark']!(ctx);
    expect(asked.status).toBe('needs_input'); // the pedagogy review is a person's
    writeFileSync(
      a('pedagogy-review.md'),
      '# Revisión pedagógica\n\nscore: 4\n\nLos módulos siguen el resultado declarado.\n',
    );
    const done = await trainer.handlers['trainer.benchmark']!(ctx);
    expect(done, done.note).toMatchObject({ status: 'done' });
    const b = JSON.parse(readFileSync(a('benchmark.json'), 'utf8')) as {
      executed: boolean;
      dims: Record<string, { pass: boolean }>;
    };
    expect(b.executed).toBe(true);
    expect(Object.keys(b.dims).sort()).toEqual([
      'accessibility',
      'brandEditorial',
      'pedagogy',
      'privacy',
      'structure',
    ]);
    // A private address in a source fails the privacy dimension.
    const course = readFileSync(a('course.yml'), 'utf8');
    writeFileSync(a('course.yml'), course.replace('meta:', 'meta:\n  # contacto: persona@example.com'));
    expect((await trainer.handlers['trainer.benchmark']!(ctx)).note).toMatch(/no pasan privacy/);
  });
});
