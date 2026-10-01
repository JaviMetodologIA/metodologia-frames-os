// Golden for nlm: the commands Frames declares (commands.yml) with their effect and
// gate, and whether any Frames code calls NotebookLM (MCP or the nlm CLI). Read-only.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { repoPath } from '../../../engine/paths.ts';

const FRAMES =
  process.env.FRAMES_ROOT ?? path.join(os.homedir(), 'Documents/workspace/metodologia-frames-agent-os');
const DIR = '02_proceso/workflows/notebooklm-os';
const cmds = (
  YAML.parse(readFileSync(path.join(FRAMES, DIR, 'commands.yml'), 'utf8')) as {
    aliases: Record<string, { starts_at: string; effect: string; stop: string }>;
  }
).aliases;
const code = readdirSync(path.join(FRAMES, DIR))
  .filter((f) => f.endsWith('.ts'))
  .map((f) => readFileSync(path.join(FRAMES, DIR, f), 'utf8'))
  .join('\n');
const projection = {
  source: `Frames ${DIR}`,
  commands: Object.keys(cmds).length,
  external: Object.fromEntries(
    Object.entries(cmds)
      .filter(([, c]) => c.effect === 'EXTERNAL_MUTATION')
      .map(([k, c]) => [k, { stage: c.starts_at, gate: c.stop }]),
  ),
  calls_notebooklm: /mcp__notebooklm|spawn\([^)]*nlm/.test(code),
};
const out = repoPath('verify/parity/golden/nlm/frames-os');
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, 'frames-projection.json'), JSON.stringify(projection, null, 2) + '\n');
console.log('golden nlm:', JSON.stringify(projection));
