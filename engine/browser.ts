// One way to get a browser for the visual gate and for capture.
import { existsSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type Browser = import('playwright').Browser;

// Use Playwright's own browser; if its build is not cached, any cached headless shell.
export async function launch(): Promise<Browser | null> {
  const { chromium } = await import('playwright');
  try {
    return await chromium.launch();
  } catch {
    const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright');
    const dirs = existsSync(cache)
      ? readdirSync(cache)
          .filter((d) => d.startsWith('chromium_headless_shell-'))
          .sort()
      : [];
    for (const d of dirs.reverse()) {
      const bin = path.join(cache, d, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell');
      if (existsSync(bin)) return chromium.launch({ executablePath: bin });
    }
    return null;
  }
}
