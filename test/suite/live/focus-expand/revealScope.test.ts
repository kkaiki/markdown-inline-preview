/**
 * Live モードの中核判定「この記法は今、生テキストとして見えているべきか」の純関数テスト。
 *
 * 期待値の出典は Obsidian 1.13.4 の実測仕様
 * （docs/specifications/live-mode/obsidian-observed-spec.md §1 原則2〜4）。
 * 特にトークンスコープの境界は `from <= cursor <= to`（**両端を含む**）であり、
 * `from - 1` では展開せず `to`（閉じ記号の直後）では展開する、という非対称でない
 * 厳密な規則を実測で確認している。ここが崩れると「閉じ記号を打ち終わった瞬間に
 * 記法が畳まれる」といった操作感の破綻に直結するため、最優先で固定する。
 *
 * 受け入れ基準: requirements.md §6 の必須回帰テスト #2 #3。
 */
import * as assert from 'assert';
import { isRevealed, type RevealScope } from '../../../../src/live/shared/revealScope';

/** テスト用に、判定に必要な最小限のフィールドだけを持つ範囲を作る。 */
function range(revealFrom: number, revealTo: number, scope: RevealScope = 'token') {
    return { revealFrom, revealTo, scope };
}

/** カーソル（空選択）1つ。 */
function caret(at: number) {
    return [{ from: at, to: at }];
}

describe('Live モード: 展開スコープ判定 isRevealed', () => {
    describe('トークンスコープの境界（実測: from <= cursor <= to）', () => {
        // 'これは **太字bold** と …' の '**太字bold**' は [4, 14)。to は最終文字の次 = 14。
        const bold = range(4, 14, 'token');

        it('トークンの1つ手前（from-1）では展開しない', () => {
            assert.strictEqual(isRevealed(bold, caret(3), true), false);
        });

        it('トークンの開始位置（from）では展開する', () => {
            assert.strictEqual(isRevealed(bold, caret(4), true), true);
        });

        it('トークンの内側では展開する', () => {
            for (const at of [5, 8, 11, 13]) {
                assert.strictEqual(isRevealed(bold, caret(at), true), true, `offset ${at}`);
            }
        });

        it('閉じ記号の直後（to）でも展開する', () => {
            assert.strictEqual(isRevealed(bold, caret(14), true), true);
        });

        it('to の1つ先（to+1）では展開しない', () => {
            assert.strictEqual(isRevealed(bold, caret(15), true), false);
        });

        it('同じ行の別トークンはカーソルが触れていなければ展開しない', () => {
            const italic = range(17, 27, 'token');
            assert.strictEqual(isRevealed(italic, caret(8), true), false);
            assert.strictEqual(isRevealed(italic, caret(17), true), true);
        });
    });

    describe('行スコープ（見出し）', () => {
        // '# 見出し1 Heading One' が 0..21 にある行
        const heading = range(0, 21, 'line');

        it('行内のどのオフセットでも展開する', () => {
            for (const at of [0, 1, 2, 10, 21]) {
                assert.strictEqual(isRevealed(heading, caret(at), true), true, `offset ${at}`);
            }
        });

        it('行の外では展開しない', () => {
            assert.strictEqual(isRevealed(heading, caret(22), true), false);
        });
    });

    describe('ブロックスコープ（コードフェンス・数式ブロック・コールアウト）', () => {
        // '```js\nconst a = 1;\n```' 全体が [0, 22]
        const block = range(0, 22, 'block');

        it('ブロック本文にカーソルがあればブロック全体を展開する', () => {
            assert.strictEqual(isRevealed(block, caret(10), true), true);
        });

        it('ブロックの外では展開しない', () => {
            assert.strictEqual(isRevealed(block, caret(23), true), false);
        });
    });

    describe('常時変換スコープ（リストの "-"・引用の ">"・表）', () => {
        const listMarker = range(0, 2, 'never');

        it('カーソルが真上にあっても展開しない', () => {
            assert.strictEqual(isRevealed(listMarker, caret(0), true), false);
            assert.strictEqual(isRevealed(listMarker, caret(1), true), false);
            assert.strictEqual(isRevealed(listMarker, caret(2), true), false);
        });
    });

    describe('フォーカス（実測: blur したら全部収縮する）', () => {
        it('フォーカスが無ければトークンの中にカーソルがあっても展開しない', () => {
            assert.strictEqual(isRevealed(range(4, 14, 'token'), caret(8), false), false);
        });

        it('フォーカスが無ければ行スコープも展開しない', () => {
            assert.strictEqual(isRevealed(range(0, 21, 'line'), caret(3), false), false);
        });
    });

    describe('選択範囲（実測: 触れている要素はすべて展開する）', () => {
        it('選択がトークンをまたいでいれば展開する', () => {
            const bold = range(4, 14, 'token');
            assert.strictEqual(isRevealed(bold, [{ from: 0, to: 30 }], true), true);
        });

        it('選択の終端がトークンの先頭に接していれば展開する', () => {
            const bold = range(4, 14, 'token');
            assert.strictEqual(isRevealed(bold, [{ from: 0, to: 4 }], true), true);
        });

        it('選択がトークンに届いていなければ展開しない', () => {
            const bold = range(4, 14, 'token');
            assert.strictEqual(isRevealed(bold, [{ from: 0, to: 3 }], true), false);
        });

        it('複数選択のうち1つでも触れていれば展開する', () => {
            const bold = range(4, 14, 'token');
            const sels = [{ from: 0, to: 1 }, { from: 9, to: 9 }];
            assert.strictEqual(isRevealed(bold, sels, true), true);
        });
    });
});
