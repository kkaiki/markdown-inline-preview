/**
 * 表の行・列編集（純関数）のテスト。
 *
 * ユーザー要望（2026-08-08）:
 *   「表セル上の右クリックメニュー（行/列の選択・上下左右に挿入・行/列削除・表削除）」
 *
 * 右クリックメニューの DOM は `test/browser/live/lists-tables/tableContextMenu.test.ts`
 * が実 Chromium で見る。ここでは**ソース変換そのもの**（どのコマンドで Markdown が
 * どう変わるか）と、**メニュー項目の有効/無効**（ヘッダ行を消せない等）を固定する。
 *
 * 行番号は区切り行を除いた 0 始まり（= ウィジェットの `data-row`）で、行0 はヘッダ。
 */
import * as assert from 'assert';
import {
    applyTableCommand,
    tableDeletionRange,
    tableMenuItems
} from '../../../../src/live/shared/tableEdit';

const TABLE = ['| 列A | 列B |', '| --- | --- |', '| a1 | b1 |'].join('\n');

/** 指定 id の項目が有効か。 */
function enabled(source: string, row: number, col: number, id: string): boolean {
    const item = tableMenuItems(source, { row, col }).find((i) => i.id === id);
    assert.ok(item, `項目 ${id} がメニューに無い`);
    return item.enabled;
}

