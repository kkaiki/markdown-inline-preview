/**
 * 実ブラウザ回帰テスト: 短時間に複数回連続する外部 update（AI がファイルを連続編集する
 * ケースを想定）を受けても、最終的な内容が壊れずカーソルも文書内に留まることを検証する。
 *
 * test-directory-design.md §5 が挙げる「browser/external-sync/ は現状空。短時間に複数回の
 * 外部 push が連続するケース（AI 編集を想定）」のギャップを埋める。既存の
 * `cursor-focus/externalUpdateRace.test.ts` は 1 回の update のみを扱っており、
 * 連続 update（前の update の適用が完了する前に次が届く）は未カバーだった。
 *
 * 実行: `npm run test:browser`。ブラウザが無い環境では skip。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';

describe('実ブラウザ: 短時間に連続する外部 update', function () {
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

    /** 待機を挟まず update メッセージだけを postMessage する（連続 push を模す）。 */
    async function postUpdateNoWait(handle: PreviewHandle, markdown: string): Promise<void> {
        await handle.page.evaluate(
            (md) => window.postMessage({ type: 'update', markdown: md, frontmatter: null }, '*'),
            markdown
        );
    }

    it('待機なしで5回連続の外部 update が届いても、最終的な内容は最後の update と一致する', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '# v0\n\nTAIL\n', 'TAIL');

        for (let i = 1; i <= 5; i++) {
            await postUpdateNoWait(h, `# v${i}\n\nTAIL\n`);
        }
        // 最後の update が反映されるまで少し待つ（連続 push 自体は無待機、収束の確認のみ待つ）。
        await h.page.waitForTimeout(600);

        const m = await h.model();
        assert.ok(m.text.includes('v5'), `最後の update (v5) が反映されていない: ${m.text}`);
        assert.ok(!m.text.includes('v4') && !m.text.includes('v3'),
            `古い update の内容が混在している: ${m.text}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('編集中に連続する外部 update が届いても、文書が壊れずカーソルは範囲内に収まる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '一つ目の段落\n\n二つ目の段落\n\nTAIL\n', 'TAIL');
        await h.placeCursorAfterText('二つ目');

        for (let i = 1; i <= 5; i++) {
            await postUpdateNoWait(h, `一つ目の段落（外部編集${i}）\n\n二つ目の段落\n\nTAIL\n`);
        }
        await h.page.waitForTimeout(600);

        const m = await h.model();
        assert.ok(m.text.includes('外部編集5'), `最後の連続 update が反映されていない: ${m.text}`);
        assert.ok(m.selFrom >= 0 && m.selFrom <= m.text.length + 10,
            `連続 update 後にカーソル位置が不正: selFrom=${m.selFrom}`);
        assert.deepStrictEqual(h.errors, []);

        // 収束後も普通に入力できる（クラッシュしていないこと）。
        await h.type('x');
        const m2 = await h.model();
        assert.ok(m2.text.includes('x'), `連続 update 後の入力が効かない: ${m2.text}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('文書サイズが増減を繰り返す連続 update でもクラッシュしない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '短い\n\nTAIL\n', 'TAIL');

        const long = '# 長い見出し\n\n' + '長い本文の段落です。'.repeat(20) + '\n\n- item1\n- item2\n- item3\n\nTAIL\n';
        const short = '短い2\n\nTAIL\n';
        await postUpdateNoWait(h, long);
        await postUpdateNoWait(h, short);
        await postUpdateNoWait(h, long);
        await postUpdateNoWait(h, short);
        await h.page.waitForTimeout(600);

        const m = await h.model();
        assert.ok(m.text.includes('短い2'), `最後の update（短縮）が反映されていない: ${m.text}`);
        assert.deepStrictEqual(h.errors, []);
    });
});
