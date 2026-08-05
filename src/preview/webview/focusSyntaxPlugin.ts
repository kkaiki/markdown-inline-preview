import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import type { ResolvedPos } from '@milkdown/prose/model';
import { $prose } from '@milkdown/utils';

import {
    findFocusedBlockDepth,
    getBlockPrefix
} from '../../shared/markdown/focusSyntaxHelpers';

let enabled = true;

export function setFocusSyntaxEnabled(value: boolean): void {
    enabled = value;
}

/**
 * 見出し等の行頭マーカーの装飾要素（行内記法マーカーは `inlineMarkBackspace` の
 * 実テキスト展開でカバーされるため、この widget はもう使わない）。
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
 * フォーカス中のブロックに対応する行頭マーカーの decoration を返す。
 * （`## ` `- ` `1. ` `- [ ] ` `> ` を見せるための decoration）
 *
 * 見出しは行内マーカー（`**` 等）と同じ `Decoration.widget` + 実 `<span>` で描画する。
 * 以前は class + data-md-prefix の node decoration を CSS `::before` で見せていたが、
 * `::before` の content は DOM テキストノードではないため、ネイティブの選択
 * （Cmd+A 等）に本質的に含まれず、選択ハイライトから `## ` だけが抜け落ちて見える
 * 不具合があった。widget なら実テキストとして選択に含まれる。
 *
 * list_item・blockquote は引き続き node decoration + CSS `::before` を使う
 * （以前は plugin の `view` から ProseMirror 管理下の DOM へ直接 classList.add /
 * setAttribute していたが、それが ProseMirror の DOMObserver を発火させて
 * 「DOM 変更 → 再描画 → view.update → また DOM 変更」の無限ループ（＝編集不能）を
 * 引き起こしていた。node decoration なら ProseMirror 自身が描画時に属性を付けるので
 * observer ループにならず、文書モデルにも何も挿入されないのでカーソルにも影響しない）。
 */
function blockMarkerDecoration($from: ResolvedPos): Decoration[] {
    const depth = findFocusedBlockDepth($from);
    if (depth === null) return [];

    // フェンスコードブロックの ``` は表示しない（背景と等幅フォントで十分に区別でき、
    // 記法文字を出すとフォーカスの前後で見た目が変わってしまう）。
    if ($from.node(depth).type.name === 'code_block') return [];

    const prefix = getBlockPrefix($from, depth);
    if (!prefix) return [];

    if ($from.node(depth).type.name === 'heading') {
        const headingFrom = $from.before(depth);
        const contentStart = headingFrom + 1;
        return [Decoration.widget(contentStart, mkMarker(prefix, contentStart), {
            side: -1,
            key: `heading-prefix-${headingFrom}`
        })];
    }

    let listDepth = -1;
    for (let d = $from.depth; d > 0; d--) {
        if ($from.node(d).type.name === 'list_item') { listDepth = d; break; }
    }

    const nodeDepth = listDepth >= 0 ? listDepth : depth;
    const from = $from.before(nodeDepth);
    const to = from + $from.node(nodeDepth).nodeSize;
    const className = listDepth >= 0 ? 'md-focus-block md-focus-list' : 'md-focus-block';
    return [Decoration.node(from, to, { class: className, 'data-md-prefix': prefix })];
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
            // フォーカス行の行頭マーカー（node decoration）を返す。
            decorations(state) {
                if (!enabled) return DecorationSet.empty;
                try {
                    const $pos = state.selection.$from;
                    const depth = findFocusedBlockDepth($pos);
                    if (depth === null) return DecorationSet.empty;

                    return DecorationSet.create(state.doc, blockMarkerDecoration($pos));
                } catch {
                    return DecorationSet.empty;
                }
            }
        }
    });
});
