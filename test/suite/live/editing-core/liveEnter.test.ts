/**
 * Live モードの Enter / Home の挙動を、CodeMirror に依存しない純関数として固定する。
 *
 * 期待値は Obsidian 実測（obsidian-observed-spec.md §4.1・§3.3）そのまま。
 * 特に既存 Preview / Raw モードと**違う**点:
 *   - 見出しの行末で Enter しても "# " を引き継がない
 *   - チェック済み項目の行末で Enter すると新項目は**未チェック**で始まる
 *   - 空のリスト項目で Enter するとマーカーだけ消えて行は増えない
 *   - 行頭付近の Backspace は記法解除しない（＝ここに Backspace のロジックは無い）
 *
 * 受け入れ基準: requirements.md §6 の必須回帰テスト #5 #6 #10。
 */
import * as assert from 'assert';
import { resolveEnter, resolveSmartHome } from '../../../../src/live/shared/liveEditing';

describe('Live モード: Enter の解決', () => {
    it('リスト項目の行末では次の行に同じマーカーを継続する', () => {
        assert.deepStrictEqual(resolveEnter('- 項目1', 5), { insert: '\n- ', deleteFrom: null });
    });

    it('"* " のリストは "* " を継続する', () => {
        assert.strictEqual(resolveEnter('* 項目', 4)?.insert, '\n* ');
    });

    it('インデントを保ったまま継続する', () => {
        assert.strictEqual(resolveEnter('  - 子項目', 6)?.insert, '\n  - ');
    });

    it('番号リストは次の番号を自動採番する', () => {
        assert.strictEqual(resolveEnter('1. 番号1', 6)?.insert, '\n2. ');
    });

    it('番号は2桁以上でも繰り上がる', () => {
        assert.strictEqual(resolveEnter('9. 九', 4)?.insert, '\n10. ');
    });

    it('未チェック項目の行末では未チェックの新項目を作る', () => {
        assert.strictEqual(resolveEnter('- [ ] タスク', 9)?.insert, '\n- [ ] ');
    });

    it('チェック済み項目の行末でも新項目は未チェックで始まる（実測）', () => {
        assert.strictEqual(resolveEnter('- [x] 済み', 8)?.insert, '\n- [ ] ');
    });

    it('引用行の行末では "> " を継続する', () => {
        assert.strictEqual(resolveEnter('> 引用', 4)?.insert, '\n> ');
    });

    it('見出しの行末ではプレフィックスを引き継がない（実測）', () => {
        assert.strictEqual(resolveEnter('# 見出し', 5), null, '既定の Enter に委ねる');
    });

    it('素の段落では既定の Enter に委ねる', () => {
        assert.strictEqual(resolveEnter('ただの本文', 5), null);
    });

    describe('空のマーカーだけの行', () => {
        it('空のリスト項目ではマーカーを削除して行を増やさない', () => {
            assert.deepStrictEqual(resolveEnter('- ', 2), { insert: '', deleteFrom: 0 });
        });

        it('空の番号リストでもマーカーを削除する', () => {
            assert.deepStrictEqual(resolveEnter('2. ', 3), { insert: '', deleteFrom: 0 });
        });

        it('空のチェックボックスでもマーカーを削除する', () => {
            assert.deepStrictEqual(resolveEnter('- [ ] ', 6), { insert: '', deleteFrom: 0 });
        });

        it('インデントされた空項目はインデントごと消す', () => {
            assert.deepStrictEqual(resolveEnter('    - ', 6), { insert: '', deleteFrom: 0 });
        });
    });

    describe('行の途中での Enter', () => {
        it('リスト項目の途中では分割して後半にマーカーを付ける', () => {
            assert.strictEqual(resolveEnter('- 項目1', 3)?.insert, '\n- ');
        });

        it('マーカーより手前にカーソルがあるときは既定に委ねる', () => {
            assert.strictEqual(resolveEnter('- 項目1', 1), null);
        });
    });
});

describe('Live モード: スマートホーム', () => {
    it('リスト行の1回目はマーカーの後ろへ', () => {
        assert.strictEqual(resolveSmartHome('- 項目1', 5), 2);
    });

    it('すでにマーカーの後ろにいるときは行頭へ', () => {
        assert.strictEqual(resolveSmartHome('- 項目1', 2), 0);
    });

    it('チェックボックスは "- [ ] " の後ろへ', () => {
        assert.strictEqual(resolveSmartHome('- [ ] タスク', 9), 6);
    });

    it('インデントされた項目も本文先頭へ', () => {
        assert.strictEqual(resolveSmartHome('  - 子', 5), 4);
    });

    it('見出し行は2段階にせず行頭へ（実測）', () => {
        assert.strictEqual(resolveSmartHome('# 見出し', 4), 0);
    });

    it('引用行も行頭へ（実測: スマートホームはリスト系のみ）', () => {
        assert.strictEqual(resolveSmartHome('> 引用', 3), 0);
    });

    it('素の段落は行頭へ', () => {
        assert.strictEqual(resolveSmartHome('本文', 2), 0);
    });
});
