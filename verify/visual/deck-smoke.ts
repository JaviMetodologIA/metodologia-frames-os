// Visual gate of an immersive deck, in a real browser (Playwright). Ported as a
// spec from A (visual_smoke_class5.mjs: 3 viewports, overflow, keyboard) and B
// (check-motion.mjs: every scene moves; reduced motion holds still).
// Returns problems, or null when no browser is available (a gap, never green).
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { launch } from '../../engine/browser.ts';

// True while a View Transition's pseudo-element animations run (evaluated in the page).
const VT_RUNNING = () =>
  document
    .getAnimations()
    .some((a) => ((a.effect as KeyframeEffect | null)?.pseudoElement ?? '').startsWith('::view-transition'));

// The pseudo-element animations start a frame after the key press: poll briefly.
const vtStarts = (p: import('playwright').Page) =>
  p.waitForFunction(VT_RUNNING, undefined, { timeout: 500, polling: 16 }).then(
    () => true,
    () => false,
  );

export type SmokeReport = { problems: string[]; checked: string[]; shots: string[] };

export async function deckSmoke(htmlFile: string, shotsDir?: string): Promise<SmokeReport | null> {
  const browser = await launch();
  if (!browser) return null;
  const url = pathToFileURL(htmlFile).href;
  const problems: string[] = [];
  const checked: string[] = [];
  const shots: string[] = [];
  try {
    for (const [w, h] of [
      [1920, 1080],
      [1366, 768],
      [390, 844],
    ] as const) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      await page.goto(url);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      if (overflow) problems.push(`${w}x${h}: desborde horizontal`);
      checked.push(`${w}x${h} sin desborde`);
      if (shotsDir) {
        const f = path.join(shotsDir, `cover-${w}x${h}.png`);
        await page.screenshot({ path: f });
        shots.push(f);
      }
      await page.close();
    }
    // Keyboard: → advances and the hash follows; End reaches the last slide.
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await page.goto(url);
    const ids: string[] = await page.$$eval('section.slide', (els) => els.map((e) => e.id));
    // A slide change animates through the View Transitions API when the entering slide
    // declares one: its pseudo-element animations must exist right after the key press.
    const settle = () => page.waitForTimeout(900);
    const trOf = (id: string) => page.$eval(`#${id}`, (e) => (e as HTMLElement).dataset.tr ?? 'none');
    await page.keyboard.press('ArrowRight');
    const animated = await vtStarts(page);
    await settle();
    const second = await page.$eval('section.slide.active', (e) => e.id);
    if (second !== ids[1]) problems.push(`→ no avanzó a ${ids[1]} (quedó en ${second})`);
    if ((await trOf(ids[1]!)) !== 'none' && !animated)
      problems.push(`${ids[1]}: declara transición y el cambio de lámina no animó`);
    // Two quick presses move two slides, even while the first transition runs.
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await settle();
    if ((await page.$eval('section.slide.active', (e) => e.id)) !== ids[Math.min(3, ids.length - 1)])
      problems.push('dos → seguidas no avanzaron dos láminas');
    await page.keyboard.press('End');
    await settle();
    if ((await page.$eval('section.slide.active', (e) => e.id)) !== ids[ids.length - 1])
      problems.push('End no llegó a la última lámina');
    checked.push('teclado: →, → → y End; la transición anima');
    // Motion: every scene changes between 0.6 s and 4 s after its slide opens. The copy
    // and the HUD sit on top of the scene and have their own entrance animation, so they
    // are hidden while measuring: otherwise text sliding in passes for a moving scene.
    // Background stars twinkle forever: they are hidden too, or a dead scene would pass.
    const SCENE_ONLY = '.copy,#help,#num,#brand,#prog,#auto,.star{visibility:hidden!important}';
    for (const [k, id] of ids.entries()) {
      await page.goto(`${url}#${id}`);
      await page.addStyleTag({ content: SCENE_ONLY });
      await page.waitForTimeout(900); // past the entry transition
      const a = await page.locator('section.slide.active svg.scene').screenshot();
      await page.waitForTimeout(3100);
      const b = await page.locator('section.slide.active svg.scene').screenshot();
      if (a.equals(b)) problems.push(`lámina ${k + 1} (${id}): la escena no se mueve`);
    }
    checked.push(`${ids.length} escenas se mueven`);
    // Reduced motion: the scene holds still at its freeze frame.
    const still = await browser.newPage({ viewport: { width: 1600, height: 900 }, reducedMotion: 'reduce' });
    for (const [k, id] of ids.entries()) {
      await still.goto(`${url}#${id}`);
      await still.addStyleTag({ content: SCENE_ONLY });
      await still.waitForTimeout(600);
      const a = await still.locator('section.slide.active svg.scene').screenshot();
      await still.waitForTimeout(1500);
      const b = await still.locator('section.slide.active svg.scene').screenshot();
      if (!a.equals(b)) problems.push(`lámina ${k + 1} (${id}): se mueve con movimiento reducido`);
      if (shotsDir && k < 3) {
        const f = path.join(shotsDir, `reduced-${id}.png`);
        await still.screenshot({ path: f });
        shots.push(f);
      }
    }
    checked.push('movimiento reducido quieto en su frame final');
    // Reduced motion: no slide transition either.
    await still.goto(`${url}#${ids[0]}`);
    await still.keyboard.press('ArrowRight');
    const moved = await vtStarts(still);
    if (moved) problems.push('con movimiento reducido el cambio de lámina anima');
    checked.push('movimiento reducido sin transición');
  } finally {
    await browser.close();
  }
  return { problems, checked, shots };
}
