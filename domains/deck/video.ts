// video.method: a method explainer as a deck-v1 where each slide is a beat with its
// narration (voiceover) and its hold in seconds. Frames' method-explainer contract
// (video-os _schema/method-explainer-*.schema.ts) supplies the rules; Frames planned
// and validated JSON and never rendered this video.
import type { DeckV1 } from './schema.ts';
import { timeline } from '../../engine/capture.ts';

export const VIDEO = {
  fps: 30,
  minSeconds: 15,
  maxSeconds: 180,
  maxBeats: 30,
  maxWordsPerSecond: 3.2,
} as const;

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const beatSeconds = (d: DeckV1) => d.slides.map((s) => s.hold ?? d.meta.hold);

export function videoGate(d: DeckV1): string[] {
  const errs: string[] = [];
  const holds = beatSeconds(d);
  const total = holds.reduce((a, b) => a + b, 0);
  if (d.slides.length > VIDEO.maxBeats) errs.push(`${d.slides.length} beats: el máximo es ${VIDEO.maxBeats}`);
  if (total < VIDEO.minSeconds || total > VIDEO.maxSeconds)
    errs.push(`duración ${total} s: un video de método dura de ${VIDEO.minSeconds} a ${VIDEO.maxSeconds} s`);
  d.slides.forEach((s, k) => {
    const at = `beat ${k + 1} (${s.id})`;
    if (!s.voiceover) return errs.push(`${at}: sin voiceover`);
    const wps = words(s.voiceover) / holds[k]!;
    if (wps > VIDEO.maxWordsPerSecond)
      errs.push(
        `${at}: ${wps.toFixed(1)} palabras por segundo (máximo ${VIDEO.maxWordsPerSecond}); alarga el hold o acorta la voz`,
      );
    if ((s.items?.length ?? 0) > 8) errs.push(`${at}: más de 8 elementos en pantalla`);
    if ([s.title, s.sub ?? '', ...(s.items ?? [])].some((x) => x.length > 160))
      errs.push(`${at}: un texto en pantalla pasa de 160 caracteres`);
  });
  return errs;
}

const stamp = (t: number) => {
  const ms = Math.round(t * 1000);
  const h = Math.floor(ms / 3.6e6);
  const m = Math.floor((ms % 3.6e6) / 6e4);
  const s = Math.floor((ms % 6e4) / 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
};

// Sentences, then commas, until each cue fits two lines of about 42 characters.
function cues(text: string, max = 84): string[] {
  const out: string[] = [];
  for (const sentence of text.split(/(?<=[.!?…])\s+/)) {
    let rest = sentence.trim();
    while (rest.length > max) {
      // Prefer a comma (kept with its clause), else the last space before the limit.
      const comma = rest.lastIndexOf(', ', max);
      const cut = comma > 0 ? comma + 1 : rest.lastIndexOf(' ', max);
      out.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) out.push(rest);
  }
  return out;
}

// WebVTT whose cue text is exactly the voiceover, timed on the video's own timeline.
export function captionsVtt(d: DeckV1, trs: string[], fps: number = VIDEO.fps): string {
  const holds = beatSeconds(d);
  const tl = timeline(holds, trs, fps);
  const lines = ['WEBVTT', ''];
  let n = 0;
  d.slides.forEach((s, k) => {
    if (!s.voiceover) return;
    const start = tl.starts[k]!;
    const end = k + 1 < holds.length ? tl.starts[k + 1]! : tl.total;
    const parts = cues(s.voiceover);
    const total = parts.reduce((a, p) => a + p.length, 0);
    let t = start;
    for (const p of parts) {
      const dt = ((end - start) * p.length) / total;
      lines.push(String(++n), `${stamp(t)} --> ${stamp(t + dt)}`, p, '');
      t += dt;
    }
  });
  return lines.join('\n');
}

// The captions carry the narration word for word (Frames: caption text == voiceover).
export const captionsText = (vtt: string) =>
  vtt
    .split('\n\n')
    .slice(1)
    .map((b) => b.split('\n').slice(2).join(' ').trim())
    .filter(Boolean)
    .join(' ');
