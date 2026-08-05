/**
 * Live モードの行番号ガターを実 Chromium で固定する。
 *
 * Obsidian 実測（obsidian-observed-spec.md §5）:
 *   行番号は**視覚行に1対1**で対応し、ウィジェットに畳まれたブロック（表・コールアウト・
 *   数式ブロック）はその**先頭のソース行番号だけ**を表示する。中間行の番号は
 *   「空欄」ではなく**表示自体が無くなる**。
 *
 * 設定 `markdownInline.live.showLineNumbers` で出し分ける。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openLive, type LiveHandle } from '../../liveBrowserHarness';

describe('Live モード: 行番号ガター（実ブラウザ）', function () {
    this.timeout(120000);

    let browser: Browser | null = null;
    let h: LiveHandle | undefined;

    before(async () => {
        browser = await launchBrowser();
    });
    after(async function () {
        this.timeout(20000);
        await browser?.close();
    });
    afterEach(async () => {
        if (h) {
            await h.close();
            h = undefined;
        }
    });

    /**
     * ガターに**実際に見えている**番号の並び。
     * CodeMirror は桁幅を確保するための不可視スペーサー（visibility: hidden）を
     * 先頭に置くので、それを除く。
     */
    async function gutterNumbers(handle: LiveHandle): Promise<string[]> {
        return handle.page.evaluate<string[]>(`(() => [...document.querySelectorAll('.cm-gutterElement')]
            .filter(e => getComputedStyle(e).visibility !== 'hidden')
            .map(e => e.textContent)
            .filter(t => /^\\d+$/.test(t)))()`);
    }

    it('設定が有効なら行番号が出る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, 'あ\nい\nう\n', { showLineNumbers: true });
        assert.deepStrictEqual(await gutterNumbers(h), ['1', '2', '3', '4']);
    });

    it('設定が無効なら行番号は出ない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, 'あ\nい\n', { showLineNumbers: false });
        assert.deepStrictEqual(await gutterNumbers(h), []);
    });

    it('畳まれた表は先頭のソース行番号だけを表示する（中間行の番号は出ない）', async function () {
        if (!browser) { this.skip(); return; }
        // 1:段落1 / 2:空 / 3-5:表 / 6:空 / 7:段落2 / 8:空
        const doc = '段落1\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n段落2\n';
        h = await openLive(browser, doc, { showLineNumbers: true });
        await h.setCursor(0);
        assert.deepStrictEqual(await gutterNumbers(h), ['1', '2', '3', '6', '7', '8']);
    });

    it('表にカーソルを入れても畳まれたままなので行番号は変わらない（Phase 4b）', async function () {
        if (!browser) { this.skip(); return; }
        const doc = '段落1\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n段落2\n';
        h = await openLive(browser, doc, { showLineNumbers: true });
        await h.setCursor(9); // 表の中
        assert.deepStrictEqual(await gutterNumbers(h), ['1', '2', '3', '6', '7', '8']);
    });

    it('コールアウトにカーソルを入れて展開すると中間行の番号も戻る', async function () {
        if (!browser) { this.skip(); return; }
        const doc = '段落1\n\n> [!note] t\n> b\n\n段落2\n';
        h = await openLive(browser, doc, { showLineNumbers: true });
        await h.setCursor(9); // コールアウトの中
        assert.deepStrictEqual(await gutterNumbers(h), ['1', '2', '3', '4', '5', '6', '7']);
    });

    it('畳まれたコールアウトも先頭のソース行番号だけを表示する', async function () {
        if (!browser) { this.skip(); return; }
        const doc = '段落1\n\n> [!note] t\n> b\n\n段落2\n';
        h = await openLive(browser, doc, { showLineNumbers: true });
        await h.setCursor(0);
        assert.deepStrictEqual(await gutterNumbers(h), ['1', '2', '3', '5', '6', '7']);
    });

    it('行番号は Raw モードと同じ実ソース行番号（記法の収縮でズレない）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '# 見出し\n\n**太字**の段落\n', { showLineNumbers: true });
        await h.setCursor(0);
        assert.deepStrictEqual(await gutterNumbers(h), ['1', '2', '3', '4']);
    });
});
