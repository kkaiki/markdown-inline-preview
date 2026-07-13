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
import {
    collapseCurrentExpandedBlock,
    getExpandedBlock,
    markRecentCheckboxDemotion
} from './blockPrefixEditPlugin';

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
                let state = view.state;
                let { $from, empty } = state.selection;
                if (!empty) return false;

                // blockPrefixEditPlugin が展開中はプレフィックスが実テキストになっている。
                // Backspace でプレフィックス文字を 1 文字ずつ削除するのが自然な挙動なので、
                // 原則スキップする。ただし本文が空のタスク項目だけは、見えている
                // "- [ ] " を1文字ずつ壊さず、先に折りたたんで空タスク削除として扱う。
                const expanded = getExpandedBlock();
                if (expanded !== null) {
                    const expandedNode = state.doc.nodeAt(expanded.nodePos);
                    const isEmptyExpandedTask =
                        expanded.nodeType === 'list_item' &&
                        /^- \[[ xX]\] $/.test(expanded.prefix) &&
                        expandedNode?.firstChild?.textContent === expanded.prefix;
                    if (!isEmptyExpandedTask) return false;

                    collapseCurrentExpandedBlock(view);
                    state = view.state;
                    ({ $from, empty } = state.selection);
                    if (!empty) return false;
                }

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
                    // 空のタスク項目では中間状態の「空の箇条書き」を作らず、その場で
                    // リストから抜けて空段落にする。行自体とカーソル位置は維持する。
                    if (/^(?:\[[ xX]\])?$/.test(listItem.textContent.trim())) {
                        const listItemType = state.schema.nodes.list_item;
                        if (listItemType && liftListItem(listItemType)(state, view.dispatch)) {
                            pinSelection(view, view.state.selection.from);
                            event.preventDefault();
                            return true;
                        }
                    }

                    // チェックボックス → 箇条書き（チェック属性を外す）。
                    // setNodeMarkup 直後、この list_item は checked=null（＝普通の箇条書き）
                    // になり、まだカーソルもその中にある。blockPrefixEditPlugin はこれを
                    // 「フォーカス中の普通の箇条書きになった」と見なして "- " を実テキストとして
                    // 展開してしまう（previewKeymapPlugin.ts の makeTodo() が対処済みの Bug1 と
                    // 同種）。加えて list-item-block コンポーネントの非同期再描画が少し遅れて
                    // 追加の selectionchange を発火させることがあり、同期的な抑制解除では
                    // そちらまでは防げない。markRecentCheckboxDemotion でこの list_item の
                    // 位置を時間窓つきで記録し、blockPrefixEditPlugin 側にこのノードだけ
                    // 展開対象から一時的に除外させる（pendingCheckboxSelectionGuard と同じ
                    // 「位置追跡 + 時間窓」方式。グローバルな抑制フラグを rAF を跨いで
                    // 持ち続けると、無関係な他ブロックの正当な展開まで巻き込んで止めてしまう）。
                    // setNodeMarkup の view.dispatch() は同期的に view.update() を
                    // 呼び出す（blockPrefixEditPlugin の誤検知はまさにこの中で起きる）ため、
                    // 記録は必ず dispatch より前に行う。
                    const liPos = $from.before(liDepth);
                    markRecentCheckboxDemotion(liPos);
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
