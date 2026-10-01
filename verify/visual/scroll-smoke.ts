// Visual gate of the scroll layouts (playbook, workbook), in a real browser. Same
// questions as the deck's, asked of a page that scrolls: no overflow at three widths,
// sections reveal when reached, scenes move on screen and hold still with reduced
// motion, the act nav follows the reader, and the workbook keeps its answers.
import { pathToFileURL } from 'node:url';
import { launch } from '../../engine/browser.ts';
import type { SmokeReport } from './deck-smoke.ts';

type Page = import('playwright').Page;

const to = (page: Page, id: string) =>
  page.evaluate(
    (i) => document.getElementById(i)!.scrollIntoView({ block: 'center', behavior: 'instant' }),
    id,
  );
// Only the drawing: the copy, the chrome and the twinkling stars are hidden.
const SCENE_ONLY = '.copy,#bar,#progress,#sky,.w,.star{visibility:hidden!important}';

export async function scrollSmoke(htmlFile: string, workbook: boolean): Promise<SmokeReport | null> {
  const browser = await launch();
  if (!browser) return null;
  const url = pathToFileURL(htmlFile).href;
  const problems: string[] = [];
  const checked: string[] = [];
  try {
    for (const [w, h] of [
      [1920, 1080],
      [1366, 768],
      [390, 844],
    ] as const) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      const errs: string[] = [];
      page.on('pageerror', (e) => errs.push(e.message));
      await page.goto(url);
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1))
        problems.push(`${w}x${h}: desborde horizontal`);
      for (const e of errs) problems.push(`${w}x${h}: error de JS: ${e}`);
      await page.close();
    }
    checked.push('3 anchos sin desborde ni errores');

    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(url);
    const ids: string[] = await page.$$eval('section.sec', (els) => els.map((e) => e.id));
    const last = ids[ids.length - 1]!;
    if (await page.$eval(`#${last}`, (e) => e.classList.contains('on')))
      problems.push('la última sección ya estaba revelada sin llegar a ella');
    // Motion: every scene changes while its section is on screen.
    await page.addStyleTag({ content: SCENE_ONLY });
    for (const id of ids) {
      await to(page, id);
      await page.waitForTimeout(900);
      const fig = page.locator(`#${id} svg.scene`);
      const a = await fig.screenshot();
      await page.waitForTimeout(2600);
      if (a.equals(await fig.screenshot())) problems.push(`${id}: la escena no se mueve en pantalla`);
      if (!(await page.$eval(`#${id}`, (e) => e.classList.contains('on'))))
        problems.push(`${id}: no se reveló al llegar`);
    }
    checked.push(`${ids.length} secciones se revelan y sus escenas se mueven`);
    await to(page, last);
    await page.waitForTimeout(200);
    const current = await page.$$eval('#acts a[aria-current=true]', (as) => as.map((a) => a.textContent));
    const lastAct = await page.$eval(`#${last}`, (e) => (e as HTMLElement).dataset.act);
    const lastLink = await page.$eval(`#acts a[data-act="${lastAct}"]`, (a) => a.textContent);
    if (current.length !== 1 || current[0] !== lastLink)
      problems.push('el menú de actos no sigue la lectura');
    checked.push('el menú de actos sigue la lectura');
    // Keyboard: the motion toggle is reachable and works.
    await page.goto(url);
    await page.focus('#motion');
    await page.keyboard.press('Enter');
    if ((await page.$eval('#motion', (b) => b.getAttribute('aria-pressed'))) !== 'true')
      problems.push('el botón de movimiento no responde al teclado');
    checked.push('botón de movimiento operable con teclado');
    await page.close();

    // Reduced motion: everything is visible at once and the scenes hold still.
    const still = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await still.goto(url);
    if (!(await still.$eval(`#${last}`, (e) => e.classList.contains('on'))))
      problems.push('con movimiento reducido las secciones no se ven de entrada');
    await still.addStyleTag({ content: SCENE_ONLY });
    for (const id of ids.slice(0, 6)) {
      await to(still, id);
      await still.waitForTimeout(400);
      const fig = still.locator(`#${id} svg.scene`);
      const a = await fig.screenshot();
      await still.waitForTimeout(1200);
      if (!a.equals(await fig.screenshot())) problems.push(`${id}: se mueve con movimiento reducido`);
    }
    checked.push('movimiento reducido: todo visible y quieto');
    await still.close();

    if (workbook) {
      const wb = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await wb.goto(url);
      const box = wb.locator('fieldset[data-kind=checklist] input').first();
      if (await box.count()) {
        await box.scrollIntoViewIfNeeded();
        await box.check();
        await wb.reload();
        if (!(await wb.locator('fieldset[data-kind=checklist] input').first().isChecked()))
          problems.push('workbook: la casilla marcada no sobrevivió a la recarga');
        checked.push('workbook: el estado sobrevive a la recarga');
      }
      await wb.close();
      // Storage that throws (private mode, blocked site data): the page still works.
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await ctx.addInitScript(() => {
        Object.defineProperty(window, 'localStorage', {
          get() {
            throw new Error('storage blocked');
          },
        });
      });
      const nb = await ctx.newPage();
      const errs: string[] = [];
      nb.on('pageerror', (e) => errs.push(e.message));
      await nb.goto(url);
      const first = nb.locator('fieldset[data-kind=checklist]').first();
      if (await first.count()) {
        await first.locator('input').first().check();
        const count = await first.locator('.count').textContent();
        if (!/^1 \//.test(count ?? ''))
          problems.push('workbook sin almacenamiento: el contador no respondió');
      }
      for (const e of errs) problems.push(`workbook sin almacenamiento: error de JS: ${e}`);
      checked.push('workbook: funciona con el almacenamiento bloqueado');
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  return { problems, checked, shots: [] };
}
