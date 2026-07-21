/**
 * 実ブラウザ回帰テスト: Cmd+A 段階選択の「括弧の中身」優先段階を、
 * **ビルド済みの実 webview バンドル**（media/milkdown.bundle.js）に対して実キー操作で検証する。
 *
 * test/webview（jsdom）はソースの .ts を直接 esbuild でバンドルしてテストするため、
 * `npm run build:webview` を忘れて media/milkdown.bundle.js が古いままでも green になり得る
 * （実際にこの抜け穴で本番バンドルへの反映漏れが一度発生した）。ここでは実際に VS Code の
 * Preview が読み込むファイルそのものを実 Chromium にロードし、実 Meta+a キー入力で検証する。
 *
 * 実行: `npm run test:browser`。ブラウザが無い環境では skip。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';

describe('実ブラウザ: Cmd+A 括弧の中身優先選択（本番バンドル）', function () {
    this.timeout(120000);

    let browser: Browser | null = null;
    let h: PreviewHandle | undefined;

    before(async () => { browser = await launchBrowser(); });
    after(async function () { this.timeout(20000); await browser?.close(); });
    afterEach(async () => { if (h) { await h.close(); h = undefined; } });

    async function selectedText(handle: PreviewHandle): Promise<string> {
        return handle.page.evaluate(() => {
            /* eslint-disable @typescript-eslint/no-explicit-any */
            const view = (window as any).__view;
            const { from, to } = view.state.selection;
            return view.state.doc.textBetween(from, to, '\n', '\n');
            /* eslint-enable @typescript-eslint/no-explicit-any */
        });
    }

    it('丸括弧の中にカーソルがあれば1回目のCmd+Aで括弧の中身だけを選択する', async function () {
        if (!browser) { this.skip(); return; }
        const text = 'note (detail here) end';
        h = await openPreview(browser, `${text}\n\nsecond paragraph\n`, text);
        await h.placeCursorAfterText('deta');
        await h.press('Meta+a');

        assert.strictEqual(await selectedText(h), 'detail here');
        assert.deepStrictEqual(h.errors, []);
    });

    it('角括弧の中にカーソルがあれば1回目のCmd+Aで括弧の中身だけを選択する', async function () {
        if (!browser) { this.skip(); return; }
        const text = 'ref [note text] end';
        h = await openPreview(browser, `${text}\n\nsecond paragraph\n`, text);
        await h.placeCursorAfterText('note te');
        await h.press('Meta+a');

        assert.strictEqual(await selectedText(h), 'note text');
    });

    it('括弧の中身→行全体→文書全体と3回のCmd+Aで段階的に広がる', async function () {
        if (!browser) { this.skip(); return; }
        const text = 'note (detail here) end';
        h = await openPreview(browser, `${text}\n\nsecond paragraph\n`, text);
        await h.placeCursorAfterText('deta');

        await h.press('Meta+a'); // 1回目: 括弧の中身
        assert.strictEqual(await selectedText(h), 'detail here');

        await h.press('Meta+a'); // 2回目: 行全体
        assert.strictEqual(await selectedText(h), text);

        await h.press('Meta+a'); // 3回目: 文書全体
        // 段落間の空行1つは blankLineRemarkPlugin により空 paragraph として実体化されるため、
        // 選択テキストにも区切りとして改行がもう1つ挟まる。
        assert.strictEqual(await selectedText(h), `${text}\n\nsecond paragraph`);
    });

    it('ネストした括弧では最も内側の中身を1回目のCmd+Aで選択する', async function () {
        if (!browser) { this.skip(); return; }
        const text = 'outer (mid [inner] end) tail';
        h = await openPreview(browser, `${text}\n`, text);
        await h.placeCursorAfterText('inn');
        await h.press('Meta+a');

        assert.strictEqual(await selectedText(h), 'inner');
    });
});
