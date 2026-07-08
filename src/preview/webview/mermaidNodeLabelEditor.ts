/**
 * `mermaidNodeLabelEdit.ts`（純関数）を DOM/ProseMirror に配線する。
 * 図の widget div に対して `attachMermaidNodeLabelEditing` を 1 回呼ぶと、
 * `.node`（Mermaid flowchart のノードグループ）のダブルクリックでインライン
 * ラベル編集ができるようになる。
 */
import type { EditorView } from '@milkdown/prose/view';
import type { Node as ProseNode } from '@milkdown/prose/model';
import { extractNodeIdFromSvgElementId, updateMermaidNodeLabel } from './mermaidNodeLabelEdit';

interface MermaidCodeBlockLocation {
    node: ProseNode;
    from: number;
    to: number;
}

/**
 * widget の現在位置（`getPos()` の呼び出し時点の値）から、直前にある
 * `language: 'mermaid'` の code_block ノードを逆引きする。widget 作成時点の
 * 位置をクロージャに固定してしまうと、無関係な編集でドキュメント位置がずれた際に
 * 誤動作するため、必ず呼び出し時点の `view.state` に対して解決する。
 */
function findMermaidCodeBlock(view: EditorView, widgetPos: number): MermaidCodeBlockLocation | null {
    const $pos = view.state.doc.resolve(Math.max(0, widgetPos - 1));
    for (let depth = $pos.depth; depth >= 0; depth--) {
        const node = $pos.node(depth);
        if (node.type.name === 'code_block' && node.attrs.language === 'mermaid') {
            const start = $pos.before(depth);
            return { node, from: start + 1, to: start + node.nodeSize - 1 };
        }
    }
    return null;
}

/**
 * 図の widget div にノードラベルのダブルクリック編集を配線する。
 * `.node`（Mermaid flowchart のノードグループ）をダブルクリックすると、
 * その場にインライン `<input>` を重ねて表示し、Enter/フォーカスアウトで確定、
 * Escape でキャンセルする。確定時はソースの mermaid コードブロックの対応ノードの
 * ラベルだけを書き換える（`updateMermaidNodeLabel`）。
 */
export function attachMermaidNodeLabelEditing(
    container: HTMLElement,
    view: EditorView,
    getPos: () => number | undefined
): void {
    container.addEventListener('dblclick', (event) => {
        const target = event.target as Element | null;
        const nodeEl = target?.closest('.node') ?? null;
        if (!nodeEl || !container.contains(nodeEl)) return;
        const nodeId = extractNodeIdFromSvgElementId(nodeEl.id);
        if (!nodeId) return;
        const labelEl = nodeEl.querySelector('.nodeLabel');
        if (!labelEl) return;
        const currentLabel = labelEl.textContent ?? '';

        event.preventDefault();
        event.stopPropagation();

        const rect = labelEl.getBoundingClientRect();
        const input = document.createElement('input');
        input.className = 'mermaid-node-label-editor';
        input.value = currentLabel;
        input.style.left = `${rect.left}px`;
        input.style.top = `${rect.top}px`;
        input.style.width = `${Math.max(rect.width, 40)}px`;
        input.style.height = `${Math.max(rect.height, 20)}px`;

        let settled = false;
        const commit = (): void => {
            if (settled) return;
            settled = true;
            input.remove();
            const newLabel = input.value.trim();
            if (!newLabel || newLabel === currentLabel) return;
            const pos = getPos();
            if (pos === undefined) return;
            const location = findMermaidCodeBlock(view, pos);
            if (!location) return;
            const source = location.node.textContent;
            const newSource = updateMermaidNodeLabel(source, nodeId, newLabel);
            if (newSource !== source) {
                view.dispatch(view.state.tr.insertText(newSource, location.from, location.to));
            }
        };
        const cancel = (): void => {
            if (settled) return;
            settled = true;
            input.remove();
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                commit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancel();
            }
        });
        input.addEventListener('blur', () => commit());
        input.addEventListener('mousedown', (e) => e.stopPropagation());
        input.addEventListener('dblclick', (e) => e.stopPropagation());

        document.body.appendChild(input);
        input.focus();
        input.select();
    });
}
