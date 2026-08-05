/**
 * 実ブラウザ回帰テスト: Preview の水平線（`---`）を編集できること。
 *
 * 水平線は ProseMirror の leaf ノードで、`.milkdown hr` は既定だと高さ 1px の
 * 罫線しか持たない。そのため「クリックしても掴めない」「選択されても見た目が
 * 変わらないので消せたか分からない」状態だった（ユーザー報告 2026-07-27
 * 「ここの横棒も編集できるようにしたい」）。さらに remark-stringify の既定では
 * thematicBreak が `***` で書き戻されるため、**別の場所を編集しただけで
 * ソースの `---` が `***` に書き換わる**という破壊も起きていた。
 *
 * ここでは実バンドル・実 Chromium・実マウスクリックで、
 * - 罫線を実際にクリックして水平線ノードを掴める（クリック判定領域がある）
 * - 選択中は見た目で分かる
 * - 選択した水平線を Backspace / Delete / 文字入力で編集できる
 * - 前後のブロックからの Backspace / Delete でも消せる
 * - 削除がホストへ送る Markdown に反映され、`---` は `---` のまま保たれる
 * を検証する。
 *
 * 実行: `npm run test:browser`。ブラウザが無い環境では skip。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';

/** 現在の選択が NodeSelection の場合、その選択ノードの型名を返す（そうでなければ null）。 */
async function selectedNodeType(h: PreviewHandle): Promise<string | null> {
    return h.page.evaluate(() => {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const node = (window as any).__view.state.selection.node;
        return node ? node.type.name : null;
        /* eslint-enable @typescript-eslint/no-explicit-any */
    });
}

/** `<hr>` 要素の実際の矩形（＝実マウスで掴めるクリック判定領域）を返す。 */
async function hrBox(h: PreviewHandle): Promise<{ x: number; y: number; width: number; height: number }> {
    const box = await h.page.locator('.milkdown hr').first().boundingBox();
    assert.ok(box, '.milkdown hr が見つからない');
    return box;
}

