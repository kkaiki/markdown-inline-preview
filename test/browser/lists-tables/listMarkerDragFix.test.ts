/**
 * 実ブラウザ回帰テスト: 箇条書き・番号付きリストのマーカー（bullet/ordered アイコン）
 * からドラッグを始めると選択できない不具合。
 *
 * 原因: `@milkdown/components` の `list-item-block` は、マーカーを囲む
 * `.label-wrapper` の `pointerdown` で、チェックボックスかどうかに関わらず常に
 * `preventDefault()` + `stopPropagation()` を呼ぶ。Pointer Events の仕様上、
 * `pointerdown` を `preventDefault()` すると後続の互換 `mousedown` が発火しなくなり、
 * `mousedown` を起点にする ProseMirror のネイティブなドラッグ選択が一切始まらない
 * （マーカー上で mousedown → 別の位置まで動かして mouseup しても選択が空のまま）。
 *
 * 修正（`listMarkerDragFixPlugin.ts`）: bullet/ordered マーカーの `pointerdown` は
 * capture フェーズで先取りして `stopPropagation()` し、component 側のハンドラに届く
 * 前に伝播を止める（`preventDefault()` は呼ばない）。これにより後続の `mousedown` が
 * 正常に発火し、ProseMirror が座標から最寄りのテキスト位置を解決してドラッグ選択を
 * 開始できる。チェックボックスのマーカー（クリックでトグル、既存機能）は対象外とし、
 * 挙動を変えない。
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

/** マーカーアイコン（`.milkdown-icon.label` の指定クラス）から、指定テキストの末尾までドラッグする。 */
async function dragFromMarkerToText(
    h: PreviewHandle,
    markerClass: string,
    targetText: string
): Promise<void> {
    const markerBox = await h.page.locator(`.milkdown-icon.label.${markerClass}`).first().boundingBox();
    if (!markerBox) throw new Error(`マーカー .${markerClass} の bounding box が取得できない`);
    const textBox = await h.page.getByText(targetText, { exact: false }).first().boundingBox();
    if (!textBox) throw new Error(`テキスト "${targetText}" の bounding box が取得できない`);

    const startX = markerBox.x + markerBox.width / 2;
    const startY = markerBox.y + markerBox.height / 2;
    const endX = textBox.x + textBox.width - 2;
    const endY = textBox.y + textBox.height / 2;

    await h.page.mouse.move(startX, startY);
    await h.page.mouse.down();
    await h.page.waitForTimeout(50);
    await h.page.mouse.move(endX, endY, { steps: 10 });
    await h.page.waitForTimeout(50);
    await h.page.mouse.up();
    await h.page.waitForTimeout(150);
}

describe('実ブラウザ: 箇条書き/番号付きリストのマーカーからドラッグ選択できる', function () {
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

    it('箇条書きの bullet マーカーからドラッグを始めても選択できる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '- first item\n\n- second item\n', 'first');

        // 1番目の展開（auto-expand）を解除して bullet アイコンを可視化する
        await h.placeCursorAfterText('second');
        await h.page.waitForTimeout(150);

        await dragFromMarkerToText(h, 'bullet', 'first item');

        const sel = await getSelectionRange(h);
        assert.ok(!sel.empty, `bullet マーカーからのドラッグで選択できなかった: ${JSON.stringify(sel)}`);
    });

    it('番号付きリストの ordered マーカーからドラッグを始めても選択できる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '1. first item\n\n2. second item\n', 'first');
        await h.placeCursorAfterText('second');
        await h.page.waitForTimeout(150);

        await dragFromMarkerToText(h, 'ordered', 'first item');

        const sel = await getSelectionRange(h);
        assert.ok(!sel.empty, `ordered マーカーからのドラッグで選択できなかった: ${JSON.stringify(sel)}`);
    });

    it('（回帰確認）チェックボックスのマーカーはクリックで従来どおりトグルできる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '- [ ] task\n', 'task');

        await h.page.locator('.milkdown-icon.label.unchecked').first().click();
        await h.page.waitForTimeout(150);

        const m = await h.model();
        assert.ok(
            m.outline.includes('list_item(checked=true)'),
            `クリックでチェック済みにならなかった: ${m.outline}`
        );
    });
});
