/**
 * 表・Mermaid・コールアウト・数式（ブロックの部品）の**高さの推定**（`src/live/shared/blockHeightEstimate.ts`）。
 *
 * CodeMirror は画面の外の行の高さを推定して描く。ブロックの部品は、描き終わるまで本当の高さが分からず、
 * 推定を渡さないと「1 行分」とみなされる。表が多い文書では、画面に入るたびに全体の高さが大きく変わり、
 * スクロール位置が飛ぶ（2026-10-05 の報告。表 8 つ・図 2 つの文書で実測: 表 1 行あたり 60〜170px、図 約 520〜550px）。
 * ここでは「実測に近い桁になる」ことと「中身が増えれば高くなる」ことを固定する。
 */
import * as assert from 'assert';
import {
    estimateTableHeight,
    estimateCalloutHeight,
    MERMAID_ESTIMATE,
    MATH_BLOCK_ESTIMATE,
    LINE_HEIGHT
} from '../../../../src/live/shared/blockHeightEstimate';

const cell = (n: number) => 'あ'.repeat(n);

describe('ブロックの部品の高さの推定', () => {
    describe('表', () => {
        it('空の表でも、少なくとも 1 行分の高さがある', () => {
            assert.ok(estimateTableHeight([]) >= LINE_HEIGHT);
        });

        it('行が増えれば高くなる', () => {
            const row = [cell(10), cell(10), cell(10)];
            assert.ok(estimateTableHeight([row, row, row, row]) > estimateTableHeight([row, row]));
        });

        it('セルの文字が長ければ（折り返しで）高くなる', () => {
            const short = [[cell(5), cell(5), cell(5)]];
            const long = [[cell(120), cell(120), cell(120)]];
            assert.ok(estimateTableHeight(long) > estimateTableHeight(short) * 2);
        });

        it('列が多いほど、1 列ごとの余白の分だけ使える幅が減り、同じ文字数でも低くはならない', () => {
            const wide = [[cell(60), cell(60)]];
            const narrow = [[cell(30), cell(30), cell(30), cell(30)]]; // 文字数の合計は同じ
            assert.ok(estimateTableHeight(narrow) >= estimateTableHeight(wide));
        });

        it('セルの中の HTML タグ（色つきラベルの <span style>）は、表示されないので幅に数えない', () => {
            const plain = [['一部待ち', cell(20)]];
            const tagged = [[
                '<span style="background:#fff3bf;color:#e67700;padding:2px 8px;border-radius:10px;font-weight:bold;white-space:nowrap">一部待ち</span>',
                cell(20)
            ]];
            assert.strictEqual(estimateTableHeight(tagged), estimateTableHeight(plain));
        });

        it('Markdown の記号やリンクの URL も、表示されないので幅に数えない', () => {
            const plain = [['リンクの文字', '強調']];
            const marked = [['[リンクの文字](https://example.com/a/very/long/path/that/is/not/shown)', '**強調**']];
            assert.strictEqual(estimateTableHeight(marked), estimateTableHeight(plain));
        });

        it('実測の桁に合う: 3 列・6 行・長いセルの表は 300〜600px（実測 399〜445px）', () => {
            const row = [cell(8), cell(40), cell(30)];
            const h = estimateTableHeight([row, row, row, row, row, row]);
            assert.ok(h >= 300 && h <= 600, `${h}px`);
        });

        it('実測の桁に合う: 7 列・11 行・長いセルの表は 1300〜2300px（実測 1855px）', () => {
            // 1 行あたり約 250 文字（実際の表: 状態・チケット名・長い対応方法・待つもの）
            const row = [cell(2), cell(6), cell(40), cell(2), cell(8), cell(120), cell(70)];
            const h = estimateTableHeight(Array.from({ length: 11 }, () => row));
            assert.ok(h >= 1300 && h <= 2300, `${h}px`);
        });
    });

    it('Mermaid の図は、実測（約 520〜550px）に近い推定を持つ', () => {
        assert.ok(MERMAID_ESTIMATE >= 400 && MERMAID_ESTIMATE <= 600, `${MERMAID_ESTIMATE}`);
    });

    it('ブロックの数式は、1 行より高い推定を持つ', () => {
        assert.ok(MATH_BLOCK_ESTIMATE > LINE_HEIGHT);
    });

    describe('コールアウト', () => {
        it('行が増えれば高くなる', () => {
            assert.ok(estimateCalloutHeight('> [!note] 見出し\n> 1\n> 2\n> 3') > estimateCalloutHeight('> [!note] 見出し\n> 1'));
        });

        it('見出しだけでも、1 行より高い（枠の余白がある）', () => {
            assert.ok(estimateCalloutHeight('> [!note] 見出し') > LINE_HEIGHT);
        });
    });
});
