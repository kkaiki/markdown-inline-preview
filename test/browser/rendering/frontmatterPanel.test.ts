/**
 * 実ブラウザ・仕様カバレッジテスト: frontmatter パネルの表示。
 *
 * preview-features.md の frontmatter サポート（`showFrontmatter`）で、YAML frontmatter が
 * 本文とは分離された上部パネル（#frontmatter-panel）に key/value 表示されることを
 * 実 DOM で検証する（spec-test-coverage.md ギャップ 3）。
 * これまで YAML パース（test/suite/shared/frontmatter）のみで、パネル表示は未検証だった。
 *
 * 実行: `npm run test:browser`。ブラウザが無い環境では skip。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';

describe('実ブラウザ: frontmatter パネル', function () {
    this.timeout(120000);

    let browser: Browser | null = null;
    let h: PreviewHandle | undefined;

    before(async () => { browser = await launchBrowser(); });
    after(async function () { this.timeout(20000); await browser?.close(); });
    afterEach(async () => { if (h) { await h.close(); h = undefined; } });

    async function panelState(handle: PreviewHandle): Promise<{ hidden: boolean; text: string }> {
        return handle.page.evaluate(() => {
            const el = document.getElementById('frontmatter-panel');
            return { hidden: !el || el.hidden, text: el?.textContent ?? '' };
        });
    }

    it('showFrontmatter: true なら frontmatter が上部パネルに key/value 表示され、本文には混ざらない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '本文です\n', '本文です', { showFrontmatter: true }, 'title: 買い物メモ\ntags: 日記');
        await h.page.waitForTimeout(300);

        const panel = await panelState(h);
        assert.strictEqual(panel.hidden, false, 'frontmatter パネルが表示されない');
        assert.ok(panel.text.includes('title') && panel.text.includes('買い物メモ'),
            `パネルに key/value が出ていない: ${panel.text}`);
        assert.ok(panel.text.includes('tags') && panel.text.includes('日記'),
            `2 つ目のエントリが出ていない: ${panel.text}`);

        const m = await h.model();
        assert.ok(!m.text.includes('title:'), `frontmatter が本文に混入した: ${m.text}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('showFrontmatter: false なら frontmatter があってもパネルは非表示', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '本文です\n', '本文です', { showFrontmatter: false }, 'title: 買い物メモ');
        await h.page.waitForTimeout(300);

        const panel = await panelState(h);
        assert.strictEqual(panel.hidden, true, '設定オフなのにパネルが表示された');
        assert.deepStrictEqual(h.errors, []);
    });

    it('外部編集（update メッセージ）で frontmatter が変わるとパネルも追従する', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '本文です\n', '本文です', { showFrontmatter: true }, 'title: 変更前');
        await h.page.waitForTimeout(300);
        assert.ok((await panelState(h)).text.includes('変更前'), '前提: 初期 frontmatter が表示されていない');

        await h.page.evaluate(() => window.postMessage(
            { type: 'update', markdown: '本文です\n', frontmatter: 'title: 変更後\nauthor: 外部ツール' }, '*'));
        await h.page.waitForTimeout(400);

        const panel = await panelState(h);
        assert.ok(panel.text.includes('変更後') && panel.text.includes('外部ツール'),
            `update 後のパネルが追従していない: ${panel.text}`);
        assert.ok(!panel.text.includes('変更前'), `古い frontmatter が残っている: ${panel.text}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('frontmatter が無いファイルではパネルは出ない（showFrontmatter: true でも）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '本文です\n', '本文です', { showFrontmatter: true }, null);
        await h.page.waitForTimeout(300);

        const panel = await panelState(h);
        assert.strictEqual(panel.hidden, true, 'frontmatter が無いのにパネルが表示された');
        assert.deepStrictEqual(h.errors, []);
    });
});
