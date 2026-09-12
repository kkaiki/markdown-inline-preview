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
        // mermaid を描く分、後始末が重い。全スイート連続実行では 20 秒では足りず
        // "after all" hook がタイムアウトしていた（2026-09-12）。
        this.timeout(60000);
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

    describe('host（VS Code 本体）からの「すべて選択」', () => {
        /*
         * 実 VS Code の webview では、⌘A を押すと CM が段階選択を終えた**あとに**
         * 本体が document.execCommand('selectAll') を送ってきて、選択が文書全体へ
         * 上書きされる（2026-08-09 に実機を CDP で計測して確認）。
         * webview 単体のこのテストには本体が居ないので、その1手を手で再現する。
         */
        it('⌘A の直後に本体が selectAll を送ってきても段階選択が保たれる', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, FENCE);
            await h.setCursor(FENCE.indexOf('const a') + 3);
            await h.press('Meta+a');
            await h.page.evaluate(`document.execCommand('selectAll')`);
            await h.page.waitForTimeout(80);
            assert.deepStrictEqual(await selection(h), {
                from: FENCE.indexOf('const a'),
                to: FENCE.indexOf('\n```\n\nい')
            });
        });

        it('本体の selectAll が遅れて届いても段階が勝手に進まない', async function () {
            if (!browser) { this.skip(); return; }
            // 時間で判定していたときの退行防止（行を選んだつもりが表全体になる）
            const table = '| A | B |\n| --- | --- |\n| あい | うえ |\n\n本文\n';
            h = await openLive(browser, table);
            await h.setCursor(table.indexOf('あい') + 1);
            await h.press('Meta+a');
            await h.press('Meta+a');
            await h.page.waitForTimeout(1200);
            await h.page.evaluate(`document.execCommand('selectAll')`);
            await h.page.waitForTimeout(80);
            const s = await selection(h);
            assert.strictEqual(table.slice(s.from, s.to), '| あい | うえ |');
        });

        it('表のセルでも同じく上書きされない', async function () {
            if (!browser) { this.skip(); return; }
            const table = '| A | B |\n| --- | --- |\n| あい | うえ |\n\n本文\n';
            h = await openLive(browser, table);
            await h.setCursor(table.indexOf('あい') + 1);
            await h.press('Meta+a');
            await h.page.evaluate(`document.execCommand('selectAll')`);
            await h.page.waitForTimeout(80);
            const s = await selection(h);
            assert.strictEqual(table.slice(s.from, s.to), 'あい');
        });

        it('キー操作と無関係に来た selectAll（メニューの「すべて選択」）は段階選択として効く', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, FENCE);
            await h.setCursor(FENCE.indexOf('const a') + 3);
            await h.page.evaluate(`document.execCommand('selectAll')`);
            await h.page.waitForTimeout(80);
            assert.deepStrictEqual(await selection(h), {
                from: FENCE.indexOf('const a'),
                to: FENCE.indexOf('\n```\n\nい')
            });
        });
    });

    describe('表のセルの中での ⌘A', () => {
        const TABLE = '| A | B |\n| --- | --- |\n| あい | うえ |\n\n本文\n';
        const TABLE_END = TABLE.indexOf('|\n\n本文') + 1;

        /** 選択されているソース文字列。 */
        async function selected(handle: LiveHandle): Promise<string> {
            const s = await selection(handle);
            return TABLE.slice(s.from, s.to);
        }

        it('1回目はカーソルのあるセルだけを選ぶ', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, TABLE);
            await h.setCursor(TABLE.indexOf('あい') + 1);
            await h.press('Meta+a');
            assert.strictEqual(await selected(h), 'あい');
        });

        it('2回目はその行', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, TABLE);
            await h.setCursor(TABLE.indexOf('あい') + 1);
            await h.press('Meta+a');
            await h.press('Meta+a');
            assert.strictEqual(await selected(h), '| あい | うえ |');
        });

        it('3回目は表全体', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, TABLE);
            await h.setCursor(TABLE.indexOf('あい') + 1);
            await h.press('Meta+a');
            await h.press('Meta+a');
            await h.press('Meta+a');
            assert.deepStrictEqual(await selection(h), { from: 0, to: TABLE_END });
        });

        it('4回目は文書全体', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, TABLE);
            await h.setCursor(TABLE.indexOf('あい') + 1);
            for (let i = 0; i < 4; i++) await h.press('Meta+a');
            assert.deepStrictEqual(await selection(h), { from: 0, to: TABLE.length });
        });

        it('選んだセルをコピーすると生 Markdown ではなくセルの中身だけが載る', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, TABLE);
            await h.setCursor(TABLE.indexOf('うえ') + 1);
            await h.press('Meta+a');
            assert.strictEqual(await selected(h), 'うえ');
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
