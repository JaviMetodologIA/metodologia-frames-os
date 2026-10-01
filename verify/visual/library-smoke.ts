// Visual gate of a prompt library: no overflow at three widths, the search and the
// family chips filter, a variable typed in shows up in the prompt, copy answers, and
// the page keeps working with storage blocked.
import { pathToFileURL } from 'node:url';
import { launch } from '../../engine/browser.ts';
import type { SmokeReport } from './deck-smoke.ts';

export async function librarySmoke(htmlFile: string): Promise<SmokeReport | null> {
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
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(url);
    const total = await page.locator('.card').count();
    const first = page.locator('.card').first();
    const word = (await first.locator('h2').textContent())!
      .split(' ')
      .sort((a, b) => b.length - a.length)[0]!;
    await page.fill('#q', word);
    const shown = await page.locator('.card:not([hidden])').count();
    if (shown < 1 || shown === total) problems.push(`la búsqueda «${word}» no filtra (${shown} de ${total})`);
    await page.fill('#q', '');
    const chip = page.locator('.chip').first();
    const fam = await chip.getAttribute('data-family');
    await chip.click();
    const wrong = await page.$$eval(
      `.card:not([hidden])`,
      (cs, f) => cs.filter((c) => (c as HTMLElement).dataset.family !== f).length,
      fam,
    );
    if (wrong) problems.push(`el filtro ${fam} deja ver ${wrong} tarjeta(s) de otra familia`);
    await chip.click();
    checked.push('la búsqueda y las familias filtran');
    const withVar = page.locator('.card:has(.vars input)').first();
    if (await withVar.count()) {
      await withVar.locator('.vars input').first().fill('VALOR-DE-PRUEBA');
      if (!(await withVar.locator('pre').textContent())?.includes('VALOR-DE-PRUEBA'))
        problems.push('la variable escrita no aparece en el prompt');
      await withVar.locator('.copy-btn').click();
      await page.waitForTimeout(200);
      if (!(await withVar.locator('.done').textContent())?.trim()) problems.push('copiar no respondió');
      await page.reload();
      if ((await withVar.locator('.vars input').first().inputValue()) !== 'VALOR-DE-PRUEBA')
        problems.push('la variable no sobrevivió a la recarga');
      checked.push('variables: se ven en el prompt, se copian y sobreviven a la recarga');
    }
    await ctx.close();
    const blocked = await browser.newContext();
    await blocked.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new Error('storage blocked');
        },
      });
    });
    const nb = await blocked.newPage();
    const errs: string[] = [];
    nb.on('pageerror', (e) => errs.push(e.message));
    await nb.goto(url);
    await nb.fill('#q', 'zzzz-sin-resultado');
    if ((await nb.locator('.card:not([hidden])').count()) !== 0)
      problems.push('sin almacenamiento la búsqueda no filtra');
    for (const e of errs) problems.push(`sin almacenamiento: error de JS: ${e}`);
    checked.push('funciona con el almacenamiento bloqueado');
    await blocked.close();
  } finally {
    await browser.close();
  }
  return { problems, checked, shots: [] };
}
