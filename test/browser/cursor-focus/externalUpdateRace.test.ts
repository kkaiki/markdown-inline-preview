/**
 * 実ブラウザ・ユースケーステスト: 編集中に外部 update（Raw エディタ・AI 等の編集反映）が
 * 届いたときの挙動。
 *
 * preview-usage-flow-test-backlog.md の
 * 「チェックボックス変換ガードと外部 update の衝突」を消化するテスト。
 * ホストは外部編集を検知すると webview へ `{ type: 'update', markdown }` を送り、
 * `applyExternalContent` が差分適用 + カーソル位置の維持を行う。
 * これが (1) チェックボックス変換直後（selection guard の 1000ms 窓内）、
 * (2) 通常の入力中、(3) 文書が短くなる update、のそれぞれで壊れないことを検証する。
 *
 * 実行: `npm run test:browser`。ブラウザが無い環境では skip。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';

describe('実ブラウザ: 外部 update と編集の衝突', function () {
    this.timeout(120000);

    let browser: Browser | null = null;
    let h: PreviewHandle | undefined;

    before(async () => { browser = await launchBrowser(); });
    after(async function () { this.timeout(20000); await browser?.close(); });
    afterEach(async () => { if (h) { await h.close(); h = undefined; } });

    async function postUpdate(handle: PreviewHandle, markdown: string): Promise<void> {
        await handle.page.evaluate(
            (md) => window.postMessage({ type: 'update', markdown: md, frontmatter: null }, '*'),
            markdown
        );
        await handle.page.waitForTimeout(400);
    }

    it('チェックボックス変換の直後（ガード時間窓内）に外部 update が届いても、カーソルは変換した項目に残る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, 'Start\n\nTAIL\n', 'Start');
        await h.placeCursorAfterText('Start');
        await h.press('Enter');
        await h.type('- [ ] task');
        // ガードの 1000ms 窓が閉じる前に、外部編集（末尾に行を追加）を反映させる。
        await postUpdate(h, 'Start\n\n- [ ] task\n\nTAIL\n\n外部が追加した行\n');

        const m = await h.model();
        assert.ok(m.text.includes('外部が追加した行'), `外部 update が反映されていない: ${m.text}`);
        assert.ok(m.outline.includes('list_item(checked=false)[paragraph["task"]]'),
            `チェックボックスが update で壊れた: ${m.outline}`);
        assert.strictEqual(m.selParentText, 'task',
            `外部 update 後にカーソルが別ブロックへ飛んだ: selParentText="${m.selParentText}"`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('外部 update の直後に続きをタイプしても、文字は元の項目に入る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, 'Start\n\nTAIL\n', 'Start');
        await h.placeCursorAfterText('Start');
        await h.press('Enter');
        await h.type('- [ ] 牛乳');
        await postUpdate(h, 'Start\n\n- [ ] 牛乳\n\nTAIL\n\n外部が追加した行\n');
        await h.type('を買う');
        await h.moveToEnd();

        const m = await h.model();
        assert.ok(m.outline.includes('list_item(checked=false)[paragraph["牛乳を買う"]]'),
            `update 後の続き入力が別の場所に入った: ${m.outline}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('段落の途中にカーソルがある状態で外部 update が届いても、カーソルは同じ段落に残る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '一つ目の段落\n\n二つ目の段落\n\nTAIL\n', 'TAIL');
        await h.placeCursorAfterText('二つ目');
        // 上の段落を外部が書き換える（カーソルのある段落は不変）。
        await postUpdate(h, '一つ目の段落（外部編集済み）\n\n二つ目の段落\n\nTAIL\n');

        const m = await h.model();
        assert.ok(m.text.includes('外部編集済み'), `外部 update が反映されていない: ${m.text}`);
        assert.strictEqual(m.selParentText, '二つ目の段落',
            `カーソルが編集していた段落から離れた: selParentText="${m.selParentText}"`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('文書が大幅に短くなる外部 update でもクラッシュせず、カーソルは文書内に収まる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '# 見出し\n\n長い本文の段落です\n\n- item1\n- item2\n\nTAIL\n', 'TAIL');
        await h.placeCursorAfterText('TAIL');
        await postUpdate(h, '短い\n');

        const m = await h.model();
        assert.ok(m.text.includes('短い'), `縮小 update が反映されていない: ${m.text}`);
        assert.ok(m.selFrom >= 0, 'カーソル位置が不正');
        assert.deepStrictEqual(h.errors, []);

        // その後の入力も普通にできる（クランプ後の位置が編集可能であること）。
        await h.type('x');
        const m2 = await h.model();
        assert.ok(m2.text.includes('x'), `縮小 update 後の入力が効かない: ${m2.text}`);
        assert.deepStrictEqual(h.errors, []);
    });
});
