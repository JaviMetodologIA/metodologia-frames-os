// Golden for trainer: the artifact limits Frames' Trainer OS enforces in its Zod
// contracts, read from its own source, and whether its benchmark ever executed.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { repoPath } from '../../../engine/paths.ts';

const FRAMES =
  process.env.FRAMES_ROOT ?? path.join(os.homedir(), 'Documents/workspace/metodologia-frames-agent-os');
const DIR = '02_proceso/workflows/trainer-os';
const read = (f: string) => readFileSync(path.join(FRAMES, DIR, f), 'utf8');
const [base, ext, mc, bench] = [
  read('adapter-contracts.ts'),
  read('adapter-extended-contracts.ts'),
  read('masterclass-contracts.ts'),
  read('benchmark.ts'),
];
const n = (src: string, re: RegExp, g = 1) => Number(re.exec(src)?.[g]);
const projection = {
  source: `Frames ${DIR}`,
  landing_sections: n(base, /sections: z\s*\.array\(Section\)\s*\.length\((\d+)\)/),
  cta_words: n(base, /split\(\/\\s\+\/u\)\.length <= (\d+)/),
  cta_chars: n(base, /label: z\s*\.string\(\)\s*\.min\(1\)\s*\.max\((\d+)\)/),
  preparation: [
    n(base, /preparation: z\.array\(Section\)\.min\((\d+)\)/),
    n(base, /preparation: z\.array\(Section\)\.min\(\d+\)\.max\((\d+)\)/),
  ],
  routes: n(base, /routes: z[\s\S]*?\.max\(\d+\),[\s\S]*?\.length\((\d+)\)/),
  route_steps_max: n(base, /routes: z[\s\S]*?\.min\(1\)\s*\.max\((\d+)\),/),
  essential_chapters: n(ext, /essentialChapters: z\.array\(Chapter\)\.length\((\d+)\)/),
  optional_chapters_max: n(ext, /optionalChapters: z\.array\(Chapter\)\.max\((\d+)\)/),
  chapter_steps: [
    n(ext, /steps: z\.array\(Step\)\.min\((\d+)\)/),
    n(ext, /steps: z\.array\(Step\)\.min\(\d+\)\.max\((\d+)\)/),
  ],
  prompts_max: n(ext, /prompts: z\.array\(Prompt\)\.min\(1\)\.max\((\d+)\)/),
  prompt_levels: (/levels: z\.tuple\(\[([\s\S]*?)\]\)/.exec(ext)?.[1]?.match(/level: z\.literal\(/g) ?? [])
    .length,
  masterclass_moments: n(mc, /moments: z\.array\(Moment\)\.length\((\d+)\)/),
  masterclass_minutes: [
    n(mc, /base !== (\d+) \|\| extended !== \d+/),
    n(mc, /base !== \d+ \|\| extended !== (\d+)/),
  ],
  benchmark_executed: !/not_executed/.test(bench),
};
const out = repoPath('verify/parity/golden/trainer/frames-os');
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, 'frames-projection.json'), JSON.stringify(projection, null, 2) + '\n');
console.log('golden trainer:', JSON.stringify(projection));