/** `<hr>` の中央を実マウスでクリックする。 */
async function clickHr(h: PreviewHandle): Promise<void> {
    const box = await hrBox(h);
    await h.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

/** 選択の可視化に使われうる計算済みスタイルをまとめて取り出す。 */
async function hrVisualStyle(h: PreviewHandle): Promise<Record<string, string>> {
    return h.page.evaluate(() => {
        const hr = document.querySelector('.milkdown hr');
        if (!hr) return {};
        const s = getComputedStyle(hr);
        return {
            outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`,
            background: s.backgroundColor,
            backgroundImage: s.backgroundImage,
            boxShadow: s.boxShadow,
            borderTopColor: s.borderTopColor
        };
    });
}

describe('実ブラウザ: Preview の水平線（---）編集', function () {
    this.timeout(120000);

    const SRC = 'above\n\n---\n\nbelow\n';

    let browser: Browser | null = null;
    let h: PreviewHandle | undefined;

    before(async () => { browser = await launchBrowser(); });
    after(async () => { await browser?.close(); });
    afterEach(async () => { if (h) { await h.close(); h = undefined; } });

    it('水平線には実マウスで掴めるだけのクリック判定領域がある', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, SRC, 'below');
        const box = await hrBox(h);
        assert.ok(
            box.height >= 8,
            `hr のクリック判定領域が細すぎて掴めない: height=${box.height}px`
        );
        assert.deepStrictEqual(h.errors, []);
    });

    it('水平線をクリックすると水平線が選択される', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, SRC, 'below');
        await clickHr(h);
        assert.strictEqual(await selectedNodeType(h), 'hr', 'クリックで hr が選択されていない');
        assert.deepStrictEqual(h.errors, []);
    });

    it('選択中の水平線は非選択時と見た目が変わる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, SRC, 'below');
        const before = await hrVisualStyle(h);
        await clickHr(h);
        assert.strictEqual(await selectedNodeType(h), 'hr', '前提: クリックで hr が選択されていない');
        const after = await hrVisualStyle(h);
        assert.notDeepStrictEqual(
            after,
            before,
            `選択しても hr の見た目が変わらない（消せたか分からない）: ${JSON.stringify(before)}`
        );
        assert.deepStrictEqual(h.errors, []);
    });

    it('選択した水平線を Backspace で削除でき Markdown からも消える', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, SRC, 'below');
        await clickHr(h);
        await h.press('Backspace');
        const m = await h.model();
        assert.ok(!m.topTypes.includes('hr'), `hr が消えていない: ${m.outline}`);
        assert.ok(m.text.includes('above') && m.text.includes('below'), `前後の段落まで消えた: ${m.outline}`);
        // `---` の行だけが消え、前後の空行（空行保持のプレースホルダ段落）はそのまま残る。
        await h.waitForMarkdown('above\n\n\nbelow\n');
        assert.deepStrictEqual(h.errors, []);
    });

    it('選択した水平線を Delete で削除できる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, SRC, 'below');
        await clickHr(h);
        await h.press('Delete');
        const m = await h.model();
        assert.ok(!m.topTypes.includes('hr'), `hr が消えていない: ${m.outline}`);
        assert.ok(m.text.includes('above') && m.text.includes('below'), `前後の段落まで消えた: ${m.outline}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('水平線の直後のブロック先頭で Backspace を続けると水平線が削除される', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, SRC, 'below');
        await h.placeCursorBeforeText('below');
        await h.press('Backspace');
        await h.press('Backspace');
        const m = await h.model();
        assert.ok(!m.topTypes.includes('hr'), `hr が消えていない: ${m.outline}`);
        assert.ok(
            m.outline.includes('paragraph["above"]') && m.outline.includes('paragraph["below"]'),
            `前後の段落が壊れた: ${m.outline}`
        );
        assert.deepStrictEqual(h.errors, []);
    });

    it('水平線の直前のブロック末尾で Delete すると水平線が削除される', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, SRC, 'below');
        await h.placeCursorAfterText('above');
        await h.press('Delete');
        const m = await h.model();
        assert.ok(!m.topTypes.includes('hr'), `hr が消えていない: ${m.outline}`);
        assert.ok(
            m.outline.includes('paragraph["above"]') && m.outline.includes('paragraph["below"]'),
            `前後の段落が壊れた: ${m.outline}`
        );
        assert.deepStrictEqual(h.errors, []);
    });

    it('水平線を選択して文字を入力すると水平線が段落に置き換わる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, SRC, 'below');
        await clickHr(h);
        await h.type('typed');
        const m = await h.model();
        assert.ok(!m.topTypes.includes('hr'), `hr が残っている: ${m.outline}`);
        assert.ok(m.outline.includes('paragraph["typed"]'), `入力した文字が段落になっていない: ${m.outline}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('水平線を削除しても Undo で元に戻せる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, SRC, 'below');
        await clickHr(h);
        await h.press('Backspace');
        await h.press('Meta+z');
        const m = await h.model();
        assert.ok(m.topTypes.includes('hr'), `Undo で hr が戻らない: ${m.outline}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('別の場所を編集しても水平線は --- のまま保存される（*** に書き換わらない）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, SRC, 'below');
        await h.placeCursorAfterText('above');
        await h.type('X');
        await h.waitForMarkdown('aboveX\n\n---\n\nbelow\n');
        assert.deepStrictEqual(h.errors, []);
    });

    it('段落で --- と入力すると水平線になる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, 'above\n\nTAIL\n', 'TAIL');
        await h.placeCursorAfterText('above');
        await h.press('Enter');
        await h.type('---');
        const m = await h.model();
        assert.ok(m.topTypes.includes('hr'), `--- 入力で hr にならない: ${m.outline}`);
        assert.deepStrictEqual(h.errors, []);
    });
});
