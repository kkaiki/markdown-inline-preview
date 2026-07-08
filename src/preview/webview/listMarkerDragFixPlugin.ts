/**
 * 箇条書き・番号付きリストのマーカー（bullet/ordered アイコン）からドラッグを始めると
 * 選択できない不具合の修正。
 *
 * ## 原因（2つ重なっている）
 *
 * 1. `@milkdown/components` の `list-item-block` は、マーカーを囲む `.label-wrapper` の
 *    `pointerdown` で、チェックボックスかどうかに関わらず常に `preventDefault()` +
 *    `stopPropagation()` を呼ぶ。Pointer Events の仕様上、`pointerdown` を
 *    `preventDefault()` すると後続の互換 `mousedown` が発火しなくなり、`mousedown` を
 *    起点にする通常の選択が一切始まらない。
 * 2. 1 を回避して `mousedown` を発火させたとしても、`.label-wrapper` 自体は
 *    `contenteditable="false"` の非編集領域であるため、ブラウザのネイティブな
 *    「mousedown 位置から mousemove 位置までテキスト選択を伸ばす」機能は非編集領域を
 *    起点にした場合は働かない（カーソルを置くだけで選択レンジには広がらない）。
 *
 * ## 修正方針
 *
 * bullet/ordered マーカー（チェックボックスは対象外・既存のクリックトグルを維持）の
 * `pointerdown` を capture フェーズで先取りして component 側の処理に渡さず
 * （`stopPropagation()`。`preventDefault()` は呼ばない）、代わりにこちらで
 * ドラッグ選択を手動実装する:
 *   - mousedown 時点でリスト項目の内容開始位置（`.children` 要素の先頭）を
 *     アンカーとして選択を置く。
 *   - 以後の mousemove ごとに `view.posAtCoords` で現在位置を求め、アンカーから
 *     現在位置までの `TextSelection` を dispatch する（ネイティブのドラッグ選択を
 *     手動で代替する）。
 *   - mouseup でリスナーを解除する。
 */
import { TextSelection } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { $prose } from '@milkdown/utils';

function closestNonCheckboxMarker(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element)) return null;
    const wrapper = target.closest('.label-wrapper');
    if (!wrapper) return null;
    const label = wrapper.querySelector('.label');
    if (!label) return null;
    if (!(label.classList.contains('bullet') || label.classList.contains('ordered'))) return null;
    return wrapper as HTMLElement;
}

/** マーカーの `.label-wrapper` から見た、リスト項目の内容（`.children`）の DOM 要素。 */
function contentElementOf(wrapper: HTMLElement): Element | null {
    return wrapper.parentElement?.querySelector(':scope > .children') ?? null;
}

export function createListMarkerDragFixPlugin() {
    return $prose((): Plugin => new Plugin({
        key: new PluginKey('listMarkerDragFix'),
        view(editorView: EditorView) {
            let anchor: number | null = null;

            const onMouseMove = (moveEvent: MouseEvent): void => {
                if (anchor === null) return;
                const pos = editorView.posAtCoords({ left: moveEvent.clientX, top: moveEvent.clientY });
                if (!pos) return;
                try {
                    const sel = TextSelection.between(
                        editorView.state.doc.resolve(anchor),
                        editorView.state.doc.resolve(pos.pos)
                    );
                    editorView.dispatch(editorView.state.tr.setSelection(sel));
                } catch {
                    // ドキュメント境界外などは無視
                }
            };
            const onMouseUp = (): void => {
                anchor = null;
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };
            const onPointerDownCapture = (event: PointerEvent): void => {
                const wrapper = closestNonCheckboxMarker(event.target);
                if (!wrapper) return;
                // component 側の preventDefault/stopPropagation（互換 mousedown を
                // 消してしまう）に到達する前に伝播を止める。
                event.stopPropagation();

                const contentEl = contentElementOf(wrapper);
                if (!contentEl) return;
                try {
                    anchor = editorView.posAtDOM(contentEl, 0);
                } catch {
                    return;
                }
                editorView.dispatch(
                    editorView.state.tr.setSelection(TextSelection.create(editorView.state.doc, anchor))
                );
                editorView.focus();
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            };

            editorView.dom.addEventListener('pointerdown', onPointerDownCapture, true);
            return {
                destroy() {
                    editorView.dom.removeEventListener('pointerdown', onPointerDownCapture, true);
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                }
            };
        }
    }));
}
