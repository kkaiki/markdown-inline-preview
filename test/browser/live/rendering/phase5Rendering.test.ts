/**
 * Phase 5（水平線・数式・コールアウト・画像・frontmatter）の描画を実 Chromium で固定する。
 *
 * 期待値は Obsidian 実測（obsidian-observed-spec.md §2.6・§2.9〜§2.11）。
 * 数式ブロックは実測どおり「展開中もソースの下に描画結果を併記する」ところまで再現する。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openLive, type LiveHandle } from '../../liveBrowserHarness';

const HR = '前の段落\n\n---\n\n後の段落\n';
const MATH = '前の段落\n\n$$\nE = mc^2\n$$\n\n後の段落\n';
const CALLOUT = '前の段落\n\n> [!warning] 注意\n> 気をつけてください。\n\n後の段落\n';

describe('Live モード: Phase 5 の描画（実ブラウザ）', function () {
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

    describe('水平線（行スコープ）', () => {
        it('カーソルが他の行にあるときは罫線として描かれる', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, HR);
            await h.setCursor(0);
            const n = await h.page.evaluate<number>(`document.querySelectorAll('.cm-live-hr').length`);
            assert.strictEqual(n, 1);
            assert.strictEqual(await h.renderedLine(3), '');
        });

        it('その行にカーソルを置くと生の "---" に戻る', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, HR);
            await h.setCursor(7);
            assert.strictEqual(await h.renderedLine(3), '---');
        });
    });

    describe('数式ブロック（ブロックスコープ）', () => {
        it('カーソルが外にあるとき KaTeX で描画される', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, MATH);
            await h.setCursor(0);
            const n = await h.page.evaluate<number>(
                `document.querySelectorAll('.cm-live-math-block .katex').length`
            );
            assert.strictEqual(n, 1, 'KaTeX が描画されていない');
        });

        it('ブロックの中にカーソルを置くと生テキストに戻り、描画結果も併記される', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, MATH);
            await h.setCursor(10); // 'E = mc^2' の中
            const lines = await h.renderedLines();
            assert.ok(lines.some((l) => l === '$$'), `生の $$ が出ていない: ${JSON.stringify(lines)}`);
            const n = await h.page.evaluate<number>(
                `document.querySelectorAll('.cm-live-math-block .katex').length`
            );
            assert.strictEqual(n, 1, '展開中に描画結果が併記されていない');
        });

        it('壊れた数式でもエディタが落ちない', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '$$\n\\frac{\n$$\n');
            await h.setCursor(0);
            assert.strictEqual(await h.doc(), '$$\n\\frac{\n$$\n');
            assert.deepStrictEqual(h.errors, []);
        });
    });

    describe('インライン数式（トークンスコープ）', () => {
        it('カーソルが外にあるとき KaTeX で描画される', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, 'これは $a^2 + b^2$ の式。\n\n本文\n');
            await h.setCursor(22);
            const n = await h.page.evaluate<number>(
                `document.querySelectorAll('.cm-live-math-inline .katex').length`
            );
            assert.strictEqual(n, 1);
        });

        it('トークンの中にカーソルを置くと生テキストに戻る', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, 'これは $a^2 + b^2$ の式。\n');
            await h.setCursor(6);
            assert.strictEqual(await h.renderedLine(1), 'これは $a^2 + b^2$ の式。');
        });
    });

    describe('コールアウト（ブロックスコープ）', () => {
        it('カーソルが外にあるときボックスとして描かれる', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, CALLOUT);
            await h.setCursor(0);
            const info = await h.page.evaluate<{ cls: string; title: string; body: string } | null>(`(() => {
                const el = document.querySelector('.cm-live-callout');
                if (!el) return null;
                return {
                    cls: el.className,
                    title: el.querySelector('.cm-live-callout-title').textContent,
                    body: el.querySelector('.cm-live-callout-body').textContent
                };
            })()`);
            assert.ok(info, 'コールアウトが描画されていない');
            assert.ok(info.cls.includes('cm-live-callout-warning'), `種別クラスが無い: ${info.cls}`);
            assert.strictEqual(info.title, '注意');
            assert.strictEqual(info.body, '気をつけてください。');
        });

        it('ブロックの中にカーソルを置くと素の引用行に戻る', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, CALLOUT);
            await h.setCursor(12);
            const lines = await h.renderedLines();
            assert.ok(
                lines.some((l) => l.includes('> [!warning] 注意')),
                `生のコールアウトが出ていない: ${JSON.stringify(lines)}`
            );
        });
    });

    describe('画像（トークンスコープ）', () => {
        const PNG =
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

        it('カーソルが外にあるとき img として描画される', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, `画像: ![alt text](${PNG})\n\n本文\n`);
            await h.setCursor(await h.doc().then((d) => d.length - 3));
            const alt = await h.page.evaluate<string | null>(`(() => {
                const img = document.querySelector('img.cm-live-image');
                return img ? img.getAttribute('alt') : null;
            })()`);
            assert.strictEqual(alt, 'alt text');
        });

        it('トークンの中にカーソルを置くと生テキストに戻る', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, `画像: ![alt text](${PNG})\n`);
            await h.setCursor(6);
            assert.ok((await h.renderedLine(1)).includes('![alt text]('));
        });
    });

    describe('frontmatter（生表示のまま）', () => {
        it('YAML はそのまま表示され、専用の背景が付く', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '---\ntitle: テスト\n---\n\n本文\n');
            await h.setCursor(22); // 本文の行
            assert.strictEqual(await h.renderedLine(1), '---');
            assert.strictEqual(await h.renderedLine(2), 'title: テスト');
            const n = await h.page.evaluate<number>(`document.querySelectorAll('.cm-live-frontmatter').length`);
            assert.strictEqual(n, 3);
        });

        it('先頭の "---" を水平線にしない', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, '---\ntitle: テスト\n---\n\n本文\n');
            await h.setCursor(22); // 本文の行
            const n = await h.page.evaluate<number>(`document.querySelectorAll('.cm-live-hr').length`);
            assert.strictEqual(n, 0);
        });
    });
});
