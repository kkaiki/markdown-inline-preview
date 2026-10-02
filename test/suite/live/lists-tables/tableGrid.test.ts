/**
 * 表のキーボード操作・範囲編集・貼り付けの純関数（src/live/shared/tableGrid.ts）。
 *
 * 何を: セル間の移動先、Shift / ⌘Shift + 矢印での範囲の伸ばし方、範囲を空にする差分、
 *       クリップボードの文字列 → セルの格子、格子を表へ流し込んだ新しいソース。
 * なぜ: 2026-10-03 の監査（docs/testing/audits/2026-10-03-table-keyboard-audit.md）で見つかった
 *       表のキーボード・範囲編集・貼り付けの不具合を直すため。ソースの書き換え規則は 1 文字ずれると
 *       表が壊れるので、DOM から切り離して網羅的に確かめる。
 * どの層で: 純関数なので jsdom 不要の単体テスト（実キー入力は test/browser 側）。
 */
import * as assert from 'assert';
import {
    clearCellsChanges,
    edgeCell,
    extendFocus,
    parseClipboardGrid,
    pasteGrid,
    sanitizeCellText,
    shapeOf,
    verticalTarget
} from '../../../../src/live/shared/tableGrid';

const T = '| h1 | h2 | h3 |\n| --- | --- | --- |\n| a1 | a2 | a3 |\n| b1 | b2 | b3 |';

function apply(source: string, changes: { from: number; to: number; insert: string }[]): string {
    let out = source;
    for (const c of [...changes].sort((x, y) => y.from - x.from)) {
        out = out.slice(0, c.from) + c.insert + out.slice(c.to);
    }
    return out;
}

describe('表の格子: 形と移動先', () => {
    it('shapeOf は行ごとのセル数を返す（区切り行は数えない）', () => {
        assert.deepStrictEqual(shapeOf(T), [3, 3, 3]);
        assert.deepStrictEqual(shapeOf('| a | b |\n| - | - |\n| c |'), [2, 1]);
    });

    it('↓ は同じ列の下のセル、最終行では表の下（below）', () => {
        const s = shapeOf(T);
        assert.deepStrictEqual(verticalTarget(s, { row: 1, col: 1 }, 'down'), { row: 2, col: 1 });
        assert.strictEqual(verticalTarget(s, { row: 2, col: 1 }, 'down'), 'below');
    });

    it('↑ は同じ列の上のセル、ヘッダでは表の上（above）', () => {
        const s = shapeOf(T);
        assert.deepStrictEqual(verticalTarget(s, { row: 1, col: 2 }, 'up'), { row: 0, col: 2 });
        assert.strictEqual(verticalTarget(s, { row: 0, col: 2 }, 'up'), 'above');
    });

    it('列数が足りない行へ移るときは、その行の最後のセルに寄せる', () => {
        const s = shapeOf('| a | b | c |\n| - | - | - |\n| d |');
        assert.deepStrictEqual(verticalTarget(s, { row: 0, col: 2 }, 'down'), { row: 1, col: 0 });
    });

    it('edgeCell は同じ列の先頭・最後、同じ行の最初・最後を返す', () => {
        const s = shapeOf(T);
        assert.deepStrictEqual(edgeCell(s, { row: 1, col: 1 }, 'up'), { row: 0, col: 1 });
        assert.deepStrictEqual(edgeCell(s, { row: 1, col: 1 }, 'down'), { row: 2, col: 1 });
        assert.deepStrictEqual(edgeCell(s, { row: 1, col: 1 }, 'left'), { row: 1, col: 0 });
        assert.deepStrictEqual(edgeCell(s, { row: 1, col: 1 }, 'right'), { row: 1, col: 2 });
    });

    it('extendFocus は1セルずつ伸ばし、表の外へははみ出さない', () => {
        const s = shapeOf(T);
        assert.deepStrictEqual(extendFocus(s, { row: 1, col: 1 }, 'down', false), { row: 2, col: 1 });
        assert.deepStrictEqual(extendFocus(s, { row: 2, col: 1 }, 'down', false), { row: 2, col: 1 });
        assert.deepStrictEqual(extendFocus(s, { row: 1, col: 0 }, 'left', false), { row: 1, col: 0 });
        assert.deepStrictEqual(extendFocus(s, { row: 1, col: 1 }, 'right', false), { row: 1, col: 2 });
    });

    it('extendFocus の toEdge は端まで一気に伸ばす（⌘Shift+矢印）', () => {
        const s = shapeOf(T);
        assert.deepStrictEqual(extendFocus(s, { row: 1, col: 1 }, 'down', true), { row: 2, col: 1 });
        assert.deepStrictEqual(extendFocus(s, { row: 2, col: 1 }, 'up', true), { row: 0, col: 1 });
        assert.deepStrictEqual(extendFocus(s, { row: 1, col: 1 }, 'right', true), { row: 1, col: 2 });
    });
});

