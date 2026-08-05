/**
 * トリプルクリックで「クリックした1行」だけを選択する。
 *
 * 2つの理由で ProseMirror 既定（＝テキストブロック全体を選択）だと広すぎる:
 *
 * - `code_block` は複数行が 1 ノードに `\n` 区切りで入るため、既定だとコードブロック
 *   全体が選択される。
 * - この Preview は Enter を段落内の改行（hardbreak）にしているため、見た目で十数行
 *   ある文章が 1 つの paragraph ノードになっている。既定だと「3回クリックすると
 *   全部選択される」ように見える（2026-07-27 ユーザー報告）。
 *
 * どちらも「行」の境界（code_block は `\n`、それ以外は hardbreak）で挟まれた範囲だけを
 * 選ぶようにする。1行しか無いブロックでは従来どおりブロックのテキスト全体になる。
 */
import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';
import type { Node as ProseNode } from '@milkdown/prose/model';
import { $prose } from '@milkdown/utils';
import { lineRangeAt } from '../../shared/preview/codeBlockLines';

/**
 * テキストブロック内の相対位置 `rel` が属する「行」の範囲を、hardbreak を境界として返す。
 * hardbreak が無ければブロック全体（0〜content.size）。
 */
export function hardbreakLineRange(node: ProseNode, rel: number): { start: number; end: number } {
    let start = 0;
    let end = node.content.size;
    let endFound = false;

    node.forEach((child, offset) => {
        if (child.type.name !== 'hardbreak') return;
        const brStart = offset;
        const brEnd = offset + child.nodeSize;
        if (brEnd <= rel) {
            start = brEnd;          // クリック位置より前の hardbreak → 行の開始を更新
        } else if (!endFound && brStart >= rel) {
            end = brStart;          // クリック位置より後の最初の hardbreak → 行の終わり
            endFound = true;
        }
    });

    return { start, end };
}

export function createCodeBlockTripleClickPlugin() {
    return $prose(() => new Plugin({
        key: new PluginKey('codeBlockTripleClick'),
        props: {
            handleTripleClick(view, pos) {
                const { doc } = view.state;
                const clampedPos = Math.max(0, Math.min(pos, doc.content.size));
                const $pos = doc.resolve(clampedPos);
                for (let d = $pos.depth; d > 0; d--) {
                    const node = $pos.node(d);
                    if (!node.isTextblock) continue;

                    const contentStart = $pos.start(d);
                    const rel = clampedPos - contentStart;
                    const { start, end } = node.type.name === 'code_block'
                        ? lineRangeAt(node.textContent, rel)
                        : hardbreakLineRange(node, rel);

                    view.dispatch(
                        view.state.tr.setSelection(
                            TextSelection.create(doc, contentStart + start, contentStart + end)
                        )
                    );
                    return true; // 既定（ブロック全選択）を抑止
                }
                return false;
            }
        }
    }));
}
