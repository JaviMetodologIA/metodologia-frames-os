import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadRegistry } from '../../engine/registry.ts';
import { route } from '../../engine/classify.ts';
import {
  AULA_KINDS,
  digest,
  loadAulaCatalog,
  type AulaKind,
  type Edition,
} from '../../engine/aula/catalog.ts';
import { aulaBuild } from '../../engine/aula/bridge.ts';
import { approve, approvalPath, artifactPath, nextStep, runDir, startRun } from '../../engine/run.ts';
import { repoPath } from '../../engine/paths.ts';
import { createFramesBriefMarkdown, type FramesBriefDraftV1 } from '../../domains/content/brief/model.ts';
import type { FramesBriefV1 } from '../../domains/content/brief/schema.ts';
import { AulaReceipt, receiptCheck } from '../../domains/aula/index.ts';

const reg = loadRegistry();
const CASE = JSON.parse(
  readFileSync(repoPath('verify/parity/cases/content.piece/brief-basic/input.json'), 'utf8'),
) as { draft: FramesBriefDraftV1; sections: FramesBriefV1['sections'] };
const requests: Record<AulaKind, string> = {
  'immersive-class': 'prepara una clase inmersiva para presentar en una sesión',
  masterclass: 'explica conceptos en una masterclass dinámica de Aula',
  workbook: 'crea un workbook dinámico con campos editables para practicar',
  'lean-coffee': 'organiza un Lean Coffee con temporizador y revelado',
  playbook: 'crea un playbook dinámico de procedimientos',
  'playbook-immersive': 'crea un playbook inmersivo para explorar procedimientos',
  index: 'construye un índice dinámico de recursos de Aula',
  module: 'construye un módulo completo de Aula con recursos y ejercicios',
  'dynamic-commercial-decks': 'crea un deck comercial de prospección',
};
let work: string;
beforeEach(() => {
  work = mkdtempSync(path.join(os.tmpdir(), 'frames-aula-test-'));
  process.env.FRAMES_WORK = work;
});
afterEach(() => {
  rmSync(work, { recursive: true, force: true });
  delete process.env.FRAMES_WORK;
  delete process.env.FRAMES_PYTHON;
});
const put = (id: string, output: string, body: string, schema = 'markdown') =>
  writeFileSync(artifactPath(id, output, schema), body);
const doc = (title: string) => `# ${title}\n\nContenido revisable y verificable.\n`;

function sourceFor(kind: AulaKind, edition: Edition): Record<string, any> {
  const entry = loadAulaCatalog().capabilities.find((s) => s.kind === kind && s.edition === edition)!;
  const source = JSON.parse(readFileSync(repoPath(entry.source, 'examples/input.json'), 'utf8')) as Record<
    string,
    any
  >;
  if (kind === 'dynamic-commercial-decks') {
    source.mode = 'comercial';
    source.deckType = 'simple';
  }
  return source;
}

async function toSpec(kind: AulaKind, edition: Edition = 'metodologia') {
  const request = requests[kind] + (edition === 'white-label' ? ' en marca blanca' : '');
  const family = kind === 'dynamic-commercial-decks' ? 'deck.immersive' : 'aula';
  expect(route(reg, request)).toMatchObject({
    kind: 'family',
    family,
    capability: { kind, edition, renderer: 'frames-aula' },
  });
  const run = startRun(reg, family, { request });
  expect(run.facts).toMatchObject({ edition, aula_format: kind, renderer: 'frames-aula' });
  expect((await nextStep(reg, run.id)).status).toBe('needs_input');
  put(
    run.id,
    'brief',
    createFramesBriefMarkdown(
      {
        ...CASE.draft,
        sources: [],
        intent: { ...CASE.draft.intent, request, request_hash: digest(request) },
      },
      CASE.sections,
    ),
  );
  put(run.id, 'ab-concepts-v1', doc('Conceptos'));
  put(run.id, 'definition-of-ready-v1', doc('Preparación'));
  expect(await nextStep(reg, run.id)).toMatchObject({ status: 'awaiting_gate', gate: 'direction' });
  approve(reg, run.id, 'direction');
  expect((await nextStep(reg, run.id)).status).toBe('done');
  if (kind === 'dynamic-commercial-decks') {
    expect((await nextStep(reg, run.id)).status).toBe('needs_input');
    put(
      run.id,
      'commercial-intake',
      JSON.stringify({
        schema: 'commercial-intake-v1',
        audience: 'Equipo de práctica',
        problem: 'Elegir un experimento',
        decision: 'Acordar un siguiente paso',
        type: 'simple',
        mode: 'comercial',
        edition,
        pillars: [],
      }),
      'commercial-intake-v1',
    );
    expect(await nextStep(reg, run.id)).toMatchObject({ status: 'awaiting_gate', gate: 'outcome' });
    approve(reg, run.id, 'outcome');
    expect((await nextStep(reg, run.id)).status).toBe('done');
  }
  expect((await nextStep(reg, run.id)).status).toBe('needs_input');
  const source = sourceFor(kind, edition);
  if (kind === 'index') {
    const html =
      '<!doctype html><html><head><title>Práctica</title></head><body><h1>Práctica local</h1></body></html>';
    put(run.id, 'practice', html, 'html');
    source.assetFiles = { 'practice.html': digest(html) };
    source.pieces = [{ kind: 'workbook', href: 'practice.html' }];
  }
  put(run.id, 'aula-source', JSON.stringify(source), 'frames-aula-v1');
  return run.id;
}

