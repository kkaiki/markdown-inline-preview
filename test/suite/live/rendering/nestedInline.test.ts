/**
 * Live モードで書式を重ねたとき（`==**example**==` など）に、内側の記法も拾うことを純関数で固定する。
 *
 * GitHub issue（2026-10-14）: "support multiple decorations at a time? e.g., highlight and bold as in ==**example**=="
 * → 外側の記法を見つけると中身を読み飛ばしていたので、内側の `**` が記号のまま見えていた。
 * 中身も同じ規則でもう一度走査する。インラインコードの中は従来どおり記法として扱わない。
 */
import * as assert from 'assert';
import { scanSyntaxRanges, type SyntaxRange } from '../../../../src/live/shared/syntaxRanges';

function inline(doc: string): { kind: string; mark: string; hidden: string[] }[] {
    return scanSyntaxRanges(doc)
        .filter((r: SyntaxRange) => r.scope === 'token')
        .map((r) => ({ kind: r.kind, mark: doc.slice(r.markFrom, r.markTo), hidden: r.hidden.map((h) => doc.slice(h.from, h.to)) }));
}

describe('Live モード: 書式の重ね掛け', () => {
    it('==**example**== は蛍光ペンと太字の両方になる（issue の例）', () => {
        assert.deepStrictEqual(inline('==**example**==\n'), [
            { kind: 'highlight', mark: '**example**', hidden: ['==', '=='] },
            { kind: 'strong', mark: 'example', hidden: ['**', '**'] }
        ]);
    });

    it('**==example==** のように順番が逆でも両方になる', () => {
        assert.deepStrictEqual(
            inline('**==example==**\n').map((r) => r.kind),
            ['strong', 'highlight']
        );
    });

    it('太字の中の斜体・取り消し線・インラインコードも拾う', () => {
        assert.deepStrictEqual(
            inline('**a *b* ~~c~~ `d`**\n').map((r) => [r.kind, r.mark]),
            [['strong', 'a *b* ~~c~~ `d`'], ['em', 'b'], ['strike', 'c'], ['code', 'd']]
        );
    });

    it('3 重（==**~~x~~**==）でも全部拾う', () => {
        assert.deepStrictEqual(inline('==**~~x~~**==\n').map((r) => r.kind), ['highlight', 'strong', 'strike']);
    });

    it('インラインコードの中は従来どおり記法として扱わない', () => {
        assert.deepStrictEqual(inline('`==**x**==`\n').map((r) => r.kind), ['code']);
    });
});
