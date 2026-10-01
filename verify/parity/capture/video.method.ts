// Golden for video.method: the method-explainer contract Frames declares (video-os
// _schema), read from its own source, and the fact that Video OS never renders
// ("Video OS no renderiza", 01_intencion/video-os/ARCHITECTURE.md). Read-only.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { repoPath } from '../../../engine/paths.ts';

const FRAMES =
  process.env.FRAMES_ROOT ?? path.join(os.homedir(), 'Documents/workspace/metodologia-frames-agent-os');
const DIR = '02_proceso/workflows/video-os/_schema';
const exec = readFileSync(path.join(FRAMES, DIR, 'method-explainer-execution-v1.schema.ts'), 'utf8');
const plan = readFileSync(path.join(FRAMES, DIR, 'method-explainer-planning-v1.schema.ts'), 'utf8');
const arch = readFileSync(path.join(FRAMES, '01_intencion/video-os/ARCHITECTURE.md'), 'utf8');
const n = (src: string, re: RegExp) => Number(re.exec(src)?.[1]);
const projection = {
  source: `Frames ${DIR} + 01_intencion/video-os/ARCHITECTURE.md`,
  size: [n(exec, /width: z\.literal\((\d+)\)/), n(exec, /height: z\.literal\((\d+)\)/)],
  fps: n(exec, /fps: z\.literal\((\d+)\)/),
  seconds: [
    n(exec, /duration_seconds: z\.number\(\)\.int\(\)\.min\((\d+)\)/),
    n(exec, /duration_seconds: z\.number\(\)\.int\(\)\.min\(\d+\)\.max\((\d+)\)/),
  ],
  beats_max: n(plan, /\.min\(1\)\s*\.max\((\d+)\),\s*\}\)/) || n(plan, /\.min\(1\)\n\s*\.max\((\d+)\)/),
  voiceover_max: Number(
    /voiceover: z\.string\(\)\.min\(1\)\.max\(([\d_]+)\)/.exec(plan)?.[1]?.replace('_', ''),
  ),
  words_per_second_max: Number(
    /max_tempo_words_per_second: z\.number\(\)\.positive\(\)\.max\(([\d.]+)\)/.exec(plan)?.[1],
  ),
  screen_items_max: n(plan, /screen: z\.array\(ScreenBudgetSchema\)\.max\((\d+)\)/),
  screen_text_max: n(
    plan,
    /ScreenBudgetSchema = z\.strictObject\(\{text: z\.string\(\)\.min\(1\)\.max\((\d+)\)/,
  ),
  renders: !/Video OS no renderiza/.test(arch),
};
const out = repoPath('verify/parity/golden/video.method/frames-os');
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, 'frames-projection.json'), JSON.stringify(projection, null, 2) + '\n');
console.log('golden video.method:', JSON.stringify(projection));
