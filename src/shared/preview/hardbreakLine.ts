/**
 * 段落内の hardbreak（`previewKeymapPlugin.ts` の `handleParagraphEnter` が Enter で挿入する
 * ソフト改行）を、Markdown 記法の自動変換（見出し・引用・リスト・チェックボックス・
 * スラッシュメニュー）にとっての「行の先頭」として扱うための純粋関数。
 *
 * これらの自動変換は本来「テキストブロックの先頭にいるか」で発火判定するが、Enter が
 * 段落を分割しなくなった（同じ段落内の hardbreak になった）ことで、"Enter した直後の行" は
 * もう本当のテキストブロック先頭ではなくなった。ここでは「直前の hardbreak（無ければ
 * テキストブロック先頭）の直後」を実質的な行頭として計算する。
 */
import type { ResolvedPos } from '@milkdown/prose/model';

/** `$pos` の属する textblock 内で、直前の hardbreak（無ければ textblock 先頭）の直後位置を返す。 */
export function virtualLineStart($pos: ResolvedPos): number {
    const parentStart = $pos.start();
    let lineStart = parentStart;
    $pos.parent.forEach((node, offset) => {
        const pos = parentStart + offset;
        if (node.type.name === 'hardbreak' && pos < $pos.pos) {
            lineStart = pos + node.nodeSize;
        }
    });
    return lineStart;
}
