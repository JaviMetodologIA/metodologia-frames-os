import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { repoPath } from '../../engine/paths.ts';
import { loadTokens, parseDeck } from '../../domains/deck/index.ts';
import { renderDeck } from '../../domains/deck/render.ts';
import { TokensV1 } from '../../domains/deck/schema.ts';

describe('preserved local brand work', () => {
  const deck = parseDeck(
    readFileSync(repoPath('verify/parity/cases/deck.immersive/frames-os/deck.yml'), 'utf8'),
  );
  it('uses an optional persistent mark and a closing logo from local tokens', () => {
    const token = 'data:image/png;base64,aGVsbG8=';
    const html = renderDeck(deck, TokensV1.parse({ ...loadTokens(), logo: token, mark: token }));
    expect(html.match(/<div class="in lockup"/g)).toHaveLength(2);
    expect(html).toContain(`<img class="mark" src="${token}" alt="">`);
    expect(html).toContain('.mark{display:block;height:22px;width:auto}');
  });
  it('escapes hostile quoted attributes on both logo and mark', () => {
    const token = 'data:image/png;base64,abc" onerror="alert(1)';
    const html = renderDeck(deck, TokensV1.parse({ ...loadTokens(), logo: token, mark: token }));
    expect(html).not.toContain('src="data:image/png;base64,abc" onerror="');
    expect(html).toContain('abc&quot; onerror=&quot;alert(1)');
    expect(() => TokensV1.parse({ ...loadTokens(), mark: 'https://example.invalid/mark.svg' })).toThrow();
  });
});
