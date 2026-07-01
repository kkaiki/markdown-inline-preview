/**
 * lineRangeAt（コードブロック内トリプルクリックの「行範囲」算出）のユニットテスト。
 */
import * as assert from 'assert';
import { lineRangeAt } from '../../src/shared/preview/codeBlockLines';

describe('lineRangeAt', () => {
    const text = 'aaa\nbbbb\ncc'; // 3行: "aaa"(0-3) "\n"(3) "bbbb"(4-8) "\n"(8) "cc"(9-11)

    it('1行目の途中 → その行だけ', () => {
        assert.deepStrictEqual(lineRangeAt(text, 1), { start: 0, end: 3 });
    });
    it('1行目の行頭', () => {
        assert.deepStrictEqual(lineRangeAt(text, 0), { start: 0, end: 3 });
    });
    it('2行目の途中 → 2行目だけ（前後の \\n は含めない）', () => {
        assert.deepStrictEqual(lineRangeAt(text, 6), { start: 4, end: 8 });
    });
    it('2行目の行頭（直前が \\n）', () => {
        assert.deepStrictEqual(lineRangeAt(text, 4), { start: 4, end: 8 });
    });
    it('最終行（末尾に \\n なし）', () => {
        assert.deepStrictEqual(lineRangeAt(text, 10), { start: 9, end: 11 });
    });
    it('改行位置（\\n そのもの）は手前の行に属する', () => {
        // offset=3 は "aaa" と "\n" の境界。lastIndexOf('\n', 2) = -1 → start 0、indexOf('\n',3)=3 → end 3
        assert.deepStrictEqual(lineRangeAt(text, 3), { start: 0, end: 3 });
    });
    it('改行のみの空行', () => {
        const t = 'x\n\ny';
        assert.deepStrictEqual(lineRangeAt(t, 2), { start: 2, end: 2 });
    });
    it('1行だけのテキストは全体', () => {
        assert.deepStrictEqual(lineRangeAt('hello', 3), { start: 0, end: 5 });
    });
    it('範囲外オフセットはクランプ', () => {
        assert.deepStrictEqual(lineRangeAt('hello', 999), { start: 0, end: 5 });
        assert.deepStrictEqual(lineRangeAt('hello', -5), { start: 0, end: 5 });
    });
});
