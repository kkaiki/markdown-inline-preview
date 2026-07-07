/**
 * 実ブラウザ・仕様カバレッジテスト: Preview スラッシュメニューの実 DOM 操作。
 *
 * preview-features.md「スラッシュメニュー（Preview）」の一連の操作
 * （`/` で開く → 文字で絞り込む → Enter で確定 / Escape で閉じる）を
 * 実 Chromium の実キー入力で検証する（spec-test-coverage.md ギャップ 2）。
 * これまで項目定義（slashMenuItems）と適用ロジック（applyPreviewSlash）の
 * ユニットテストしか無く、「メニューが実際に画面に出て操作できる」ことは未検証だった。
 *
 * 実行: `npm run test:browser`。ブラウザが無い環境では skip。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';

describe('実ブラウザ: Preview スラッシュメニューの DOM 操作', function () {
    this.timeout(120000);

    let browser: Browser | null = null;
    let h: PreviewHandle | undefined;

    before(async () => { browser = await launchBrowser(); });
    after(async function () { this.timeout(20000); await browser?.close(); });
    afterEach(async () => { if (h) { await h.close(); h = undefined; } });

    /** Start 行の下に新しい空行を作って typed をタイプする。 */
    async function typeOnNewLine(typed: string): Promise<PreviewHandle> {
        const handle = await openPreview(browser, 'Start\n\nTAIL\n', 'Start');
        await handle.placeCursorAfterText('Start');
        await handle.press('Enter');
        await handle.type(typed);
        await handle.page.waitForTimeout(200);
        return handle;
    }

    async function menuVisible(handle: PreviewHandle): Promise<boolean> {
        return handle.page.evaluate(() => {
            const el = document.getElementById('slash-menu');
            return !!el && !el.hidden;
        });
    }

    async function menuLabels(handle: PreviewHandle): Promise<string[]> {
        return handle.page.evaluate(() =>
            Array.from(document.querySelectorAll('#slash-menu .slash-menu-label')).map((el) => el.textContent ?? '')
        );
    }

    it('空行で "/" をタイプするとメニューが開き、全コマンドが並ぶ', async function () {
        if (!browser) { this.skip(); return; }
        h = await typeOnNewLine('/');
        assert.strictEqual(await menuVisible(h), true, 'スラッシュメニューが開かない');
        const labels = await menuLabels(h);
        assert.ok(labels.length >= 10, `コマンド一覧が少なすぎる: ${labels.join(', ')}`);
        assert.ok(labels.includes('/h1') && labels.includes('/table') && labels.includes('/todo'),
            `主要コマンドが見当たらない: ${labels.join(', ')}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('"/todo" と絞り込むと todo だけが残り、Enter で空のチェックボックス項目になる', async function () {
        if (!browser) { this.skip(); return; }
        h = await typeOnNewLine('/todo');
        assert.strictEqual(await menuVisible(h), true, '絞り込み中にメニューが閉じた');
        const labels = await menuLabels(h);
        assert.deepStrictEqual(labels, ['/todo'], `絞り込み結果が想定外: ${labels.join(', ')}`);

        await h.press('Enter');
        await h.page.waitForTimeout(300);
        assert.strictEqual(await menuVisible(h), false, '確定後もメニューが開いたまま');
        const m = await h.model();
        assert.ok(m.outline.includes('list_item(checked=false)'),
            `/todo の確定でチェックボックス項目にならない: ${m.outline}`);
        assert.ok(!m.text.includes('/todo'), `"/todo" のテキストが残っている: ${m.text}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('"/h2" を Enter で確定して見出しを作り、続けてタイトルを入力できる', async function () {
        if (!browser) { this.skip(); return; }
        h = await typeOnNewLine('/h2');
        await h.press('Enter');
        await h.type('議題');
        await h.moveToEnd();

        const m = await h.model();
        assert.ok(m.outline.includes('heading(2)["議題"]'),
            `/h2 確定 + 入力で H2 見出しにならない: ${m.outline}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('Escape でメニューが閉じ、打った "/" テキストはそのまま残る', async function () {
        if (!browser) { this.skip(); return; }
        h = await typeOnNewLine('/qu');
        assert.strictEqual(await menuVisible(h), true, '前提: メニューが開いていない');
        await h.press('Escape');
        assert.strictEqual(await menuVisible(h), false, 'Escape でメニューが閉じない');
        const m = await h.model();
        assert.ok(m.text.includes('/qu'), `Escape で "/qu" のテキストまで消えた: ${m.text}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('ArrowDown で選択位置が移動し、その項目が Enter で適用される', async function () {
        if (!browser) { this.skip(); return; }
        h = await typeOnNewLine('/');
        await h.press('ArrowDown');   // h1 → h2
        const selected = await h.page.evaluate(() =>
            document.querySelector('#slash-menu .slash-menu-item.is-selected .slash-menu-label')?.textContent ?? '');
        assert.strictEqual(selected, '/h2', `ArrowDown 後の選択項目が想定外: ${selected}`);

        await h.press('Enter');
        await h.type('二番目');
        await h.moveToEnd();
        const m = await h.model();
        assert.ok(m.outline.includes('heading(2)["二番目"]'),
            `選択した /h2 が適用されていない: ${m.outline}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('enableSlashMenu: false なら "/" をタイプしてもメニューは開かない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, 'Start\n\nTAIL\n', 'Start', { enableSlashMenu: false });
        await h.placeCursorAfterText('Start');
        await h.press('Enter');
        await h.type('/');
        await h.page.waitForTimeout(300);
        assert.strictEqual(await menuVisible(h), false, '無効設定なのにスラッシュメニューが開いた');
        const m = await h.model();
        assert.ok(m.text.includes('/'), `"/" が普通の文字として入力されていない: ${m.text}`);
        assert.deepStrictEqual(h.errors, []);
    });
});
