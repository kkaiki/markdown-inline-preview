/**
 * 各行（トップレベルブロック＋リスト項目）の左ガターに「表示要素の連番」を出す。
 *
 * ソース Markdown の行番号とは対応しない。1, 2, 3, ... と隙間なく振るだけ
 * （blank-line-preservation.md）。「行番号を出すべき要素」＝トップレベルブロックと、
 * その中のリスト項目（再帰）。ソースの空行は blankLineRemarkPlugin により実体のある
 * 空 paragraph としてトップレベルブロックに復元されるため、このループが自然に拾い、
 * 連番の中に含まれる。
 *
 * - 行番号は `Decoration.widget`（side:-1）で各要素の先頭に挿入する。
 *   focusSyntaxPlugin / blockPrefixEditPlugin が使う `::before` と衝突しないようにするため。
 * - docChanged 時のみ再計算してキャッシュする（decorations は選択変更でも呼ばれるため）。
 */
import { Plugin, PluginKey } from '@milkdown/prose/state';
import type { Node as ProseNode } from '@milkdown/prose/model';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';

/** 行番号を出す位置と番号。pos は widget を置くドキュメント位置。 */
export interface LineAnchor {
    pos: number;
    line: number;
}

function isListNode(node: ProseNode): boolean {
    const n = node.type.name;
    return n === 'bullet_list' || n === 'ordered_list';
}

/**
 * doc 内の「行番号を出す要素」を文書順に集め、1 から連番を振る。
 * トップレベルブロックに加え、リストの直下項目（再帰）にも番号を付ける。
 */
export function computeLineAnchors(doc: ProseNode): LineAnchor[] {
    const anchors: LineAnchor[] = [];
    let line = 1;

    // リスト項目（再帰）に連番を振る。
    const walkList = (listNode: ProseNode, listOffset: number): void => {
        listNode.forEach((child, childRelOffset) => {
            if (child.type.name === 'list_item') {
                // list_item の中身先頭（最初の子の中）に widget を置く。
                const itemAbsOffset = listOffset + 1 + childRelOffset;
                anchors.push({ pos: itemAbsOffset + 1, line: line++ });

                // 項目内にネストしたリストがあれば再帰。
                child.forEach((grand, grandRelOffset) => {
                    if (isListNode(grand)) {
                        const grandAbsOffset = itemAbsOffset + 1 + grandRelOffset;
                        walkList(grand, grandAbsOffset);
                    }
                });
            }
        });
    };

    doc.forEach((node, offset) => {
        if (isListNode(node)) {
            walkList(node, offset);
        } else {
            anchors.push({ pos: offset + 1, line: line++ });
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

export function createLineNumberGutterPlugin() {
    return $prose(() => {
        let cache: { doc: ProseNode; anchors: LineAnchor[] } | null = null;
        return new Plugin({
            key: new PluginKey('lineNumberGutter'),
            props: {
                decorations(state) {
                    if (!cache || cache.doc !== state.doc) {
                        cache = { doc: state.doc, anchors: computeLineAnchors(state.doc) };
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
