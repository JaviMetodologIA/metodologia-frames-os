// Golden for content.prompts and content.campaign: the field lists Frames declares for
// each deliverable (deliverable-definition-registry.yml), and whether any Frames code
// produces them. Read-only.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { repoPath } from '../../../engine/paths.ts';

const FRAMES =
  process.env.FRAMES_ROOT ?? path.join(os.homedir(), 'Documents/workspace/metodologia-frames-agent-os');
const REG = '02_proceso/workflows/multimedia/_assets/deliverable-definition-registry.yml';
const reg = YAML.parse(readFileSync(path.join(FRAMES, REG), 'utf8')) as {
  deliverables?: { deliverable_id: string; workflow_id: string; required_fields: string[] }[];
} & Record<string, unknown>;
const list = reg.deliverables ?? (Object.values(reg).find(Array.isArray) as typeof reg.deliverables) ?? [];
const fields = (ids: string[]) =>
  Object.fromEntries(
    ids.map((id) => [id, list.find((d) => d.deliverable_id === id)?.required_fields ?? null]),
  );
const FAMILIES: Record<string, string[]> = {
  'content.prompts': [
    'universal-prompts-v1',
    'asset-package-v1',
    'asset-manifest-v1',
    'capability-report-v1',
    'tool-run-evidence-v1',
  ],
  'content.campaign': [
    'brief-campaign-map-v1',
    'campaign-charter-v1',
    'editorial-calendar-v1',
    'content-grid-v1',
    'board-v1',
    'batch-plan-v1',
    'platform-package-v1',
    'publication-record-v1',
    'results-dashboard-v1',
    'learning-report-v1',
  ],
};
for (const [fam, ids] of Object.entries(FAMILIES)) {
  const projection = {
    source: `Frames ${REG}`,
    // The multimedia runner writes one generic envelope per deliverable; no code fills a field.
    producing_code: false,
    fields: fields(ids),
  };
  const out = repoPath('verify/parity/golden', fam, 'frames-os');
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, 'frames-projection.json'), JSON.stringify(projection, null, 2) + '\n');
  console.log(
    `golden ${fam}:`,
    Object.entries(projection.fields)
      .map(([k, v]) => `${k}(${v?.length ?? 'X'})`)
      .join(' '),
  );
}
