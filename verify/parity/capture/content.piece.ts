// Golden capture for content.piece: runs FRAMES' OWN brief code (read-only, from
// FRAMES_ROOT) on each case and stores what it produced. CI never needs Frames:
// re-capture only to re-baseline.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { repoPath } from '../../../engine/paths.ts';

const FRAMES =
  process.env.FRAMES_ROOT ?? path.join(os.homedir(), 'Documents/workspace/metodologia-frames-agent-os');
const runner = (f: string) =>
  pathToFileURL(path.join(FRAMES, '02_proceso/workflows/multimedia/_runner', f)).href;

const model = (await import(runner('brief-model.ts'))) as {
  createFramesBriefMarkdown: (draft: unknown, sections: unknown) => string;
};
const renderer = (await import(runner('brief-renderer.ts'))) as {
  renderFramesBriefHtml: (md: string) => string;
};
const parity = (await import(runner('brief-parity.ts'))) as {
  verifyBriefParity: (
    md: string,
    html: string,
  ) => { status: string; content_sha256: string; issues: string[] };
};

const casesDir = repoPath('verify/parity/cases/content.piece');
for (const name of readdirSync(casesDir).sort()) {
  const input = JSON.parse(readFileSync(path.join(casesDir, name, 'input.json'), 'utf8')) as {
    draft: unknown;
    sections: unknown;
  };
  const md = model.createFramesBriefMarkdown(input.draft, input.sections);
  const html = renderer.renderFramesBriefHtml(md);
  const out = repoPath('verify/parity/golden/content.piece', name);
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, 'brief.md'), md);
  writeFileSync(path.join(out, 'brief.html'), html);
  const p = parity.verifyBriefParity(md, html);
  writeFileSync(path.join(out, 'frames-parity.json'), JSON.stringify(p, null, 2) + '\n');
  console.log(`golden ${name}: ${p.status} ${p.content_sha256.slice(0, 12)}`);
}
