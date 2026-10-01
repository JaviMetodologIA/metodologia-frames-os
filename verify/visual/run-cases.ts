// Renders every deck case in its three layouts (deck, playbook, workbook) with the
// MetodologIA tokens and runs the browser gate on each, the three in parallel; then the
// carousel cases and the print-first documents.
// Exit 0 ok, 1 red, 3 when no browser is available (a gap).
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { repoPath } from '../../engine/paths.ts';
import { loadTokens, parseDeck } from '../../domains/deck/index.ts';
import { renderDeck } from '../../domains/deck/render.ts';
import { renderPlaybook } from '../../domains/deck/playbook.ts';
import { deckSmoke } from './deck-smoke.ts';
import { scrollSmoke } from './scroll-smoke.ts';
import { framesSmoke } from './frames-smoke.ts';
import { renderFrames } from '../../domains/deck/frames.ts';
import { auditHtml } from './audit.ts';
import { patchBriefHtml } from '../../domains/content/index.ts';
import { createFramesBriefMarkdown } from '../../domains/content/brief/model.ts';
import { renderFramesBriefHtml } from '../../domains/content/brief/renderer.ts';
import {
  renderCareerCvAtsHtml,
  renderCareerLetterHtml,
} from '../../domains/career/frames/_runner/document-renderer.ts';

const dir = repoPath('verify/parity/cases/deck.immersive');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'frames-visual-'));
let red = 0;
try {
  for (const name of readdirSync(dir).sort()) {
    const deck = parseDeck(readFileSync(path.join(dir, name, 'deck.yml'), 'utf8'));
    const t = loadTokens();
    const file = (layout: string, html: string) => {
      const f = path.join(tmp, `${name}.${layout}.html`);
      writeFileSync(f, html);
      return f;
    };
    const runs = await Promise.all([
      deckSmoke(file('deck', renderDeck(deck, t))).then((r) => ['deck', r] as const),
      scrollSmoke(file('playbook', renderPlaybook(deck, t)), false).then((r) => ['playbook', r] as const),
      scrollSmoke(file('workbook', renderPlaybook(deck, t, { workbook: true })), true).then(
        (r) => ['workbook', r] as const,
      ),
    ]);
    for (const [layout, r] of runs) {
      if (!r) {
        console.log('sin navegador: el gate visual no corrió');
        process.exit(3);
      }
      for (const p of r.problems) console.log(`${name} ${layout}: ${p}`);
      red += r.problems.length;
    }
    console.log(runs.map(([layout, r]) => `${name} ${layout}: ${r!.checked.length} pruebas`).join(' · '));
  }
  // Social frames: every content.carousel case through the frames gate.
  const cdir = repoPath('verify/parity/cases/content.carousel');
  for (const name of readdirSync(cdir).sort()) {
    const d = parseDeck(readFileSync(path.join(cdir, name, 'deck.yml'), 'utf8'));
    const f = path.join(tmp, `${name}.carousel.html`);
    writeFileSync(f, renderFrames(d, loadTokens(), 'carousel'));
    const r = await framesSmoke(f);
    if (!r) process.exit(3);
    for (const p of r.problems) console.log(`${name} carousel: ${p}`);
    red += r.problems.length;
    console.log(`${name} carousel: ${r.checked.length} pruebas`);
  }
  // Print-first documents (brief, CV, letter): the audit's three viewports, contrast,
  // overflow and JS errors. A high finding is red; a medium one is the author's to judge.
  const j = (f: string) => JSON.parse(readFileSync(repoPath('verify/parity/cases', f), 'utf8'));
  const brief = j('content.piece/brief-basic/input.json');
  const docs: [string, string][] = [
    [
      'content.piece brief',
      patchBriefHtml(renderFramesBriefHtml(createFramesBriefMarkdown(brief.draft, brief.sections))),
    ],
    [
      'career.cv',
      renderCareerCvAtsHtml(
        j('career.cv/frames-os/source-en.json'),
        j('career.cv/frames-os/evidence-bank.json'),
      ),
    ],
    [
      'career.cover',
      renderCareerLetterHtml(
        j('career.cover/frames-os/letter.json'),
        j('career.cover/frames-os/evidence-bank.json'),
      ),
    ],
  ];
  for (const [name, html] of docs) {
    const f = path.join(tmp, `${name.replace(/\W+/g, '-')}.html`);
    writeFileSync(f, html);
    const r = await auditHtml(f);
    if (!r.browser) process.exit(3);
    const high = r.findings.filter((x) => x.severity === 'high');
    for (const x of high) console.log(`${name}: ${x.id} ${x.where}`);
    red += high.length;
    console.log(`${name}: auditoría en 3 viewports · ${r.findings.length} hallazgo(s), ${high.length} altos`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
process.exit(red ? 1 : 0);
