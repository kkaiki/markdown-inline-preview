/**
 * `virtualLineStart`（`shared/preview/hardbreakLine.ts`）を使った、webview 側（実 EditorView
 * への dispatch を伴う）ヘルパー。
 */
import type { EditorView } from '@milkdown/prose/view';

import { virtualLineStart } from '../../shared/preview/hardbreakLine';

export { virtualLineStart };

/**
 * `pos` が textblock 内で hardbreak の直後（＝Enter で作られた「行」の途中）にあるとき、
 * その hardbreak を「独立した1個の空行プレースホルダ段落」として切り出し、本物の
 * 段落分割にする（`view.dispatch` 済み）。hardbreak を挟んでいなければ何もせず
 * `pos` をそのまま返す。
 *
 * `paragraph[A, hardbreak, B]` を、hardbreak の前後で2回 split したあと
 * hardbreak 自体を削除して `paragraph[A]`, `paragraph[]`（真に空）, `paragraph[B]` の
 * 3段落にする。**空段落は中身が完全に空（`content.size === 0`）でなければならない** ——
 * Milkdown 組み込みの `paragraphSchema.toMarkdown` は「空行を保存に残すか」を
 * `content.size === 0`（かつ文書の最後の子でない）で判定しており、hardbreak を
 * 中身として残したままだと空行として直列化されない（空文字列になる）。
 * `blankLineRemarkPlugin.ts` が空行1つを実体化する空 paragraph も同じく中身が空であり、
 * これに合わせることで `applyExternalContent.ts` の外部更新ブロック差分が
 * 「本来あるはずの空行プレースホルダ」を欠けたものと誤認してカーソルを
 * 無関係な場所へ飛ばす事故を防ぐ。
 *
 * 戻り値は分割後のドキュメントにおける、元の `pos` に対応する位置
 * （＝新しく独立した段落の内容末尾）。
 */
export function splitAtPrecedingHardbreak(view: EditorView, pos: number): number {
    const $pos = view.state.doc.resolve(pos);
    if (!$pos.parent.isTextblock) return pos;
    const parentStart = $pos.start();
    if (pos === parentStart) return pos;
    const lineStart = virtualLineStart($pos);
    if (lineStart === parentStart) return pos; // hardbreak を挟んでいない

    const hardbreakPos = lineStart - 1;
    let tr = view.state.tr.split(hardbreakPos + 1); // [...A, hardbreak] | [B...]
    tr = tr.split(hardbreakPos); // [...A] | [hardbreak] | [B...]
    const placeholderHardbreakPos = hardbreakPos + 2;
    tr = tr.delete(placeholderHardbreakPos, placeholderHardbreakPos + 1); // [...A] | [](空) | [B...]
    const mapped = tr.mapping.map(pos);
    view.dispatch(tr.scrollIntoView());
    return mapped;
}