async function rendered(kind: AulaKind, edition: Edition = 'metodologia') {
  const id = await toSpec(kind, edition);
  expect(await nextStep(reg, id)).toMatchObject({ status: 'awaiting_gate', gate: 'sources-and-spec' });
  approve(reg, id, 'sources-and-spec');
  expect((await nextStep(reg, id)).status).toBe('done');
  const result = await nextStep(reg, id);
  expect(result, result.note).toMatchObject({ status: 'done' });
  return id;
}

describe('Aula native succession', () => {
  it('executes all eighteen edition and format combinations through native human gates', async () => {
    for (const edition of ['metodologia', 'white-label'] as const)
      for (const kind of AULA_KINDS) {
        const id = await rendered(kind, edition);
        const file = artifactPath(id, 'aula-receipt', 'aula-receipt-v1');
        const receipt = AulaReceipt.parse(JSON.parse(readFileSync(file, 'utf8')));
        expect(receipt).toMatchObject({ kind, edition, state: 'RENDERED_DRAFT' });
        expect(receiptCheck(readFileSync(file, 'utf8'), file)).toBeNull();
        const preview = readFileSync(artifactPath(id, 'aula-html', 'html'), 'utf8');
        expect(preview).toContain("default-src 'none'");
        const payload = JSON.parse(/id="payload">([\s\S]*?)<\/script>/.exec(preview)![1]!) as {
          brand: { name: string };
          data: any;
        };
        expect(payload.brand.name).toBe(edition === 'metodologia' ? 'MetodologIA' : 'Tu marca');
        expect(payload.data.sections[1].fields[0].key).toBe('contexto');
        if (kind === 'module') {
          expect(Object.keys(receipt.outputs)).toHaveLength(11);
          expect(payload.data.pieces).toHaveLength(6);
        }
        if (kind === 'index' || kind === 'module')
          for (const piece of payload.data.pieces)
            expect(existsSync(path.join(runDir(id), 'artifacts', piece.href))).toBe(true);
        if (kind !== 'module') {
          const audience = readFileSync(
            path.join(runDir(id), 'artifacts/aula/artifact-audience.html'),
            'utf8',
          );
          const data = JSON.parse(/id="payload">([\s\S]*?)<\/script>/.exec(audience)![1]!) as { data: any };
          expect(data.data.sections[0].notes).toBeUndefined();
        }
        expect((await nextStep(reg, id)).status).toBe('needs_input');
        put(id, 'review-report-v1', doc('Revisión'));
        put(id, 'verdict-v1', 'verdict: PASS\n');
        put(id, 'top5-changes-v1', doc('Sin cambios'));
        expect((await nextStep(reg, id)).status).toBe('done');
        expect(await nextStep(reg, id)).toMatchObject({ status: 'awaiting_gate', gate: 'acceptance' });
        expect((await nextStep(reg, id)).status).toBe('awaiting_gate');
        approve(reg, id, 'acceptance');
        expect((await nextStep(reg, id)).status).toBe('done');
        expect((await nextStep(reg, id)).status).toBe('complete');
      }
  }, 120_000);

  it('keeps deck-v1, NotebookLM and Trainer on their historical paths', () => {
    for (const [request, kind] of [
      ['crea un material para practicar', 'workbook'],
      ['necesito enseñar conceptos', 'masterclass'],
      ['prepara una sesión presentada', 'immersive-class'],
      ['arma un kit completo', 'module'],
    ])
      expect(route(reg, request!)).toMatchObject({ family: 'aula', capability: { kind } });
    expect(route(reg, 'crea una presentación html animada para la clase')).toMatchObject({
      family: 'deck.immersive',
    });
    expect(startRun(reg, 'deck.immersive').facts.renderer).toBeUndefined();
    expect(
      route(reg, 'sube estas fuentes a un cuaderno de notebooklm y prepara una guía de estudio'),
    ).toMatchObject({ family: 'nlm' });
    expect(startRun(reg, 'trainer', { request: 'curso de tres módulos' }).facts.renderer).toBeUndefined();
    expect(() => startRun(reg, 'aula', { edition: 'invalid' })).toThrow();
    expect(() => startRun(reg, 'aula', { aula_format: 'dynamic-commercial-decks' })).toThrow(/FAMILY-FORMAT/);
  });

  it('a host-authored score cannot approve the human specification gate', async () => {
    const id = await toSpec('workbook');
    put(
      id,
      'aula-source',
      JSON.stringify({ ...sourceFor('workbook', 'metodologia'), score: 10, human_approved: true }),
      'frames-aula-v1',
    );
    expect((await nextStep(reg, id)).status).toBe('awaiting_gate');
    expect((await nextStep(reg, id)).status).toBe('awaiting_gate');
    expect(existsSync(path.join(runDir(id), 'artifacts/aula'))).toBe(false);
  });

  it('rejects missing or stale direction and specification approvals before rendering', async () => {
    for (const failure of ['missing', 'stale'] as const) {
      const id = await toSpec('masterclass');
      await nextStep(reg, id);
      approve(reg, id, 'sources-and-spec');
      await nextStep(reg, id);
      if (failure === 'missing') rmSync(approvalPath(id, 'direction'));
      else
        put(
          id,
          'aula-source',
          JSON.stringify({ ...sourceFor('masterclass', 'metodologia'), title: 'Contenido nuevo' }),
          'frames-aula-v1',
        );
      expect(await nextStep(reg, id)).toMatchObject({ status: 'blocked' });
      expect(existsSync(path.join(runDir(id), 'artifacts/aula'))).toBe(false);
    }
  });

  it('rejects facts without provenance, placeholders, invalid brands and broken links', async () => {
    const probes: [AulaKind, Edition, (source: Record<string, any>) => void][] = [
      [
        'workbook',
        'metodologia',
        (s) => {
          s.facts = [{ id: 'x', claim: 'Afirmación sin fuente' }];
        },
      ],
      [
        'workbook',
        'metodologia',
        (s) => {
          s.sections[0].body = 'TODO completar';
        },
      ],
      [
        'workbook',
        'white-label',
        (s) => {
          s.brand = { name: 'Ejemplo', colors: { gold: 'invalid' } };
        },
      ],
      [
        'index',
        'metodologia',
        (s) => {
          s.pieces = [{ kind: 'workbook', href: 'missing.html' }];
        },
      ],
      [
        'workbook',
        'metodologia',
        (s) => {
          s.assetFiles = { '../escape.html': 'a'.repeat(64) };
        },
      ],
    ];
    for (const [kind, edition, mutate] of probes) {
      const id = await toSpec(kind, edition);
      const source = sourceFor(kind, edition);
      mutate(source);
      put(id, 'aula-source', JSON.stringify(source), 'frames-aula-v1');
      expect((await nextStep(reg, id)).status).toBe('blocked');
      expect(existsSync(path.join(runDir(id), 'artifacts/aula'))).toBe(false);
    }
  });

  it('a changed module sibling blocks acceptance even when its receipt is unchanged', async () => {
    const id = await rendered('module');
    await nextStep(reg, id);
    put(id, 'review-report-v1', doc('Revisión'));
    put(id, 'verdict-v1', 'verdict: PASS\n');
    put(id, 'top5-changes-v1', doc('Sin cambios'));
    await nextStep(reg, id);
    expect((await nextStep(reg, id)).status).toBe('awaiting_gate');
    approve(reg, id, 'acceptance');
    writeFileSync(path.join(runDir(id), 'artifacts/aula/workbook.html'), 'altered');
    expect(await nextStep(reg, id)).toMatchObject({ status: 'awaiting_gate' });
    expect((await nextStep(reg, id)).note).toMatch(/receipt invalid/);
  });

  it('rejects catalog tampering and reports a missing Python sensor as a gap', () => {
    const catalog = loadAulaCatalog();
    catalog.capabilities[0]!.files['SKILL.md'] = 'f'.repeat(64);
    const file = path.join(work, 'catalog.json');
    writeFileSync(file, JSON.stringify(catalog));
    expect(() => loadAulaCatalog(file)).toThrow(/HASH-MISMATCH/);
    process.env.FRAMES_PYTHON = path.join(work, 'missing-python');
    expect(() =>
      aulaBuild(JSON.stringify(sourceFor('workbook', 'metodologia')), 'workbook', 'metodologia'),
    ).toThrow(/SENSOR-GAP/);
  });

  it('does not write a generated bundle through a symlink outside the run', async () => {
    const id = await toSpec('workbook');
    await nextStep(reg, id);
    approve(reg, id, 'sources-and-spec');
    await nextStep(reg, id);
    symlinkSync(work, path.join(runDir(id), 'artifacts/aula'));
    expect((await nextStep(reg, id)).status).toBe('blocked');
    expect(existsSync(path.join(work, 'artifact.html'))).toBe(false);
  });
});
