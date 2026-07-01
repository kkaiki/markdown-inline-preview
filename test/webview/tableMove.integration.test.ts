/**
 * テーブルの行/列の入れ替え（移動）統合テスト。
 * 「行を上下に入れ替えられるか」の確認＋回帰防止。ヘッダ行（index 0）は動かさない。
 */
import './jsdomSetup';
import * as assert from 'assert';
import { TextSelection } from '@milkdown/prose/state';
import { moveTableRow } from '@milkdown/prose/tables';

import { createPreviewEditor, type PreviewEditorHandle } from './milkdownHarness';
import { computeRowMove, computeColMove } from '../../src/preview/webview/tableToolbarPlugin';

// ヘッダ(H1,H2) + 本文3行
const TABLE_MD = [
    '| H1 | H2 |',
    '| --- | --- |',
    '| a1 | a2 |',
    '| b1 | b2 |',
    '| c1 | c2 |',
    ''
].join('\n');

/** 指定テキストを含むセルの「中身の先頭位置」。 */
function cellPosOf(h: PreviewEditorHandle, text: string): number {
    let pos = -1;
    h.view.state.doc.descendants((node, p) => {
        if (pos < 0 && node.isText && node.text === text) { pos = p; return false; }
        return true;
    });
    return pos;
}

/** 本文セルのテキストを上→下の順に並べた配列（1列目）。 */
function firstColumnBody(h: PreviewEditorHandle): string[] {
    const cells: string[] = [];
    h.view.state.doc.descendants((node) => {
        if (node.type.name === 'table_cell') {
            cells.push(node.textContent);
        }
        return true;
    });
    // 2 列なので 1 列目だけ拾う
    return cells.filter((_, i) => i % 2 === 0);
}

describe('webview統合: テーブルの行/列移動', () => {
    let h: PreviewEditorHandle;
    afterEach(() => h?.destroy());

    it('本文行を下へ移動できる（a行 → b行の下）', async () => {
        h = await createPreviewEditor(TABLE_MD);
        // a1 セルにカーソル（本文1行目 = 行 index 1）
        const pos = cellPosOf(h, 'a1');
        h.view.dispatch(h.view.state.tr.setSelection(TextSelection.create(h.view.state.doc, pos)));

        const move = computeRowMove(h.view, 1); // 下へ
        assert.ok(move, '移動量が算出できない');
        assert.deepStrictEqual(move, { from: 1, to: 2 }, 'a行(1) → 2 へ');
        moveTableRow({ from: move.from, to: move.to })(h.view.state, h.view.dispatch, h.view);

        const col = firstColumnBody(h);
        assert.deepStrictEqual(col, ['b1', 'a1', 'c1'], `並びが入れ替わっていない: ${col.join(',')}`);
    });

    it('ヘッダ行（index 0）は動かさない（カーソルがヘッダなら null）', async () => {
        h = await createPreviewEditor(TABLE_MD);
        const pos = cellPosOf(h, 'H1');
        h.view.dispatch(h.view.state.tr.setSelection(TextSelection.create(h.view.state.doc, pos)));
        assert.strictEqual(computeRowMove(h.view, -1), null, 'ヘッダを上へは不可');
        assert.strictEqual(computeRowMove(h.view, 1), null, 'ヘッダを下へも不可（本文に降ろさない）');
    });

    it('先頭本文行は上へ移動できない（ヘッダ位置に入れない）', async () => {
        h = await createPreviewEditor(TABLE_MD);
        const pos = cellPosOf(h, 'a1'); // 行 index 1
        h.view.dispatch(h.view.state.tr.setSelection(TextSelection.create(h.view.state.doc, pos)));
        assert.strictEqual(computeRowMove(h.view, -1), null, '先頭本文行は上(=ヘッダ)へ移動不可');
    });

    it('最終本文行は下へ移動できない（範囲外）', async () => {
        h = await createPreviewEditor(TABLE_MD);
        const pos = cellPosOf(h, 'c1'); // 最終行
        h.view.dispatch(h.view.state.tr.setSelection(TextSelection.create(h.view.state.doc, pos)));
        assert.strictEqual(computeRowMove(h.view, 1), null, '最終行は下へ移動不可');
    });

    it('列を右へ移動できる（1列目 → 2列目）', async () => {
        h = await createPreviewEditor(TABLE_MD);
        const pos = cellPosOf(h, 'a1');
        h.view.dispatch(h.view.state.tr.setSelection(TextSelection.create(h.view.state.doc, pos)));
        const move = computeColMove(h.view, 1);
        assert.deepStrictEqual(move, { from: 0, to: 1 }, '1列目(0) → 1 へ');
    });

    it('最左列は左へ移動できない（範囲外）', async () => {
        h = await createPreviewEditor(TABLE_MD);
        const pos = cellPosOf(h, 'a1');
        h.view.dispatch(h.view.state.tr.setSelection(TextSelection.create(h.view.state.doc, pos)));
        assert.strictEqual(computeColMove(h.view, -1), null);
    });
});
