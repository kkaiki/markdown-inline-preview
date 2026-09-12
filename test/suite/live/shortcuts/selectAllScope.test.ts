/**
 * 段階的な全選択（⌘A を押すたびに範囲が広がる）の純関数テスト。
 *
 * ユーザー指示（2026-08-05）:
 *   「表のセルの中で command a で、そのセルを全部。もう一度でその行、
 *    もう一度で表全部、もう一度で全てのファイルの内容」
 *   「``` も、同じようにその中をコピーするように」
 *
 * 直前の選択範囲を見て「今どの段階か」を判定し、次の段階の範囲を返す。
 */
import * as assert from 'assert';
import { nextSelectAllRange } from '../../../../src/live/shared/selectAllScope';

describe('Live モード: 段階的な全選択（コードフェンス）', () => {
    //            0         1         2
    //            0123456789012345678901234
    const doc = 'あ\n\n```js\nconst a = 1;\nconsole.log(a);\n```\n\nい\n';
    const bodyFrom = doc.indexOf('const');
    const bodyTo = doc.indexOf('\n```\n\nい');
    const blockFrom = doc.indexOf('```js');
    const blockTo = doc.indexOf('```\n\nい') + 3;

    it('1回目はフェンスの中身だけを選ぶ', () => {
        const r = nextSelectAllRange(doc, { from: bodyFrom + 3, to: bodyFrom + 3 });
        assert.deepStrictEqual(r, { from: bodyFrom, to: bodyTo });
    });

    it('2回目はフェンス行を含むブロック全体', () => {
        const r = nextSelectAllRange(doc, { from: bodyFrom, to: bodyTo });
        assert.deepStrictEqual(r, { from: blockFrom, to: blockTo });
    });

    it('3回目は文書全体', () => {
        const r = nextSelectAllRange(doc, { from: blockFrom, to: blockTo });
        assert.deepStrictEqual(r, { from: 0, to: doc.length });
    });

    it('文書全体まで来たらそれ以上広がらない', () => {
        const r = nextSelectAllRange(doc, { from: 0, to: doc.length });
        assert.deepStrictEqual(r, { from: 0, to: doc.length });
    });

    it('本文が無いフェンスは1回目でブロック全体（中が存在しないため）', () => {
        const empty = '前\n\n```\n```\n\n後\n';
        const from = empty.indexOf('```');
        const to = from + '```\n```'.length;
        assert.deepStrictEqual(nextSelectAllRange(empty, { from: from + 1, to: from + 1 }), { from, to });
    });

    it('前に閉じていないフェンスがあっても、正しいブロックを選ぶ', () => {
        // CommonMark: info string を持つ行は閉じフェンスにならないので、
        // 1本目は最後の ``` で閉じる。その中で ⌘A したらその本文が選ばれる。
        const d = '```\nあ\n\n```js\nx\n```\n';
        const r = nextSelectAllRange(d, { from: d.indexOf('x'), to: d.indexOf('x') });
        assert.strictEqual(d.slice(r.from, r.to), 'あ\n\n```js\nx');
    });

    it('4連バッククォートの中の3連は閉じフェンスにしない', () => {
        const d = '````\n```\nx\n```\n````\n';
        const r = nextSelectAllRange(d, { from: d.indexOf('x'), to: d.indexOf('x') });
        assert.strictEqual(d.slice(r.from, r.to), '```\nx\n```');
    });

    it('コードブロックの外では最初から文書全体', () => {
        const r = nextSelectAllRange(doc, { from: 0, to: 0 });
        assert.deepStrictEqual(r, { from: 0, to: doc.length });
    });

    it('フェンス行の上でも中身から始まる', () => {
        const r = nextSelectAllRange(doc, { from: blockFrom + 1, to: blockFrom + 1 });
        assert.deepStrictEqual(r, { from: bodyFrom, to: bodyTo });
    });
});

describe('Live モード: 段階的な全選択（表）', () => {
    const doc = '前\n\n| A | B |\n| --- | --- |\n| あい | うえ |\n| 3 | 4 |\n\n後\n';
    const tableFrom = doc.indexOf('| A');
    const lastRow = '| 3 | 4 |';
    const tableTo = doc.indexOf(lastRow) + lastRow.length;
    const rowText = '| あい | うえ |';
    const rowFrom = doc.indexOf(rowText);
    const rowTo = rowFrom + rowText.length;
    const cellFrom = doc.indexOf('あい');
    const cellTo = cellFrom + 'あい'.length;

    it('1回目はカーソルのあるセルだけ', () => {
        const r = nextSelectAllRange(doc, { from: cellFrom + 1, to: cellFrom + 1 });
        assert.deepStrictEqual(r, { from: cellFrom, to: cellTo });
    });

    it('2回目はカーソルのある行', () => {
        const r = nextSelectAllRange(doc, { from: cellFrom, to: cellTo });
        assert.deepStrictEqual(r, { from: rowFrom, to: rowTo });
    });

    it('3回目は表全体', () => {
        const r = nextSelectAllRange(doc, { from: rowFrom, to: rowTo });
        assert.deepStrictEqual(r, { from: tableFrom, to: tableTo });
    });

    it('4回目は文書全体', () => {
        const r = nextSelectAllRange(doc, { from: tableFrom, to: tableTo });
        assert.deepStrictEqual(r, { from: 0, to: doc.length });
    });

    it('セル内の空白の上でもそのセルが選ばれる', () => {
        // "| あい | うえ |" の "うえ" の直前の空白
        const at = doc.indexOf('うえ') - 1;
        const r = nextSelectAllRange(doc, { from: at, to: at });
        assert.strictEqual(doc.slice(r.from, r.to), 'うえ');
    });

    it('ヘッダ行でもセルから始まる', () => {
        const at = doc.indexOf('| A') + 2;
        const r = nextSelectAllRange(doc, { from: at, to: at });
        assert.strictEqual(doc.slice(r.from, r.to), 'A');
    });

    it('区切り行の上ではセルを飛ばして行から始まる', () => {
        const delim = '| --- | --- |';
        const at = doc.indexOf(delim) + 3;
        const r = nextSelectAllRange(doc, { from: at, to: at });
        assert.deepStrictEqual(r, { from: doc.indexOf(delim), to: doc.indexOf(delim) + delim.length });
    });

    it('空セルの上では（選ぶものが無いので）行から始まる', () => {
        const d = '| A | B |\n| --- | --- |\n|  | 2 |\n';
        const rowStart = d.indexOf('|  | 2 |');
        const at = rowStart + 2;
        const r = nextSelectAllRange(d, { from: at, to: at });
        assert.deepStrictEqual(r, { from: rowStart, to: rowStart + '|  | 2 |'.length });
    });

    it('セルが1つだけの行でも段階は セル → 行 → 表 と進む', () => {
        const d = '| A |\n| --- |\n| x |\n';
        const cell = d.lastIndexOf('x');
        const rowFrom1 = d.lastIndexOf('| x |');
        const rowTo1 = rowFrom1 + '| x |'.length;
        assert.deepStrictEqual(nextSelectAllRange(d, { from: cell, to: cell }), { from: cell, to: cell + 1 });
        assert.deepStrictEqual(nextSelectAllRange(d, { from: cell, to: cell + 1 }), {
            from: rowFrom1,
            to: rowTo1
        });
        assert.deepStrictEqual(nextSelectAllRange(d, { from: rowFrom1, to: rowTo1 }), {
            from: 0,
            to: rowTo1
        });
    });
});
