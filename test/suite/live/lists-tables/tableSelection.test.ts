/**
 * 表のセル範囲選択（純関数）のテスト。
 *
 * ユーザー報告（2026-08-05）: 「表の複数選択ができない」。
 * セルを個別の contenteditable にしている都合上、ブラウザの選択はセルをまたげない。
 * そこで「アンカーセルとフォーカスセルの矩形」を自前で持つ。ここではその範囲計算と、
 * 選択セルを Markdown へ書き出す処理を固定する。
 */
import * as assert from 'assert';
import { cellsInRect, selectionToMarkdown } from '../../../../src/live/shared/tableSelection';

describe('Live モード: 表のセル範囲', () => {
    it('同じセルを指すと1つだけ', () => {
        assert.deepStrictEqual(cellsInRect({ row: 1, col: 1 }, { row: 1, col: 1 }), [{ row: 1, col: 1 }]);
    });

    it('横方向の範囲', () => {
        assert.deepStrictEqual(cellsInRect({ row: 0, col: 0 }, { row: 0, col: 2 }), [
            { row: 0, col: 0 },
            { row: 0, col: 1 },
            { row: 0, col: 2 }
        ]);
    });

    it('縦方向の範囲', () => {
        assert.deepStrictEqual(cellsInRect({ row: 0, col: 1 }, { row: 2, col: 1 }), [
            { row: 0, col: 1 },
            { row: 1, col: 1 },
            { row: 2, col: 1 }
        ]);
    });

    it('矩形の範囲（行優先の順で返す）', () => {
        assert.deepStrictEqual(cellsInRect({ row: 0, col: 0 }, { row: 1, col: 1 }), [
            { row: 0, col: 0 },
            { row: 0, col: 1 },
            { row: 1, col: 0 },
            { row: 1, col: 1 }
        ]);
    });

    it('逆向きにドラッグしても同じ範囲になる', () => {
        const a = cellsInRect({ row: 2, col: 2 }, { row: 0, col: 0 });
        const b = cellsInRect({ row: 0, col: 0 }, { row: 2, col: 2 });
        assert.deepStrictEqual(a, b);
    });
});

describe('Live モード: 選択セルの書き出し', () => {
    const rows = [
        ['見出しA', '見出しB', '見出しC'],
        ['a1', 'b1', 'c1'],
        ['a2', 'b2', 'c2']
    ];

    it('1セルならその中身だけ', () => {
        assert.strictEqual(selectionToMarkdown(rows, [{ row: 1, col: 1 }]), 'b1');
    });

    it('横の複数セルはタブ区切り', () => {
        const cells = cellsInRect({ row: 1, col: 0 }, { row: 1, col: 2 });
        assert.strictEqual(selectionToMarkdown(rows, cells), 'a1\tb1\tc1');
    });

    it('縦の複数セルは改行区切り', () => {
        const cells = cellsInRect({ row: 0, col: 0 }, { row: 2, col: 0 });
        assert.strictEqual(selectionToMarkdown(rows, cells), '見出しA\na1\na2');
    });

    it('矩形は行ごとに改行、列はタブ', () => {
        const cells = cellsInRect({ row: 1, col: 0 }, { row: 2, col: 1 });
        assert.strictEqual(selectionToMarkdown(rows, cells), 'a1\tb1\na2\tb2');
    });

    it('範囲外のセルは無視する', () => {
        assert.strictEqual(selectionToMarkdown(rows, [{ row: 9, col: 9 }]), '');
    });
});
