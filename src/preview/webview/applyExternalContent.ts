/**
 * 外部からの本文更新（Raw エディタ・AI・他ツールによる .md 編集）を Milkdown へ反映する。
 *
 * `replaceAll` は文書を丸ごと作り直すため、何もしないとカーソルが先頭/末尾へ飛び、
 * フォーカスも外れる。置換前の選択位置とフォーカス状態を控え、置換後に新しい文書
 * サイズへクランプして復元する。
 *
 * milkdownApp 本体の状態（`editor` / `lastSyncedMarkdown`）から切り離した純粋な関数に
 * しておくことで、jsdom 上の実エディタに対してユニットテストできる。
 */
import { editorViewCtx } from '@milkdown/kit/core';
import type { Ctx } from '@milkdown/ctx';
import { replaceAll } from '@milkdown/kit/utils';
import { Selection, TextSelection } from '@milkdown/prose/state';

/**
 * 正規化済みの Markdown 文字列でエディタ本文を置き換え、選択とフォーカスを可能な範囲で保つ。
 * @returns 置換を実行したら true（呼び出し側で再描画などに使う）。
 */
export function applyExternalContent(ctx: Ctx, nextMarkdown: string): boolean {
    const view = ctx.get(editorViewCtx);
    const hadFocus = view.hasFocus();
    const { from, to } = view.state.selection;

    replaceAll(nextMarkdown)(ctx);

    const size = view.state.doc.content.size;
    const anchor = Math.min(from, size);
    const head = Math.min(to, size);
    try {
        const $anchor = view.state.doc.resolve(anchor);
        const selection = anchor === head
            ? Selection.near($anchor)
            : TextSelection.between($anchor, view.state.doc.resolve(head));
        view.dispatch(view.state.tr.setSelection(selection));
    } catch {
        // 位置の解決に失敗しても落とさない（選択復元のみ諦める）。
    }
    if (hadFocus) view.focus();
    return true;
}
