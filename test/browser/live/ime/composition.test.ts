/**
 * 日本語 IME（composition）中の挙動を実 Chromium で固定する。
 *
 * requirements.md R4.6:
 *   変換中は展開/収縮の再計算を行わず、確定後に1回だけ再計算する。変換中に
 *   カーソルが飛ばないこと。
 *
 * decoration を毎キーストローク作り直すと、変換中の DOM をエディタ側が差し替えて
 * しまい、未確定文字列が消える・カーソルが行頭へ飛ぶといった典型的な不具合が出る。
 * ここでは CDP の `Input.imeSetComposition` で**実際の composition イベント**を発生させて
 * 検証する（jsdom では再現できない）。
 */
import * as assert from 'assert';
import type { Browser, CDPSession } from 'playwright';
import { launchBrowser, openLive, type LiveHandle } from '../../liveBrowserHarness';

/** IME で `text` を未確定入力してから確定する。 */
async function imeType(h: LiveHandle, cdp: CDPSession, text: string): Promise<void> {
    for (let i = 1; i <= text.length; i++) {
        const part = text.slice(0, i);
        await cdp.send('Input.imeSetComposition', {
            text: part,
            selectionStart: part.length,
            selectionEnd: part.length
        });
        await h.page.waitForTimeout(40);
    }
    await cdp.send('Input.insertText', { text });
    await h.page.waitForTimeout(120);
}

describe('Live モード: 日本語 IME（実ブラウザ）', function () {
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

    it('変換中の文字列が消えず、確定するとその位置に入る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '前\n');
        await h.setCursor(1);
        const cdp = await h.page.context().newCDPSession(h.page);
        await imeType(h, cdp, 'にほんご');
        assert.strictEqual(await h.doc(), '前にほんご\n');
        assert.strictEqual(await h.cursor(), 5, 'カーソルが確定後の末尾に無い');
    });

    it('記法のある行で変換してもカーソルが飛ばない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '**太字**のあと\n');
        await h.setCursor(9); // 行末（'**太字**のあと' は9文字）
        const cdp = await h.page.context().newCDPSession(h.page);
        await imeType(h, cdp, 'にほんご');
        assert.strictEqual(await h.doc(), '**太字**のあとにほんご\n');
        assert.strictEqual(await h.cursor(), 13);
    });

    it('変換中は記法の再計算をしない（確定後に反映される）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '前\n\n本文\n');
        await h.setCursor(1);
        const cdp = await h.page.context().newCDPSession(h.page);
        // "**" を未確定のまま置いても、確定するまでは太字として畳まない
        await cdp.send('Input.imeSetComposition', { text: 'ほげ', selectionStart: 2, selectionEnd: 2 });
        await h.page.waitForTimeout(120);
        const composing = await h.page.evaluate<boolean>(`window.__liveView.composing`);
        assert.strictEqual(composing, true, 'composition 状態として認識されていない');
        await cdp.send('Input.insertText', { text: 'ほげ' });
        await h.page.waitForTimeout(150);
        assert.strictEqual(await h.doc(), '前ほげ\n\n本文\n');
        assert.deepStrictEqual(h.errors, []);
    });

    it('変換確定後に記法が正しく収縮する', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '\n\n本文\n');
        await h.setCursor(0);
        const cdp = await h.page.context().newCDPSession(h.page);
        await imeType(h, cdp, 'あ');
        await h.page.keyboard.type('**強調**');
        await h.setCursor(await h.doc().then((d) => d.length - 3));
        assert.strictEqual(await h.renderedLine(1), 'あ強調', '確定後に記法が収縮していない');
    });
});
