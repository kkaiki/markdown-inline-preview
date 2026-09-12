/**
 * 表の列幅つまみ（ドラッグでの列幅調整）の計算（純関数）。
 *
 * ユーザー指示（2026-09-12）:「表について、一時的にでいいので開いている間
 * 列の幅を調整できるようにつまみを選べるようにしてほしい」。
 * 幅は Markdown には書かない（＝一時的）。ここでは「ドラッグ量から次の幅を出す」
 * 部分だけを純関数として固定する。
 */
import * as assert from 'assert';
import {
    MIN_COLUMN_WIDTH,
    resizeColumn,
    normalizeWidths
} from '../../../../src/live/shared/tableColumnWidths';

describe('Live モード: 表の列幅', () => {
    it('ドラッグ量の分だけその列の幅が変わる', () => {
        assert.deepStrictEqual(resizeColumn([100, 200], 0, 40), [140, 200]);
    });

    it('左へドラッグすると狭くなる', () => {
        assert.deepStrictEqual(resizeColumn([100, 200], 1, -50), [100, 150]);
    });

    it('他の列の幅は変えない（表全体が広がる/狭まる）', () => {
        assert.deepStrictEqual(resizeColumn([100, 120, 140], 1, 30), [100, 150, 140]);
    });

    it('最小幅より狭くはならない', () => {
        const next = resizeColumn([100, 100], 0, -500);
        assert.strictEqual(next[0], MIN_COLUMN_WIDTH);
        assert.strictEqual(next[1], 100);
    });

    it('範囲外の列を指定しても壊れない', () => {
        assert.deepStrictEqual(resizeColumn([100, 100], 5, 20), [100, 100]);
        assert.deepStrictEqual(resizeColumn([], 0, 20), []);
    });

    it('小数は整数に丸める（DOM の px 指定で揺れないように）', () => {
        assert.deepStrictEqual(resizeColumn([100.4, 100], 0, 10.3), [111, 100]);
    });

    it('列数が増えたら実測値で埋め、減ったら切り詰める', () => {
        // 記憶している幅（2列）に対して、表が3列になったとき
        assert.deepStrictEqual(normalizeWidths([120, 130], [80, 90, 100]), [120, 130, 100]);
        assert.deepStrictEqual(normalizeWidths([120, 130, 140], [80, 90]), [120, 130]);
    });

    it('記憶が無ければ実測値をそのまま使う', () => {
        assert.deepStrictEqual(normalizeWidths(undefined, [80, 90]), [80, 90]);
    });
});
