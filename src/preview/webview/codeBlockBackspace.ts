/**
 * コードブロックの先頭で Backspace を押すと、コードブロックを解除して段落へ戻す
 * （= 「```」を消してコード装飾を外す）。heading の先頭 Backspace 降格と同じ発想。
 *
 * Preview ではコードブロックは独立ノードで、フォーカスしても ``` 自体は文字として存在せず
 * 編集（削除）できなかった。これで「コードブロックの解除」を Backspace でできるようにする。
 * 複数行のコードは改行を含む 1 段落になる。
 */
import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';
import type { EditorState } from '@milkdown/prose/state';
import { $prose } from '@milkdown/utils';
import { isCodeFenceEditActive } from './codeFenceEditPlugin';

/** コードブロックの先頭にカーソルがあれば、その depth を返す。無ければ -1。 */
export function codeBlockAtContentStart(state: EditorState): number {
    const { $from, empty } = state.selection;
    if (!empty) return -1;
    for (let depth = $from.depth; depth > 0; depth--) {
        if ($from.node(depth).type.name === 'code_block') {
            return $from.pos === $from.start(depth) ? depth : -1;
        }
    }
    return -1;
}

export function createCodeBlockBackspacePlugin() {
    return $prose(() => new Plugin({
        key: new PluginKey('codeBlockBackspace'),
        priority: 100,
        props: {
            handleKeyDown(view, event) {
                if (event.key !== 'Backspace') return false;
                // codeFenceEditPlugin が展開中は、実テキストとして挿入したフェンスを
                // 普通の Backspace で1文字ずつ編集させる（全消去時の段落化は
                // codeFenceEditPlugin の collapse 側が担当する）。
                if (isCodeFenceEditActive()) return false;

                const { state } = view;
                const depth = codeBlockAtContentStart(state);
                if (depth < 0) return false;

                const paragraphType = state.schema.nodes.paragraph;
                if (!paragraphType) return false;

                const codeBlock = state.selection.$from.node(depth);
                const text = codeBlock.textContent;
                const textNode = text ? state.schema.text(text) : undefined;
                const paragraph = paragraphType.create(null, textNode);

                const blockPos = state.selection.$from.before(depth);
                const tr = state.tr.replaceWith(blockPos, blockPos + codeBlock.nodeSize, paragraph);
                tr.setSelection(TextSelection.create(tr.doc, blockPos + 1));
                view.dispatch(tr.scrollIntoView());
                event.preventDefault();
                return true;
            }
        }
    }));
}
