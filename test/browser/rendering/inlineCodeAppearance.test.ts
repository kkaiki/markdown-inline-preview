/**
 * 実ブラウザ回帰テスト: インラインコード（`` `code` ``）の見た目を Raw（インラインプレビュー）に揃える。
 *
 * ## 背景
 *
 * ユーザー要望（2026-07-27）: 「`` の部分がほぼ inline preview と一緒になるようにして
 * ほしい」。Raw モード（CodeMirror + VS Code のテーマ）のインラインコードは
 * **背景チップを持たず、テーマのコード色（`textPreformat.foreground` 相当）が付いた等幅
 * テキスト**として見える。一方 Preview は角丸グレーのチップ（背景 + padding）で描画して
 * いたため、同じファイルをモード切替すると印象が大きく変わっていた。
 *
 * ここでは Preview 側のインラインコードから背景チップを外し、Raw と同じ「色 + 等幅」だけの
 * 表現になっていることを実 Chromium の computed style で固定する。
 * コードブロック（`pre`）の背景は対象外（ブロック要素としての区別に必要なので残す）。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';

/** `.milkdown` 配下の最初の要素の computed style を返す。 */
async function computed(h: PreviewHandle, selector: string, props: string[]): Promise<Record<string, string>> {
    return h.page.evaluate(({ sel, keys }) => {
        const el = document.querySelector(`.milkdown ${sel}`);
        if (!el) throw new Error(`not found: ${sel}`);
        const cs = getComputedStyle(el);
        const out: Record<string, string> = {};
        for (const k of keys) out[k] = cs.getPropertyValue(k);
        return out;
    }, { sel: selector, keys: props });
}

/** 完全透明（背景が塗られていない）か。 */
function isTransparent(color: string): boolean {
    return color === 'transparent' || /rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(color);
}

describe('実ブラウザ: インラインコードの見た目が Raw と揃っている', function () {
    this.timeout(120000);

    let browser: Browser | null = null;
    let h: PreviewHandle | undefined;

    before(async () => { browser = await launchBrowser(); });
    after(async function () {
        this.timeout(60000);
        await Promise.race([
            browser?.close(),
            new Promise<void>(resolve => setTimeout(resolve, 55000))
        ]);
    });
    afterEach(async () => { if (h) { await h.close(); h = undefined; } });

    it('インラインコードにグレーのチップ背景が付かない', async function () {
        if (!browser) return this.skip();
        h = await openPreview(browser, '`switchToRaw` を呼ぶ\n', 'switchToRaw');

        const cs = await computed(h, 'code', ['background-color', 'padding-left', 'border-radius']);
        assert.ok(isTransparent(cs['background-color']), `背景チップが残っている: ${cs['background-color']}`);
        assert.strictEqual(cs['padding-left'], '0px', `チップの余白が残っている: ${cs['padding-left']}`);
        assert.strictEqual(cs['border-radius'], '0px', `チップの角丸が残っている: ${cs['border-radius']}`);
    });

    it('インラインコードは等幅フォントとテーマのコード色で描画される', async function () {
        if (!browser) return this.skip();
        h = await openPreview(browser, '`switchToRaw` を呼ぶ\n', 'switchToRaw');

        const codeStyle = await computed(h, 'code', ['font-family', 'color']);
        const bodyStyle = await computed(h, 'p', ['color']);
        assert.ok(/mono/i.test(codeStyle['font-family']), `等幅になっていない: ${codeStyle['font-family']}`);
        assert.notStrictEqual(
            codeStyle['color'],
            bodyStyle['color'],
            '本文と同じ色で、コードとして区別できない'
        );
    });

    it('コードブロック（pre）の背景は従来どおり残る', async function () {
        if (!browser) return this.skip();
        h = await openPreview(browser, '```js\nconst a = 1;\n```\n', 'const');

        const cs = await computed(h, 'pre', ['background-color']);
        assert.strictEqual(isTransparent(cs['background-color']), false, 'コードブロックの背景まで消えている');
    });
});
