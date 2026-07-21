/**
 * `blankLineRemarkPlugin.ts` が空行1つごとに作る「真に空の段落」（blank-line-preservation.md）は
 * 見た目には存在しない透明な区切りだが、これが実ノードとしてドキュメントに挟まると、
 * textblock 末尾/先頭での Delete/Backspace が「ユーザーが本当にマージしたい隣の
 * ブロック」ではなく、まずこの空段落自身にぶつかってしまう。結果として、以前は
 * 1回の操作で済んでいた「次（前）のブロックを取り込む」操作に余分な1回が必要になる
 * （例: チェックリスト末尾で Delete → 本来は直後の段落が新規項目として取り込まれるはずが、
 * 間の空行プレースホルダを消すだけで終わる）。
 *
 * ここでは、トップレベルブロックの末尾（Delete）/先頭（Backspace）でその操作を行う
 * 直前に、隣接する「真に空のプレースホルダ段落」だけを黙って取り除き、event は
 * 消費せず（`false` を返し）既定の Delete/Backspace 処理へそのまま続ける。
 * こうすることで、ユーザーからは元通り1回の操作で隣のブロックが取り込まれるように見える。
 *
 * 文書の最後の子（`paragraphSchema.toMarkdown` が空行として保存しない特別扱いの対象）は
 * スキップ対象から除く（意味を持たない末尾の空段落を暗黙に消してしまわないため）。
 */
import { Plugin, PluginKey } from '@milkdown/prose/state';
import type { Node as ProseNode, ResolvedPos } from '@milkdown/prose/model';
import { $prose } from '@milkdown/utils';

function isBlankPlaceholder(node: ProseNode | null | undefined): node is ProseNode {
    return !!node && node.type.name === 'paragraph' && node.content.size === 0;
}

/**
 * `$from` が「トップレベルブロック（depth=1）の内容の末尾」にあるかどうか。
 * 生の位置比較（`$from.pos === $from.end(1)`）は、末尾のテキストブロックの後ろに
 * まだ閉じタグ分の“構造上のギャップ”（list_item/bullet_list 等のネストの数だけ）が
 * 残るため使えない。ここでは代わりに、直接の親（textblock）の末尾にいること、かつ
 * それ以降の各祖先が自分の親の「最後の子」であることを depth をたどって確認する。
 */
function isAtEndOfTopLevelNode($from: ResolvedPos): boolean {
    if ($from.parentOffset !== $from.parent.content.size) return false;
    for (let d = $from.depth; d > 1; d--) {
        if ($from.index(d - 1) !== $from.node(d - 1).childCount - 1) return false;
    }
    return true;
}

/** `isAtEndOfTopLevelNode` の先頭版。 */
function isAtStartOfTopLevelNode($from: ResolvedPos): boolean {
    if ($from.parentOffset !== 0) return false;
    for (let d = $from.depth; d > 1; d--) {
        if ($from.index(d - 1) !== 0) return false;
    }
    return true;
}

export function createBlankLinePlaceholderSkipPlugin() {
    return $prose(() => new Plugin({
        key: new PluginKey('blankLinePlaceholderSkip'),
        props: {
            handleKeyDown(view, event) {
                if (event.key !== 'Delete' && event.key !== 'Backspace') return false;
                const { state } = view;
                const { $from, empty } = state.selection;
                if (!empty || $from.depth === 0) return false;

                const doc = state.doc;

                if (event.key === 'Delete') {
                    if (!isAtEndOfTopLevelNode($from)) return false;
                    const after = $from.after(1);
                    if (after >= doc.content.size) return false; // 文書末尾
                    const next = doc.nodeAt(after);
                    if (!isBlankPlaceholder(next) || after + next.nodeSize >= doc.content.size) return false;
                    view.dispatch(state.tr.delete(after, after + next.nodeSize));
                    return false;
                }

                // Backspace
                if (!isAtStartOfTopLevelNode($from)) return false;
                const before = $from.before(1);
                if (before <= 0) return false;
                let prevStart = -1;
                let prevNode: ProseNode | null = null;
                doc.forEach((node, offset) => {
                    if (offset + node.nodeSize === before) { prevStart = offset; prevNode = node; }
                });
                if (!isBlankPlaceholder(prevNode)) return false;
                view.dispatch(state.tr.delete(prevStart, before));
                return false;
            }
        }
    }));
}