describe('表の格子: 範囲を空にする', () => {
    it('選んだセルの中身だけを消し、パイプと他のセルは残す', () => {
        const changes = clearCellsChanges(T, 0, [
            { row: 1, col: 0 },
            { row: 1, col: 1 },
            { row: 2, col: 0 },
            { row: 2, col: 1 }
        ]);
        assert.strictEqual(
            apply(T, changes),
            '| h1 | h2 | h3 |\n| --- | --- | --- |\n|  |  | a3 |\n|  |  | b3 |'
        );
    });

    it('base オフセットを足した絶対位置で返す', () => {
        const [c] = clearCellsChanges(T, 100, [{ row: 0, col: 0 }]);
        assert.deepStrictEqual(c, { from: 102, to: 104, insert: '' });
    });

    it('存在しないセルは無視する', () => {
        assert.deepStrictEqual(clearCellsChanges(T, 0, [{ row: 9, col: 9 }]), []);
    });
});

describe('表の格子: 貼り付ける文字列の整形', () => {
    it('改行は空白に、パイプはエスケープする', () => {
        assert.strictEqual(sanitizeCellText('x\ny'), 'x y');
        assert.strictEqual(sanitizeCellText('x\r\ny'), 'x y');
        assert.strictEqual(sanitizeCellText('x|y'), 'x\\|y');
        assert.strictEqual(sanitizeCellText('a||b'), 'a\\|\\|b');
    });

    it('既にエスケープ済みのパイプは二重にエスケープしない', () => {
        assert.strictEqual(sanitizeCellText('x\\|y'), 'x\\|y');
    });

    it('タブ区切り・改行区切りの文字列を格子にする（末尾の改行は行にしない）', () => {
        assert.deepStrictEqual(parseClipboardGrid('P\tQ\nR\tS\n'), [['P', 'Q'], ['R', 'S']]);
        assert.deepStrictEqual(parseClipboardGrid('P\tQ\r\nR\tS'), [['P', 'Q'], ['R', 'S']]);
    });

    it('格子の各セルもパイプをエスケープする', () => {
        assert.deepStrictEqual(parseClipboardGrid('a|b\tc'), [['a\\|b', 'c']]);
    });
});

describe('表の格子: 格子を表へ流し込む', () => {
    it('始点のセルから右下へ上書きする', () => {
        assert.strictEqual(
            pasteGrid(T, { row: 1, col: 1 }, [['P', 'Q'], ['R', 'S']]),
            '| h1 | h2 | h3 |\n| --- | --- | --- |\n| a1 | P | Q |\n| b1 | R | S |'
        );
    });

    it('表より下にはみ出す分は行を足す', () => {
        const out = pasteGrid(T, { row: 2, col: 0 }, [['P'], ['R']]);
        const lines = out.split('\n');
        assert.strictEqual(lines.length, 5);
        assert.strictEqual(lines[3], '| P | b2 | b3 |');
        assert.match(lines[4], /^\| R +\| +\| +\|$/);
    });

    it('表より右にはみ出す分は列を足す（区切り行も増える）', () => {
        const out = pasteGrid(T, { row: 1, col: 2 }, [['P', 'Q']]);
        const lines = out.split('\n');
        assert.strictEqual(lines[1].split('|').length - 2, 4, `区切り行が4列でない: ${lines[1]}`);
        assert.match(lines[2], /^\| a1 \| a2 \| P \| Q +\|$/);
        assert.strictEqual(lines[0].split('|').length - 2, 4);
    });

    it('貼り付けてもパースし直すと同じ格子が読める', () => {
        const out = pasteGrid(T, { row: 0, col: 0 }, [['x\\|y', '']]);
        assert.strictEqual(out.split('\n')[0], '| x\\|y |  | h3 |');
    });
});
