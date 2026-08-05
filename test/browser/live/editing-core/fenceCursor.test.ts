/**
 * コードフェンスの中にカーソルを入れられることを実 Chromium で固定する。
 *
 * ユーザー報告（2026-08-05）:「``` ``` この中にカーソルを入れることができない」。
 * 原因は「開始フェンスを打っても本文行が作られない」こと。本文行が無いと
 * カーソルを置く場所そのものが存在しない。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openLive, type LiveHandle } from '../../liveBrowserHarness';

describe('Live モード: コードフェンスの中への入力（実ブラウザ）', function () {
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

    it('"```" を打って Enter すると本文行と閉じフェンスができる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '\n');
        await h.setCursor(0);
        await h.type('```');
        await h.press('Enter');
        assert.strictEqual(await h.doc(), '```\n\n```\n');
    });

    it('補完直後のカーソルは本文行にある（そのまま打てる）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '\n');
        await h.setCursor(0);
        await h.type('```js');
        await h.press('Enter');
        await h.type('const a = 1;');
        assert.strictEqual(await h.doc(), '```js\nconst a = 1;\n```\n');
    });

    it('すでに閉じているフェンスでは二重に補完しない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '```js\n```\n');
        await h.setCursor(5); // 開始フェンス行の末尾
        await h.press('Enter');
        assert.strictEqual(await h.doc(), '```js\n\n```\n', '普通の改行で本文行が1つ増えるだけ');
    });

    it('空のフェンスでも開始行の末尾で Enter すれば本文行を作れる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '前\n\n```\n```\n\n後\n');
        await h.setCursor(6); // 開始フェンス行の末尾
        await h.press('Enter');
        await h.type('x');
        assert.strictEqual(await h.doc(), '前\n\n```\nx\n```\n\n後\n');
    });

    it('本文行があればクリックでその行に入れる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '前\n\n```\ncode\n```\n\n後\n');
        await h.setCursor(0);
        const pos = await h.page.evaluate<{ x: number; y: number } | null>(`(() => {
            const el = [...document.querySelectorAll('.cm-content > .cm-line')].find(e => e.textContent === 'code');
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { x: r.x + 20, y: r.y + r.height / 2 };
        })()`);
        assert.ok(pos, 'コード本文の行が見つからない');
        await h.page.mouse.click(pos.x, pos.y);
        await h.page.waitForTimeout(200);
        const cursor = await h.cursor();
        const doc = await h.doc();
        assert.ok(
            cursor >= doc.indexOf('code') && cursor <= doc.indexOf('code') + 4,
            `コード本文にカーソルが入っていない: ${cursor}`
        );
    });
});
