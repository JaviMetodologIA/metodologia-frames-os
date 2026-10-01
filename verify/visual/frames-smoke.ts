// Visual gate of social frames: on every frame the copy fits its box and stays inside
// the safe zone, and the scene moves. Frames declared safeZonePx and never read it.
import { pathToFileURL } from 'node:url';
import { launch } from '../../engine/browser.ts';
import type { SmokeReport } from './deck-smoke.ts';

export async function framesSmoke(htmlFile: string, safe = 72): Promise<SmokeReport | null> {
  const browser = await launch();
  if (!browser) return null;
  const problems: string[] = [];
  const checked: string[] = [];
  try {
    const url = pathToFileURL(htmlFile).href;
    const page = await browser.newPage();
    await page.goto(url);
    const [w, h] = await page.$eval('#stage', (e) => [
      +(e as HTMLElement).dataset.w!,
      +(e as HTMLElement).dataset.h!,
    ]);
    await page.setViewportSize({ width: w!, height: h! });
    const ids: string[] = await page.$$eval('section.slide', (els) => els.map((e) => e.id));
    for (const [k, id] of ids.entries()) {
      await page.goto(`${url}#${id}`);
      await page.reload();
      // Text whole, as in a still: every entrance animation at its end.
      await page.evaluate(() => {
        for (const a of document.getAnimations()) a.finish();
      });
      const r = await page.$eval(
        `#${id}`,
        (sec, m) => {
          const box = sec.querySelector('.copy') as HTMLElement;
          const out: string[] = [];
          const fr = sec.querySelector('.fr') as HTMLElement;
          if (fr.getBoundingClientRect().height < sec.getBoundingClientRect().height * 0.34)
            out.push('el texto empuja la escena a menos de un tercio de la tarjeta');
          const W = +(document.getElementById('stage') as HTMLElement).dataset.w!;
          const H = +(document.getElementById('stage') as HTMLElement).dataset.h!;
          const st = document.getElementById('stage')!.getBoundingClientRect();
          const sx = st.width / W;
          for (const el of box.querySelectorAll('h1,p,li,.col,table')) {
            const b = el.getBoundingClientRect();
            const [x0, y0, x1, y1] = [
              (b.left - st.left) / sx,
              (b.top - st.top) / sx,
              (b.right - st.left) / sx,
              (b.bottom - st.top) / sx,
            ];
            if (x0 < m - 1 || y0 < m - 1 || x1 > W - m + 1 || y1 > H - m + 1) {
              out.push(`«${(el.textContent ?? '').trim().slice(0, 30)}» sale del margen de seguridad`);
              break;
            }
          }
          return out;
        },
        safe,
      );
      for (const p of r) problems.push(`tarjeta ${k + 1} (${id}): ${p}`);
      const fig = page.locator(`#${id} svg.scene`);
      await page.addStyleTag({ content: '.star{visibility:hidden!important}' });
      await page.waitForTimeout(700);
      const a = await fig.screenshot();
      await page.waitForTimeout(2300);
      if (a.equals(await fig.screenshot())) problems.push(`tarjeta ${k + 1} (${id}): la escena no se mueve`);
    }
    checked.push(
      `${ids.length} tarjetas: el texto cabe, respeta el margen de ${safe} px y la escena se mueve`,
    );
  } finally {
    await browser.close();
  }
  return { problems, checked, shots: [] };
}
