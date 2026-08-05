/**
 * ⌘A の段階的な全選択と、mermaid のプレビューを実 Chromium で固定する。
 *
 * ユーザー指示（2026-08-05）:
 *   「表のセルの中で command a で、そのセルを全部。もう一度でその行、もう一度で表全部、
 *    もう一度で全てのファイルの内容」「``` も、同じようにその中をコピーするように」
 *   「mermaid だけはその下に preview で見やすくなるように」
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openLive, type LiveHandle } from '../../liveBrowserHarness';

const FENCE = 'あ\n\n```js\nconst a = 1;\nconsole.log(a);\n```\n\nい\n';

describe('Live モード: 段階的な全選択と mermaid（実ブラウザ）', function () {
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

    /** 現在の選択範囲。 */
    async function selection(handle: LiveHandle): Promise<{ from: number; to: number }> {
        return handle.page.evaluate<{ from: number; to: number }>(
            `(() => { const s = window.__liveView.state.selection.main; return { from: s.from, to: s.to }; })()`
        );
    }

    describe('コードフェンスの中での ⌘A', () => {
        it('1回目はフェンスの中身だけを選ぶ', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, FENCE);
            await h.setCursor(FENCE.indexOf('const') + 3);
            await h.press('Meta+a');
            const sel = await selection(h);
            assert.strictEqual(
                (await h.doc()).slice(sel.from, sel.to),
                'const a = 1;\nconsole.log(a);'
            );
        });

        it('2回目はフェンス行を含むブロック全体', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, FENCE);
            await h.setCursor(FENCE.indexOf('const') + 3);
            await h.press('Meta+a');
            await h.press('Meta+a');
            const sel = await selection(h);
            assert.ok((await h.doc()).slice(sel.from, sel.to).startsWith('```js'));
        });

        it('3回目は文書全体', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, FENCE);
            await h.setCursor(FENCE.indexOf('const') + 3);
            await h.press('Meta+a');
            await h.press('Meta+a');
            await h.press('Meta+a');
            const sel = await selection(h);
            assert.deepStrictEqual(sel, { from: 0, to: FENCE.length });
        });

        it('コードブロックの外では1回で文書全体', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, FENCE);
            await h.setCursor(0);
            await h.press('Meta+a');
            assert.deepStrictEqual(await selection(h), { from: 0, to: FENCE.length });
        });
    });

    describe('mermaid', () => {
        const MERMAID = 'あ\n\n```mermaid\ngraph TD;\n  A-->B;\n```\n\nい\n';

        it('ソースは畳まれず、その下に図が描かれる', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, MERMAID);
            await h.setCursor(0);
            await h.page.waitForTimeout(1200);
            const lines = await h.renderedLines();
            assert.ok(
                lines.some((l) => l.includes('graph TD;')),
                `ソースが見えていない: ${JSON.stringify(lines)}`
            );
            const svg = await h.page.evaluate<number>(
                `document.querySelectorAll('.cm-live-mermaid svg').length`
            );
            assert.strictEqual(svg, 1, 'mermaid の図が描画されていない');
        });

        it('壊れた図でもエディタが落ちない', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '```mermaid\n((((\n```\n');
            await h.setCursor(0);
            await h.page.waitForTimeout(1200);
            assert.strictEqual(await h.doc(), '```mermaid\n((((\n```\n');
        });

        it('mermaid 以外のコードブロックには図を出さない', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, FENCE);
            await h.setCursor(0);
            await h.page.waitForTimeout(600);
            const n = await h.page.evaluate<number>(`document.querySelectorAll('.cm-live-mermaid').length`);
            assert.strictEqual(n, 0);
        });
    });
});
