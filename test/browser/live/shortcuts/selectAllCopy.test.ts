/**
 * 必須の回帰テスト #8（requirements.md §6）:「全選択コピーの内容がソースと完全一致」。
 *
 * Live モードは記法を隠して表示する（`**` が消える・表はウィジェットになる）。
 * コピーが**画面の見た目**を拾ってしまうと、貼り付け先で Markdown が壊れる。
 * クリップボードに載る文字列が生ソースと1文字も違わないことを実 Chromium で固定する。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openLive, type LiveHandle } from '../../liveBrowserHarness';

/** 記法をひととおり含む文書（見出し・強調・リスト・コードフェンス・表）。 */
const DOC = [
    '# 見出し',
    '',
    'これは **太字** と *斜体* と `コード` の段落です。',
    '',
    '- 項目1',
    '- [ ] 未チェック',
    '',
    '```js',
    'const a = 1;',
    '```',
    '',
    '| 列A | 列B |',
    '| --- | --- |',
    '| a1 | b1 |',
    ''
].join('\n');

describe('Live モード: 全選択コピー（実ブラウザ）', function () {
    this.timeout(120000);

    let browser: Browser | null = null;
    let h: LiveHandle | undefined;

    before(async () => {
        browser = await launchBrowser();
    });
    after(async function () {
        this.timeout(60000);
        await browser?.close();
    });
    afterEach(async () => {
        if (h) {
            await h.close();
            h = undefined;
        }
    });

    /** ⌘A を必要なだけ押して文書全体を選び、⌘C でクリップボードに載る文字列を返す。 */
    async function copyWholeDocument(handle: LiveHandle): Promise<string> {
        await handle.page.evaluate(`(() => {
            window.__copied = null;
            document.addEventListener('copy', (e) => {
                window.__copied = e.clipboardData ? e.clipboardData.getData('text/plain') : null;
            });
        })()`);

        // ⌘A は段階的に広がる（トークン → ブロック → 文書全体）ので、全体になるまで押す
        for (let i = 0; i < 5; i++) {
            await handle.press('Meta+a');
            const range = await handle.page.evaluate<{ from: number; to: number }>(
                `({ from: window.__liveView.state.selection.main.from, to: window.__liveView.state.selection.main.to })`
            );
            const length = await handle.page.evaluate<number>(`window.__liveView.state.doc.length`);
            if (range.from === 0 && range.to === length) break;
        }
        await handle.press('Meta+c');
        await handle.page.waitForTimeout(150);
        return (await handle.page.evaluate<string | null>(`window.__copied`)) ?? '';
    }

    it('⌘A →⌘C の内容が生 Markdown と完全に一致する', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, DOC);
        await h.setCursor(0);

        const copied = await copyWholeDocument(h);
        assert.strictEqual(copied, await h.doc());
    });

    it('コピーしても文書は変わらない（副作用が無い）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, DOC);
        await h.setCursor(0);
        await copyWholeDocument(h);
        assert.strictEqual(await h.doc(), DOC);
        assert.deepStrictEqual(h.errors, []);
    });
});
