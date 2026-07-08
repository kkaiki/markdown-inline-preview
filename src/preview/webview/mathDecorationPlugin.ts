/**
 * KaTeX 数式の描画（ProseMirror デコレーション方式）。
 *
 * 以前は `katex/contrib/auto-render` が ProseMirror 管理下の DOM のテキストノードを
 * 直接 KaTeX の `<span>` 群に置き換えていた。これは Mermaid で起きたのと同じ問題
 * （`mermaidDiagramPlugin.ts` 参照）で、ProseMirror の MutationObserver が「自分が
 * 作っていない変更」とみなして即座に巻き戻すため、**数式は一瞬も表示されないか、
 * 表示されても直後に消える**。
 *
 * そこで Mermaid と同じくデコレーションで描画する。KaTeX は同期レンダリングなので
 * Mermaid のような非同期キャッシュは不要で、さらに Typora 風の挙動にできる:
 *
 *   - カーソルが数式（`$...$` / `$$...$$`）の**外**にあるとき:
 *     ソーステキストを `Decoration.inline`（display:none）で隠し、直後に
 *     `Decoration.widget` で KaTeX レンダリング結果を表示する。
 *   - カーソルが数式の**中**（境界含む）にあるとき: 何もしない（ソースがそのまま
 *     見え、編集できる）。widget をクリックするとカーソルが隣に置かれるので、
 *     自然にソース表示へ切り替わる。
 *
 * 対象はコードブロック・インラインコード以外のテキストノード内で完結する
 * `$$式$$`（displayMode）と `$式$`（インライン）。
 */
import { Plugin, PluginKey } from '@milkdown/prose/state';
import type { EditorState } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';
import katex from 'katex';

let enabled = true;

export function setMathEnabled(value: boolean): void {
    enabled = value;
}

// `$$式$$`（displayMode）を先に、残りを `$式$` として拾う。
// `$` の直後が空白のもの（"$ 100" のような金額表記）は数式とみなさない。
const MATH_RE = /\$\$([^$]+?)\$\$|\$([^$\s](?:[^$\n]*?[^$\s])?)\$/g;

const renderCache = new Map<string, string>();

function renderKatex(expr: string, displayMode: boolean): string {
    const cacheKey = `${displayMode ? 'D' : 'I'}:${expr}`;
    const cached = renderCache.get(cacheKey);
    if (cached !== undefined) return cached;
    let html: string;
    try {
        html = katex.renderToString(expr, { throwOnError: false, displayMode });
    } catch {
        html = '';
    }
    renderCache.set(cacheKey, html);
    return html;
}

function widgetFactory(expr: string, displayMode: boolean): () => HTMLElement {
    return () => {
        const span = document.createElement('span');
        span.className = displayMode ? 'ipreview-math ipreview-math-display' : 'ipreview-math';
        span.contentEditable = 'false';
        span.setAttribute('aria-hidden', 'true');
        span.innerHTML = renderKatex(expr, displayMode);
        return span;
    };
}

function buildDecorations(state: EditorState): DecorationSet {
    if (!enabled) return DecorationSet.empty;
    const decorations: Decoration[] = [];
    const sel = state.selection;

    state.doc.descendants((node, pos) => {
        if (node.type.name === 'code_block') return false;
        if (!node.isText || typeof node.text !== 'string') return true;
        if (node.marks.some((mark) => mark.type.name === 'inlineCode' || mark.type.name === 'code_inline')) return true;

        MATH_RE.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = MATH_RE.exec(node.text)) !== null) {
            const displayMode = match[1] !== undefined;
            const expr = displayMode ? match[1] : match[2];
            const from = pos + match.index;
            const to = from + match[0].length;

            // カーソル（または選択）が数式に触れている間はソースを見せる。
            if (sel.from <= to + 1 && sel.to >= from - 1) continue;

            const html = renderKatex(expr, displayMode);
            if (!html) continue;

            decorations.push(Decoration.inline(from, to, { class: 'ipreview-math-source' }));
            decorations.push(Decoration.widget(to, widgetFactory(expr, displayMode), {
                side: 1,
                key: `math-${displayMode ? 'D' : 'I'}-${expr}`
            }));
        }
        return true;
    });

    return DecorationSet.create(state.doc, decorations);
}

const mathKey = new PluginKey<DecorationSet>('mathDecoration');

export function createMathDecorationPlugin() {
    return $prose(() => new Plugin({
        key: mathKey,
        props: {
            // 選択位置に依存する（カーソルが触れたらソース表示に戻す）ため、
            // doc だけでなく毎回 state から計算する。
            decorations(state) {
                return buildDecorations(state);
            }
        }
    }));
}
