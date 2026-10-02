// Run lifecycle: start a family, advance one step per call, stop at every gate.
// State is run.json + an append-only log.jsonl + approvals/; nothing else.
import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Family, Pred, Registry, Step } from '../registry/schema.ts';
import { checkOutput, handlers, type Facts } from './handlers.ts';
import { within, workDir } from './paths.ts';
import { aulaFacts } from './aula/intent.ts';

export type StepState = {
  id: string;
  status: 'pending' | 'needs_input' | 'skipped' | 'awaiting_gate' | 'done' | 'blocked';
  outputs: { id: string; file: string; sha256: string }[];
  note?: string;
};
export type RunState = { id: string; family: string; facts: Facts; steps: StepState[] };

export const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

export function runDir(id: string): string {
  if (!/^[a-z0-9._-]+$/.test(id)) throw new Error(`RUN-ID-INVALID: ${id}`);
  return within(workDir(), 'runs', id);
}

export function atomicWrite(file: string, data: string | Buffer): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, file);
}

const save = (s: RunState) =>
  atomicWrite(path.join(runDir(s.id), 'run.json'), JSON.stringify(s, null, 2) + '\n');
const log = (s: RunState, entry: object) => {
  const file = path.join(runDir(s.id), 'log.jsonl');
  appendFileSync(file, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
  writeSession(s, file);
};

// work/session.json: the record a new session reads first. Derived from the log of the
// run that moved last, so it cannot disagree with it.
function writeSession(s: RunState, logFile: string): void {
  const events = readFileSync(logFile, 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as { gate?: string });
  const lastGate = [...events].reverse().find((e) => e.gate)?.gate ?? null;
  const pending = s.steps.find((st) => !['done', 'skipped'].includes(st.status));
  atomicWrite(
    path.join(workDir(), 'session.json'),
    JSON.stringify(
      {
        run: s.id,
        active_feature: s.family,
        turns: events.length,
        last_gate: lastGate,
        next_step: pending ? `${pending.id} (${pending.status})` : null,
      },
      null,
      2,
    ) + '\n',
  );
}

export function loadRun(id: string): RunState {
  const file = path.join(runDir(id), 'run.json');
  if (!existsSync(file)) throw new Error(`RUN-NOT-FOUND: ${id}`);
  return JSON.parse(readFileSync(file, 'utf8')) as RunState;
}

export function holds(pred: Pred | undefined, facts: Facts): boolean {
  if (!pred) return true;
  if ('fact' in pred) return facts[pred.fact] === pred.eq;
  if ('all' in pred) return pred.all.every((p) => holds(p, facts));
  if ('any' in pred) return pred.any.some((p) => holds(p, facts));
  return !holds(pred.not, facts);
}

function family(reg: Registry, id: string): Family {
  const fam = reg.families.find((f) => f.id === id);
  if (!fam) throw new Error(`FAMILY-UNKNOWN: ${id}`);
  return fam;
}

export function startRun(reg: Registry, familyId: string, facts: Facts = {}): RunState {
  const fam = family(reg, familyId);
  if (fam.status !== 'active')
    throw new Error(`FAMILY-PLANNED: ${fam.id} llega en la ola ${fam.wave}; todavía no ejecuta`);
  const id = `${fam.id}-${randomUUID().slice(0, 8)}`;
  const state: RunState = {
    id,
    family: fam.id,
    facts: aulaFacts(familyId, facts),
    steps: fam.steps.map((s) => ({ id: s.id, status: 'pending', outputs: [] })),
  };
  // artifacts/ exists from the start: the host writes there when a step asks for input.
  mkdirSync(path.join(runDir(id), 'artifacts'), { recursive: true });
  save(state);
  log(state, { event: 'start', family: fam.id, facts });
  return state;
}

// The file extension follows the output's schema (an HTML twin is a real .html file);
// anything not listed is markdown.
export const EXT: Record<string, string> = {
  html: '.html',
  json: '.json',
  'deck-v1': '.yml',
  'carousel-v1': '.yml',
  'prompts-v1': '.yml',
  'storyboard-v1': '.yml',
  mp4: '.mp4',
  vtt: '.vtt',
  'notebook-intent-v1': '.json',
  'notebook-profile-v1': '.json',
  'notebook-plan-draft': '.json',
  'studio-brief-v1': '.json',
  'course-v1': '.yml',
  pdf: '.pdf',
  docx: '.docx',
  'evidence-bank-v1': '.json',
  'career-cv-v2': '.json',
  'career-letter-v1': '.json',
  'local-extension-brief-v1': '.json',
  'documentation-impact-plan-v1': '.json',
  'skill-system-case-v1': '.json',
  'demotion-input-v1': '.json',
  'capability-map-v1': '.json',
  'skill-architecture-decision-v1': '.json',
  'skill-component-contract-v1': '.json',
  'skill-eval-plan-v1': '.json',
  'skill-review-report-v1': '.json',
  'skill-change-proposal-v1': '.json',
  'maintenance-request-v1': '.json',
  'work-order-v1': '.json',
  'skill-md-v1': '.md',
  'frames-aula-v1': '.json',
  'aula-build-bindings-v1': '.json',
  'commercial-intake-v1': '.json',
  'aula-receipt-v1': '.json',
};
export const artifactPath = (id: string, output: string, schema = 'markdown') =>
  path.join(runDir(id), 'artifacts', `${output}${EXT[schema] ?? '.md'}`);

// Shas of what a gate approves: the outputs of the step that waits on it, re-read
// from disk so any edit after approval invalidates the token.
export function currentShas(s: RunState, stepId: string): Record<string, string> {
  const st = s.steps.find((x) => x.id === stepId);
  return Object.fromEntries(
    (st?.outputs ?? []).map((o) => [o.id, existsSync(o.file) ? sha256(readFileSync(o.file)) : 'MISSING']),
  );
}

export type NextResult = {
  run: RunState;
  step?: string;
  status: StepState['status'] | 'complete' | 'hard_stop';
  note: string;
  gate?: string;
};

export async function nextStep(reg: Registry, runId: string): Promise<NextResult> {
  const s = loadRun(runId);
  const fam = family(reg, s.family);
  writeSession(s, path.join(runDir(s.id), 'log.jsonl')); // a call to next is a turn, even at a gate
  for (const [i, st] of s.steps.entries()) {
    if (st.status === 'done' || st.status === 'skipped') continue;
    const step = fam.steps[i] as Step;
    if (st.status === 'awaiting_gate') {
      // An artifact edited while waiting at its gate sends the step back through its
      // handler (re-validate, re-render); any approval issued before stops matching.
      const recorded = Object.fromEntries(st.outputs.map((o) => [o.id, o.sha256]));
      if (JSON.stringify(recorded) === JSON.stringify(currentShas(s, st.id)))
        return gateCheck(reg, s, st, step);
      log(s, { event: 'reopen', step: step.id, reason: 'artifact changed while awaiting gate' });
    }
    if (!holds(step.when, s.facts)) {
      st.status = 'skipped';
      save(s);
      log(s, { event: 'skip', step: step.id });
      continue;
    }
    return execute(s, st, step);
  }
  return { run: s, status: 'complete', note: 'todos los pasos terminados' };
}

async function execute(s: RunState, st: StepState, step: Step): Promise<NextResult> {
  const dir = runDir(s.id);
  const produced = new Map(s.steps.flatMap((x) => x.outputs.map((o) => [o.id, o.file] as const)));
  const missingInputs = step.inputs.filter((i) => !produced.has(i));
  if (missingInputs.length) {
    st.status = 'blocked';
    st.note = `faltan insumos: ${missingInputs.join(', ')}`;
    save(s);
    return { run: s, step: step.id, status: 'blocked', note: st.note };
  }
  const handler = handlers.get(step.handler);
  if (!handler) throw new Error(`HANDLER-UNKNOWN: ${step.handler}`);
  const outputs = step.outputs
    .filter((o) => holds(o.when, s.facts))
    .map((o) => ({ ...o, file: artifactPath(s.id, o.id, o.schema) }));
  const res = await handler({
    runDir: dir,
    step,
    facts: s.facts,
    outputs,
    inputs: Object.fromEntries(step.inputs.map((i) => [i, produced.get(i) as string])),
    write: (rel, data) => {
      const file = within(dir, rel);
      atomicWrite(file, data);
      return file;
    },
  });
  if (res.facts) Object.assign(s.facts, res.facts);
  if (res.status !== 'done') {
    st.status = res.status;
    st.note = res.note;
    save(s);
    log(s, { event: res.status, step: step.id, note: res.note });
    return { run: s, step: step.id, status: res.status, note: res.note };
  }
  const bad = outputs
    .filter((o) => o.required || existsSync(o.file))
    .map((o) => (existsSync(o.file) ? [o.id, checkOutput(o.schema, o.file)] : [o.id, 'missing']))
    .filter(([, err]) => err);
  if (bad.length) {
    st.status = 'needs_input';
    st.note = bad.map(([id, err]) => `${id}: ${err}`).join('; ');
    save(s);
    log(s, { event: 'invalid_output', step: step.id, note: st.note });
    return { run: s, step: step.id, status: 'needs_input', note: st.note };
  }
  st.outputs = outputs
    .filter((o) => existsSync(o.file))
    .map((o) => ({ id: o.id, file: o.file, sha256: sha256(readFileSync(o.file)) }));
  st.status = step.gate ? 'awaiting_gate' : 'done';
  st.note = step.gate ? `espera aprobación humana: ${step.gate}` : res.note;
  save(s);
  log(s, { event: 'done', step: step.id, outputs: st.outputs.map((o) => [o.id, o.sha256]) });
  return step.gate
    ? { run: s, step: step.id, status: 'awaiting_gate', gate: step.gate, note: st.note }
    : { run: s, step: step.id, status: 'done', note: res.note };
}

export type Approval = {
  gate: string;
  step: string;
  artifact_shas: Record<string, string>;
  nonce: string;
  consumed: boolean;
};

export const approvalPath = (runId: string, gate: string) =>
  path.join(runDir(runId), 'approvals', `${gate}.json`);

function gateCheck(reg: Registry, s: RunState, st: StepState, step: Step): NextResult {
  const gate = reg.gates.find((g) => g.id === step.gate);
  if (!gate) throw new Error(`GATE-UNKNOWN: ${step.gate}`);
  if (gate.kind === 'hard_stop')
    return { run: s, step: step.id, status: 'hard_stop', gate: gate.id, note: gate.summary };
  const file = approvalPath(s.id, gate.id);
  const wait = (note: string): NextResult => ({
    run: s,
    step: step.id,
    status: 'awaiting_gate',
    gate: gate.id,
    note,
  });
  if (!existsSync(file)) return wait(`espera: frames approve ${s.id} ${gate.id} (lo corre la persona)`);
  // A material receipt validates the files it binds again before acceptance.
  // This catches edited module siblings even when the receipt itself is unchanged.
  for (const output of step.outputs.filter((o) => o.schema === 'aula-receipt-v1')) {
    const material = st.outputs.find((o) => o.id === output.id);
    if (!material) return wait(`material receipt missing: ${output.id}`);
    const problem = checkOutput(output.schema, material.file);
    if (problem) return wait(`material receipt invalid: ${problem}`);
  }
  const tok = JSON.parse(readFileSync(file, 'utf8')) as Approval;
  if (tok.consumed) return wait('aprobación ya consumida: se necesita una nueva');
  if (tok.gate !== gate.id || tok.step !== step.id)
    return wait('aprobación para otro gate o paso: rechazada');
  const now = currentShas(s, step.id);
  if (JSON.stringify(now) !== JSON.stringify(tok.artifact_shas))
    return wait('los artefactos cambiaron después de aprobar: la aprobación ya no vale');
  atomicWrite(file, JSON.stringify({ ...tok, consumed: true }, null, 2) + '\n');
  st.status = 'done';
  st.note = `aprobado: ${gate.id}`;
  save(s);
  log(s, { event: 'approved', step: step.id, gate: gate.id, nonce: tok.nonce });
  return { run: s, step: step.id, status: 'done', gate: gate.id, note: st.note };
}

// Issue a one-use approval bound to the current artifact shas. The CLI only calls
// this from an interactive terminal; the guard denies it to agents.
export function approve(reg: Registry, runId: string, gateId: string): Approval {
  const s = loadRun(runId);
  const st = s.steps.find((x) => x.status === 'awaiting_gate');
  const step = st && family(reg, s.family).steps.find((x) => x.id === st.id);
  if (!st || !step || step.gate !== gateId) throw new Error(`APPROVE-NOTHING-WAITING: ${gateId}`);
  const gate = reg.gates.find((g) => g.id === gateId);
  if (gate?.kind !== 'human') throw new Error(`APPROVE-NOT-HUMAN-GATE: ${gateId}`);
  const tok: Approval = {
    gate: gateId,
    step: st.id,
    artifact_shas: currentShas(s, st.id),
    nonce: randomUUID(),
    consumed: false,
  };
  atomicWrite(approvalPath(runId, gateId), JSON.stringify(tok, null, 2) + '\n');
  log(s, { event: 'approval_issued', step: st.id, gate: gateId, nonce: tok.nonce });
  return tok;
}

// Resume capsule for a new session, bounded at 1,800 estimated tokens (ADOPTION-V1).
export const CAPSULE_TOKENS = 1800;
export function capsule(reg: Registry, runId: string): string {
  const s = loadRun(runId);
  const fam = family(reg, s.family);
  const pending = s.steps.find((x) => x.status !== 'done' && x.status !== 'skipped');
  const lines = [
    `# Cápsula ${s.id}`,
    `Familia: ${fam.title} (${fam.id})`,
    `Hechos: ${JSON.stringify(s.facts)}`,
    '',
    '| Paso | Estado | Artefactos |',
    '|---|---|---|',
    ...s.steps.map(
      (x) =>
        `| ${x.id} | ${x.status} | ${x.outputs.map((o) => `${o.id}@${o.sha256.slice(0, 12)}`).join(' ') || '-'} |`,
    ),
    '',
    pending
      ? `Siguiente: ${pending.id} (${pending.status})${pending.note ? ` — ${pending.note}` : ''}`
      : 'Run completo.',
    `Reanudar: pnpm frames next ${s.id}`,
  ];
  let out = lines.join('\n') + '\n';
  if (out.length / 4 > CAPSULE_TOKENS)
    out = out.slice(0, CAPSULE_TOKENS * 4 - 40) + '\n…(cápsula truncada)\n';
  return out;
}
