/**
 * Mermaid 図の描画（ProseMirror デコレーション方式）。
 *
 * 以前は `pre.replaceWith(container)` で `<pre><code>` を直接 SVG の `<div>` に
 * 置き換えていたが、ProseMirror が管理する contentDOM を外側から書き換えると、
 * MutationObserver が「自分が作っていない変更」とみなして再パースし、コードブロックが
 * 別のノード（段落）に化けてしまっていた（`codeHighlightPlugin.ts` のコメント参照、
 * 同種の問題）。
 *
 * そこで、` ```mermaid ` コードブロックの**直後**（ノード終端位置）に
 * `Decoration.widget` として図の `<div>` を挿入する。ウィジェットは ProseMirror 自身が
 * 描画するため MutationObserver に検知されず、コードのソーステキストは
 * `<pre><code>` にそのまま残る（そのまま編集できる）。図はその**下**に表示される。
 *
 * `mermaid.render()` は非同期。ProseMirror は同じ `key`（ソーステキストから作る）を
 * 持つ decoration を「変わっていない」とみなし、**トランザクションを積み直しても
 * widget の toDOM ファクトリを再実行しない**（＝ dispatch で強制再描画しようとしても
 * 空のまま固定された widget DOM を使い回されてしまう）。そのため再描画の完了は
 * dispatch ではなく、**生成済みの widget DOM 要素を直接ここで覚えておいて後から
 * innerHTML を書き換える**方式にする（widget 自身の DOM を書き換えるのは
 * MutationObserver の監視対象外なので安全）。
 */
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import type { EditorView } from '@milkdown/prose/view';
import type { Node as ProseNode } from '@milkdown/prose/model';
import { $prose } from '@milkdown/utils';
import mermaid from 'mermaid';
import { attachMermaidNodeLabelEditing } from './mermaidNodeLabelEditor';

let enabled = true;

export function setMermaidEnabled(value: boolean): void {
    enabled = value;
}

const svgCache = new Map<string, string>();
const errorCache = new Set<string>();
const pending = new Set<string>();
// 同じソーステキストを持つ複数のコードブロック（重複した図）が同時に存在しうるので、
// 1 ソースにつき複数の widget DOM を保持する。
const liveElements = new Map<string, Set<HTMLElement>>();

function applyContent(div: HTMLElement, source: string): void {
    const svg = svgCache.get(source);
    if (svg) {
        div.classList.remove('mermaid-diagram-error');
        div.innerHTML = svg;
    } else if (errorCache.has(source)) {
        div.classList.add('mermaid-diagram-error');
        div.innerHTML = '';
    } else {
        div.innerHTML = '';
    }
}

function widgetFactory(source: string): (view: EditorView, getPos: () => number | undefined) => HTMLElement {
    return (view, getPos) => {
        const div = document.createElement('div');
        div.className = 'mermaid-diagram';
        div.contentEditable = 'false';
        let set = liveElements.get(source);
        if (!set) {
            set = new Set();
            liveElements.set(source, set);
        }
        set.add(div);
        applyContent(div, source);
        attachMermaidNodeLabelEditing(div, view, getPos);
        return div;
    };
}

function refreshLiveElements(source: string): void {
    const set = liveElements.get(source);
    if (!set) return;
    for (const el of set) applyContent(el, source);
}

function scheduleRender(source: string): void {
    if (svgCache.has(source) || errorCache.has(source) || pending.has(source)) return;
    pending.add(source);
    const id = `mermaid-${Math.random().toString(36).slice(2, 9)}`;
    void mermaid.render(id, source).then(
        ({ svg }) => {
            pending.delete(source);
            svgCache.set(source, svg);
            refreshLiveElements(source);
        },
        () => {
            pending.delete(source);
            errorCache.add(source);
            refreshLiveElements(source);
        }
    );
}

function buildDecorations(doc: ProseNode): DecorationSet {
    if (!enabled) return DecorationSet.empty;
    const decorations: Decoration[] = [];
    doc.descendants((node, pos) => {
        if (node.type.name !== 'code_block') return true;
        if (node.attrs.language === 'mermaid') {
            const source = node.textContent.trim();
            if (source) {
                scheduleRender(source);
                decorations.push(
                    Decoration.widget(pos + node.nodeSize, widgetFactory(source), {
                        side: 1,
                        // widget 内（SVG のノードラベル等）をマウスドラッグでネイティブ選択
                        // できるようにする。これが無いと ProseMirror の WidgetViewDesc が
                        // selection 変更を「無視すべきでない変更」として処理し直し、
                        // ユーザーが手動選択した内容を消してしまう。
                        // 詳細: docs/specifications/mermaid-text-selection-fix.md
                        ignoreSelection: true,
                        key: `mermaid-${source}`
                    })
                );
            }
        }
        return false; // コードブロックの中はこれ以上潜らない
    });
    return DecorationSet.create(doc, decorations);
}

const mermaidKey = new PluginKey<DecorationSet>('mermaidDiagram');

export function createMermaidDiagramPlugin() {
    return $prose(() => new Plugin({
        key: mermaidKey,
        state: {
            init: (_config, instance) => buildDecorations(instance.doc),
            apply: (tr, old) => (tr.docChanged ? buildDecorations(tr.doc) : old)
        },
        props: {
            decorations(state) {
                return mermaidKey.getState(state);
            }
        }
    }));
}
