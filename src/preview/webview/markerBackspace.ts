/**
 * 行頭マーカー（`#`・`-`・`- [ ]`）を Backspace で **1 段階ずつ** 外す。
 *
 * Preview は WYSIWYG なのでマーカー（`##` 等）は装飾で、文字として消せず「編集できない」状態
 * だった。ここでは行頭で Backspace したとき、Raw と同じ感覚で段階的に外す:
 * - 見出し: `H2 → H1 → 段落`（`#` を 1 つずつ）
 * - チェックボックス: `- [ ] → -（箇条書き）→ 段落`
 * - 箇条書き/番号付き: `- → 段落`（リストから持ち上げ）
 *
 * いずれも「行頭にカーソルがあるとき」だけ作動し、それ以外は既定の Backspace に委ねる。
 */
import { Plugin, PluginKey, TextSelection, Selection } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import { liftListItem } from '@milkdown/prose/schema-list';
import { $prose } from '@milkdown/utils';

import { headingDowngradeLevel } from '../../shared/markdown/headingBackspace';
import { getExpandedBlock } from './blockPrefixEditPlugin';

/**
 * 変換後に選択位置を「固定」する。
 *
 * list-item-block コンポーネント（Web Component）はチェックボックス／bullet ラベルを
 * **非同期で再描画**する。markerBackspace が同期的に正しいカーソル位置をセットしても、
 * この再描画が DOM のキャレットを別ブロック（直前の段落など）へずらし、ProseMirror が
 * `selectionchange` でその壊れた DOM 選択をモデルへ逆同期してしまう（= カーソルが上の行に
 * 飛ぶ）。そこで再描画が落ち着いた後にモデルの選択を再アサートし、DOM を正しく書き戻す。
 *
 * `requestAnimationFrame` を **2 段**にしているのは、list-item-block コンポーネント自身も
 * onMount で 1 フレーム後に選択を復元しようとするため。1 段だとその復元処理と同フレームで
 * 競合し、コンポーネント側が「内容は同じだが別インスタンスの doc」に対して setSelection して
 * RangeError を投げる。コンポーネントの復元（または break）が済んだ次フレームで補正する。
 */
function pinSelection(view: EditorView, pos: number): void {
    requestAnimationFrame(() => requestAnimationFrame(() => {
        if (view.isDestroyed) return;
        const clamped = Math.max(0, Math.min(pos, view.state.doc.content.size));
        if (view.state.selection.from !== clamped) {
            const selection = Selection.near(view.state.doc.resolve(clamped), -1);
            view.dispatch(view.state.tr.setSelection(selection).setMeta('addToHistory', false));
        }
        view.focus();
    }));
}

export function createMarkerBackspacePlugin() {
    return $prose(() => new Plugin({
        key: new PluginKey('markerBackspace'),
        priority: 100, // 既定の Backspace より先に処理する
        props: {
            handleKeyDown(view, event) {
                if (event.key !== 'Backspace') return false;
                const { state } = view;
                const { $from, empty } = state.selection;
                if (!empty) return false;

                // blockPrefixEditPlugin が展開中はプレフィックスが実テキストになっている。
                // Backspace でプレフィックス文字を 1 文字ずつ削除するのが自然な挙動なので、
                // ここではスキップして ProseMirror 既定の文字削除に委ねる。
                if (getExpandedBlock() !== null) return false;

                // 1) 見出し: 行頭で 1 レベル降格 → 最後は段落
                for (let depth = $from.depth; depth > 0; depth--) {
                    const node = $from.node(depth);
                    if (node.type.name !== 'heading') continue;
                    if ($from.pos !== $from.start(depth)) return false; // 行頭以外は既定へ

                    const headingPos = $from.before(depth);
                    const next = headingDowngradeLevel(Number(node.attrs.level) || 1);
                    if (next !== null) {
                        view.dispatch(
                            state.tr.setNodeMarkup(headingPos, undefined, { ...node.attrs, level: next })
                                .scrollIntoView()
                        );
                    } else {
                        const paragraphType = state.schema.nodes.paragraph;
                        if (!paragraphType) return false;
                        const paragraph = paragraphType.create(null, node.content);
                        const tr = state.tr.replaceWith(headingPos, headingPos + node.nodeSize, paragraph);
                        tr.setSelection(TextSelection.create(tr.doc, headingPos + 1));
                        view.dispatch(tr.scrollIntoView());
                    }
                    event.preventDefault();
                    return true;
                }

                // 2) リスト項目（チェックボックス/箇条書き/番号付き）: 行頭で 1 段階外す
                let liDepth = -1;
                for (let depth = $from.depth; depth > 0; depth--) {
                    if ($from.node(depth).type.name === 'list_item') { liDepth = depth; break; }
                }
                if (liDepth < 0) return false;
                // 項目の最初のブロックの行頭にいるときだけ
                if ($from.parentOffset !== 0 || $from.index(liDepth) !== 0) return false;

                const listItem = $from.node(liDepth);
                const checked = listItem.attrs.checked;
                if (checked === true || checked === false) {
                    // チェックボックス → 箇条書き（チェック属性を外す）
                    const liPos = $from.before(liDepth);
                    view.dispatch(
                        state.tr.setNodeMarkup(liPos, undefined, { ...listItem.attrs, checked: null })
                            .scrollIntoView()
                    );
                    // ラベルの非同期再描画でカーソルが上の行へ飛ぶのを防ぐ。
                    pinSelection(view, view.state.selection.from);
                    event.preventDefault();
                    return true;
                }

                // 箇条書き/番号付き → 段落（リストから持ち上げ）
                const listItemType = state.schema.nodes.list_item;
                if (listItemType && liftListItem(listItemType)(state, view.dispatch)) {
                    pinSelection(view, view.state.selection.from);
                    event.preventDefault();
                    return true;
                }
                return false;
            }
        }
    }));
}
