/**
 * Phase 4b: 表のセル内直接編集を実 Chromium で固定する。
 *
 * Obsidian 実測（obsidian-observed-spec.md §2.8）では、表は**常時レンダリング**され、
 * カーソルが表の中にあってもパイプ記法の生表示に戻らない。編集はレンダリングされた
 * セルの中で行う。Phase 4 ではブロックスコープ（カーソルを入れると生表示）で暫定実装
 * していたが、ここで Obsidian と同じ「畳んだまま編集」に揃える。
 *
 * セルの範囲が1文字でもズレると入力が隣のセルへ入りドキュメントが壊れるため、
 * 「入力した文字が正しいセルに入る」ことを複数のセルで確認する。
 */
import * as assert from 'assert';
import type { Browser } from 'playwright';
import { launchBrowser, openLive, type LiveHandle } from '../../liveBrowserHarness';

const TABLE = '前の段落\n\n| 列A | 列B |\n| --- | --- |\n| a1 | b1 |\n\n後の段落\n';

/** n 番目（0 始まり）の編集可能セルをクリックして末尾にキャレットを置く。 */
async function focusCell(h: LiveHandle, index: number): Promise<void> {
    await h.page.evaluate((i: number) => {
        const cells = Array.from(document.querySelectorAll('.cm-live-table [contenteditable="true"]'));
        const cell = cells[i] as HTMLElement;
        cell.focus();
        const range = document.createRange();
        range.selectNodeContents(cell);
        range.collapse(false);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
    }, index);
    await h.page.waitForTimeout(60);
}

