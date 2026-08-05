/**
 * 大きなファイルでの応答性を実 Chromium で固定する。
 *
 * requirements.md §5:
 *   1万行のファイルを開いて操作可能になるまで 1 秒以内 / 入力から描画まで 1 フレーム。
 *
 * decoration を StateField で供給している都合上、素朴に書くと**カーソルを動かすたびに
 * 文書全体を再走査**してしまう。ここは実測値でしか守れないので、実ブラウザで測る。
 * 閾値は環境差を見込んで要件より緩めてあるが、「毎回フルスキャン」に戻ると
 * 確実に超える水準にしてある（退行検出が目的なので、これ以上緩めないこと）。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openLive, type LiveHandle } from '../../liveBrowserHarness';

/** 1万行のそれっぽい Markdown。 */
function bigDocument(lines: number): string {
    const out: string[] = [];
    for (let i = 0; i < lines / 5; i++) {
        out.push(`## 見出し ${i}`);
        out.push('');
        out.push(`本文に **太字** と \`コード\` と [リンク](https://example.com/${i}) を含む段落。`);
        out.push(`- 箇条書き ${i}`);
        out.push('');
    }
    return out.join('\n');
}

describe('Live モード: 大きなファイルでの応答性（実ブラウザ）', function () {
    this.timeout(180000);

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

    it('1万行のファイルを2秒以内に開ける', async function () {
        if (!browser) { this.skip(); return; }
        const doc = bigDocument(10000);
        const started = Date.now();
        h = await openLive(browser, doc);
        const elapsed = Date.now() - started;
        assert.strictEqual((await h.doc()).length, doc.length, '内容が欠けている');
        assert.ok(elapsed < 2000, `1万行のオープンに ${elapsed}ms かかった`);
    });

    it('1万行でもカーソル移動が 60ms 以内に終わる（毎回フルスキャンしていない）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, bigDocument(10000));
        const ms = await h.page.evaluate<number>(`(() => {
            const v = window.__liveView;
            v.focus();
            const t0 = performance.now();
            for (let i = 0; i < 20; i++) v.dispatch({ selection: { anchor: 100 + i * 37 } });
            return (performance.now() - t0) / 20;
        })()`);
        assert.ok(ms < 60, `カーソル移動 1 回あたり ${ms.toFixed(1)}ms かかっている`);
    });

    it('1万行でも1文字の入力が 80ms 以内に終わる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, bigDocument(10000));
        const ms = await h.page.evaluate<number>(`(() => {
            const v = window.__liveView;
            v.focus();
            v.dispatch({ selection: { anchor: 50 } });
            const t0 = performance.now();
            for (let i = 0; i < 10; i++) {
                v.dispatch({ changes: { from: 50 + i, insert: 'x' }, selection: { anchor: 51 + i } });
            }
            return (performance.now() - t0) / 10;
        })()`);
        assert.ok(ms < 80, `1文字入力あたり ${ms.toFixed(1)}ms かかっている`);
    });
});
