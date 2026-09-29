/**
 * ツールバーのリンクボタンは、絵文字（🔗）ではなく線画のアイコンで描く（実 Chromium）。
 *
 * ユーザー要望 2026-09-29:「このリンクのアイコンを変更して欲しいです。写真 2 枚目（Slack の書式バー）のような
 * 絵文字ではないアイコンにして」。絵文字は OS のカラーフォントで描かれ、周りの B / I / U / S / <> と
 * 色も太さも揃わない。線画の SVG を `currentColor` で描けば、テーマの文字色に揃い、ホバー時の色変化にも追従する。
 * 描画結果（色・大きさ）は実 DOM が要るので実 Chromium で見る。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openLive, type LiveHandle } from '../../liveBrowserHarness';

const LINK = '.cm-live-toolbar-button[data-format="link"]';
const CODE = '.cm-live-toolbar-button[data-format="code"]';

describe('Live モード: ツールバーのリンクアイコン（実ブラウザ）', function () {
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

    it('リンクボタンには絵文字の文字が無く、線画の SVG アイコンが入っている', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '本文\n', { showLineNumbers: false });
        assert.strictEqual((await h.page.locator(LINK).textContent())?.trim(), '', '文字（絵文字）が残っている');
        assert.strictEqual(await h.page.locator(`${LINK} svg`).count(), 1, 'SVG アイコンが無い');
    });

    it('アイコンの線は隣のボタン（<>）の文字と同じ色で描かれる（テーマの文字色に揃う）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '本文\n', { showLineNumbers: false });
        const [stroke, textColor] = await h.page.evaluate<[string, string]>(`[
            getComputedStyle(document.querySelector('${LINK} svg :is(path, rect, circle, line)')).stroke,
            getComputedStyle(document.querySelector('${CODE}')).color
        ]`);
        assert.strictEqual(stroke, textColor);
    });

    it('アイコンは隣の文字ボタンと同じくらいの大きさで、ボタンの高さを変えない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '本文\n', { showLineNumbers: false });
        const link = await h.page.locator(LINK).boundingBox();
        const code = await h.page.locator(CODE).boundingBox();
        const svg = await h.page.locator(`${LINK} svg`).boundingBox();
        assert.ok(link && code && svg, '位置が取れない');
        assert.strictEqual(Math.round(link.height), Math.round(code.height), 'ボタンの高さが変わった');
        assert.ok(svg.height >= 12 && svg.height <= 18, `アイコンの高さ: ${svg.height}`);
    });

    it('ボタンの読み上げ名は「Link」のまま（アイコン化で名前を失わない）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '本文\n', { showLineNumbers: false });
        assert.strictEqual(await h.page.locator(LINK).getAttribute('aria-label'), 'Link');
    });
});
