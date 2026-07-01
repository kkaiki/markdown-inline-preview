import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import type { ResolvedPos } from '@milkdown/prose/model';
import { $prose } from '@milkdown/utils';

import {
    collectInlineMarksInRange,
    findFocusedBlockDepth,
    getBlockPrefix
} from '../../shared/markdown/focusSyntaxHelpers';
import { getExpandedBlock } from './blockPrefixEditPlugin';

let enabled = true;

export function setFocusSyntaxEnabled(value: boolean): void {
    enabled = value;
}

/**
 * 行内記法マーカー（`**` `*` `` ` `` `~~` `[..](..)`）の装飾要素。
 *
 * **`contenteditable="false"` が重要**: これが無いとマーカーの `<span>` がエディタから
 * `contenteditable=true` を継承し、矢印キーのキャレットがマーカー文字（`**` 等）の中に
 * 入り込んで**そこから先へ進めなくなる**（「これ以上右に行けない」）。false にすると
 * ブラウザはマーカーを飛ばして次の文書位置へキャレットを動かせる。
 */
export function createSyntaxMarkerElement(text: string): HTMLElement {
    const el = document.createElement('span');
    el.className = 'md-syntax-marker';
    el.textContent = text;
    el.contentEditable = 'false';
    el.setAttribute('aria-hidden', 'true');
    return el;
}

/**
 * クリック時にカーソルを `pmPos` へ移動するために位置情報を埋め込んだ widget 生成関数。
 * `data-pm-pos` を使い、`handleDOMEvents.mousedown` 側で位置を読み出す。
 */
function mkMarker(text: string, pmPos: number): () => HTMLElement {
    return () => {
        const el = createSyntaxMarkerElement(text);
        el.dataset.pmPos = String(pmPos);
        return el;
    };
}

/**
 * フォーカス中のブロックに対応する行頭マーカーの node decoration を返す。
 * （`## ` `- ` `1. ` `- [ ] ` `> ` を CSS の ::before で見せるための class/属性）
 *
 * 以前は plugin の `view` から ProseMirror 管理下の DOM へ直接 classList.add /
 * setAttribute していたが、それが ProseMirror の DOMObserver を発火させて
 * 「DOM 変更 → 再描画 → view.update → また DOM 変更」の無限ループ（＝編集不能）を
 * 引き起こしていた。node decoration なら ProseMirror 自身が描画時に属性を付けるので
 * observer ループにならず、文書モデルにも何も挿入されないのでカーソルにも影響しない。
 */
function blockMarkerDecoration($from: ResolvedPos): Decoration | null {
    // blockPrefixEditPlugin が実テキストとしてプレフィックスを展開中は
    // CSS の ::before による二重表示を防ぐためスキップする。
    if (getExpandedBlock() !== null) return null;

    const depth = findFocusedBlockDepth($from);
    if (depth === null) return null;
    const prefix = getBlockPrefix($from, depth);
    if (!prefix) return null;

    let listDepth = -1;
    for (let d = $from.depth; d > 0; d--) {
        if ($from.node(d).type.name === 'list_item') { listDepth = d; break; }
    }

    const nodeDepth = listDepth >= 0 ? listDepth : depth;
    const from = $from.before(nodeDepth);
    const to = from + $from.node(nodeDepth).nodeSize;
    const className = listDepth >= 0 ? 'md-focus-block md-focus-list' : 'md-focus-block';
    return Decoration.node(from, to, { class: className, 'data-md-prefix': prefix });
}

export const focusSyntaxPlugin = $prose(() => {
    return new Plugin({
        key: new PluginKey('focusSyntax'),
        props: {
            // `.md-syntax-marker` をクリックするとカーソルがその位置へ移動する。
            // `contenteditable="false"` 要素をクリックするとブラウザがキャレットを
            // widget 内に置こうとして迷子になるため、mousedown を先取りして防止する。
            handleDOMEvents: {
                mousedown(view, event) {
                    const target = event.target as HTMLElement;
                    if (!target.classList.contains('md-syntax-marker')) return false;
                    const pmPosStr = target.dataset.pmPos;
                    if (!pmPosStr) return false;
                    const pmPos = Number(pmPosStr);
                    if (!Number.isFinite(pmPos) || pmPos < 0 || pmPos > view.state.doc.content.size) return false;
                    event.preventDefault();
                    try {
                        const $pos = view.state.doc.resolve(pmPos);
                        view.dispatch(view.state.tr.setSelection(TextSelection.near($pos)));
                    } catch {
                        // position が文書の範囲外になった場合はスキップ
                    }
                    view.focus();
                    return true;
                }
            },
            // フォーカス行の行頭マーカー（node decoration）と
            // 行内マーカー（** * ` ~~ [..](..) を widget）をまとめて返す。
            decorations(state) {
                if (!enabled) return DecorationSet.empty;
                try {
                    const $pos = state.selection.$from;
                    const depth = findFocusedBlockDepth($pos);
                    if (depth === null) return DecorationSet.empty;

                    const decorations: Decoration[] = [];

                    const blockMarker = blockMarkerDecoration($pos);
                    if (blockMarker) decorations.push(blockMarker);

                    const blockStart = $pos.start(depth);
                    const blockEnd = $pos.end(depth);
                    for (const { pos, end, marker } of collectInlineMarksInRange(state.doc, blockStart, blockEnd)) {
                        decorations.push(
                            Decoration.widget(pos, mkMarker(marker.open, pos), { side: -1, key: `open-${pos}` }),
                            Decoration.widget(end, mkMarker(marker.close, end), { side: 1, key: `close-${end}` })
                        );
                    }

                    return DecorationSet.create(state.doc, decorations);
                } catch {
                    return DecorationSet.empty;
                }
            }
        }
    });
});
