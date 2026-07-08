import assert from 'assert';
import { findEnclosingBracketContent } from '../../../src/shared/markdown/bracketSelection';

describe('bracketSelection: findEnclosingBracketContent', function () {
    it('カーソルが丸括弧の中にあれば中身の範囲を返す', function () {
        const text = '説明(補足)です';
        const cursor = text.indexOf('補足') + 1;
        const range = findEnclosingBracketContent(text, cursor);
        assert.ok(range);
        assert.strictEqual(text.slice(range.start, range.end), '補足');
    });

    it('カーソルが角括弧の中にあれば中身の範囲を返す', function () {
        const text = '参照[note]終わり';
        const cursor = text.indexOf('note') + 1;
        const range = findEnclosingBracketContent(text, cursor);
        assert.ok(range);
        assert.strictEqual(text.slice(range.start, range.end), 'note');
    });

    it('括弧の外（開き括弧より前）にカーソルがあれば null を返す', function () {
        const text = 'plain(text)here';
        const range = findEnclosingBracketContent(text, 0);
        assert.strictEqual(range, null);
    });

    it('括弧が全く無い行では null を返す', function () {
        const range = findEnclosingBracketContent('no brackets at all', 5);
        assert.strictEqual(range, null);
    });

    it('ネストした括弧では最も内側の範囲を返す', function () {
        const text = 'outer(mid[inner]end)tail';
        const cursor = text.indexOf('inner') + 2;
        const range = findEnclosingBracketContent(text, cursor);
        assert.ok(range);
        assert.strictEqual(text.slice(range.start, range.end), 'inner');
    });

    it('ネストした括弧の外側部分にカーソルがあれば外側の範囲を返す', function () {
        const text = 'outer(mid[inner]end)tail';
        const cursor = text.indexOf('mid') + 1;
        const range = findEnclosingBracketContent(text, cursor);
        assert.ok(range);
        assert.strictEqual(text.slice(range.start, range.end), 'mid[inner]end');
    });

    it('複数の独立した括弧では現在位置を含む方だけを返す', function () {
        const text = '(first) plain (second)';
        const cursorInSecond = text.indexOf('second') + 1;
        const range = findEnclosingBracketContent(text, cursorInSecond);
        assert.ok(range);
        assert.strictEqual(text.slice(range.start, range.end), 'second');
    });

    it('開き括弧の直後にカーソルがあれば中身（空でも）を選択対象にする', function () {
        const text = 'note()end';
        const cursor = text.indexOf('()') + 1;
        const range = findEnclosingBracketContent(text, cursor);
        assert.ok(range);
        assert.strictEqual(range.start, range.end);
    });

    it('閉じ括弧の直前（中身の末尾と同じ位置）にカーソルがあれば中身に含める', function () {
        const text = 'note(body)end';
        const cursor = text.indexOf(')');
        const range = findEnclosingBracketContent(text, cursor);
        assert.ok(range);
        assert.strictEqual(text.slice(range.start, range.end), 'body');
    });

    it('開き括弧の直前にカーソルがあれば括弧の外とみなす', function () {
        const text = 'note(body)end';
        const cursor = text.indexOf('(');
        const range = findEnclosingBracketContent(text, cursor);
        assert.strictEqual(range, null);
    });

    it('対応しない閉じ括弧は無視して外側の対応する開き括弧とペアにする', function () {
        const text = 'a) (b)';
        const cursor = text.indexOf('b');
        const range = findEnclosingBracketContent(text, cursor);
        assert.ok(range);
        assert.strictEqual(text.slice(range.start, range.end), 'b');
    });

    it('種類の異なる括弧はまたがず、対応する種類同士だけをペアにする', function () {
        const text = '(a]b)';
        const cursor = text.indexOf('a');
        const range = findEnclosingBracketContent(text, cursor);
        assert.ok(range);
        assert.strictEqual(text.slice(range.start, range.end), 'a]b');
    });
});
