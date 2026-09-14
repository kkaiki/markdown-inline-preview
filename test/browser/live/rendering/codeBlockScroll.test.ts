/**
 * フェンスコードブロックは折り返さず、横スクロールで見られること（実 Chromium）。
 *
 * ユーザー指摘（2026-09-14）:「コードブロックは、折り返さずに、横スクロールで
 * 移動できるようにするのが基本なのでは？」。
 *
 * Live モードは `EditorView.lineWrapping` を編集領域全体に効かせている
 * （地の文の折り返しのため）ので、素のままだとコード行もそれに巻き込まれて
 * 折り返ってしまう。コード行だけ `white-space: pre` + 横スクロールへ戻す。
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

    it('長いコード行は折り返さず、行の高さは1行分のまま', async function () {
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
            longLineHeight <= shortLineHeight * 1.5,
            `長い行が折り返されて縦に伸びている（長: ${longLineHeight} / 短: ${shortLineHeight}）`
        );
    });

    it('長いコード行はその場で横スクロールできる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, DOC);

        const raw = await h.page.evaluate(`(() => {
            const line = document.querySelectorAll('.cm-live-code-line:not(.cm-live-code-first):not(.cm-live-code-last)')[0];
            const overflowing = line.scrollWidth > line.clientWidth + 1;
            line.scrollLeft = line.scrollWidth;
            return { overflowing, scrollLeft: line.scrollLeft };
        })()`);
        const result = raw as { overflowing: boolean; scrollLeft: number };
        assert.ok(result.overflowing, '長い行がそもそもはみ出していない（テスト前提が崩れている）');
        assert.ok(result.scrollLeft > 0, 'コード行を横スクロールできない');
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
