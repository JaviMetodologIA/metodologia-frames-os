// frames capture: stills, PDF and video from the same animated HTML. Time is never
// read from the clock: every frame pins the SVG scene (setCurrentTime) and every CSS
// animation (currentTime) to the same instant, so one input gives the same frames.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch } from './browser.ts';

type Page = import('playwright').Page;
export type Frame = { slide: string; t: number; sha256: string; png?: Buffer; tr?: string };

// Chrome that only a live presenter needs.
const HIDE = '#help,#auto,#overlay{display:none!important}';

async function open(
  page: Page,
  url: string,
  id: string,
): Promise<{ dur: number; freeze: number; tr: string }> {
  await page.goto(`${url}#${id}`);
  await page.reload(); // a fresh document: no transition from the previous slide
  await page.addStyleTag({ content: HIDE });
  return page.$eval(`#${id}`, (e) => ({
    dur: +((e as HTMLElement).dataset.dur ?? 10),
    freeze: +((e as HTMLElement).dataset.freeze ?? 0.9),
    tr: (e as HTMLElement).dataset.tr ?? 'none',
  }));
}

// Pin the active slide: its scene at `t` seconds, its CSS animations (the copy's
// entrance) at `t` too, or at their end for a still, where the text must be whole.
const pin = (page: Page, t: number, copyAtEnd = false) =>
  page.evaluate(
    ([sec, end]) => {
      const svg = document.querySelector('section.slide.active svg.scene') as SVGSVGElement | null;
      if (svg) {
        svg.pauseAnimations();
        svg.setCurrentTime(sec);
      }
      for (const a of document.getAnimations()) {
        a.pause();
        a.currentTime = end ? (a.effect?.getComputedTiming().endTime as number) : sec * 1000;
      }
    },
    [t, copyAtEnd] as const,
  );

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

export type CaptureOpts = {
  html: string;
  width?: number;
  height?: number;
  slides?: string[];
};

async function withPage<T>(
  o: CaptureOpts,
  fn: (page: Page, url: string, ids: string[], size: { w: number; h: number }) => Promise<T>,
) {
  const browser = await launch();
  if (!browser) throw new Error('sin navegador: capture necesita Playwright o un headless shell');
  try {
    const page = await browser.newPage({ viewport: { width: o.width ?? 1600, height: o.height ?? 900 } });
    const url = pathToFileURL(path.resolve(o.html)).href;
    await page.goto(url);
    // The page declares its stage (a deck 1600×900, a carousel frame 1080×1350…).
    const stage = await page.$eval('#stage', (e) => [
      +(e as HTMLElement).dataset.w!,
      +(e as HTMLElement).dataset.h!,
    ]);
    if (!o.width && stage[0] && stage[1]) await page.setViewportSize({ width: stage[0], height: stage[1] });
    const size = { w: o.width ?? stage[0] ?? 1600, h: o.height ?? stage[1] ?? 900 };
    const all: string[] = await page.$$eval('section.slide', (els) => els.map((e) => e.id));
    const ids = o.slides?.length ? all.filter((id) => o.slides!.includes(id)) : all;
    return await fn(page, url, ids, size);
  } finally {
    await browser.close();
  }
}

// One PNG per slide, at its freeze point (the state reduced motion shows). Without
// `outDir` the PNGs come back in memory, for a handler to write through ctx.write.
export function capturePngs(o: CaptureOpts & { outDir?: string }): Promise<Frame[]> {
  if (o.outDir) mkdirSync(o.outDir, { recursive: true });
  return withPage(o, async (page, url, ids) => {
    const frames: Frame[] = [];
    for (const [k, id] of ids.entries()) {
      const { dur, freeze } = await open(page, url, id);
      const t = dur * freeze;
      await pin(page, t, true);
      const png = await page.screenshot();
      if (o.outDir) writeFileSync(path.join(o.outDir, `${String(k + 1).padStart(2, '0')}-${id}.png`), png);
      frames.push({ slide: id, t, sha256: sha(png), png });
    }
    return frames;
  });
}