describe('Live モード: 表の行・列編集（コマンド）', () => {
    describe('行の挿入', () => {
        it('下に行を挿入すると、その行の次に空行が入る', () => {
            assert.strictEqual(
                applyTableCommand(TABLE, { row: 1, col: 0 }, 'insertRowBelow'),
                ['| 列A | 列B |', '| --- | --- |', '| a1 | b1 |', '|     |     |'].join('\n')
            );
        });

        it('ヘッダ行の下に挿入すると、区切り行の次に入る（区切り行は動かない）', () => {
            assert.strictEqual(
                applyTableCommand(TABLE, { row: 0, col: 0 }, 'insertRowBelow'),
                ['| 列A | 列B |', '| --- | --- |', '|     |     |', '| a1 | b1 |'].join('\n')
            );
        });

        it('上に行を挿入すると、その行の手前に空行が入る', () => {
            assert.strictEqual(
                applyTableCommand(TABLE, { row: 1, col: 0 }, 'insertRowAbove'),
                ['| 列A | 列B |', '| --- | --- |', '|     |     |', '| a1 | b1 |'].join('\n')
            );
        });

        it('挿入する空セルの幅は区切り行に揃うので、ソースの縦線が崩れない', () => {
            const wide = ['| 見出しA | B |', '| ------- | - |', '| a1      | b |'].join('\n');
            assert.strictEqual(
                applyTableCommand(wide, { row: 1, col: 0 }, 'insertRowBelow'),
                ['| 見出しA | B |', '| ------- | - |', '| a1      | b |', '|         |   |'].join('\n')
            );
        });

        it('ヘッダ行の上には行を挿入できない（区切り行の位置が壊れるため）', () => {
            assert.strictEqual(enabled(TABLE, 0, 0, 'insertRowAbove'), false);
            assert.strictEqual(applyTableCommand(TABLE, { row: 0, col: 0 }, 'insertRowAbove'), null);
        });
    });

    describe('行の削除', () => {
        it('行を削除するとその行だけが消える', () => {
            const three = [TABLE, '| a2 | b2 |'].join('\n');
            assert.strictEqual(
                applyTableCommand(three, { row: 1, col: 1 }, 'deleteRow'),
                ['| 列A | 列B |', '| --- | --- |', '| a2 | b2 |'].join('\n')
            );
        });

        it('本文が1行だけでも削除でき、ヘッダと区切り行だけの表が残る', () => {
            assert.strictEqual(
                applyTableCommand(TABLE, { row: 1, col: 0 }, 'deleteRow'),
                ['| 列A | 列B |', '| --- | --- |'].join('\n')
            );
        });

        it('パイプ1本だけの行が混じっていても、行番号がズレない', () => {
            // parseTableCells（＝画面の data-row）はパイプ1本の行をセル無しとして飛ばす。
            // ここで数え方が食い違うと、1つ下の行を消してしまう。
            const broken = ['| A | B |', '| --- | --- |', '|', '| a2 | b2 |'].join('\n');
            assert.strictEqual(
                applyTableCommand(broken, { row: 1, col: 0 }, 'deleteRow'),
                ['| A | B |', '| --- | --- |', '|'].join('\n')
            );
        });

        it('ヘッダ行は削除できない（表でなくなるため）', () => {
            assert.strictEqual(enabled(TABLE, 0, 0, 'deleteRow'), false);
            assert.strictEqual(applyTableCommand(TABLE, { row: 0, col: 0 }, 'deleteRow'), null);
        });
    });

    describe('列の挿入', () => {
        it('右に列を挿入すると、全行と区切り行に空セルが増える', () => {
            assert.strictEqual(
                applyTableCommand(TABLE, { row: 1, col: 0 }, 'insertColumnRight'),
                ['| 列A |     | 列B |', '| --- | --- | --- |', '| a1 |     | b1 |'].join('\n')
            );
        });

        it('左に列を挿入すると、その列の手前に空セルが増える', () => {
            assert.strictEqual(
                applyTableCommand(TABLE, { row: 0, col: 0 }, 'insertColumnLeft'),
                ['|     | 列A | 列B |', '| --- | --- | --- |', '|     | a1 | b1 |'].join('\n')
            );
        });

        it('セル数が足りない行では末尾に足す（崩れた表でも壊さない）', () => {
            const ragged = ['| A | B |', '| --- | --- |', '| a1 |'].join('\n');
            assert.strictEqual(
                applyTableCommand(ragged, { row: 0, col: 1 }, 'insertColumnRight'),
                ['| A | B |     |', '| --- | --- | --- |', '| a1 |     |'].join('\n')
            );
        });
    });

    describe('列の削除', () => {
        it('列を削除すると全行からその列が消える', () => {
            assert.strictEqual(
                applyTableCommand(TABLE, { row: 1, col: 1 }, 'deleteColumn'),
                ['| 列A |', '| --- |', '| a1 |'].join('\n')
            );
        });

        it('残る列の配置指定（:--- など）はそのまま保たれる', () => {
            const aligned = ['| A | B |', '| :--- | ---: |', '| a1 | b1 |'].join('\n');
            assert.strictEqual(
                applyTableCommand(aligned, { row: 0, col: 0 }, 'deleteColumn'),
                ['| B |', '| ---: |', '| b1 |'].join('\n')
            );
        });

        it('列が1つだけのときは削除できない', () => {
            const single = ['| A |', '| --- |', '| a1 |'].join('\n');
            assert.strictEqual(enabled(single, 1, 0, 'deleteColumn'), false);
            assert.strictEqual(applyTableCommand(single, { row: 1, col: 0 }, 'deleteColumn'), null);
        });
    });

    describe('表の削除・選択', () => {
        it('表を削除すると空文字になる', () => {
            assert.strictEqual(applyTableCommand(TABLE, { row: 1, col: 0 }, 'deleteTable'), '');
        });

        it('行を選択・列を選択はソースを変えない', () => {
            assert.strictEqual(applyTableCommand(TABLE, { row: 1, col: 0 }, 'selectRow'), null);
            assert.strictEqual(applyTableCommand(TABLE, { row: 1, col: 0 }, 'selectColumn'), null);
        });
    });

    describe('表を削除したあとの改行', () => {
        /** 表ブロックを削除した結果の文書。 */
        function removeTable(doc: string, block: string): string {
            const from = doc.indexOf(block);
            const range = tableDeletionRange(doc, from, from + block.length);
            return doc.slice(0, range.from) + doc.slice(range.to);
        }

        const BLOCK = '| A |\n| - |';

        it('前後を空行で挟まれた表を消すと、空行は1つだけ残る', () => {
            assert.strictEqual(
                removeTable(`前の段落\n\n${BLOCK}\n\n後の段落\n`, BLOCK),
                '前の段落\n\n後の段落\n'
            );
        });

        it('文書の先頭の表を消すと、先頭に空行が残らない', () => {
            assert.strictEqual(removeTable(`${BLOCK}\n\n後の段落\n`, BLOCK), '後の段落\n');
        });

        it('文書の末尾の表を消しても、手前の段落は消えない', () => {
            assert.strictEqual(removeTable(`段落\n\n${BLOCK}\n`, BLOCK), '段落\n\n');
        });

        it('最終行に改行が無い表でも壊れない', () => {
            assert.strictEqual(removeTable(`段落\n\n${BLOCK}`, BLOCK), '段落\n\n');
        });
    });

    describe('メニュー項目', () => {
        it('選択・挿入・削除の9項目がこの順で並ぶ', () => {
            assert.deepStrictEqual(
                tableMenuItems(TABLE, { row: 1, col: 0 }).map((i) => i.id),
                [
                    'selectRow',
                    'selectColumn',
                    'insertRowAbove',
                    'insertRowBelow',
                    'insertColumnLeft',
                    'insertColumnRight',
                    'deleteRow',
                    'deleteColumn',
                    'deleteTable'
                ]
            );
        });

        it('本文セルでは表の削除以外もすべて使える', () => {
            for (const item of tableMenuItems(TABLE, { row: 1, col: 0 })) {
                assert.strictEqual(item.enabled, true, `${item.id} が無効になっている`);
            }
        });

        it('項目のラベルは英語ソース（表示時に webview 側で訳す）', () => {
            const labels = tableMenuItems(TABLE, { row: 1, col: 0 }).map((i) => i.label);
            assert.deepStrictEqual(labels, [
                'Select row',
                'Select column',
                'Insert row above',
                'Insert row below',
                'Insert column left',
                'Insert column right',
                'Delete row',
                'Delete column',
                'Delete table'
            ]);
        });
    });
});
