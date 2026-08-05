/**
 * 実ブラウザ回帰テスト: 「フォーカスしても見た目が変わらない」Preview（記法の実テキスト展開の廃止）。
 *
 * ## 背景
 *
 * ユーザー要望（2026-07-26）: 「Preview は Raw と同じような見た目にしてほしい。`## ` は
 * 見えず文字の大きさだけ変わる、その状態のままフォーカスしても変化しないようにしたい。
 * ここで起こるエラーが多いから」。
 *
 * これまでは 3 つのプラグインがフォーカス時に Markdown 記法を**実テキストとして挿入**して
 * いた（`blockPrefixEditPlugin` = `## ` `- ` `> `、`inlineMarkEditPlugin` = `` ` `` `**`
 * `[..](..)`、`codeFenceEditPlugin` = ```` ``` ````）。ドキュメント本文が「フォーカスした
 * だけ」で変わるため、カーソル飛び・差分ガターの誤判定・直列化の混入など多数の不具合の
 * 温床になっていた。本テストはその展開が**一切起きない**ことを固定する。
 *
 * あわせて、記法を外す操作（行頭・マーク境界での Backspace）が **リアルタイムで**
 * 見た目に反映されること（コードブロックの背景・インラインコードの色がその場で消える）も
 * 検証する。展開時代はフォーカスが外れる collapse まで見た目が変わらなかった。
 *
 * 実行: `npm run test:browser`。ブラウザが無い環境では skip。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';

/** `.milkdown` 配下の指定セレクタの要素数。 */
async function count(h: PreviewHandle, selector: string): Promise<number> {
    return h.page.locator(`.milkdown ${selector}`).count();
}

describe('実ブラウザ: フォーカスしても記法が実テキストとして現れない', function () {
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

    it('見出しにカーソルを置いても "## " が本文に挿入されない', async function () {
        if (!browser) return this.skip();
        h = await openPreview(browser, '# タイトル\n\n## 見出し2\n\n本文\n', '見出し2');
        const before = await h.docText();

        await h.clickTextAt('見出し2');

        assert.strictEqual(await h.docText(), before, 'フォーカスで本文が変化した');
        assert.strictEqual((await h.docText()).includes('##'), false, '"##" が本文に現れた');
        assert.strictEqual(await count(h, 'h2'), 1, '見出しのスタイル（h2）は維持される');
    });

    it('箇条書きにカーソルを置いても "- " が本文に挿入されない', async function () {
        if (!browser) return this.skip();
        h = await openPreview(browser, '- 項目A\n- 項目B\n', '項目A');
        const before = await h.docText();

        await h.clickTextAt('項目A');

        assert.strictEqual(await h.docText(), before, 'フォーカスで本文が変化した');
    });

    it('引用にカーソルを置いても "> " が本文に挿入されない', async function () {
        if (!browser) return this.skip();
        h = await openPreview(browser, '> 引用文\n\n本文\n', '引用文');
        const before = await h.docText();

        await h.clickTextAt('引用文');

        assert.strictEqual(await h.docText(), before, 'フォーカスで本文が変化した');
    });

    it('インラインコード・太字・リンクを含む段落にカーソルを置いても記法文字が現れない', async function () {
        if (!browser) return this.skip();
        const md = '`code` と **bold** と [text](https://example.com)\n';
        h = await openPreview(browser, md, 'bold');
        const before = await h.docText();

        await h.clickTextAt('bold');

        assert.strictEqual(await h.docText(), before, 'フォーカスで本文が変化した');
        assert.strictEqual(await count(h, 'code'), 1, 'インラインコードのスタイルは維持される');
        assert.strictEqual(await count(h, 'strong'), 1, '太字のスタイルは維持される');
    });

    it('コードブロックにカーソルを置いてもフェンス行が本文に挿入されない', async function () {
        if (!browser) return this.skip();
        h = await openPreview(browser, '# タイトル\n\n```js\nconst a = 1;\n```\n', 'const');
        const before = await h.docText();

        await h.clickTextAt('const');

        assert.strictEqual(await h.docText(), before, 'フォーカスでフェンス行が挿入された');
        assert.strictEqual((await h.docText()).includes('```'), false, '"```" が本文に現れた');
        assert.strictEqual(await count(h, 'pre'), 1, 'コードブロックのスタイル（pre）は維持される');
    });

    it('別のブロックへカーソルを移してもドキュメントは 1 文字も変化しない', async function () {
        if (!browser) return this.skip();
        const md = '# タイトル\n\n## 見出し2\n\n- 項目\n\n> 引用\n\n`code` の段落\n';
        h = await openPreview(browser, md, '見出し2');
        const before = await h.docText();

        for (const t of ['見出し2', '項目', '引用', 'code', 'タイトル']) {
            await h.clickTextAt(t);
            assert.strictEqual(await h.docText(), before, `"${t}" へフォーカスした時点で本文が変化した`);
        }
    });
});

describe('実ブラウザ: 記法を外すと見た目がリアルタイムで普通の文字に戻る', function () {
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

    it('コードブロックの先頭で Backspace すると、背景と色がその場で消えて段落になる', async function () {
        if (!browser) return this.skip();
        h = await openPreview(browser, '# タイトル\n\n```js\nconst a = 1;\n```\n', 'const');
        assert.strictEqual(await count(h, 'pre'), 1);

        await h.clickTextAt('const');
        await h.press('Home');
        await h.press('Backspace');

        // フォーカスを外さない（blur しない）まま、その場で pre が消えていること
        assert.strictEqual(await count(h, 'pre'), 0, 'コードブロックの背景（pre）が残っている');
        assert.ok((await h.docText()).includes('const a = 1;'), 'コード本文が失われた');
    });

    it('インラインコードの末尾で Backspace すると、色がその場で消えて普通の文字になる', async function () {
        if (!browser) return this.skip();
        h = await openPreview(browser, '`code` の段落\n', 'code');
        assert.strictEqual(await count(h, 'code'), 1);

        await h.placeCursorAfterText('code');
        await h.press('Backspace');

        assert.strictEqual(await count(h, 'code'), 0, 'インラインコードの装飾が残っている');
        assert.ok((await h.docText()).includes('code'), '本文が失われた');
    });

    it('見出しの行頭で Backspace すると、その場で 1 段階降格する（H2 → H1）', async function () {
        if (!browser) return this.skip();
        h = await openPreview(browser, '## 見出し2\n\n本文\n', '見出し2');
        assert.strictEqual(await count(h, 'h2'), 1);

        await h.clickTextAt('見出し2');
        await h.press('Home');
        await h.press('Backspace');

        assert.strictEqual(await count(h, 'h2'), 0, 'H2 のままになっている');
        assert.strictEqual(await count(h, 'h1'), 1, 'H1 へ降格していない');
    });

    it('箇条書きの行頭で Backspace すると、その場でリストが外れて段落になる', async function () {
        if (!browser) return this.skip();
        h = await openPreview(browser, '- 項目A\n', '項目A');
        assert.strictEqual(await count(h, 'li'), 1);

        await h.clickTextAt('項目A');
        await h.press('Home');
        await h.press('Backspace');

        assert.strictEqual(await count(h, 'li'), 0, 'リスト項目が残っている');
        assert.ok((await h.docText()).includes('項目A'), '本文が失われた');
    });
});
