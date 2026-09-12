/**
 * 必須の回帰テスト #7（requirements.md §6）:「収縮中の文字をクリックしたときのカーソル着地位置」。
 *
 * Live モードは記法文字（`**` や `## `）を隠して表示する。画面上の x 座標から
 * ソースのオフセットへ戻す計算がズレると、**クリックした文字の隣にカーソルが落ちる**。
 * 隠し方（decoration の replace / 透明化）を変えたときに真っ先に壊れるところなので、
 * 実 Chromium の実クリックで固定する。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openLive, type LiveHandle } from '../../liveBrowserHarness';

const DOC = ['## 見出しです', '', 'これは **太字** です', '', '- 箇条書きの項目', ''].join('\n');

describe('Live モード: 収縮中の文字のクリック位置（実ブラウザ）', function () {
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

    /** 画面に出ている `needle` の先頭文字の左端をクリックする。 */
    async function clickBeforeChar(handle: LiveHandle, needle: string): Promise<void> {
        const rect = await handle.page.evaluate<{ x: number; y: number } | null>(`(() => {
            const root = document.querySelector('.cm-content');
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            let node;
            while ((node = walker.nextNode())) {
                const i = node.textContent.indexOf(${JSON.stringify(needle)});
                if (i < 0) continue;
                const range = document.createRange();
                range.setStart(node, i);
                range.setEnd(node, i + 1);
                const r = range.getBoundingClientRect();
                if (r.width === 0) continue;
                return { x: r.left + 1, y: r.top + r.height / 2 };
            }
            return null;
        })()`);
        assert.ok(rect, `画面に "${needle}" が見つからない`);
        await handle.page.mouse.click(rect.x, rect.y);
        await handle.page.waitForTimeout(120);
    }

    it('隠れている `**` の分だけカーソルがずれない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, DOC);
        await h.setCursor(0); // 太字トークンは収縮したまま

        await clickBeforeChar(h, '太字');
        assert.strictEqual(await h.cursor(), DOC.indexOf('太字'));
    });

    it('隠れている `## ` の分だけカーソルがずれない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, DOC);
        await h.setCursor(DOC.indexOf('これは'));

        await clickBeforeChar(h, '見出しです');
        assert.strictEqual(await h.cursor(), DOC.indexOf('見出しです'));
    });

    it('透明化したリストマーカーの分だけカーソルがずれない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, DOC);
        await h.setCursor(0);

        await clickBeforeChar(h, '箇条書きの項目');
        assert.strictEqual(await h.cursor(), DOC.indexOf('箇条書きの項目'));
    });

    it('クリックだけでは文書が変わらない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, DOC);
        await h.setCursor(0);
        await clickBeforeChar(h, '太字');
        assert.strictEqual(await h.doc(), DOC);
        assert.deepStrictEqual(h.errors, []);
    });
});