describe('Live モード: 表のセル内編集（実ブラウザ）', function () {
    this.timeout(120000);

    let browser: Browser | null = null;
    let h: LiveHandle | undefined;

    before(async () => {
        browser = await launchBrowser();
    });
    after(async function () {
        this.timeout(20000);
        await browser?.close();
    });
    afterEach(async () => {
        if (h) {
            await h.close();
            h = undefined;
        }
    });

    it('カーソルが表の行にあっても生のパイプ記法に戻らない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await h.setCursor(15); // 表の1行目
        const lines = await h.renderedLines();
        assert.ok(
            !lines.some((l) => l.includes('| 列A')),
            `生のパイプ記法が出ている: ${JSON.stringify(lines)}`
        );
        const n = await h.page.evaluate<number>(`document.querySelectorAll('table.cm-live-table').length`);
        assert.strictEqual(n, 1, '表が畳まれていない');
    });

    it('セルは編集可能になっている', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        const n = await h.page.evaluate<number>(
            `document.querySelectorAll('.cm-live-table [contenteditable="true"]').length`
        );
        assert.strictEqual(n, 4, 'ヘッダ2 + 本文2 の4セルが編集可能であるべき');
    });

    it('先頭セルに入力するとソースの該当セルだけが変わる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await focusCell(h, 0);
        await h.page.keyboard.type('X');
        await h.page.waitForTimeout(150);
        assert.strictEqual(await h.doc(), '前の段落\n\n| 列AX | 列B |\n| --- | --- |\n| a1 | b1 |\n\n後の段落\n');
    });

    it('2つ目以降のセルに入力しても位置がズレない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await focusCell(h, 1);
        await h.page.keyboard.type('Y');
        await h.page.waitForTimeout(150);
        assert.strictEqual(await h.doc(), '前の段落\n\n| 列A | 列BY |\n| --- | --- |\n| a1 | b1 |\n\n後の段落\n');
    });

    it('本文行のセルにも入力できる', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await focusCell(h, 3);
        await h.page.keyboard.type('Z');
        await h.page.waitForTimeout(150);
        assert.strictEqual(await h.doc(), '前の段落\n\n| 列A | 列B |\n| --- | --- |\n| a1 | b1Z |\n\n後の段落\n');
    });

    it('連続して入力してもセルの範囲がズレない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await focusCell(h, 0);
        await h.page.keyboard.type('123');
        await h.page.waitForTimeout(200);
        assert.strictEqual(await h.doc(), '前の段落\n\n| 列A123 | 列B |\n| --- | --- |\n| a1 | b1 |\n\n後の段落\n');
    });

    it('あるセルを編集した後に別のセルを編集しても正しい位置に入る', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await focusCell(h, 0);
        await h.page.keyboard.type('AA');
        await h.page.waitForTimeout(200);
        await focusCell(h, 3);
        await h.page.keyboard.type('BB');
        await h.page.waitForTimeout(200);
        assert.strictEqual(
            await h.doc(),
            '前の段落\n\n| 列AAA | 列B |\n| --- | --- |\n| a1 | b1BB |\n\n後の段落\n'
        );
    });

    it('Tab で次のセルへ移動する', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await focusCell(h, 0);
        await h.page.keyboard.press('Tab');
        await h.page.waitForTimeout(120);
        const idx = await h.page.evaluate<number>(
            `[...document.querySelectorAll('.cm-live-table [contenteditable="true"]')].indexOf(document.activeElement)`
        );
        assert.strictEqual(idx, 1);
    });

    it('Shift+Tab で前のセルへ移動する', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await focusCell(h, 2);
        await h.page.keyboard.press('Shift+Tab');
        await h.page.waitForTimeout(120);
        const idx = await h.page.evaluate<number>(
            `[...document.querySelectorAll('.cm-live-table [contenteditable="true"]')].indexOf(document.activeElement)`
        );
        assert.strictEqual(idx, 1);
    });

    it('セル内で Enter しても改行が入らず表が壊れない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await focusCell(h, 0);
        await h.page.keyboard.press('Enter');
        await h.page.waitForTimeout(150);
        assert.strictEqual(await h.doc(), TABLE, '表のソースが変わってしまった');
    });

    it('セルの中のインライン記法は装飾されて表示される（記法文字は出ない）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '| **太字** | `code` |\n| --- | --- |\n| a | b |\n');
        const info = await h.page.evaluate<{ text: string; strong: number; code: number }>(`(() => {
            const th = document.querySelectorAll('.cm-live-table th');
            return {
                text: th[0].textContent,
                strong: document.querySelectorAll('.cm-live-table .cm-live-strong').length,
                code: document.querySelectorAll('.cm-live-table .cm-live-code').length
            };
        })()`);
        assert.strictEqual(info.text, '太字', '記法文字がセルに出ている');
        assert.strictEqual(info.strong, 1);
        assert.strictEqual(info.code, 1);
    });

    it('セルにフォーカスすると生の Markdown に戻り、外すと再び装飾される', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '| **太字** | b |\n| --- | --- |\n| a | b |\n');
        await focusCell(h, 0);
        assert.strictEqual(
            await h.page.evaluate<string>(`document.querySelectorAll('.cm-live-table th')[0].textContent`),
            '**太字**',
            'フォーカスしても生テキストに戻っていない'
        );
        await focusCell(h, 1);
        assert.strictEqual(
            await h.page.evaluate<string>(`document.querySelectorAll('.cm-live-table th')[0].textContent`),
            '太字',
            'フォーカスを外しても装飾に戻っていない'
        );
    });

    it('装飾されたセルを編集してもソースの記法が壊れない', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, '| **太字** | b |\n| --- | --- |\n| a | b |\n');
        await focusCell(h, 0);
        await h.page.keyboard.type('X');
        await h.page.waitForTimeout(200);
        assert.strictEqual(await h.doc(), '| **太字**X | b |\n| --- | --- |\n| a | b |\n');
    });

    describe('セルをまたぐ範囲選択（ユーザー報告: 表の複数選択ができない）', () => {
        /** セル i からセル j までドラッグする。 */
        async function dragCells(handle: LiveHandle, from: number, to: number): Promise<void> {
            const box = await handle.page.evaluate<{ fx: number; fy: number; tx: number; ty: number }>(
                `(() => {
                    const cells = Array.from(document.querySelectorAll('.cm-live-table [contenteditable="true"]'));
                    const a = cells[${from}].getBoundingClientRect();
                    const b = cells[${to}].getBoundingClientRect();
                    return { fx: a.x + a.width / 2, fy: a.y + a.height / 2, tx: b.x + b.width / 2, ty: b.y + b.height / 2 };
                })()`
            );
            await handle.page.mouse.move(box.fx, box.fy);
            await handle.page.mouse.down();
            await handle.page.mouse.move(box.tx, box.ty, { steps: 6 });
            await handle.page.mouse.up();
            await handle.page.waitForTimeout(150);
        }

        it('ドラッグで複数セルが選択される', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, TABLE);
            await dragCells(h, 0, 3);
            const n = await h.page.evaluate<number>(
                `document.querySelectorAll('.cm-live-cell-selected').length`
            );
            assert.strictEqual(n, 4, '4セルが選択されるべき');
        });

        it('横方向のドラッグで同じ行のセルだけ選択される', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, TABLE);
            await dragCells(h, 0, 1);
            const sel = await h.page.evaluate<string[]>(
                `Array.from(document.querySelectorAll('.cm-live-cell-selected')).map(e => e.textContent)`
            );
            assert.deepStrictEqual(sel, ['列A', '列B']);
        });

        it('単一セルのクリックでは範囲選択にならない（通常のテキスト選択のまま）', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, TABLE);
            await dragCells(h, 1, 1);
            const n = await h.page.evaluate<number>(
                `document.querySelectorAll('.cm-live-cell-selected').length`
            );
            assert.strictEqual(n, 0);
        });

        it('選択したセルはドキュメントを変更しない', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, TABLE);
            await dragCells(h, 0, 3);
            assert.strictEqual(await h.doc(), TABLE);
            assert.deepStrictEqual(h.errors, []);
        });

        it('Escape で選択が解除される', async function () {
            if (!browser) { this.skip(); return; }
            h = await openLive(browser, TABLE);
            await dragCells(h, 0, 3);
            await h.page.keyboard.press('Escape');
            await h.page.waitForTimeout(150);
            const n = await h.page.evaluate<number>(
                `document.querySelectorAll('.cm-live-cell-selected').length`
            );
            assert.strictEqual(n, 0);
        });
    });

    it('セル編集は差分として host へ送られる（全体置換しない）', async function () {
        if (!browser) { this.skip(); return; }
        h = await openLive(browser, TABLE);
        await focusCell(h, 0);
        await h.page.keyboard.type('X');
        await h.page.waitForTimeout(200);
        const edits = (await h.sent()).filter((m) => m.type === 'edit');
        assert.strictEqual(edits.length, 1, `edit が1件でない: ${JSON.stringify(edits)}`);
        const changes = edits[0].changes as { from: number; to: number; insert: string }[];
        assert.ok(changes[0].to - changes[0].from < 10, `全体置換になっている: ${JSON.stringify(changes)}`);
        assert.deepStrictEqual(h.errors, []);
    });
});
