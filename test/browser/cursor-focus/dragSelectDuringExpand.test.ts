/**
 * 実ブラウザ回帰テスト: フォーカス展開中の別ブロックが残ったままドラッグ選択すると
 * 選択が空になってしまう不具合。
 *
 * 症状: 文書を開くと最初のブロック（見出しなど）が自動でフォーカス展開される
 * （`blockPrefixEditPlugin` の auto-expand）。この状態のまま、別のブロック（例:
 * 最初の箇条書き項目のテキスト部分）でマウスドラッグによる範囲選択を始めると、
 * 選択が完了しない（mouseup 後も選択が空のまま）。
 *
 * 原因: ドラッグの最中、ブラウザは mousedown 位置から mousemove の位置まで
 * ネイティブ選択を伸ばしていくが、この過程で ProseMirror の selection も変化し、
 * `blockPrefixEditPlugin` の `view.update` がフォーカス中ブロックの変化を検知して
 * 展開中ブロックの collapse（テキスト削除を伴う transaction）を即座に発火させていた。
 * ドラッグの途中でドキュメントが変化すると、ブラウザが内部で追跡しているネイティブ
 * 選択の anchor/focus ノードが無効になり、mouseup 時点の最終選択が正しく
 * 反映されない（空になる）。
 *
 * 修正方針: マウスボタンが押されている間（ドラッグ中）は expand/collapse の
 * 処理を保留し、mouseup 後にまとめて 1 回だけ同期する。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';

async function getSelectionRange(h: PreviewHandle): Promise<{ from: number; to: number; empty: boolean }> {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    return h.page.evaluate(() => {
        const view = (window as any).__view;
        const sel = view.state.selection;
        return { from: sel.from, to: sel.to, empty: sel.empty };
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */
}

/** 指定テキストを含む要素の左端から右端までマウスドラッグする（マーカーアイコンは避ける）。 */
async function dragSelectText(h: PreviewHandle, text: string): Promise<void> {
    const box = await h.page.getByText(text, { exact: false }).first().boundingBox();
    if (!box) throw new Error(`テキスト "${text}" の bounding box が取得できない`);
    const startX = box.x + 2;
    const endX = box.x + box.width - 2;
    const y = box.y + box.height / 2;

    await h.page.mouse.move(startX, y);
    await h.page.mouse.down();
    await h.page.waitForTimeout(50);
    await h.page.mouse.move(endX, y, { steps: 10 });
    await h.page.waitForTimeout(50);
    await h.page.mouse.up();
    await h.page.waitForTimeout(150);
}

describe('実ブラウザ: フォーカス展開中の別ブロックが残ったままドラッグ選択できる', function () {
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

    it('見出し（auto-expand 済み）が残ったまま最初の箇条書き項目のテキストをドラッグ選択できる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '## Heading\n\n- first item\n\n- second item\n', 'first');

        // 開いた直後、見出しが auto-expand されている前提の確認
        const initial = await getSelectionRange(h);
        assert.ok(initial.empty, '初期状態は空選択のはず');

        await dragSelectText(h, 'first item');

        const sel = await getSelectionRange(h);
        assert.ok(!sel.empty, `見出し展開中にドラッグしても選択が空のまま: ${JSON.stringify(sel)}`);
    });

    it('比較: 見出しの展開が既に解除されていれば、同じドラッグは元から選択できる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '## Heading\n\n- first item\n\n- second item\n', 'first');

        // 先に別ブロックへカーソルを移し、見出しの展開を解除しておく
        await h.placeCursorAfterText('first');
        await h.page.waitForTimeout(200);

        await dragSelectText(h, 'first item');

        const sel = await getSelectionRange(h);
        assert.ok(!sel.empty, `展開解除済みでもドラッグ選択できない: ${JSON.stringify(sel)}`);
    });
});
