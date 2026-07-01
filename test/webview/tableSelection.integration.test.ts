/**
 * テーブルのセル選択（CellSelection）統合テスト。
 *
 * 「複数セルを選択できない」不具合の調査・回帰防止。ハーネスはアプリと同じ
 * commonmark + gfm（= prosemirror-tables の tableEditing / columnResizing を含む）を
 * 使うので、ここで CellSelection が作れて保持されることを検証する。
 */
import './jsdomSetup';
import * as assert from 'assert';
import { CellSelection } from '@milkdown/prose/tables';

import { createPreviewEditor, type PreviewEditorHandle } from './milkdownHarness';

const TABLE_MD = [
    '| A | B |',
    '| --- | --- |',
    '| 1 | 2 |',
    ''
].join('\n');

/** doc 内の全セル（table_cell / table_header）の「直前位置」を順に返す。 */
function cellPositions(h: PreviewEditorHandle): number[] {
    const positions: number[] = [];
    h.view.state.doc.descendants((node, pos) => {
        if (node.type.name === 'table_cell' || node.type.name === 'table_header') {
            positions.push(pos);
        }
        return true;
    });
    return positions;
}

describe('webview統合: テーブルのセル選択（CellSelection）', () => {
    let h: PreviewEditorHandle;
    afterEach(() => h?.destroy());

    it('gfm によりテーブルが table_cell/table_header としてパースされる', async () => {
        h = await createPreviewEditor(TABLE_MD);
        const cells = cellPositions(h);
        assert.ok(cells.length >= 4, `セルが4つ未満: ${cells.length}`);
    });

    it('同じ行の2セルにまたがる CellSelection を作れる', async () => {
        h = await createPreviewEditor(TABLE_MD);
        const cells = cellPositions(h);
        // 先頭行（ヘッダ）の A セルと B セル
        const sel = CellSelection.create(h.view.state.doc, cells[0], cells[1]);
        h.view.dispatch(h.view.state.tr.setSelection(sel));
        const cur = h.view.state.selection;
        assert.ok(cur instanceof CellSelection, 'CellSelection になっていない');
        // 選択セル数を数える
        let count = 0;
        if (cur instanceof CellSelection) {
            cur.forEachCell(() => { count++; });
        }
        assert.strictEqual(count, 2, `2セル選択のはずが ${count}`);
    });

    it('列全体（colSelection）を作れる', async () => {
        h = await createPreviewEditor(TABLE_MD);
        const cells = cellPositions(h);
        const $anchor = h.view.state.doc.resolve(cells[0]);
        const sel = CellSelection.colSelection($anchor);
        h.view.dispatch(h.view.state.tr.setSelection(sel));
        const cur = h.view.state.selection;
        assert.ok(cur instanceof CellSelection && cur.isColSelection(), '列選択になっていない');
    });

    it('行全体（rowSelection）を作れる', async () => {
        h = await createPreviewEditor(TABLE_MD);
        const cells = cellPositions(h);
        const $anchor = h.view.state.doc.resolve(cells[0]);
        const sel = CellSelection.rowSelection($anchor);
        h.view.dispatch(h.view.state.tr.setSelection(sel));
        const cur = h.view.state.selection;
        assert.ok(cur instanceof CellSelection && cur.isRowSelection(), '行選択になっていない');
    });

    it('セル選択は、無関係なメタ更新（プラグインの再描画相当）の後も保持される', async () => {
        h = await createPreviewEditor(TABLE_MD);
        const cells = cellPositions(h);
        h.view.dispatch(h.view.state.tr.setSelection(CellSelection.create(h.view.state.doc, cells[0], cells[1])));
        // ドキュメントを変えない meta だけのトランザクション（focusSyntax/diff 等の更新を模す）
        h.view.dispatch(h.view.state.tr.setMeta('noop', true));
        assert.ok(h.view.state.selection instanceof CellSelection, 'メタ更新後に CellSelection が失われた');
    });
});
