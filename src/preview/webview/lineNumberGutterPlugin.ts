/**
 * 各行（トップレベルブロック＋リスト項目）の左ガターに「ソース Markdown の行番号」を出す。
 *
 * Preview は WYSIWYG なので Raw のような全行番号は出せない（空行は要素として存在せず、
 * 1 ブロックが複数ソース行にまたがる）。そこで「行番号を出すべき要素」＝トップレベル
 * ブロックと、その中のリスト項目（再帰）ごとに、対応するソース行の開始番号を出す。
 *
 * - 行番号は `Decoration.widget`（side:-1）で各要素の先頭に挿入する。
 *   focusSyntaxPlugin / blockPrefixEditPlugin が使う `::before` と衝突しないようにするため。
 * - 開始行は「各ブロックを Markdown 直列化した行数」を累積して求める。リスト内は直列化結果を
 *   行マーカーで分割して項目ごとに割り当てる。完璧な一致ではなく目安（ブロック間に空行 1 つを仮定）。
 * - docChanged 時のみ再計算してキャッシュする（decorations は選択変更でも呼ばれるため）。
 */
import { Plugin, PluginKey } from '@milkdown/prose/state';
import type { Node as ProseNode } from '@milkdown/prose/model';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';

export interface LineNumberGutterDeps {
    /** トップレベルブロック 1 つを Markdown 化する（行数カウント用）。失敗時は textContent でよい。 */
    serializeBlock: (node: ProseNode) => string;
}

/** 行番号を出す位置と番号。pos は widget を置くドキュメント位置。 */
export interface LineAnchor {
    pos: number;
    line: number;
}

function isListNode(node: ProseNode): boolean {
    const n = node.type.name;
    return n === 'bullet_list' || n === 'ordered_list';
}

/** リストの直列化結果から、各「直下項目」が始まる行のインデックス（0 始まり）を返す。 */
function directItemLineOffsets(listMarkdown: string): number[] {
    const lines = listMarkdown.replace(/\n+$/, '').split('\n');
    // 直下項目の行頭インデント＝最小インデント。ネスト項目はそれより深い。
    let minIndent = Infinity;
    const markerRe = /^(\s*)(?:[-*+]|\d+[.)])\s/;
    for (const line of lines) {
        const m = markerRe.exec(line);
        if (m) minIndent = Math.min(minIndent, m[1].length);
    }
    if (minIndent === Infinity) return [0];
    const offsets: number[] = [];
    lines.forEach((line, i) => {
        const m = markerRe.exec(line);
        if (m && m[1].length === minIndent) offsets.push(i);
    });
    return offsets.length ? offsets : [0];
}

/**
 * doc 内の「行番号を出す要素」を文書順に集め、各要素の開始ソース行を割り当てる。
 * トップレベルブロックに加え、リストの直下項目（再帰）にも番号を付ける。
 */
export function computeLineAnchors(
    doc: ProseNode,
    serializeBlock: (node: ProseNode) => string
): LineAnchor[] {
    const anchors: LineAnchor[] = [];
    let line = 1;

    const safeSerialize = (node: ProseNode): string => {
        try {
            return serializeBlock(node);
        } catch {
            return node.textContent;
        }
    };

    // リスト（その項目）を処理し、消費した行数だけ line を進める。
    const walkList = (listNode: ProseNode, listOffset: number, startLine: number): number => {
        const listMd = safeSerialize(listNode);
        const itemOffsets = directItemLineOffsets(listMd);
        const totalLines = listMd.replace(/\n+$/, '').split('\n').length;

        let itemSeq = 0; // 直下 list_item の通し番号
        listNode.forEach((child, childRelOffset) => {
            if (child.type.name === 'list_item') {
                const itemStartLine = startLine + (itemOffsets[itemSeq] ?? itemSeq);
                // list_item の中身先頭（最初の子の中）に widget を置く。
                // pos = listOffset(リスト開き) + 1 ではなく、子の絶対 offset を使う。
                const itemAbsOffset = listOffset + 1 + childRelOffset;
                anchors.push({ pos: itemAbsOffset + 1, line: itemStartLine });

                // 項目内にネストしたリストがあれば再帰（おおよその行で）。
                child.forEach((grand, grandRelOffset) => {
                    if (isListNode(grand)) {
                        const grandAbsOffset = itemAbsOffset + 1 + grandRelOffset;
                        // ネストリストの開始行は項目開始行の次行付近。厳密一致は諦め目安。
                        walkList(grand, grandAbsOffset, itemStartLine + 1);
                    }
                });
                itemSeq++;
            }
        });
        return startLine + totalLines;
    };

    doc.forEach((node, offset) => {
        if (isListNode(node)) {
            line = walkList(node, offset, line) + 1; // +1 = ブロック間の空行
        } else {
            anchors.push({ pos: offset + 1, line });
            const consumed = safeSerialize(node).replace(/\n+$/, '').split('\n').length;
            line += consumed + 1;
        }
    });

    return anchors;
}

function lineNumberWidget(n: number): () => HTMLElement {
    return () => {
        const el = document.createElement('span');
        el.className = 'line-number-gutter';
        el.textContent = String(n);
        el.contentEditable = 'false';
        el.setAttribute('aria-hidden', 'true');
        return el;
    };
}

export function createLineNumberGutterPlugin(deps: LineNumberGutterDeps) {
    return $prose(() => {
        let cache: { doc: ProseNode; anchors: LineAnchor[] } | null = null;
        return new Plugin({
            key: new PluginKey('lineNumberGutter'),
            props: {
                decorations(state) {
                    if (!cache || cache.doc !== state.doc) {
                        cache = { doc: state.doc, anchors: computeLineAnchors(state.doc, deps.serializeBlock) };
                    }
                    const decorations = cache.anchors.map((a, i) =>
                        Decoration.widget(a.pos, lineNumberWidget(a.line), {
                            side: -1,
                            key: `ln-${i}-${a.pos}-${a.line}`
                        })
                    );
                    return DecorationSet.create(state.doc, decorations);
                }
            }
        });
    });
}
