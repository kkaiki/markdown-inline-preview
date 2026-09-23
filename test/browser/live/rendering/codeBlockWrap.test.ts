/**
 * フェンスコードブロックは長い行を折り返し、横スクロールしないこと（実 Chromium）。
 *
 * ユーザー指摘（2026-09-23）:「横スクロールを変えて欲しいです。折り返すようにして欲しいです」。
 * 2026-09-14 に一度「コードは折り返さず横スクロール」へ変えたが、方針をここで逆にする
 * （旧テスト `codeBlockScroll.test.ts` は本ファイルに置き換え）。
 *
 * 折り返しは空白の無い長い文字列（URL やハッシュ値など）でも起きる必要があるため、
 * 単語境界に関係なく折り返す（`overflow-wrap: anywhere`）。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openLive, type LiveHandle } from '../../liveBrowserHarness';

const LONG_LINE = 'x'.repeat(200);
const DOC = `本文\n\n\`\`\`\n${LONG_LINE}\n短い行\n\`\`\`\n\n後の段落\n`;

describe('Live モード: コードブロックの折り返し（実ブラウザ）', function () {
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

    it('長いコード行は折り返され、行の高さが増える', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, DOC);

        const raw = await h.page.evaluate(`(() => {
            const lines = Array.from(document.querySelectorAll('.cm-live-code-line:not(.cm-live-code-first):not(.cm-live-code-last)'));
            return lines.map((l) => l.getBoundingClientRect().height);
        })()`);
        const heights = raw as number[];
        assert.strictEqual(heights.length, 2, `コード行が2つのはず: ${JSON.stringify(heights)}`);
        const [longLineHeight, shortLineHeight] = heights;
        assert.ok(
            longLineHeight > shortLineHeight * 1.5,
            `長い行が折り返されていない（長: ${longLineHeight} / 短: ${shortLineHeight}）`
        );
    });

    it('空白の無い長い行（URL・ハッシュ値等）でも折り返される', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, DOC);
        const raw = await h.page.evaluate<number>(`(() => {
            const line = document.querySelectorAll('.cm-live-code-line:not(.cm-live-code-first):not(.cm-live-code-last)')[0];
            return line.scrollWidth - line.clientWidth;
        })()`);
        assert.ok(raw <= 1, `折り返されず、はみ出している（差 ${raw}px）`);
    });

    it('コードブロックは横スクロールしない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, DOC);
        const overflowX = await h.page.evaluate(`(() => {
            const line = document.querySelectorAll('.cm-live-code-line:not(.cm-live-code-first):not(.cm-live-code-last)')[0];
            return getComputedStyle(line).overflowX;
        })()`);
        assert.notStrictEqual(overflowX, 'auto', 'コード行がまだ横スクロール可能になっている');
        assert.notStrictEqual(overflowX, 'scroll', 'コード行がまだ横スクロール可能になっている');
    });

    it('コードブロックがあってもページ全体は横に広がらない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, DOC);
        const overflow = Number(
            await h.page.evaluate(`document.documentElement.scrollWidth - window.innerWidth`)
        );
        assert.ok(overflow <= 1, `ページが横に広がっている（はみ出し ${overflow}px）`);
    });
});
