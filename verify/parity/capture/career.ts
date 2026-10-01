// Goldens for career.cv, career.cover, career.search and improve, read from Frames'
// career code (read-only): the evidence rule, the letter word ranges, the scoring
// weights, the submission stop, which steps a real run executed, and whether the
// "improve" route read the existing file.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { repoPath } from '../../../engine/paths.ts';

const FRAMES =
  process.env.FRAMES_ROOT ?? path.join(os.homedir(), 'Documents/workspace/metodologia-frames-agent-os');
const R = '02_proceso/workflows/career/_runner';
const read = (f: string) => readFileSync(path.join(FRAMES, f), 'utf8');
const gate = read(`${R}/evidence-gate.ts`);
const model = read(`${R}/document-model.ts`);
const scoring = read(`${R}/scoring.ts`);
const submission = read(`${R}/submission.ts`);
const runner = read(`${R}/career-runner.ts`);
const route =
  read('03_artefactos/skills/content-os-router/scripts/route-intent.mjs') +
  read('03_artefactos/skills/content-os-router/scripts/route-content.mjs');
const range = (ch: string) =>
  new RegExp(
    `${ch === 'letter' ? "document.channel === 'letter' \\? " : ch === 'form' ? "document.channel === 'form' \\? " : ': '}\\[(\\d+), (\\d+)\\]`,
  )
    .exec(model)
    ?.slice(1, 3)
    .map(Number);
const out = (fam: string, v: object) => {
  const d = repoPath('verify/parity/golden', fam, 'frames-os');
  mkdirSync(d, { recursive: true });
  writeFileSync(
    path.join(d, 'frames-projection.json'),
    JSON.stringify({ source: `Frames ${R}`, ...v }, null, 2) + '\n',
  );
  console.log(`golden ${fam}:`, JSON.stringify(v));
};
const common = {
  evidence_confidence:
    /'verified'/.test(gate) && /'user_confirmed'/.test(gate) ? ['verified', 'user_confirmed'] : [],
  rejects_unbound_text: /UNBOUND_VISIBLE_TEXT/.test(gate),
  submission_decision: /decision: 'PREPARED_STOP'/.test(submission) ? 'PREPARED_STOP' : 'UNKNOWN',
  run_writes_only_brief:
    /runCareerBriefFirst/.test(runner) && !/renderCareerCvAtsDocx|renderCareerPdf/.test(runner),
};
out('career.cv', common);
out('career.cover', {
  ...common,
  words: { letter: range('letter'), form: range('form'), message: range('message') },
});
out('career.search', {
  weights: Object.fromEntries(
    [...(/CAREER_SCORE_WEIGHTS = \{([\s\S]*?)\}/.exec(scoring)?.[1] ?? '').matchAll(/(\w+): (\d+)/g)].map(
      (m) => [m[1], +m[2]!],
    ),
  ),
  blocks_on_mandatory: /mandatory_blockers\.length > 0 \? \('BLOCKED'/.test(scoring),
  runner_for_c04: /C04/.test(runner) && /scoreCareerOpportunity/.test(runner),
});
out('improve', { reads_existing: /readFileSync\([^)]*source/.test(route) });
