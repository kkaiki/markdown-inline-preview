/**
 * 実ブラウザ回帰テスト: Git 差分ガター（青バー）× フォーカス展開。
 *
 * ## 背景
 *
 * ユーザー報告（2026-07-26）: `` `docs/spec.md` `` のようなインラインコードを含む
 * テーブルセルにカーソルを入れただけで、まだ 1 文字も編集していないのに差分ガターの
 * 青バー（`.diff-modified`）がテーブル全体の左に出る。差分の単位はトップレベルノード
 * なので、セル 1 個の記法展開でテーブル全体が「編集済み」に見えてしまう。
 *
 * 原因は `inlineMarkEditPlugin` がフォーカス時にマーカー文字（`` ` `` / `**` / `](url)`）を
 * **実テキスト**として挿入することで、`previewDiffPlugin` の比較用シグネチャが HEAD 側と
 * 食い違うこと（`docs/specifications/inline-mark-focus-edit-fix.md` §3.2）。
 *
 * jsdom 側（`test/webview/focus-expand/previewDiffInlineMarkExpand.integration.test.ts`）でも
 * 検証しているが、**実際に配信されるバンドル（media/milkdown.bundle.js）と実クリック**での
 * 挙動が本判定なのでこの層でも固定する。
 *
 * 実行: `npm run test:browser`。ブラウザが無い環境では skip。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';

/** HEAD 基準（= 現在の内容そのまま＝未編集）を webview へ送る。 */
async function setDiffBase(h: PreviewHandle, markdown: string): Promise<void> {
    await h.page.evaluate(
        (md) => window.postMessage({ type: 'baseMarkdown', baseMarkdown: md }, '*'),
        markdown
    );
    await h.page.waitForTimeout(200);
}

/** 差分ガターが付いているトップレベルブロックの種別一覧。 */
async function diffMarkedBlocks(h: PreviewHandle): Promise<string[]> {
    return h.page.evaluate(() =>
        Array.from(document.querySelectorAll('.diff-modified, .diff-added')).map(
            (el) => `${el.tagName.toLowerCase()}.${el.className.split(/\s+/).filter(c => c.startsWith('diff-')).join('.')}`
        )
    );
}

describe('実ブラウザ: Git差分ガター × フォーカス展開（未編集で青バーが出ない）', function () {
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

    it('テーブルセル内のインラインコードをクリックしてもテーブルに青バーが出ない', async function () {
        if (!browser) return this.skip();
        const md = '# タイトル\n\n| 仕様書 | 症状 |\n| --- | --- |\n| `docs/spec.md` | カーソルが飛ぶ |\n';
        h = await openPreview(browser, md, '仕様書');
        await setDiffBase(h, md);
        assert.deepStrictEqual(await diffMarkedBlocks(h), [], 'フォーカス前から差分ガターが出ている');

        await h.clickTextAt('docs/spec.md');
        await h.page.waitForTimeout(300);

        assert.deepStrictEqual(
            await diffMarkedBlocks(h),
            [],
            'セルにカーソルを入れただけで差分ガター（青バー）が出た'
        );
        assert.deepStrictEqual(h.errors, []);
    });

    it('インラインコードを含む段落をクリックしても青バーが出ない', async function () {
        if (!browser) return this.skip();
        const md = '# タイトル\n\n`docs/spec.md` を参照してください\n';
        h = await openPreview(browser, md, 'を参照してください');
        await setDiffBase(h, md);

        await h.clickTextAt('docs/spec.md');
        await h.page.waitForTimeout(300);

        assert.deepStrictEqual(
            await diffMarkedBlocks(h),
            [],
            '段落にカーソルを入れただけで差分ガター（青バー）が出た'
        );
        assert.deepStrictEqual(h.errors, []);
    });

    it('見出しをクリックしてもプレフィックス展開だけでは青バーが出ない', async function () {
        if (!browser) return this.skip();
        const md = '# タイトル\n\n本文\n';
        h = await openPreview(browser, md, 'タイトル');
        await setDiffBase(h, md);

        await h.clickTextAt('タイトル');
        await h.page.waitForTimeout(300);

        assert.deepStrictEqual(await diffMarkedBlocks(h), [], '見出しにカーソルを入れただけで青バーが出た');
        assert.deepStrictEqual(h.errors, []);
    });

    it('インラインコードを含む見出し（プレフィックス展開と同時）でも青バーが出ない', async function () {
        if (!browser) return this.skip();
        // ユーザー報告の実データ相当: 見出しの中にインラインコードがあり、フォーカスすると
        // `### ` の展開と `` ` `` の展開が同時に起きる。
        const md = '# タイトル\n\n### 実 Chromium（`test/browser/`）— DOM フォーカス依存\n\n本文\n';
        h = await openPreview(browser, md, '実 Chromium');
        await setDiffBase(h, md);
        assert.deepStrictEqual(await diffMarkedBlocks(h), [], 'フォーカス前から差分ガターが出ている');

        await h.clickTextAt('test/browser/');
        await h.page.waitForTimeout(300);

        assert.deepStrictEqual(
            await diffMarkedBlocks(h),
            [],
            '見出し内インラインコードにカーソルを入れただけで青バーが出た'
        );
        assert.deepStrictEqual(h.errors, []);
    });

    it('見出し内インラインコードから別ブロックへ移っても青バーが残らない', async function () {
        if (!browser) return this.skip();
        const md = '# タイトル\n\n### 実 Chromium（`test/browser/`）— DOM フォーカス依存\n\n本文\n';
        h = await openPreview(browser, md, '実 Chromium');
        await setDiffBase(h, md);

        await h.clickTextAt('test/browser/');
        await h.page.waitForTimeout(200);
        await h.clickTextAt('本文'); // 展開が collapse され、元の記法へ戻る
        await h.page.waitForTimeout(300);

        assert.deepStrictEqual(
            await diffMarkedBlocks(h),
            [],
            'フォーカスを外した後も差分ガターが残っている（collapse で内容が変わってしまった）'
        );
        assert.deepStrictEqual(h.errors, []);
    });

    it('コードブロックにカーソルを入れてもフェンス展開だけでは青バーが出ない', async function () {
        if (!browser) return this.skip();
        // codeFenceEditPlugin もフォーカス時に ```lang / ``` を実テキストとして挿入する
        // （inlineMarkEditPlugin と同じ「実テキスト展開」系）。
        const md = '# タイトル\n\n```js\nconst a = 1;\n```\n\n本文\n';
        h = await openPreview(browser, md, 'const');
        await setDiffBase(h, md);
        assert.deepStrictEqual(await diffMarkedBlocks(h), [], 'フォーカス前から差分ガターが出ている');

        await h.clickTextAt('const');
        await h.page.waitForTimeout(300);

        assert.deepStrictEqual(
            await diffMarkedBlocks(h),
            [],
            'コードブロックにカーソルを入れただけで青バー（.diff-modified）が出た'
        );
        assert.deepStrictEqual(h.errors, []);
    });

    it('実際に文字を打てばそのブロックに差分ガターが出る（除外しすぎていない）', async function () {
        if (!browser) return this.skip();
        const md = '# タイトル\n\n`docs/spec.md` を参照してください\n';
        h = await openPreview(browser, md, 'を参照してください');
        await setDiffBase(h, md);

        await h.clickTextAt('を参照してください');
        await h.press('End');
        await h.type('！');
        await h.page.waitForTimeout(300);

        const marked = await diffMarkedBlocks(h);
        assert.ok(marked.length > 0, '本文を編集したのに差分ガターが出ない');
    });
});
