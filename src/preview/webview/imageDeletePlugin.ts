/**
 * Preview（Milkdown）で画像を「クリックして選択 → × ボタンで削除」できるようにする
 * プラグイン（image-click-delete-copy.md）。
 *
 * 画像は ProseMirror の leaf ノードなので、クリックすれば NodeSelection にはなるものの、
 * 削除の導線が Backspace しか無く、選択されたことすら見た目で分からなかった。
 * ここでは画像が選択されている間だけ、その右上に × ボタンを重ねて表示する。
 *
 * ボタンは `position: fixed` で `document.body` へ置き、画像の矩形に合わせて配置する。
 * 画像の親 DOM に差し込むと、`p:has(> img)` を使った「画像のみの段落は横並び」の既存
 * レイアウト（milkdown-preview.css）が壊れるため。スクロール・リサイズ時は再配置する。
 *
 * 動画・音声（`classifyMediaKind` が image 以外）は対象外。それらの NodeView は
 * `stopEvent: () => true` でブラウザ標準 controls を守っており、そもそもクリックしても
 * 選択されない上、× が再生ボタンと重なって誤爆するため（media-embed-support.md）。
 */

import { Plugin, PluginKey, NodeSelection } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';
import { classifyMediaKind } from '../../shared/preview/mediaKind';
import { t } from './i18n';

const imageDeleteKey = new PluginKey('imageDelete');

/** × ボタンの class（テスト・CSS から参照）。 */
export const IMAGE_DELETE_BUTTON_CLASS = 'ipreview-image-delete';

/** 画像として描画されているノードか（動画・音声は対象外）。 */
function isDeletableImageNode(node: { type: { name: string }; attrs: Record<string, unknown> }): boolean {
    const src = typeof node.attrs.src === 'string' ? node.attrs.src : '';
    return node.type.name === 'image' && classifyMediaKind(src) === 'image';
}

/**
 * 現在の選択が「画像ノードの NodeSelection」ならその位置を返す（そうでなければ null）。
 */
function selectedImagePos(view: EditorView): number | null {
    const { selection } = view.state;
    if (!(selection instanceof NodeSelection)) return null;
    if (!isDeletableImageNode(selection.node)) return null;
    return selection.from;
}

/**
 * `<img>` 要素に対応する画像ノードの文書位置を返す（見つからなければ null）。
 *
 * 右クリック経由の削除では ProseMirror の選択が画像ノードになっているとは限らないため、
 * DOM から位置を解決する。`posAtDOM` は要素の直前/直後どちらの位置を返すか状況で
 * 揺れるので、両隣を確かめて実際に画像ノードがある位置を採用する。
 */
export function imagePosFromDom(view: EditorView, img: HTMLElement): number | null {
    let pos: number;
    try {
        pos = view.posAtDOM(img, 0);
    } catch {
        return null;
    }
    for (const candidate of [pos, pos - 1, pos + 1]) {
        if (candidate < 0 || candidate > view.state.doc.content.size) continue;
        const node = view.state.doc.nodeAt(candidate);
        if (node && isDeletableImageNode(node)) return candidate;
    }
    return null;
}

/** 指定位置の画像ノードだけを削除する（Undo 可能な通常の編集操作）。 */
export function deleteImageAt(view: EditorView, pos: number): boolean {
    const node = view.state.doc.nodeAt(pos);
    if (!node || !isDeletableImageNode(node)) return false;
    const tr = view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos));
    view.dispatch(tr.deleteSelection().scrollIntoView());
    view.focus();
    return true;
}

/** クリックされた `<img>` に対応する画像ノードを削除する（右クリックメニュー用）。 */
export function deleteImageAtDom(view: EditorView, img: HTMLElement): boolean {
    const pos = imagePosFromDom(view, img);
    if (pos === null) return false;
    return deleteImageAt(view, pos);
}

export const imageDeletePlugin = $prose(() => new Plugin({
    key: imageDeleteKey,
    view: (editorView) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = IMAGE_DELETE_BUTTON_CLASS;
        button.textContent = '×';
        button.title = t('Delete Image');
        button.setAttribute('aria-label', t('Delete Image'));

        // mousedown を握りつぶして、ボタン押下で画像の選択が外れる（＝削除対象を
        // 見失う）のを防ぐ。実削除は click で行う。
        button.addEventListener('mousedown', (e) => e.preventDefault());
        button.addEventListener('click', (e) => {
            e.preventDefault();
            const pos = selectedImagePos(editorView);
            if (pos !== null) deleteImageAt(editorView, pos);
        });

        let visible = false;

        const hide = (): void => {
            if (!visible) return;
            visible = false;
            button.remove();
        };

        const placeOver = (img: Element): void => {
            const rect = img.getBoundingClientRect();
            // 画像の右上内側に少しめり込ませる（小さすぎる画像でも押せるよう最低限はみ出す）。
            button.style.left = `${Math.round(rect.right - 22)}px`;
            button.style.top = `${Math.round(rect.top + 4)}px`;
        };

        const sync = (): void => {
            const pos = editorView.editable ? selectedImagePos(editorView) : null;
            if (pos === null) {
                hide();
                return;
            }
            const dom = editorView.nodeDOM(pos);
            if (!(dom instanceof HTMLElement)) {
                hide();
                return;
            }
            if (!visible) {
                document.body.appendChild(button);
                visible = true;
            }
            placeOver(dom);
        };

        const reposition = (): void => { if (visible) sync(); };
        window.addEventListener('scroll', reposition, true);
        window.addEventListener('resize', reposition);

        sync();

        return {
            update: () => sync(),
            destroy: () => {
                window.removeEventListener('scroll', reposition, true);
                window.removeEventListener('resize', reposition);
                hide();
            }
        };
    }
}));
