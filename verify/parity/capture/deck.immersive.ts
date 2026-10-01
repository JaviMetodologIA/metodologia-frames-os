// Golden for deck.immersive: what Frames could do with a presentation, read from
// its own source (read-only). Frames sealed `deck: { materialized: false }` and
// capped the profile at RENDERED_DRAFT: there was no deck to compare bytes with.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { repoPath } from '../../../engine/paths.ts';

const FRAMES =
  process.env.FRAMES_ROOT ?? path.join(os.homedir(), 'Documents/workspace/metodologia-frames-agent-os');
const SRC = '02_proceso/workflows/multimedia/_runner/commercial-proposal-projections-v1.ts';
const code = readFileSync(path.join(FRAMES, SRC), 'utf8');
const projection = {
  source: `Frames ${SRC}`,
  deck_materialized: !/materialized:\s*false/.test(code),
  maximum_state: /maximumAutomaticState:\s*'([A-Z_]+)'/.exec(code)?.[1] ?? null,
  next_step: /'next step':\s*'([^']+)'/.exec(code)?.[1] ?? null,
};
for (const name of readdirSync(repoPath('verify/parity/cases/deck.immersive')).sort()) {
  const out = repoPath('verify/parity/golden/deck.immersive', name);
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, 'frames-projection.json'), JSON.stringify(projection, null, 2) + '\n');
  console.log(`golden ${name}:`, JSON.stringify(projection));
}
