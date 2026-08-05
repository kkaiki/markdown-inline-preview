/**
 * コードフェンス・表の描画と、背景が常に白であることを実 Chromium で固定する。
 *
 * 背景の要件はユーザー指示（2026-08-05）:
 *   「そこの md ファイルの背景だけ常に白になるようにして欲しい」
 * すなわち VS Code / Cursor のテーマがダークでも、Live の編集エリアだけは
 * 白い紙のように見せる。テーマ変数に依存していないことをここでロックする。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openLive, type LiveHandle } from '../../liveBrowserHarness';

const FENCE = 'あ\n\n```js\nconst a = 1;\nconsole.log(a);\n```\n\nい\n';
const TABLE = '前の段落\n\n| 列A | 列B |\n| --- | --- |\n| a1 | b1 |\n| a2 | b2 |\n\n後の段落\n';

describe('Live モード: ブロック要素の描画（実ブラウザ）', function () {
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

    describe('背景（常に白）', () => {
        it('エディタの背景はテーマに関係なく白', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '本文\n');
            const bg = await h.page.evaluate(`getComputedStyle(document.querySelector('.cm-editor')).backgroundColor`);
            assert.strictEqual(bg, 'rgb(255, 255, 255)');
        });

        it('本文の文字色は白背景で読める暗い色', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '本文\n');
            const fg = await h.page.evaluate(`getComputedStyle(document.querySelector('.cm-editor')).color`);
            assert.strictEqual(fg, 'rgb(31, 35, 40)');
        });
    });

    describe('コードフェンス（ブロックスコープ）', () => {
        it('カーソルが外にあるとき開始フェンスは言語ラベルになる', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, FENCE);
            await h.setCursor(0);
            assert.strictEqual(await h.renderedLine(3), 'js');
        });

        it('カーソルが外にあるとき終了フェンスは空表示になる', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, FENCE);
            await h.setCursor(0);
            assert.strictEqual(await h.renderedLine(6), '');
        });

        it('コード本文にカーソルを置くと両方のフェンスが生テキストに戻る', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, FENCE);
            await h.setCursor(14); // 'const a = 1;' の中
            assert.strictEqual(await h.renderedLine(3), '```js');
            assert.strictEqual(await h.renderedLine(6), '```');
        });

        it('ブロック全体に背景が付く', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, FENCE);
            await h.setCursor(0);
            const n = await h.page.evaluate(`document.querySelectorAll('.cm-live-code-line').length`);
            assert.strictEqual(n, 4, '開始・本文2行・終了の4行に背景が付くべき');
        });

        it('コード本文の記法は装飾されない', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '```\n**not bold**\n```\n');
            await h.setCursor(0);
            assert.strictEqual(await h.renderedLine(2), '**not bold**');
        });
    });

    describe('表', () => {
        it('カーソルが外にあるとき実 table として描画される', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, TABLE);
            await h.setCursor(0);
            const info = await h.page.evaluate(`(() => {
                const t = document.querySelector('table.cm-live-table');
                if (!t) return null;
                return {
                    headers: [...t.querySelectorAll('th')].map(e => e.textContent),
                    rows: [...t.querySelectorAll('tbody tr')].map(tr => [...tr.querySelectorAll('td')].map(td => td.textContent))
                };
            })()`);
            assert.deepStrictEqual(info, {
                headers: ['列A', '列B'],
                rows: [['a1', 'b1'], ['a2', 'b2']]
            });
        });

        it('区切り行は描画されない', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, TABLE);
            await h.setCursor(0);
            const text = await h.page.evaluate<string>(
                `document.querySelector('table.cm-live-table').textContent`
            );
            assert.ok(!text.includes('---'), `区切り行が描画されている: ${text}`);
        });

        it('表の中にカーソルを置いても畳まれたまま（Phase 4b でセル内編集に変更）', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, TABLE);
            await h.setCursor(15); // 表の1行目
            const lines = await h.renderedLines();
            assert.ok(
                !lines.some((l) => l.includes('| 列A | 列B |')),
                `生のパイプ記法が出ている: ${JSON.stringify(lines)}`
            );
        });

        it('表を描画してもドキュメントは変わらない', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, TABLE);
            await h.setCursor(0);
            assert.strictEqual(await h.doc(), TABLE);
            assert.deepStrictEqual(h.errors, []);
        });
    });
});
