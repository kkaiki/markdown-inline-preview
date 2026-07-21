/**
 * 実ブラウザ回帰テスト（本番バンドル）: フォーカス中のコードブロックで開き/閉じフェンス
 * （```lang` / ```）の文字を1つでも削って記法として壊れた瞬間、コードブロックの背景
 * （`.milkdown pre` の `background`）を動的に解除する。
 *
 * ## 背景
 *
 * `codeFenceEditPlugin.ts` は元々「フォーカスを外したとき」だけ `parseCodeFenceRealText`
 * でフェンスの完全性を判定し、壊れていれば `code_block` を `paragraph` へ変換していた。
 * しかしフォーカスしたまま編集している間は、フェンスをどれだけ壊しても見た目
 * （コードブロックらしい背景）が変わらず、「もうコードブロックとして保存されない」ことに
 * 気づきにくいというユーザー要望があった。ここでは `codeHighlightPlugin.ts` に、
 * 展開中のブロックで `parseCodeFenceRealText` が失敗している間だけ `code-fence-broken`
 * クラスを付与するデコレーションを追加し、`media/milkdown-preview.css` 側でこのクラスに
 * 対して背景を透明化する。
 *
 * 実行: `npm run test:browser`。ブラウザが無い環境では skip。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';

describe('実ブラウザ: フェンス崩壊時のコードブロック背景の動的解除', function () {
    this.timeout(120000);

    let browser: Browser | null = null;
    let h: PreviewHandle | undefined;

    before(async () => { browser = await launchBrowser(); });
    after(async function () { this.timeout(20000); await browser?.close(); });
    afterEach(async () => { if (h) { await h.close(); h = undefined; } });

    async function isFenceBroken(handle: PreviewHandle): Promise<boolean> {
        return handle.page.evaluate(() => {
            const pre = document.querySelector('.milkdown pre');
            return !!pre && pre.classList.contains('code-fence-broken');
        });
    }

    it('正常なフェンスのままなら code-fence-broken は付かない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '```js\nconst x = 1;\n```\n\n段落\n', '段落');
        await h.placeCursorAfterText('const x = 1;');
        await h.page.waitForTimeout(150);

        assert.strictEqual(await isFenceBroken(h), false, 'フェンスが健全なのに壊れた扱いになっている');
        assert.deepStrictEqual(h.errors, []);
    });

    it('閉じフェンスの ` を1文字消すと、フォーカスを外す前から code-fence-broken が付く', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '```js\nconst x = 1;\n```\n\n段落\n', '段落');
        await h.placeCursorAfterText('const x = 1;');
        await h.page.waitForTimeout(150);
        assert.strictEqual(await isFenceBroken(h), false, '前提: まだ壊れていない');

        await h.moveToEnd();
        // 閉じフェンス（末尾の ```）の直前に置いてから1文字だけ削る。
        await h.placeCursorAfterText('const x = 1;');
        await h.press('ArrowDown');
        await h.press('End');
        await h.press('Backspace'); // ``` → `` へ

        assert.strictEqual(await isFenceBroken(h), true, '閉じフェンスを壊しても code-fence-broken が付かない');
        assert.deepStrictEqual(h.errors, []);
    });

    it('壊れたフェンスを打ち直して完全な形に戻すと code-fence-broken が外れる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '```js\nconst x = 1;\n```\n\n段落\n', '段落');
        await h.placeCursorAfterText('const x = 1;');
        await h.page.waitForTimeout(150);

        await h.placeCursorAfterText('const x = 1;');
        await h.press('ArrowDown');
        await h.press('End');
        await h.press('Backspace');
        assert.strictEqual(await isFenceBroken(h), true, '前提: 壊れている');

        await h.type('`'); // `` → ``` へ復元
        assert.strictEqual(await isFenceBroken(h), false, '修復後も code-fence-broken が残っている');
        assert.deepStrictEqual(h.errors, []);
    });
});
