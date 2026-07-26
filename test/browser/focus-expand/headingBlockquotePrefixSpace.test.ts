/**
 * 実ブラウザ回帰テスト: 見出し・引用のフォーカス展開で、プレフィックスと本文の間の
 * 半角スペースが消える不具合。
 *
 * ## バグ内容
 *
 * `## heading` や `> quote` を1文字ずつ実際にタイプすると、`## `/`> ` へ変換された直後
 * （プレフィックスがまだ空の状態）に続けて文字を打つと、プレフィックスと本文の間の
 * スペースが消える（`##heading`、`>quote` のようにくっつく）。`blockPrefixEditPlugin` が
 * プログラム的に挿入する末尾スペース（素の半角スペース）を、ブラウザが視覚的に潰して
 * しまい、続く実キー入力で ProseMirror の domObserver がその潰れたスペースを文字に
 * 置き換えられたものとして扱ってしまうことが原因。箇条書き・番号付き・チェックボックス
 * （`list-item-block` Web Component でレンダリング）では再現しない。
 *
 * 詳細設計: docs/specifications/fixes/heading-blockquote-prefix-space-fix.md
 *
 * 既存のマークダウンを読み込んだ場合は問題無い。実際にキーを1つずつ押した場合にだけ
 * 再現するため、`h.type()`（実キーイベント）で検証する。
 *
 * 実行: `npm run test:browser`。ブラウザが無い環境では skip。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';

describe('実ブラウザ: 見出し・引用のプレフィックス末尾スペース回帰', function () {
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

    async function typeOnNewLine(typed: string): Promise<PreviewHandle> {
        const handle = await openPreview(browser, 'Start\n\nTAIL\n', 'Start');
        await handle.placeCursorAfterText('Start');
        await handle.press('Enter');
        await handle.page.waitForTimeout(200);
        await handle.type(typed);
        await handle.page.waitForTimeout(300);
        return handle;
    }

    it('"## heading" を1文字ずつタイプすると、プレフィックスと本文の間にスペースが保持される', async function () {
        if (!browser) { this.skip(); return; }
        h = await typeOnNewLine('## heading');
        const m = await h.model();
        assert.ok(
            m.outline.includes('heading(2)["## heading"]'),
            `見出しのスペースが失われた: ${m.outline}`
        );
        assert.deepStrictEqual(h.errors, []);
    });

    it('"# item"（H1）でもスペースが保持される', async function () {
        if (!browser) { this.skip(); return; }
        h = await typeOnNewLine('# item');
        const m = await h.model();
        assert.ok(
            m.outline.includes('heading(1)["# item"]'),
            `見出しのスペースが失われた: ${m.outline}`
        );
        assert.deepStrictEqual(h.errors, []);
    });

    it('"### h"（H3）でもスペースが保持される', async function () {
        if (!browser) { this.skip(); return; }
        h = await typeOnNewLine('### h');
        const m = await h.model();
        assert.ok(
            m.outline.includes('heading(3)["### h"]'),
            `見出しのスペースが失われた: ${m.outline}`
        );
        assert.deepStrictEqual(h.errors, []);
    });

    it('"> quote" でもスペースが保持される', async function () {
        if (!browser) { this.skip(); return; }
        h = await typeOnNewLine('> quote');
        const m = await h.model();
        assert.ok(
            m.outline.includes('blockquote[paragraph["> quote"]]'),
            `引用のスペースが失われた: ${m.outline}`
        );
        assert.deepStrictEqual(h.errors, []);
    });

    it('回帰確認: 見出しの collapse 後、保存 markdown に "## " が正しく（欠落・二重化せず）反映される', async function () {
        if (!browser) { this.skip(); return; }
        h = await typeOnNewLine('## heading');
        await h.placeCursorAfterText('TAIL');
        await h.page.waitForTimeout(300);
        const md = await h.lastChangeMarkdown();
        assert.ok(md, 'change がホストに送られていない');
        assert.ok(md.includes('## heading'), `見出しプレフィックスが正しくない: ${JSON.stringify(md)}`);
        assert.ok(!md.includes('## ## '), `プレフィックスが二重化した: ${JSON.stringify(md)}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('回帰確認: 引用の collapse 後、保存 markdown に "> " が正しく反映される', async function () {
        if (!browser) { this.skip(); return; }
        h = await typeOnNewLine('> quote');
        await h.placeCursorAfterText('TAIL');
        await h.page.waitForTimeout(300);
        const md = await h.lastChangeMarkdown();
        assert.ok(md, 'change がホストに送られていない');
        assert.ok(md.includes('> quote'), `引用プレフィックスが正しくない: ${JSON.stringify(md)}`);
        assert.ok(!md.includes('> > '), `プレフィックスが二重化した: ${JSON.stringify(md)}`);
        assert.deepStrictEqual(h.errors, []);
    });
});
