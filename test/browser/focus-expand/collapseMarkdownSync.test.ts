/**
 * 実ブラウザ回帰テスト: ブロックの collapse（フォーカスが外れた際の記法プレフィックス除去）が
 * ホストへ同期されない（サイレントなデータ消失）不具合。
 *
 * ## バグ内容
 *
 * `blockPrefixEditPlugin` の collapse 処理（見出し/箇条書き/引用のプレフィックス除去）は
 * Undo 履歴を汚さないため `addToHistory: false` を付けて dispatch する。ところが Milkdown
 * 公式の `@milkdown/plugin-listener`（`markdownUpdated` の実体）は、内部の `state.apply` で
 * `tr.getMeta('addToHistory') === false` の transaction を完全に無視する（`latestTr` を
 * 更新しない）。そのため collapse で確定した最終テキストが、その後 **他に何の編集も
 * 起きなければ永久にホストへ送られず**、保存ファイルからその内容が丸ごと欠落することがあった。
 *
 * 詳細設計: docs/specifications/collapse-markdown-sync-fix.md
 *
 * 実行: `npm run test:browser`。ブラウザが無い環境では skip。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';

describe('実ブラウザ: collapse 後の markdown 同期回帰', function () {
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

    /** Start の次に新しい行を作り、typed をタイプしてから TAIL へ離れる（他の編集はしない）。 */
    async function typeThenLeave(typed: string): Promise<PreviewHandle> {
        const handle = await openPreview(browser, 'Start\n\nTAIL\n', 'Start');
        await handle.placeCursorAfterText('Start');
        await handle.press('Enter');
        await handle.page.waitForTimeout(200);
        await handle.type(typed);
        await handle.page.waitForTimeout(300);
        await handle.placeCursorAfterText('TAIL');
        await handle.page.waitForTimeout(300);
        return handle;
    }

    it('見出しを新規タイプして離れるだけで、保存 markdown に見出しの内容が反映される', async function () {
        if (!browser) { this.skip(); return; }
        h = await typeThenLeave('## heading');
        const md = await h.lastChangeMarkdown();
        assert.ok(md, 'change がホストに送られていない');
        assert.ok(md.includes('## heading'), `見出しが保存 markdown に反映されていない: ${JSON.stringify(md)}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('箇条書きを新規タイプして離れるだけで、保存 markdown に内容が反映される', async function () {
        if (!browser) { this.skip(); return; }
        h = await typeThenLeave('- item');
        const md = await h.lastChangeMarkdown();
        assert.ok(md, 'change がホストに送られていない');
        assert.ok(md.includes('- item'), `箇条書きが保存 markdown に反映されていない: ${JSON.stringify(md)}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('引用を新規タイプして離れるだけで、保存 markdown に内容が反映される', async function () {
        if (!browser) { this.skip(); return; }
        h = await typeThenLeave('> quote');
        const md = await h.lastChangeMarkdown();
        assert.ok(md, 'change がホストに送られていない');
        assert.ok(md.includes('> quote'), `引用が保存 markdown に反映されていない: ${JSON.stringify(md)}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('既存見出しに1文字追記して離れるだけで、保存 markdown に追記内容が反映される', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '## Existing\n\nTAIL\n', 'Existing');
        await h.placeCursorAfterText('Existing');
        await h.page.waitForTimeout(200);
        await h.type('X');
        await h.page.waitForTimeout(200);
        await h.placeCursorAfterText('TAIL');
        await h.page.waitForTimeout(300);
        const md = await h.lastChangeMarkdown();
        assert.ok(md, 'change がホストに送られていない');
        assert.ok(md.includes('## ExistingX'), `追記が保存 markdown に反映されていない: ${JSON.stringify(md)}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('何も変更せずフォーカスして離れただけなら、余計な change は増えない（重複判定の回帰確認）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '## Existing\n\nTAIL\n', 'Existing');
        await h.placeCursorAfterText('Existing');
        await h.page.waitForTimeout(200);
        await h.placeCursorAfterText('TAIL');
        await h.page.waitForTimeout(300);
        const sentCount = await h.page.evaluate(
            () => (window as unknown as { __sent: Array<{ type: string }> }).__sent.filter(s => s.type === 'change').length
        );
        assert.strictEqual(sentCount, 0, `変更が無いのに change が送られた（回数: ${sentCount}）`);
        assert.deepStrictEqual(h.errors, []);
    });
});
