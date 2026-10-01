// Golden for content.carousel: Frames' carousel rules and renderer facts, read from
// its own source (read-only). The successor must enforce every rule and fix the two
// renderer defects: the card count hard-coded as "/ 8" and a safe zone never read.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { repoPath } from '../../../engine/paths.ts';

const FRAMES =
  process.env.FRAMES_ROOT ?? path.join(os.homedir(), 'Documents/workspace/metodologia-frames-agent-os');
const SCHEMA = '02_proceso/workflows/content/types/carousel/schema.ts';
const HTML = '03_artefactos/renderers/static-social/src/carousel-html.ts';
const schema = readFileSync(path.join(FRAMES, SCHEMA), 'utf8');
const html = readFileSync(path.join(FRAMES, HTML), 'utf8');
const num = (re: RegExp) => Number(re.exec(schema)?.[1]);
const projection = {
  source: `Frames ${SCHEMA} + ${HTML}`,
  cards: [
    num(/cards: z\.array\(CarouselCardV1Schema\)\.min\((\d+)\)/),
    num(/CarouselCardV1Schema\)\.min\(\d+\)\.max\((\d+)\)/),
  ],
  eyebrow_max: num(/eyebrow: z\.string\(\)\.trim\(\)\.min\(1\)\.max\((\d+)\)/),
  title_max: num(/title: PublicCopySchema\.pipe\(z\.string\(\)\.max\((\d+)\)\)/),
  bullets: [
    num(/bullets: z\.array\(z\.string\(\)\.trim\(\)\.min\(1\)\.max\(\d+\)\)\.max\((\d+)\)/),
    num(/bullets: z\.array\(z\.string\(\)\.trim\(\)\.min\(1\)\.max\((\d+)\)/),
  ],
  sources_per_card: [
    num(/sourceIds: z\.array\(PortableIdSchema\)\.min\((\d+)\)\.max\(8\)/),
    num(/sourceIds: z\.array\(PortableIdSchema\)\.min\(1\)\.max\((\d+)\)/),
  ],
  alt: [
    num(/altText: z\.string\(\)\.trim\(\)\.min\((\d+)\)/),
    num(/altText: z\.string\(\)\.trim\(\)\.min\(\d+\)\.max\((\d+)\)/),
  ],
  caption: [
    num(/caption: z\.string\(\)\.trim\(\)\.min\((\d+)\)/),
    num(/caption: z\.string\(\)\.trim\(\)\.min\(\d+\)\.max\((\d+)\)/),
  ],
  cta: [
    num(/  cta: z\.string\(\)\.trim\(\)\.min\((\d+)\)/),
    num(/  cta: z\.string\(\)\.trim\(\)\.min\(\d+\)\.max\((\d+)\)/),
  ],
  opens_with: /cards\[0\]\?\.role !== '(\w+)'/.exec(schema)?.[1],
  closes_with: /cards\.at\(-1\)\?\.role !== '(\w+)'/.exec(schema)?.[1],
  support_needs_pillar: /CAR-004/.test(schema),
  cta_min_position: num(/card\.role === 'cta' && card\.position < (\d+)/),
  count_hard_coded: /\} \/ 8</.test(html),
  safe_zone_read: /safeZonePx/.test(html),
};
for (const name of readdirSync(repoPath('verify/parity/cases/content.carousel')).sort()) {
  const out = repoPath('verify/parity/golden/content.carousel', name);
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, 'frames-projection.json'), JSON.stringify(projection, null, 2) + '\n');
  console.log(`golden ${name}:`, JSON.stringify(projection));
}
