/**
 * 幅が狭いときのツールバーの振る舞い（実 Chromium）。
 *
 * ユーザー報告（2026-09-12）: エディタのペインが狭いとツールバーが収まりきらず、
 * 画面（＝編集領域）そのものが横に広がってしまう。ツールバーは**枠内に収めて、
 * はみ出す分はツールバー自身の横スクロール**にしたい。
 *
 * jsdom ではレイアウト幅が出ないので実ブラウザで固定する。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openLive, type LiveHandle } from '../../liveBrowserHarness';

const DOC = '# 見出し\n\n本文\n';

describe('Live モード: 狭い幅でのツールバー（実ブラウザ）', function () {
    this.timeout(120000);

    let browser: Browser | null = null;
    let h: LiveHandle | undefined;

    before(async () => {
        browser = await launchBrowser();
    });
    after(async function () {
        // 全スイート連続実行では後始末（browser.close）が 20 秒に収まらず
        // "after all" hook がタイムアウトすることがある（2026-09-12）。
        this.timeout(60000);
        await browser?.close();
    });
    afterEach(async () => {
        if (h) {
            await h.close();
            h = undefined;
        }
    });

    it('ツールバーが収まらない幅でも、ページ全体は横に広がらない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, DOC);
        await h.page.setViewportSize({ width: 460, height: 600 });
        await h.page.waitForTimeout(200);

        const overflow = Number(
            await h.page.evaluate(`document.documentElement.scrollWidth - window.innerWidth`)
        );
        assert.ok(overflow <= 1, `ページが横に広がっている（はみ出し ${overflow}px）`);
    });

    it('はみ出した分はツールバー自身の横スクロールで見られる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, DOC);
        await h.page.setViewportSize({ width: 460, height: 600 });
        await h.page.waitForTimeout(200);

        const scrolled = await h.page.evaluate(`(() => {
            const el = document.querySelector('.cm-live-toolbar-scroll');
            if (!el) return { found: false };
            const overflowing = el.scrollWidth > el.clientWidth + 1;
            el.scrollLeft = el.scrollWidth;
            return { found: true, overflowing, scrollLeft: el.scrollLeft };
        })()`);
        const r = scrolled as { found: boolean; overflowing?: boolean; scrollLeft?: number };
        assert.ok(r.found, 'ツールバーの横スクロール領域（.cm-live-toolbar-scroll）が無い');
        assert.ok(r.overflowing, '狭い幅なのにツールバーがはみ出していない（判定の前提が崩れている）');
        assert.ok((r.scrollLeft ?? 0) > 0, 'ツールバーを横スクロールできない');
    });

    it('広い幅ではツールバーは横スクロールにならない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, DOC);
        await h.page.setViewportSize({ width: 1200, height: 600 });
        await h.page.waitForTimeout(200);

        const overflowing = await h.page.evaluate(`(() => {
            const el = document.querySelector('.cm-live-toolbar-scroll');
            return el ? el.scrollWidth > el.clientWidth + 1 : null;
        })()`);
        assert.strictEqual(overflowing, false);
    });
});