// A PDF with one page per slide, each scene pinned at its freeze point.
export function capturePdf(o: CaptureOpts & { out: string }): Promise<number> {
  return withPage(o, async (page, _url, ids, size) => {
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(() => {
      for (const s of document.querySelectorAll<HTMLElement>('section.slide')) {
        const svg = s.querySelector('svg.scene') as SVGSVGElement | null;
        if (!svg) continue;
        svg.pauseAnimations();
        svg.setCurrentTime(+(s.dataset.dur ?? 10) * +(s.dataset.freeze ?? 0.9));
      }
    });
    const pdf = await page.pdf({ width: `${size.w}px`, height: `${size.h}px`, printBackground: true });
    writeFileSync(o.out, pdf);
    return ids.length;
  });
}

// Every frame of every slide at `fps`, for `seconds` per slide (default: its loop, up
// to its hold). Returns the frame hashes; `framesDir` receives them as PNG.
export function captureFrames(
  o: CaptureOpts & { framesDir: string; fps?: number; seconds?: number; useHold?: boolean },
): Promise<Frame[]> {
  const fps = o.fps ?? 30;
  mkdirSync(o.framesDir, { recursive: true });
  return withPage(o, async (page, url, ids) => {
    const frames: Frame[] = [];
    let n = 0;
    for (const id of ids) {
      const { dur, tr } = await open(page, url, id);
      const hold = await page.$eval(`#${id}`, (e) => +((e as HTMLElement).dataset.hold ?? 14));
      // A video beat lasts its hold; a preview lasts one loop of its scene.
      const seconds = o.seconds ?? (o.useHold ? hold : Math.min(dur, hold));
      for (let f = 0; f < Math.round(seconds * fps); f++) {
        const t = f / fps;
        await pin(page, t);
        const png = await page.screenshot();
        writeFileSync(path.join(o.framesDir, `${String(n++).padStart(6, '0')}.png`), png);
        frames.push({ slide: id, t, sha256: sha(png), tr });
      }
    }
    return frames;
  });
}

// The deck's transitions, as ffmpeg xfade effects between slide segments.
const XFADE: Record<string, string> = {
  fade: 'fade',
  push: 'slideleft',
  zoom: 'zoomin',
  morph: 'fade',
  none: 'fade',
};
const ENCODE = [
  '-c:v',
  'libx264',
  '-preset',
  'medium',
  '-crf',
  '20',
  '-pix_fmt',
  'yuv420p',
  '-threads',
  '1',
  '-fflags',
  '+bitexact',
  '-flags:v',
  '+bitexact',
  '-map_metadata',
  '-1',
];

