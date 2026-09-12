/**
 * 単語の途中にあるアンダースコア（`core_api_app` のような snake_case）が
 * 斜体・太字として解釈されないことを検証する（Live モードの記法スキャナ）。
 *
 * CommonMark では `_` は「単語の途中」では強調を開始・終了できない（`*` とは違う）。
 * この規則が無いと識別子・ファイル名・環境変数名を書いた行が勝手に斜体になり、
 * しかも記号が隠れて元の文字列が読めなくなる（ユーザー報告 2026-09-12）。
 *
 * 純関数（scanSyntaxRanges）レベルで担保する。表セル内の見た目も同じ関数を
 * 経由する（inlineSegments）ので、ここを直せば表の中も直る。
 */
import * as assert from 'assert';
import { scanSyntaxRanges, type SyntaxRange } from '../../../../src/live/shared/syntaxRanges';
import { inlineSegments } from '../../../../src/live/shared/inlineSegments';

function kinds(doc: string): string[] {
    return scanSyntaxRanges(doc)
        .filter((r: SyntaxRange) => r.kind === 'em' || r.kind === 'strong' || r.kind === 'strongEm')
        .map((r) => r.kind);
}

function marked(doc: string, kind: string): string[] {
    return scanSyntaxRanges(doc)
        .filter((r) => r.kind === kind)
        .map((r) => doc.slice(r.markFrom, r.markTo));
}

describe('Live モード: 単語途中のアンダースコア', () => {
    it('snake_case の識別子は斜体にならない', () => {
        assert.deepStrictEqual(kinds('core_api_app を使う\n'), []);
    });

    it('単語途中の "__" は太字にならない', () => {
        assert.deepStrictEqual(kinds('core__api__app を使う\n'), []);
    });

    it('アンダースコアを多く含むファイル名の行でも強調は検出されない', () => {
        assert.deepStrictEqual(kinds('src/foo_bar.ts と test_helper_util.ts と MY_ENV_VAR\n'), []);
    });

    it('表のセル（ウィジェット描画）でも snake_case は素のまま出る', () => {
        // 表はブロックウィジェットなので decoration ではなく inlineSegments が見た目を作る。
        const segs = inlineSegments('core_api_app');
        assert.deepStrictEqual(segs, [{ text: 'core_api_app', classes: '' }]);
    });

    it('前後が空白の "_斜体_" はこれまでどおり斜体になる', () => {
        assert.deepStrictEqual(marked('これは _斜体_ です\n', 'em'), ['斜体']);
    });

    it('前後が空白の "__太字__" はこれまでどおり太字になる', () => {
        assert.deepStrictEqual(marked('これは __太字__ です\n', 'strong'), ['太字']);
    });

    it('"_foo_bar_" は途中の "_" では閉じず全体が斜体になる', () => {
        assert.deepStrictEqual(marked('_foo_bar_\n', 'em'), ['foo_bar']);
    });

    it('"*" は単語の途中でも斜体のまま（CommonMark どおり）', () => {
        assert.deepStrictEqual(marked('core*api*app\n', 'em'), ['api']);
    });
});
