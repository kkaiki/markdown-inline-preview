/**
 * 実ブラウザ回帰テスト: 見出しの行頭 Backspace による 1 段階ずつの降格。
 *
 * ## 背景
 *
 * 記法の実テキスト展開があった頃は、フォーカスで挿入された `####` を 1 文字ずつ
 * Backspace して見出しレベルを変えていた。この方式は「`#` を全部消すと区切りの NBSP が
 * 本文に残り、再フォーカスのたびにレベルが増殖して見える」実バグを生んでいた
 * （旧 `fixes/heading-prefix-zero-hash-collapse-fix.md`）。
 *
 * 展開を廃止（`docs/specifications/no-focus-expand.md`）した現在は、`markerBackspace.ts`
 * が **行頭 Backspace で 1 段階ずつ降格**する（`H4 → H3 → … → H1 → 段落`）。本文へ記法
 * 文字が入らないので残骸も増殖も原理的に起きない。ここではその降格が正しく進むこと、
 * 何度繰り返しても本文が汚れないことを固定する。
 *
 * 実行: `npm run test:browser`。ブラウザが無い環境では skip。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';

describe('実ブラウザ: 見出しの行頭 Backspace で 1 段階ずつ降格する', function () {
    this.timeout(120000);

    let browser: Browser | null = null;
    let h: PreviewHandle | undefined;

    before(async () => { browser = await launchBrowser(); });
    after(async function () {
        this.timeout(60000);
        await Promise.race([
            browser?.close(),
            new Promise<void>(resolve => setTimeout(resolve, 55000))
        ]);
    });
    afterEach(async () => { if (h) { await h.close(); h = undefined; } });

    /** `.milkdown` 配下の要素数。 */
    async function count(selector: string): Promise<number> {
        if (!h) throw new Error('handle 未初期化');
        return h.page.locator(`.milkdown ${selector}`).count();
    }

    /** 見出し行頭へカーソルを置く。 */
    async function focusHeadingStart(text: string): Promise<void> {
        if (!h) throw new Error('handle 未初期化');
        await h.clickTextAt(text);
        await h.press('Home');
    }

    it('H4 の行頭で Backspace すると H3 になる（本文に "#" は残らない）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '#### 見出し\n\n本文\n', '見出し');
        await focusHeadingStart('見出し');
        await h.press('Backspace');

        assert.strictEqual(await count('h3'), 1, 'H3 になっていない');
        assert.strictEqual((await h.docText()).includes('#'), false, '本文に "#" が残っている');
        assert.deepStrictEqual(h.errors, []);
    });

    it('Backspace を繰り返すと H4 → H3 → H2 → H1 → 段落 と 1 段階ずつ降格する', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '#### 見出し\n\n本文\n', '見出し');
        await focusHeadingStart('見出し');

        for (const level of [3, 2, 1]) {
            await h.press('Backspace');
            assert.strictEqual(await count(`h${level}`), 1, `H${level} へ降格していない`);
        }
        await h.press('Backspace');
        assert.strictEqual(await count('h1'), 0, '見出しのままになっている');
        assert.ok((await h.docText()).includes('見出し'), '本文が失われた');
    });

    it('降格を繰り返しても本文に記法文字（# や NBSP）の残骸が積み上がらない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '### 見出し\n\n本文\n', '見出し');

        // 降格 → 別ブロックへ移動 → 戻る、を繰り返す
        for (let i = 0; i < 3; i++) {
            await focusHeadingStart('見出し');
            await h.press('Backspace');
            await h.clickTextAt('本文');
        }

        const text = await h.docText();
        assert.strictEqual(text.includes('#'), false, `"#" の残骸がある: ${JSON.stringify(text)}`);
        assert.strictEqual(text.includes(' '), false, `NBSP の残骸がある: ${JSON.stringify(text)}`);
        assert.deepStrictEqual(h.errors, []);
    });
});
