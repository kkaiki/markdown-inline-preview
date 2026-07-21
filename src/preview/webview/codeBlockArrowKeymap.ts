/**
 * コードブロック内での ↑/↓（縦移動）をブラウザのネイティブキャレット移動に任せず、
 * プレーンテキストの行計算で明示的に処理する。
 *
 * 背景: フォーカス中のコードブロックは開始行（```lang）/終了行（```）を
 * `contenteditable="false"` の widget として表示する（`focusSyntaxPlugin.ts`、
 * `code-fence-focus-markers.md`）。この widget には改行文字を含むテキストが入っており、
 * ネイティブのキャレット上下移動がこの widget をまたぐ際に DOM 位置を正しく解決できず、
 * **文書の先頭（position 1 付近）へキャレットが飛んでしまう実バグ**があった
 * （ユーザー報告、`codeBlockArrowUpJumpToTop.test.ts` で再現）。
 *
 * さらに widget が絡まない行同士の移動でも、`codeHighlightPlugin` の inline decoration
 * （hljs シンタックスハイライト）が行のレイアウトを複雑にし、ネイティブの
 * 「同じ列で1行上/下」の判定がコードブロック内の他の行を素通りして直前/直後の
 * ブロックまで一気に抜けてしまうことがあった（コードブロックが実質1行しかないかの
 * ように振る舞う）。
 *
 * そのため、コードブロック内にカーソル（または選択）があるときは ↑/↓ を常にここで
 * 処理し、`code_block` の生テキストを `lineRangeAt`（`codeBlockLines.ts`）で行分割して
 * 移動先を手動計算する。修飾キー付き（Shift 範囲選択・Cmd 等）は対象外（既存の
 * `tableArrowKeymap.ts` と同じ方針で、ネイティブ動作に委ねる）。
 */
import { Plugin, PluginKey, Selection, TextSelection } from '@milkdown/prose/state';
import type { EditorState, Selection as PMSelection } from '@milkdown/prose/state';
import type { Node as ProseNode } from '@milkdown/prose/model';
import { $prose } from '@milkdown/utils';
import { lineRangeAt } from '../../shared/preview/codeBlockLines';

/** カーソルのあるコードブロックの depth。無ければ -1。 */
function codeBlockDepthOf(state: EditorState): number {
    const { $head } = state.selection;
    for (let d = $head.depth; d > 0; d--) {
        if ($head.node(d).type.name === 'code_block') return d;
    }
    return -1;
}

/**
 * `blankLineRemarkPlugin.ts` が空行1つごとに作る「真に空の段落」は見た目には存在しない
 * 透明な区切りだが、実ノードとして挟まると、ブロックの外へ抜ける ArrowUp/Down が
 * 直前/直後の実際の段落ではなく、まずこの空段落自身に着地してしまう
 * （blank-line-preservation.md）。トップレベルの隣接ノードを辿って、連続する空
 * プレースホルダをすべて読み飛ばした先の位置を返す。
 */
function skipBlankPlaceholders(state: EditorState, pos: number, dir: 1 | -1): number {
    const doc = state.doc;
    let cur = pos;
    for (;;) {
        if (dir < 0) {
            let start = -1;
            let node: ProseNode | null = null;
            doc.forEach((n, offset) => {
                if (offset + n.nodeSize === cur) { start = offset; node = n; }
            });
            if (!node || node.type.name !== 'paragraph' || node.content.size !== 0) return cur;
            cur = start;
        } else {
            const node = doc.nodeAt(cur);
            if (!node || node.type.name !== 'paragraph' || node.content.size !== 0) return cur;
            cur += node.nodeSize;
        }
    }
}

/**
 * コードブロック内で縦移動（dir=1: 下 / dir=-1: 上）したときの移動先選択を返す。
 * - 同じブロック内に行があればそこへ（列位置はできる限り保持し、短い行にはクランプ）。
 * - 端の行（1行目で上 / 最終行で下）ならブロックの外（直前/直後）へ抜ける。
 * - コードブロック内でなければ null。
 */
export function codeBlockVerticalTarget(state: EditorState, dir: 1 | -1): PMSelection | null {
    const depth = codeBlockDepthOf(state);
    if (depth < 0) return null;

    const { $head } = state.selection;
    const node = $head.node(depth);
    const contentStart = $head.start(depth);
    const nodeStart = $head.before(depth);
    const nodeEnd = $head.after(depth);
    const text = node.textContent;
    const offset = $head.pos - contentStart;

    const { start: lineStart, end: lineEnd } = lineRangeAt(text, offset);
    const column = offset - lineStart;

    if (dir < 0) {
        if (lineStart === 0) {
            const target = skipBlankPlaceholders(state, nodeStart, -1);
            return Selection.near(state.doc.resolve(target), -1);
        }
        const prev = lineRangeAt(text, lineStart - 1);
        const targetOffset = prev.start + Math.min(column, prev.end - prev.start);
        return TextSelection.create(state.doc, contentStart + targetOffset);
    }

    if (lineEnd === text.length) {
        const target = skipBlankPlaceholders(state, nodeEnd, 1);
        return Selection.near(state.doc.resolve(target), 1);
    }
    const next = lineRangeAt(text, lineEnd + 1);
    const targetOffset = next.start + Math.min(column, next.end - next.start);
    return TextSelection.create(state.doc, contentStart + targetOffset);
}

export function createCodeBlockArrowKeymapPlugin() {
    return $prose(() => new Plugin({
        key: new PluginKey('codeBlockArrowKeymap'),
        props: {
            handleKeyDown(view, event) {
                if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return false;
                if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return false;
                const target = codeBlockVerticalTarget(view.state, event.key === 'ArrowDown' ? 1 : -1);
                if (!target) return false;
                view.dispatch(view.state.tr.setSelection(target).scrollIntoView());
                return true;
            }
        }
    }));
}
