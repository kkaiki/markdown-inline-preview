/**
 * 表のセル範囲解析（純関数）のテスト。
 *
 * Phase 4b では表を畳んだまま**セルの中で直接編集**できるようにする。そのためには
 * 「画面上のこのセルは、ソースのどこからどこまでか」を1文字もズラさずに知る必要がある。
 * ここがズレると、入力した文字が隣のセルへ入る・パイプ記法が壊れる、という形で
 * ドキュメントが破壊されるため、純関数として厳密に固定する。
 */
import * as assert from 'assert';
import { parseTableCells } from '../../../../src/live/shared/tableCells';

describe('Live モード: 表のセル範囲解析', () => {
    const SRC = '| 列A | 列B |\n| --- | --- |\n| a1 | b1 |';

    it('区切り行を除いた行を返す', () => {
        const rows = parseTableCells(SRC, 0);
        assert.strictEqual(rows.length, 2, 'ヘッダ行と本文行の2行になるべき');
        assert.strictEqual(rows[0].isHeader, true);
        assert.strictEqual(rows[1].isHeader, false);
    });

    it('各セルのテキストを返す', () => {
        const rows = parseTableCells(SRC, 0);
        assert.deepStrictEqual(rows[0].cells.map((c) => c.text), ['列A', '列B']);
        assert.deepStrictEqual(rows[1].cells.map((c) => c.text), ['a1', 'b1']);
    });

    it('セルの範囲がソースの実オフセットと一致する', () => {
        const rows = parseTableCells(SRC, 0);
        for (const row of rows) {
            for (const cell of row.cells) {
                assert.strictEqual(SRC.slice(cell.from, cell.to), cell.text, `範囲がズレている: ${cell.text}`);
            }
        }
    });

    it('baseOffset を足した絶対オフセットを返す', () => {
        const doc = `前の段落\n\n${SRC}\n`;
        const base = doc.indexOf('|');
        const rows = parseTableCells(SRC, base);
        assert.strictEqual(doc.slice(rows[0].cells[0].from, rows[0].cells[0].to), '列A');
        assert.strictEqual(doc.slice(rows[1].cells[1].from, rows[1].cells[1].to), 'b1');
    });

    it('空のセルは幅0の範囲になる（挿入位置として使える）', () => {
        const src = '| a |  |\n| --- | --- |';
        const rows = parseTableCells(src, 0);
        assert.strictEqual(rows[0].cells[1].text, '');
        assert.strictEqual(rows[0].cells[1].from, rows[0].cells[1].to);
        assert.ok(rows[0].cells[1].from > 0);
    });

    it('列数が揃っていない行も落ちずに解析できる', () => {
        const src = '| a | b |\n| --- | --- |\n| 1 |';
        const rows = parseTableCells(src, 0);
        assert.strictEqual(rows[1].cells.length, 1);
        assert.strictEqual(rows[1].cells[0].text, '1');
    });

    it('区切り行から列の配置を読む', () => {
        const rows = parseTableCells('| a | b | c |\n|:---|---:|:--:|', 0);
        assert.deepStrictEqual(rows[0].cells.map((c) => c.align), ['left', 'right', 'center']);
    });

    it('配置指定が無ければ align は空', () => {
        const rows = parseTableCells('| a |\n| --- |', 0);
        assert.strictEqual(rows[0].cells[0].align, '');
    });

    it('セル内のパイプのエスケープ（\\|）で分割しない', () => {
        const rows = parseTableCells('| a \\| b | c |\n| --- | --- |', 0);
        assert.deepStrictEqual(rows[0].cells.map((c) => c.text), ['a \\| b', 'c']);
    });
});
