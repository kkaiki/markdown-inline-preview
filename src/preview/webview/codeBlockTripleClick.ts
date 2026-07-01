/**
 * コードブロック内のトリプルクリックで「その行だけ」を選択する。
 *
 * ProseMirror では code_block は **1 つのテキストブロック**（複数行が 1 ノードに `\n` 区切りで
 * 入る）なので、既定のトリプルクリック（＝テキストブロック全選択）だと**コードブロック全体**が
 * 選択されてしまう。ここでは handleTripleClick を横取りし、クリックした行（前後の `\n` に挟まれた
 * 範囲）だけを選ぶ。
 */
import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';
import { $prose } from '@milkdown/utils';
import { lineRangeAt } from '../../shared/preview/codeBlockLines';

export function createCodeBlockTripleClickPlugin() {
    return $prose(() => new Plugin({
        key: new PluginKey('codeBlockTripleClick'),
        props: {
            handleTripleClick(view, pos) {
                const { doc } = view.state;
                const clampedPos = Math.max(0, Math.min(pos, doc.content.size));
                const $pos = doc.resolve(clampedPos);
                for (let d = $pos.depth; d > 0; d--) {
                    if ($pos.node(d).type.name !== 'code_block') continue;
                    const contentStart = $pos.start(d);
                    const text = $pos.node(d).textContent;
                    const { start, end } = lineRangeAt(text, clampedPos - contentStart);
                    view.dispatch(
                        view.state.tr.setSelection(
                            TextSelection.create(doc, contentStart + start, contentStart + end)
                        )
                    );
                    return true; // 既定（ブロック全選択）を抑止
                }
                return false; // コードブロック外は既定どおり
            }
        }
    }));
}
