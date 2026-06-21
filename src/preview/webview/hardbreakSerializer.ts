/**
 * テーブルセル内の hardbreak を `<br>` としてシリアライズするよう Milkdown を上書きする。
 *
 * Milkdown 既定では、セル内 hardbreak はスペース（isInline=false）かリテラル改行
 * （isInline=true）になり、いずれも GFM テーブルのセル内改行として保存できない。
 * シリアライザのスタックに `tableCell` がある間だけ `<br>` を出力し、表の外の
 * hardbreak（段落の Shift+Enter やソフト改行）は既定のまま変えない。
 *
 * 取り込み側は convertTableCellBreaksToEntities が `<br>` → `&#10;` に直し、
 * Milkdown が `&#10;` を hardbreak として解釈する（これで round-trip が成立する）。
 */
import type { Ctx } from '@milkdown/ctx';
import { hardbreakSchema } from '@milkdown/kit/preset/commonmark';

export function overrideHardbreakSerializer(ctx: Ctx): void {
    const prevFactory = ctx.get(hardbreakSchema.key);
    ctx.set(hardbreakSchema.key, (c) => {
        const spec = prevFactory(c);
        const baseRunner = spec.toMarkdown.runner;
        return {
            ...spec,
            toMarkdown: {
                match: spec.toMarkdown.match,
                runner: (state, node) => {
                    // SerializerState.elements は protected のため構造的に参照する。
                    // スタックに tableCell があれば、その hardbreak はセル内改行。
                    const stack = (state as unknown as { elements?: ReadonlyArray<{ type?: string }> }).elements;
                    const inTableCell = Array.isArray(stack) && stack.some((el) => el?.type === 'tableCell');
                    if (inTableCell) {
                        state.addNode('html', undefined, '<br>');
                        return;
                    }
                    baseRunner(state, node);
                }
            }
        };
    });
}
