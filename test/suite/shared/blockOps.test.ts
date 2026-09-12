/**
 * Notion 準拠のブロック操作（⌘D 複製 / ⌘⇧↑↓ 移動）を、エディタ非依存の純関数として固定する。
 *
 * Notion の「ブロック」に相当するのは Markdown では「その行 + インデントで
 * ぶら下がっている子行」なので、複製も移動も子を連れていく。
 * Raw / Live の両方がこの計算結果（置換する行範囲と置換後テキスト）をそのまま適用する。
 *
 * 仕様: docs/specifications/notion-shortcuts.md §1.3
 */
import * as assert from 'assert';
import { duplicateBlock, moveBlock, toggleTaskLine } from '../../../src/shared/blockOps';

const LIST = ['- 親A', '  - 子A1', '  - 子A2', '- 親B'];

describe('Notion 準拠のブロック操作', () => {
    describe('⌘D: ブロックを複製する', () => {
        it('単独の行を複製すると直下に同じ行が増える', () => {
            assert.deepStrictEqual(duplicateBlock(['一行目', '二行目'], 0, 0), {
                fromLine: 0,
                toLine: 0,
                text: '一行目\n一行目',
                selectionFromLine: 1,
                selectionToLine: 1
            });
        });

        it('子を持つ項目を複製すると子ごと複製される', () => {
            assert.deepStrictEqual(duplicateBlock(LIST, 0, 0), {
                fromLine: 0,
                toLine: 2,
                text: '- 親A\n  - 子A1\n  - 子A2\n- 親A\n  - 子A1\n  - 子A2',
                selectionFromLine: 3,
                selectionToLine: 5
            });
        });

        it('複数行を選択しているとその範囲をまとめて複製する', () => {
            const r = duplicateBlock(['a', 'b', 'c'], 0, 1);
            assert.strictEqual(r.text, 'a\nb\na\nb');
            assert.strictEqual(r.selectionFromLine, 2);
            assert.strictEqual(r.selectionToLine, 3);
        });

        it('空行は子として連れて行かない', () => {
            const r = duplicateBlock(['- 親A', '', '  つづき'], 0, 0);
            assert.strictEqual(r.toLine, 0);
            assert.strictEqual(r.text, '- 親A\n- 親A');
        });
    });

    describe('⌘⇧↑ / ⌘⇧↓: ブロックを移動する', () => {
        it('上へ移動すると直前の行と入れ替わる', () => {
            assert.deepStrictEqual(moveBlock(['a', 'b', 'c'], 1, 1, 'up'), {
                fromLine: 0,
                toLine: 1,
                text: 'b\na',
                selectionFromLine: 0,
                selectionToLine: 0
            });
        });

        it('下へ移動すると直後の行と入れ替わる', () => {
            assert.deepStrictEqual(moveBlock(['a', 'b', 'c'], 1, 1, 'down'), {
                fromLine: 1,
                toLine: 2,
                text: 'c\nb',
                selectionFromLine: 2,
                selectionToLine: 2
            });
        });

        it('子を持つ項目を下へ移動すると子ごと移動する', () => {
            assert.deepStrictEqual(moveBlock(LIST, 0, 0, 'down'), {
                fromLine: 0,
                toLine: 3,
                text: '- 親B\n- 親A\n  - 子A1\n  - 子A2',
                selectionFromLine: 1,
                selectionToLine: 1
            });
        });

        it('先頭行で上へ移動しても何も起きない', () => {
            assert.strictEqual(moveBlock(['a', 'b'], 0, 0, 'up'), null);
        });

        it('末尾ブロックで下へ移動しても何も起きない', () => {
            assert.strictEqual(moveBlock(LIST, 3, 3, 'down'), null);
        });

        it('子を含めた末尾が文書末なら下へ移動できない', () => {
            assert.strictEqual(moveBlock(['- 親', '  - 子'], 0, 0, 'down'), null);
        });
    });

    describe('⌘Enter: チェックボックスを切り替える', () => {
        it('未チェックの項目はチェック済みになる', () => {
            assert.strictEqual(toggleTaskLine('- [ ] やること'), '- [x] やること');
        });

        it('チェック済みの項目は未チェックに戻る', () => {
            assert.strictEqual(toggleTaskLine('- [x] やること'), '- [ ] やること');
        });

        it('大文字の [X] も未チェックに戻せる', () => {
            assert.strictEqual(toggleTaskLine('- [X] やること'), '- [ ] やること');
        });

        it('インデントや別のマーカー（* +）でも切り替わる', () => {
            assert.strictEqual(toggleTaskLine('    * [ ] 子'), '    * [x] 子');
            assert.strictEqual(toggleTaskLine('+ [ ] 項目'), '+ [x] 項目');
        });

        it('チェックボックスでない行は普通の箇条書きをチェックボックスにする', () => {
            assert.strictEqual(toggleTaskLine('- 項目'), '- [ ] 項目');
        });

        it('リストですらない行は null（呼び出し側が既定動作に委ねる）', () => {
            assert.strictEqual(toggleTaskLine('ただの段落'), null);
        });
    });
});
