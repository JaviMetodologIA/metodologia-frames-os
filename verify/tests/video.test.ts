import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { deck as deckDomain, parseDeck } from '../../domains/deck/index.ts';
import { captionsText, captionsVtt, videoGate } from '../../domains/deck/video.ts';
import { timeline } from '../../engine/capture.ts';
import { repoPath } from '../../engine/paths.ts';
import { loadRegistry } from '../../engine/registry.ts';
import { compare } from '../parity/compare.ts';

const SRC = repoPath('verify/parity/cases/video.method/frames-os/storyboard.yml');
const board = () => parseDeck(readFileSync(SRC, 'utf8'));
const tmp = mkdtempSync(path.join(os.tmpdir(), 'frames-video-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('video.method', () => {
  it('holds the storyboard to Frames method explainer contract', () => {
    expect(videoGate(board())).toEqual([]);
    expect(compare('video.method', 'frames-os')).toMatchObject({ verdict: 'superset' });
    const fast = board();
    fast.slides[0]!.voiceover = Array(30).fill('palabra').join(' ');
    expect(videoGate(fast).join()).toMatch(/palabras por segundo/);
  });

  it('producer, verifier and guardian are three different agents (Frames video-os-state)', () => {
    const steps = loadRegistry().families.find((f) => f.id === 'video.method')!.steps;
    const agent = (id: string) => steps.find((x) => x.id === id)!.agent;
    expect(new Set([agent('V02'), agent('V03'), agent('V04')]).size).toBe(3);
  });

  it('joins beats with their declared transitions on a shared timeline', () => {
    const tl = timeline([6, 6, 6], ['fade', 'none', 'zoom'], 30);
    expect(tl.tds[1]).toBe(1 / 30); // 'none' is a one-frame cut
    expect(tl.tds[2]).toBe(0.5);
    expect(tl.starts[1]).toBeCloseTo(6 - 1 / 30, 6);
    expect(tl.total).toBeCloseTo(18 - 1 / 30 - 0.5, 6);
    const d = board();
    const trs = d.slides.map((s) => s.transition ?? d.meta.transition);
    const vtt = captionsVtt(d, trs);
    expect(captionsText(vtt)).toBe(d.slides.map((s) => s.voiceover).join(' '));
    // The first cue of beat 2 starts where the timeline puts beat 2.
    const starts = timeline(
      d.slides.map((s) => s.hold ?? d.meta.hold),
      trs,
      30,
    ).starts;
    const secondBeat = vtt.split('\n\n').find((b) => b.includes('Todo empieza'))!;
    const [h, m, sec] = secondBeat.split('\n')[1]!.split(' --> ')[0]!.split(':').map(Number);
    expect(h! * 3600 + m! * 60 + sec!).toBeCloseTo(starts[1]!, 2);
  });

  it('renders a method explainer to MP4 with captions equal to the narration', async () => {
    const run = mkdtempSync(path.join(tmp, 'run-'));
    mkdirSync(path.join(run, 'artifacts'), { recursive: true });
    const d = board();
    d.slides = d.slides.slice(0, 3).map((s) => ({ ...s, hold: 6 })); // 18 s at ≤ 3,2 words per second
    writeFileSync(path.join(run, 'artifacts', 'storyboard.yml'), YAML.stringify(d));
    const step = loadRegistry()
      .families.find((f) => f.id === 'video.method')!
      .steps.find((x) => x.id === 'V02')!;
    const ext: Record<string, string> = { html: '.html', json: '.json', mp4: '.mp4', vtt: '.vtt' };
    const ctx = {
      runDir: run,
      step,
      facts: {},
      inputs: {},
      outputs: step.outputs.map((o) => ({
        id: o.id,
        schema: o.schema,
        required: true,
        file: path.join(run, 'artifacts', `${o.id}${ext[o.schema] ?? '.md'}`),
      })),
      write: (rel: string, data: string | Buffer) => {
        const f = path.join(run, rel);
        mkdirSync(path.dirname(f), { recursive: true });
        writeFileSync(f, data);
        return f;
      },
    };
    const r = await deckDomain.handlers['video.render']!(ctx);
    if (r.status === 'blocked') return; // no browser: a gap, never green
    expect(r, r.note).toMatchObject({ status: 'done' });
    const mp4 = path.join(run, 'artifacts', 'video-mp4.mp4');
    const probe = spawnSync(
      'ffprobe',
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=width,height,r_frame_rate',
        '-of',
        'csv=p=0',
        mp4,
      ],
      { encoding: 'utf8' },
    );
    if (!probe.error) expect(probe.stdout.trim()).toBe('1080,1920,30/1');
    const m = JSON.parse(readFileSync(path.join(run, 'artifacts', 'video-manifest.json'), 'utf8')) as {
      frames: number;
      duration_s: number;
      audio: string;
    };
    expect(m.frames).toBe(540);
    expect(m.duration_s).toBeCloseTo(18 - 1, 1); // two fades of 0.5 s overlap
    expect(m.audio).toBe('none');
    const vtt = readFileSync(path.join(run, 'artifacts', 'video-captions.vtt'), 'utf8');
    expect(captionsText(vtt)).toBe(d.slides.map((s) => s.voiceover).join(' '));
  }, 300_000);
});
