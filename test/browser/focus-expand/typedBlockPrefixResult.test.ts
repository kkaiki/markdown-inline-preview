/**
 * 実ブラウザ回帰テスト: 行頭記法をタイプしたときの変換結果（`## ` `# ` `> `）。
 *
 * ## 背景
 *
 * かつては入力ルールで見出し化した直後に `blockPrefixEditPlugin` が `## ` を実テキストと
 * して再挿入しており、その区切り文字（non-breaking space）が本文へ残る不具合があった。
 * 記法の実テキスト展開は 2026-07-26 に廃止（`docs/specifications/no-focus-expand.md`）した
 * ため、タイプ直後の本文には記法も NBSP も残らず、本文テキストだけになるのが正しい。
 * 「打った直後の見た目」＝「ファイルを開き直した見た目」であることを固定する。
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

    it('"## heading" を1文字ずつタイプすると、記法は消えて本文だけの見出しになる', async function () {
        if (!browser) { this.skip(); return; }
        h = await typeOnNewLine('## heading');
        const m = await h.model();
        assert.ok(
            m.outline.includes('heading(2)["heading"]'),
            `見出しの本文が期待と違う: ${m.outline}`
        );
        assert.deepStrictEqual(h.errors, []);
    });

    it('"# item"（H1）でも本文だけの見出しになる', async function () {
        if (!browser) { this.skip(); return; }
        h = await typeOnNewLine('# item');
        const m = await h.model();
        assert.ok(
            m.outline.includes('heading(1)["item"]'),
            `見出しの本文が期待と違う: ${m.outline}`
        );
        assert.deepStrictEqual(h.errors, []);
    });

    it('"### h"（H3）でも本文だけの見出しになる', async function () {
        if (!browser) { this.skip(); return; }
        h = await typeOnNewLine('### h');
        const m = await h.model();
        assert.ok(
            m.outline.includes('heading(3)["h"]'),
            `見出しの本文が期待と違う: ${m.outline}`
        );
        assert.deepStrictEqual(h.errors, []);
    });

    it('"> quote" でも本文だけの引用になる', async function () {
        if (!browser) { this.skip(); return; }
        h = await typeOnNewLine('> quote');
        const m = await h.model();
        assert.ok(
            m.outline.includes('blockquote[paragraph["quote"]]'),
            `引用の本文が期待と違う: ${m.outline}`
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
