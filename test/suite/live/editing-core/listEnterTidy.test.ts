/**
 * Live モードのリストで Enter したとき、番号リストを「整理された」状態に保つ純関数を固定する。
 *
 * ユーザー報告（2026-10-20）: 「3. …です。4. SEREAL社…」の「4.」の手前で Enter すると「4. 4. SEREAL社…」になった。
 * 行の途中で割るとき、後ろ半分が既にマーカー（`4. ` `- ` など）で始まっていれば新しいマーカーを足さない。
 * さらに番号リストでは、Enter のあとに続く同じ深さの項目の番号を 1 から順に振り直す（数字の重複・飛びを残さない）。
 */
import * as assert from 'assert';
import { planListEnter } from '../../../../src/live/shared/liveEditing';

/** `|` の位置にカーソルを置いて Enter したあとの文書（とカーソル位置 `|`）。 */
function enter(docWithCaret: string): string | null {
    const pos = docWithCaret.indexOf('|');
    const doc = docWithCaret.replace('|', '');
    const plan = planListEnter(doc, pos);
    if (!plan) return null;
    const next = doc.slice(0, plan.from) + plan.insert + doc.slice(plan.to);
    return next.slice(0, plan.cursor) + '|' + next.slice(plan.cursor);
}

describe('Live モード: リストの Enter で番号を整理する', () => {
    describe('後ろ半分が既にマーカーで始まるとき', () => {
        it('「4.」の手前で割ると、マーカーを重ねずに 4. の項目になる（報告の例）', () => {
            assert.strictEqual(
                enter('3. 共有いただきたいです。|4. SEREAL社に再送\n'),
                '3. 共有いただきたいです。\n|4. SEREAL社に再送\n'
            );
        });

        it('手前の空白は捨てる（「です。 4. …」でも 4. が行頭に来る）', () => {
            assert.strictEqual(enter('3. A。 | 4. B\n'), '3. A。\n|4. B\n');
        });

        it('番号がずれていても、手前の項目の次の番号に直す', () => {
            assert.strictEqual(enter('3. A|9. B\n'), '3. A\n|4. B\n');
        });

        it('箇条書きでも「- 」を重ねない', () => {
            assert.strictEqual(enter('- A|- B\n'), '- A\n|- B\n');
        });

        it('インデントは手前の項目に揃える', () => {
            assert.strictEqual(enter('  1. A|2. B\n'), '  1. A\n  |2. B\n');
        });
    });

    describe('続く項目の番号の振り直し', () => {
        it('項目の行末で Enter すると、新しい項目のあとの番号が 1 つずつ繰り下がる', () => {
            assert.strictEqual(enter('1. A|\n2. B\n3. C\n'), '1. A\n2. |\n3. B\n4. C\n');
        });

        it('報告の例で後ろに 4. があれば 5. に繰り下がる', () => {
            assert.strictEqual(
                enter('3. A。|4. B\n4. C\n5. D\n'),
                '3. A。\n|4. B\n5. C\n6. D\n'
            );
        });

        it('子の項目（深いインデント）はまたいで、同じ深さの項目だけ振り直す', () => {
            assert.strictEqual(
                enter('1. A|\n2. B\n   1. 子\n3. C\n'),
                '1. A\n2. |\n3. B\n   1. 子\n4. C\n'
            );
        });

        it('空行や別の段落で振り直しを止める', () => {
            assert.strictEqual(enter('1. A|\n2. B\n\n2. 別のリスト\n'), '1. A\n2. |\n3. B\n\n2. 別のリスト\n');
        });

        it('「1)」形式も同じ記号のまま振り直す', () => {
            assert.strictEqual(enter('1) A|\n2) B\n'), '1) A\n2) |\n3) B\n');
        });
    });

    describe('これまでどおりの動き', () => {
        it('リストでない行では何もしない（既定の Enter に任せる）', () => {
            assert.strictEqual(enter('ただの文|章\n'), null);
        });

        it('空の項目で Enter するとマーカーだけ消える', () => {
            assert.strictEqual(enter('1. A\n2. |\n'), '1. A\n|\n');
        });

        it('箇条書きの行末では次の「- 」を足す', () => {
            assert.strictEqual(enter('- A|\n'), '- A\n- |\n');
        });
    });
});
