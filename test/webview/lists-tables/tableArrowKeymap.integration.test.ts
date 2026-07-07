/**
 * 表セル内の ↑/↓ で「真下/真上のセル（同じ列）」へ移ることのテスト。
 * 「↓ を押すと右のセルに飛ぶ」不具合の回帰防止。
 *
 * 端判定（endOfTextblock）はレイアウト依存で jsdom では検証しづらいため、移動先を計算する
 * `tableCellVerticalTarget` を直接テストする（これが「同じ列の上下」を担保する中核）。
 */
import '../jsdomSetup';
import * as assert from 'assert';
import { TextSelection } from '@milkdown/prose/state';
import type { Node as ProseNode } from '@milkdown/prose/model';

import { createPreviewEditor, type PreviewEditorHandle } from '../milkdownHarness';
import { tableCellVerticalTarget } from '../../../src/preview/webview/tableArrowKeymap';

// ヘッダ(a1,b1) + 本文2行((a2,b2),(a3,b3))
const MD = ['| a1 | b1 |', '| --- | --- |', '| a2 | b2 |', '| a3 | b3 |', ''].join('\n');

/** 指定テキストのセル内にカーソルを置く。 */
function cursorInCell(h: PreviewEditorHandle, text: string): void {
    let pos = -1;
    h.view.state.doc.descendants((node, p) => {
        if (pos < 0 && node.isText && node.text === text) { pos = p + 1; return false; }
        return true;
    });
    if (pos < 0) throw new Error(`cell text not found: ${text}`);
    h.view.dispatch(h.view.state.tr.setSelection(TextSelection.create(h.view.state.doc, pos)));
}

/** 位置 pos を含むセル（table_cell/table_header）の textContent。表外なら null。 */
function cellTextAt(h: PreviewEditorHandle, pos: number): string | null {
    const $pos = h.view.state.doc.resolve(Math.min(Math.max(pos, 0), h.view.state.doc.content.size));
    for (let d = $pos.depth; d > 0; d--) {
        const role = $pos.node(d).type.spec.tableRole;
        if (role === 'cell' || role === 'header_cell') return $pos.node(d).textContent;
    }
    return null;
}

describe('webview統合: 表セルの ↑/↓ ナビゲーション', () => {
    let h: PreviewEditorHandle;
    afterEach(() => h?.destroy());

    it('↓: 真下のセル（同じ列）へ移る（右へ飛ばない）', async () => {
        h = await createPreviewEditor(MD);
        cursorInCell(h, 'a2'); // 1列目・本文1行目
        const target = tableCellVerticalTarget(h.view.state, 1);
        assert.ok(target, '移動先が算出できない');
        assert.strictEqual(cellTextAt(h, target.from), 'a3', '真下(a3)ではないセルへ移動した');
    });

    it('↑: 真上のセル（同じ列）へ移る', async () => {
        h = await createPreviewEditor(MD);
        cursorInCell(h, 'a3');
        const target = tableCellVerticalTarget(h.view.state, -1);
        assert.ok(target);
        assert.strictEqual(cellTextAt(h, target.from), 'a2', '真上(a2)へ移動していない');
    });

    it('↑: 本文先頭行からヘッダの同じ列へ移る', async () => {
        h = await createPreviewEditor(MD);
        cursorInCell(h, 'a2');
        const target = tableCellVerticalTarget(h.view.state, -1);
        assert.ok(target);
        assert.strictEqual(cellTextAt(h, target.from), 'a1', 'ヘッダ(a1)へ移動していない');
    });

    it('2列目でも真下のセルへ（列を保つ）', async () => {
        h = await createPreviewEditor(MD);
        cursorInCell(h, 'b2');
        const target = tableCellVerticalTarget(h.view.state, 1);
        assert.ok(target);
        assert.strictEqual(cellTextAt(h, target.from), 'b3', '列がズレた');
    });

    it('最終行で ↓ は表の外へ抜ける（セルではない）', async () => {
        h = await createPreviewEditor(MD + '\nafter table\n');
        cursorInCell(h, 'a3'); // 最終行
        const target = tableCellVerticalTarget(h.view.state, 1);
        assert.ok(target);
        assert.strictEqual(cellTextAt(h, target.from), null, '表の外へ抜けていない');
    });

    it('表の外にカーソルがあるときは null（既定の移動に委ねる）', async () => {
        h = await createPreviewEditor('just a paragraph\n\n' + MD);
        const p = (() => {
            let pos = -1;
            h.view.state.doc.descendants((node, q) => {
                if (pos < 0 && node.isText && node.text === 'just a paragraph') { pos = q + 1; return false; }
                return true;
            });
            return pos;
        })();
        h.view.dispatch(h.view.state.tr.setSelection(TextSelection.create(h.view.state.doc, p)));
        assert.strictEqual(tableCellVerticalTarget(h.view.state, 1), null);
    });
});