function ffmpeg(args: string[]): void {
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { encoding: 'utf8' });
  if (r.error) throw new Error('ffmpeg no está instalado: capture --mp4 lo necesita');
  if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr.trim().split('\n').pop()}`);
}

// The video's timeline: each beat's start once transitions overlap, each transition's
// length (`none` is a one-frame cut), and the total. Captions and the encoder share it.
export function timeline(durs: number[], trs: string[], fps: number, T = 0.5) {
  const starts = [0];
  const tds = [0];
  let acc = durs[0] ?? 0;
  for (let k = 1; k < durs.length; k++) {
    const td = trs[k] === 'none' ? 1 / fps : Math.min(T, acc / 2, durs[k]! / 2);
    starts.push(acc - td);
    tds.push(td);
    acc += durs[k]! - td;
  }
  return { starts, tds, total: acc };
}

// MP4 from the frames: one segment per slide, joined by the transition the entering
// slide declares (`transition` seconds; `none` is a one-frame cut). Single-threaded,
// bit-exact, no metadata: the same HTML gives the same bytes.
export async function captureMp4(
  o: CaptureOpts & { out: string; fps?: number; seconds?: number; transition?: number; useHold?: boolean },
) {
  const fps = o.fps ?? 30;
  const dir = mkdtempSync(path.join(os.tmpdir(), 'frames-capture-'));
  try {
    const frames = await captureFrames({ ...o, framesDir: dir, fps });
    const segs: { n: number; start: number; tr: string }[] = [];
    frames.forEach((f, i) => {
      const last = segs[segs.length - 1];
      if (!last || frames[i - 1]!.slide !== f.slide) segs.push({ n: 1, start: i, tr: f.tr ?? 'none' });
      else last.n++;
    });
    const files = segs.map((g, k) => {
      const f = path.join(dir, `seg-${k}.mp4`);
      ffmpeg([
        '-framerate',
        String(fps),
        '-start_number',
        String(g.start),
        '-i',
        path.join(dir, '%06d.png'),
        '-frames:v',
        String(g.n),
        ...ENCODE,
        f,
      ]);
      return f;
    });
    const tl = timeline(
      segs.map((g) => g.n / fps),
      segs.map((g) => g.tr),
      fps,
      o.transition ?? 0.5,
    );
    if (files.length === 1)
      ffmpeg(['-i', files[0]!, '-c', 'copy', '-map_metadata', '-1', '-fflags', '+bitexact', o.out]);
    else {
      const chain = segs.slice(1).map((g, i) => {
        const k = i + 1;
        const from = k === 1 ? '[0:v]' : `[v${k - 1}]`;
        return `${from}[${k}:v]xfade=transition=${XFADE[g.tr] ?? 'fade'}:duration=${tl.tds[k]!.toFixed(4)}:offset=${tl.starts[k]!.toFixed(4)}[v${k}]`;
      });
      ffmpeg([
        ...files.flatMap((f) => ['-i', f]),
        '-filter_complex',
        chain.join(';'),
        '-map',
        `[v${segs.length - 1}]`,
        ...ENCODE,
        o.out,
      ]);
    }
    const duration = tl.total;
    const framesDigest = sha(Buffer.from(frames.map((f) => f.sha256).join('')));
    return {
      frames: frames.length,
      sha256: sha(readFileSync(o.out)),
      segments: segs.length,
      duration,
      framesDigest,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// A contact sheet: every frame side by side, scaled to `thumb` px wide, on `bg`.
export async function contactSheet(pngs: Buffer[], bg: string, thumb = 270, cols = 5): Promise<Buffer> {
  const browser = await launch();
  if (!browser) throw new Error('sin navegador: la hoja de contacto necesita Playwright');
  try {
    const page = await browser.newPage({ viewport: { width: cols * (thumb + 16) + 16, height: 400 } });
    const imgs = pngs.map((b) => `<img src="data:image/png;base64,${b.toString('base64')}">`).join('');
    await page.setContent(
      `<body style="margin:0;background:${bg}"><div id="g" style="display:grid;grid-template-columns:repeat(${cols},${thumb}px);gap:16px;padding:16px">${imgs}</div><style>img{width:${thumb}px;height:auto;display:block;border-radius:6px}</style></body>`,
    );
    return await page.locator('#g').screenshot();
  } finally {
    await browser.close();
  }
}

// A document (CV, letter) printed to A4. Printed twice: the two PDFs must match once the
// dates Chrome stamps on every print are removed, or the render is not deterministic.
const PDF_DATES = /\/(CreationDate|ModDate) \(D:[^)]*\)/g;
export async function printPdf(o: {
  html: string;
  out: string;
  format?: 'A4' | 'Letter';
}): Promise<{ pages: number; sha256: string }> {
  const browser = await launch();
  if (!browser) throw new Error('sin navegador: printPdf necesita Playwright o un headless shell');
  try {
    const once = async () => {
      const page = await browser.newPage();
      await page.route('**/*', (r) => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
      await page.goto(pathToFileURL(path.resolve(o.html)).href);
      const pdf = await page.pdf({ format: o.format ?? 'A4', printBackground: true });
      await page.close();
      return pdf;
    };
    const [a, b] = [await once(), await once()];
    const strip = (x: Buffer) => x.toString('latin1').replace(PDF_DATES, '');
    if (strip(a) !== strip(b)) throw new Error('PDF_NOT_DETERMINISTIC: dos impresiones difieren');
    writeFileSync(o.out, a);
    return {
      pages: (strip(a).match(/\/Type\s*\/Page\b/g) ?? []).length,
      sha256: sha(Buffer.from(strip(a), 'latin1')),
    };
  } finally {
    await browser.close();
  }
}
