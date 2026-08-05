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
    const doc = '前\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |\n\n後\n';
    const tableFrom = doc.indexOf('| A');
    const lastRow = '| 3 | 4 |';
    const tableTo = doc.indexOf(lastRow) + lastRow.length;
    const rowFrom = doc.indexOf('| 1 | 2 |');
    const rowTo = rowFrom + '| 1 | 2 |'.length;

    it('1回目はカーソルのある行だけ', () => {
        const r = nextSelectAllRange(doc, { from: rowFrom + 3, to: rowFrom + 3 });
        assert.deepStrictEqual(r, { from: rowFrom, to: rowTo });
    });

    it('2回目は表全体', () => {
        const r = nextSelectAllRange(doc, { from: rowFrom, to: rowTo });
        assert.deepStrictEqual(r, { from: tableFrom, to: tableTo });
    });

    it('3回目は文書全体', () => {
        const r = nextSelectAllRange(doc, { from: tableFrom, to: tableTo });
        assert.deepStrictEqual(r, { from: 0, to: doc.length });
    });
});
