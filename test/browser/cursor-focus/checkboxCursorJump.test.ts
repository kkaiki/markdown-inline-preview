/**
 * 実ブラウザ回帰テスト: チェックボックス変換後にカーソルが別ブロックへ飛ぶ不具合。
 *
 * ## バグ内容
 *
 * 対象行をチェックボックスへ変換する（⌥⌘4 / ツールバーの ☑ ボタン）とき、対象行が
 * まだリストでない場合は「bullet_list へ wrap」→「checked 属性を設定」の 2 回に
 * 分けて `view.dispatch` している。チェックボックス項目は Milkdown の
 * `list-item-block` Web Component でレンダリングされるため、1 回目の dispatch
 * 直後は素の `<li>`、2 回目の dispatch で Web Component へ再マウントされる。
 * この再マウントの瞬間にブラウザのネイティブ selection が失われ、ドキュメント内に
 * 他のリストブロックが存在すると、そちらへ selection が退避してしまうことがある
 * （selectionchange を ProseMirror がそのまま拾ってしまう）。
 *
 * 詳細設計: docs/specifications/fixes/checkbox-cursor-jump-fix.md
 *
 * 単独の段落しか無い文書では再現しない（`blockPrefixBugs.test.ts` の Bug4 が
 * カバーしており、そちらは対象外）。本ファイルは「ドキュメント内の他の場所に
 * 既存のリストブロックがある」場合に絞って、可能な限り多くの操作・周辺状態の
 * 組み合わせを網羅する。
 *
 * 実行: `npm run test:browser`。ブラウザが無い環境では skip。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';

describe('実ブラウザ: チェックボックス変換後のカーソル飛び回帰', function () {
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

    function assertCursorStaysOnTarget(m: { selParentText: string; outline: string }, target: string): void {
        assert.ok(
            m.selParentText.includes(target),
            `カーソルが対象行から別ブロックへ飛んだ: selParentText="${m.selParentText}" outline="${m.outline}"`
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 入口 1: ⌥⌘4 ショートカット
    // ─────────────────────────────────────────────────────────────────────────
    describe('⌥⌘4 ショートカット', () => {
        it('上に既存の箇条書きがある場合、変換後もカーソルは対象行に留まる', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '- 既存項目\n\n対象行\n\nTAIL\n', '対象行');
            await h.placeCursorAfterText('対象行');
            await h.press('Alt+Meta+4');
            await h.page.waitForTimeout(300);
            assertCursorStaysOnTarget(await h.model(), '対象行');
            assert.deepStrictEqual(h.errors, []);
        });

        it('上に既存の番号付きリストがある場合、変換後もカーソルは対象行に留まる', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '1. 既存項目\n\n対象行\n\nTAIL\n', '対象行');
            await h.placeCursorAfterText('対象行');
            await h.press('Alt+Meta+4');
            await h.page.waitForTimeout(300);
            assertCursorStaysOnTarget(await h.model(), '対象行');
            assert.deepStrictEqual(h.errors, []);
        });

        it('上に既存のチェックボックスがある場合、変換後もカーソルは対象行に留まる', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '- [ ] 既存TODO\n\n対象行\n\nTAIL\n', '対象行');
            await h.placeCursorAfterText('対象行');
            await h.press('Alt+Meta+4');
            await h.page.waitForTimeout(300);
            assertCursorStaysOnTarget(await h.model(), '対象行');
            assert.deepStrictEqual(h.errors, []);
        });

        it('下に既存の箇条書きがある場合、変換後もカーソルは対象行に留まる', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '対象行\n\n- 下の項目\n\nTAIL\n', '対象行');
            await h.placeCursorAfterText('対象行');
            await h.press('Alt+Meta+4');
            await h.page.waitForTimeout(300);
            assertCursorStaysOnTarget(await h.model(), '対象行');
            assert.deepStrictEqual(h.errors, []);
        });

        it('上下両方に既存リストがある場合、変換後もカーソルは対象行に留まる', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '- 上の項目\n\n対象行\n\n1. 下の項目\n\nTAIL\n', '対象行');
            await h.placeCursorAfterText('対象行');
            await h.press('Alt+Meta+4');
            await h.page.waitForTimeout(300);
            assertCursorStaysOnTarget(await h.model(), '対象行');
            assert.deepStrictEqual(h.errors, []);
        });

        it('対照群: 周辺に既存リストが無い場合も、変換後カーソルは対象行に留まる', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '前の段落\n\n対象行\n\nTAIL\n', '対象行');
            await h.placeCursorAfterText('対象行');
            await h.press('Alt+Meta+4');
            await h.page.waitForTimeout(300);
            assertCursorStaysOnTarget(await h.model(), '対象行');
            assert.deepStrictEqual(h.errors, []);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 入口 2: ツールバーのチェックボックスボタン
    // ─────────────────────────────────────────────────────────────────────────
    describe('ツールバーのチェックボックスボタン', () => {
        async function clickCheckboxButton(handle: PreviewHandle): Promise<void> {
            await handle.page.click('button[aria-label="Checkbox"]');
            await handle.page.waitForTimeout(300);
        }

        it('上に既存の箇条書きがある場合、変換後もカーソルは対象行に留まる', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '- 既存項目\n\n対象行\n\nTAIL\n', '対象行', { showToolbar: true });
            await h.placeCursorAfterText('対象行');
            await clickCheckboxButton(h);
            assertCursorStaysOnTarget(await h.model(), '対象行');
            assert.deepStrictEqual(h.errors, []);
        });

        it('上に既存のチェックボックスがある場合、変換後もカーソルは対象行に留まる', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '- [ ] 既存TODO\n\n対象行\n\nTAIL\n', '対象行', { showToolbar: true });
            await h.placeCursorAfterText('対象行');
            await clickCheckboxButton(h);
            assertCursorStaysOnTarget(await h.model(), '対象行');
            assert.deepStrictEqual(h.errors, []);
        });

        it('下に既存の番号付きリストがある場合、変換後もカーソルは対象行に留まる', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '対象行\n\n1. 下の項目\n\nTAIL\n', '対象行', { showToolbar: true });
            await h.placeCursorAfterText('対象行');
            await clickCheckboxButton(h);
            assertCursorStaysOnTarget(await h.model(), '対象行');
            assert.deepStrictEqual(h.errors, []);
        });

        it('見出しから変換する場合も、周辺に既存リストがあればカーソルは対象行に留まる', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '- 既存項目\n\n## 対象見出し\n\nTAIL\n', '対象見出し', { showToolbar: true });
            await h.placeCursorAfterText('対象見出し');
            await clickCheckboxButton(h);
            assertCursorStaysOnTarget(await h.model(), '対象見出し');
            assert.deepStrictEqual(h.errors, []);
        });

        // checkbox-cursor-jump-fix.md §5 が推奨する「入口 × 周辺リスト有無 × リスト種別」の
        // 総当たりのうち、ショートカット系（上の describe）とは重ならない残りの組み合わせを補う。
        it('下に既存の箇条書きがある場合、変換後もカーソルは対象行に留まる', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '対象行\n\n- 下の項目\n\nTAIL\n', '対象行', { showToolbar: true });
            await h.placeCursorAfterText('対象行');
            await clickCheckboxButton(h);
            assertCursorStaysOnTarget(await h.model(), '対象行');
            assert.deepStrictEqual(h.errors, []);
        });

        it('上下両方に既存リストがある場合、変換後もカーソルは対象行に留まる', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '- 上の項目\n\n対象行\n\n1. 下の項目\n\nTAIL\n', '対象行', { showToolbar: true });
            await h.placeCursorAfterText('対象行');
            await clickCheckboxButton(h);
            assertCursorStaysOnTarget(await h.model(), '対象行');
            assert.deepStrictEqual(h.errors, []);
        });

        it('対照群: 周辺に既存リストが無い場合も、変換後カーソルは対象行に留まる', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '前の段落\n\n対象行\n\nTAIL\n', '対象行', { showToolbar: true });
            await h.placeCursorAfterText('対象行');
            await clickCheckboxButton(h);
            assertCursorStaysOnTarget(await h.model(), '対象行');
            assert.deepStrictEqual(h.errors, []);
        });

        it('上に既存の番号付きリストがある場合、変換後もカーソルは対象行に留まる', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '1. 既存項目\n\n対象行\n\nTAIL\n', '対象行', { showToolbar: true });
            await h.placeCursorAfterText('対象行');
            await clickCheckboxButton(h);
            assertCursorStaysOnTarget(await h.model(), '対象行');
            assert.deepStrictEqual(h.errors, []);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // ショートカット系にのみ存在していなかった「見出しから変換」をツールバー側と対称にする
    // ─────────────────────────────────────────────────────────────────────────
    describe('⌥⌘4 ショートカット（見出し起点）', () => {
        it('見出しから変換する場合も、周辺に既存リストがあればカーソルは対象行に留まる', async function () {
            if (!browser) { this.skip(); return; }
            h = await openPreview(browser, '- 既存項目\n\n## 対象見出し\n\nTAIL\n', '対象見出し');
            await h.placeCursorAfterText('対象見出し');
            await h.press('Alt+Meta+4');
            await h.page.waitForTimeout(300);
            assertCursorStaysOnTarget(await h.model(), '対象見出し');
            assert.deepStrictEqual(h.errors, []);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 変換結果そのものの正しさ（カーソルだけでなく checked も正しいことを確認）
    // ─────────────────────────────────────────────────────────────────────────
    it('上に既存リストがあっても、対象行は checked=false の独立した list_item になる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '- 既存項目\n\n対象行\n\nTAIL\n', '対象行');
        await h.placeCursorAfterText('対象行');
        await h.press('Alt+Meta+4');
        await h.page.waitForTimeout(300);
        const m = await h.model();
        assert.ok(
            m.outline.includes('list_item(checked=false)[paragraph["対象行"]]'),
            `対象行が正しく checked=false の独立した list_item になっていない: ${m.outline}`
        );
        assert.deepStrictEqual(h.errors, []);
    });
});
