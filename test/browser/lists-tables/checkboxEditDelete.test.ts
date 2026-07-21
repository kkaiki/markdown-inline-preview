/**
 * 実ブラウザ回帰テスト: チェックボックス項目の Enter による文中分割、クリックによる
 * チェック解除（既存の `listMarkerDragFix.test.ts` はチェック方向のみ検証済み）を、
 * 実 DOM のカーソル位置・クリック座標を通して検証する。
 * jsdom（`test/webview/editing-core/checkboxEditDelete.test.ts`）で構造レベルの
 * 正しさは確認済みだが、実ブラウザのカーソル配置・DOM クリックでも同じ結果になることを
 * ここで固定する。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openPreview, type PreviewHandle } from '../previewBrowserHarness';

describe('実ブラウザ: チェックボックスの編集・削除', function () {
    this.timeout(240000);

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

    it('チェック済み項目のテキスト中央で Enter して分割すると、新項目は未チェックになる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '- [x] hello world\n', 'hello world');
        await h.placeCursorAfterText('hello');
        await h.press('Enter');

        const m = await h.model();
        assert.ok(m.outline.includes('list_item(checked=true)[paragraph["hello"]]'),
            `前半（元の項目）が checked=true のまま残っていない: ${m.outline}`);
        assert.ok(m.outline.includes('list_item(checked=false)[paragraph[" world"]]'),
            `文中分割で作られた後半の新項目が未チェックになっていない: ${m.outline}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('チェック済みのチェックボックスをクリックすると未チェックに戻る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '- [x] task\n', 'task');

        await h.page.locator('.milkdown-icon.label.checked').first().click();
        await h.page.waitForTimeout(150);

        const m = await h.model();
        assert.ok(m.outline.includes('list_item(checked=false)'),
            `クリックで未チェックに戻らなかった: ${m.outline}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('リスト2番目のチェックボックスの行頭で Backspace すると、前の項目とマージせず箇条書きへ降格し、テキストは汚れない', async function () {
        // 実バグ回帰（2026-07-08 発見・修正）: markerBackspace のチェックボックス→箇条書き
        // 降格（checked: boolean → null）は setBlockPrefixExpansionSuppressed で
        // 展開を抑制していなかったため、setNodeMarkup 直後に blockPrefixEditPlugin が
        // 「フォーカス中の普通の箇条書きになった」と誤検知して "- " を実テキストとして
        // 挿入し、"- second" のように記法がテキストに漏れ出し、checked も null のまま
        // 壊れた状態になっていた（previewKeymapPlugin.ts の makeTodo() が対処済みの
        // Bug1 と同じ機序）。詳細: docs/specifications/preview-usage-flow-test-backlog.md 4.2。
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, '- [x] first\n- [ ] second\n', 'second');
        await h.placeCursorAtLineStart('second');
        await h.press('Backspace');

        const m = await h.model();
        assert.ok(m.outline.includes('list_item(checked=true)[paragraph["first"]]'),
            `1項目目（first）が変化してはいけない: ${m.outline}`);
        assert.ok(m.outline.includes('list_item(checked=null)[paragraph["second"]]'),
            `2項目目はチェックボックスから箇条書きへ降格し、テキストは "second" のままであるべき（"- " が漏れていないか）: ${m.outline}`);
        assert.deepStrictEqual(h.errors, []);
    });

    it('空チェックボックスで Backspace → 箇条書きを経由せず、その位置に空行を残す', async function () {
        if (!browser) { this.skip(); return; }
        h = await openPreview(browser, 'above\n\n- [ ] x\n\nbelow\n', 'below');
        await h.placeCursorAfterText('x');
        await h.press('Backspace'); // 本文を空にする
        await h.press('Backspace');
        await h.page.waitForTimeout(100);

        // 'above'/'x'/'below' を挟む空行2つ（前後1つずつ）は blankLineRemarkPlugin により
        // それぞれ空 paragraph として実体化されるため、リフト後の空段落と合わせて
        // 合計5段落になる。
        const m = await h.model();
        assert.deepStrictEqual(m.topTypes, ['paragraph', 'paragraph', 'paragraph', 'paragraph', 'paragraph'], `空行として残っていない: ${m.outline}`);
        assert.ok(!m.outline.includes('bullet_list'), `空の箇条書きが残っている: ${m.outline}`);
        assert.deepStrictEqual(h.errors, []);
    });
});
