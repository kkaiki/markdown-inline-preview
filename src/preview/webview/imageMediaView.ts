/**
 * `image` スキーマノード（`![alt](src)`）の描画を、拡張子に応じて
 * `<img>` / `<video controls>` / `<audio controls>` に出し分ける NodeView。
 *
 * スキーマ（`src`/`alt`/`title` 属性・`![alt](src)` へのシリアライズ）は
 * `@milkdown/preset-commonmark` の image ノードのまま変更しない。`$view` で
 * 描画（NodeView）だけを上書きするため、markdownTransform.ts の webview URI
 * 変換・復元や imageIsolationPlugin.ts（画像とテキストの混在段落分割）は
 * 無改修のまま動画・音声にも適用される。
 *
 * 動画・音声はブラウザ標準の controls（再生ボタン・シークバー）を持つ。これを
 * ProseMirror の編集操作として解釈させたり、controls 自身の DOM 変化（再生時間の
 * 表示更新等）を MutationObserver 経由で「意図しない変更」として巻き戻されたり
 * しないよう、`stopEvent`/`ignoreMutation` で ProseMirror の介入を止める
 * （mermaidDiagramPlugin.ts が抱えていた contentDOM 外部変更検知の問題と同種の対策）。
 */
import type { Node as ProseNode } from '@milkdown/prose/model';
import type { NodeViewConstructor } from '@milkdown/prose/view';
import { imageSchema } from '@milkdown/kit/preset/commonmark';
import { $view } from '@milkdown/utils';
import { classifyMediaKind } from '../../shared/preview/mediaKind';

function createMediaElement(node: ProseNode): HTMLElement {
    const src = String(node.attrs.src ?? '');
    const alt = String(node.attrs.alt ?? '');
    const title = String(node.attrs.title ?? '');
    const kind = classifyMediaKind(src);

    if (kind === 'video') {
        const video = document.createElement('video');
        video.src = src;
        video.controls = true;
        if (title) video.title = title;
        return video;
    }
    if (kind === 'audio') {
        const audio = document.createElement('audio');
        audio.src = src;
        audio.controls = true;
        if (title) audio.title = title;
        return audio;
    }
    const img = document.createElement('img');
    img.src = src;
    img.alt = alt;
    if (title) img.title = title;
    return img;
}

export const imageMediaView = $view(imageSchema.node, (): NodeViewConstructor => {
    return (initialNode) => {
        const kind = classifyMediaKind(String(initialNode.attrs.src ?? ''));
        const dom = createMediaElement(initialNode);
        const interactive = kind !== 'image';

        return interactive
            ? { dom, stopEvent: () => true, ignoreMutation: () => true }
            : { dom };
    };
});
