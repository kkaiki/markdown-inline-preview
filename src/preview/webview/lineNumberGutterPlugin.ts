/**
 * 各行（トップレベルブロック＋リスト項目）の左ガターに「ソース Markdown 上の実際の行番号」を出す。
 *
 * Raw モード（CodeMirror）が表示する行番号と一致させる（blank-line-preservation.md 3節）。
 * 「行番号を出すべき要素」＝トップレベルブロックと、その中のリスト項目（再帰）。ソースの
 * 空行は blankLineRemarkPlugin により実体のある空 paragraph としてトップレベルブロックに
 * 復元されるため、このループが自然に拾い、その空行自身の実ソース行番号を表示する
 * （合成ノードのため mdast 上 position を持たず、周囲の実ノードから補間する）。
 * 表（table）・コードブロック（code_block）のように複数の物理行にまたがる要素は、
 * ブロック全体で1個ではなく、実際に表示される行ごとに1個の番号を出す
 * （blank-line-preservation.md 4節）。
 *
 * 行番号の取得方法: milkdown が内部でドキュメントを ProseMirror doc に変換する際に使う
 * `remarkCtx`（gfm・blankLineRemarkPlugin を含む、登録済み全 remark プラグインが反映された
 * 単一の unified プロセッサ）を再利用し、現在の doc から `serializerCtx` で得た Markdown
 * テキストをもう一度パースし直すことで、mdast ノードの `.position`（行番号）を取得する。
 * milkdown 組み込みの `parseMarkdown` ランナーは `.position` を ProseMirror ノードの attrs
 * に伝播しないため、doc→ProseMirror 変換パイプラインとは別に、この「並行パース」で行番号
 * だけを取り出し、既存の ProseMirror 走査（computeLineAnchors）と文書順のインデックス対応
 * でzipする。
 *
 * - 行番号は `Decoration.widget`（side:-1）で各要素の先頭に挿入する。
 *   focusSyntaxPlugin が使う `::before` と衝突しないようにするため。
 * - docChanged 時のみ再計算してキャッシュする（decorations は選択変更でも呼ばれるため。
 *   remark の再パースもこのキャッシュ判定の内側でのみ行う）。
 */
import { Plugin, PluginKey } from '@milkdown/prose/state';
import type { Node as ProseNode } from '@milkdown/prose/model';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';
import { remarkCtx, serializerCtx } from '@milkdown/kit/core';
import type { Ctx } from '@milkdown/ctx';
import type { Code, List, Root, RootContent } from 'mdast';
import { stripListItemPlaceholderBr, stripPlaceholderLineBreaks, tightenListSpacing } from '../../shared/markdown/lineBreaks';
// 表示用フェンスの長さは保存側（remark-stringify）と同じ規則で計算する。3連固定だと
// 内容に ``` を含むブロックでフェンス行が二重に見える（code-fence-display-length-fix.md）。
import { codeFenceMarker } from '../../shared/markdown/codeFence';

/** 行番号を出す位置と番号。pos は widget を置くドキュメント位置。 */
export interface LineAnchor {
    pos: number;
    line: number;
    /** コードフェンス行として常時表示する文字列。 */
    fence?: string;
    /**
     * widget decoration の `side`（既定 -1 = その位置の手前に描画）。
     *
     * コードブロックの**閉じ**フェンスだけは +1（位置の後ろ）にする。-1 だと widget が
     * 「コード本文の終端位置の手前」に置かれ、本文全体を選択したときの DOM 上の選択終端が
     * widget の後ろに来るため、閉じフェンス行だけが選択ハイライトで塗られてしまう
     * （開きフェンスは選択開始位置の手前なので塗られない ＝ 非対称。2026-07-27 ユーザー報告）。
     */
    side?: number;
}

/**
 * mdast 側の「1要素（トップレベルブロック or リスト項目）につき1エントリ」の実行番号。
 * 表・コードブロックのみ、1エントリが複数の物理行分の番号をまとめて持つ（'multi'）。
 */
type RealLineEntry =
    | { kind: 'single'; line: number }
    | { kind: 'multi'; lines: number[] };

function isListNode(node: ProseNode): boolean {
    const n = node.type.name;
    return n === 'bullet_list' || n === 'ordered_list';
}

/**
 * フェンス付きコードブロックの本文各行の実ソース行番号。
 * 本 Preview の code_block シリアライズは常にフェンス形式になるため
 * （blank-line-preservation.md 4節）、本文1行目 = フェンス開始行 + 1 で確定する。
 */
function codeContentLineNumbers(code: Code): number[] {
    const startLine = code.position?.start.line;
    if (startLine === undefined || startLine === null) return [];
    const value = code.value ?? '';
    const bodyLines = value.split('\n').map((_, i) => startLine + 1 + i);
    const endLine = code.position?.end.line ?? startLine + bodyLines.length + 1;
    return [startLine, ...bodyLines, endLine];
}

/**
 * remark で再パースした mdast ツリーを、computeLineAnchors がたどる順序
 * （トップレベル要素＋リスト項目の再帰。リスト項目内部の複数行ブロックは対象外）と
 * 1エントリずつ対応する「実行番号エントリ」の配列に変換する。
 *
 * 空行から復元された空 paragraph（blankLineRemarkPlugin、position 無し）は、直前の実ノード
 * （position を持つ最後のノード）の終了行から補間する。空 paragraph はソースの空行と 1:1 に
 * 対応するため（blank-line-preservation.md §1・§10）、この区間内 k 番目（0始まり）の
 * 空 paragraph の行番号は「直前の実ノードの終了行 + 1 + k」。
 */
export function computeRealLineEntries(tree: Root): RealLineEntry[] {
    const entries: RealLineEntry[] = [];
    let lastRealEndLine: number | undefined;
    let blankRunIndex = 0;

    const trackReal = (endLine: number | undefined): void => {
        if (endLine === undefined) return;
        lastRealEndLine = endLine;
        blankRunIndex = 0;
    };

    const singleLineFor = (node: RootContent): number => {
        const pos = node.position;
        if (pos) {
            trackReal(pos.end.line);
            return pos.start.line;
        }
        const line = (lastRealEndLine ?? 0) + 1 + blankRunIndex;
        blankRunIndex++;
        return line;
    };

    const walkList = (list: List): void => {
        for (const item of list.children) {
            entries.push({ kind: 'single', line: singleLineFor(item) });
            for (const child of item.children) {
                if (child.type === 'list') walkList(child);
            }
        }
    };

    for (const node of tree.children) {
        if (node.type === 'list') {
            walkList(node);
        } else if (node.type === 'table') {
            entries.push({
                kind: 'multi',
                lines: node.children.map((row) => row.position?.start.line ?? 0)
            });
            trackReal(node.position?.end.line);
        } else if (node.type === 'code') {
            entries.push({ kind: 'multi', lines: codeContentLineNumbers(node) });
            trackReal(node.position?.end.line);
        } else if (node.type === 'paragraph' && node.position && node.position.end.line > node.position.start.line) {
            const startLine = node.position.start.line;
            entries.push({
                kind: 'multi',
                lines: Array.from(
                    { length: node.position.end.line - startLine + 1 },
                    (_, i) => startLine + i
                )
            });
            trackReal(node.position.end.line);
        } else {
            entries.push({ kind: 'single', line: singleLineFor(node) });
        }
    }

    return entries;
}

/**
 * doc 内の「行番号を出す要素」を文書順に集め、対応する実ソース行番号（realLines）を割り当てる。
 * トップレベルブロックに加え、リストの直下項目（再帰）にも番号を付ける。表・コードブロックは
 * 1ブロックにつき複数の widget（行ごと）を出す。
 *
 * realLines は computeRealLineEntries が返す、この関数の走査と同じ順序のエントリ配列。
 * 万一エントリが不足する場合（realLines と doc の構造が食い違う想定外のケース）は連番へ
 * フォールバックする（クラッシュを避けるための保険であり、通常は発生しない）。
 *
 */
export function computeLineAnchors(
    doc: ProseNode,
    realLines: RealLineEntry[] = []
): LineAnchor[] {
    if (realLines.length === 0 && doc.childCount === 1) {
        const first = doc.firstChild;
        if (first?.type.name === 'paragraph' && first.content.size === 0) return [];
    }

    const anchors: LineAnchor[] = [];
    let cursor = 0;
    let fallbackLine = realLines.reduce((max, entry) => {
        if (entry.kind === 'single') return Math.max(max, entry.line);
        return Math.max(max, ...entry.lines);
    }, 0) + 1;

    const nextEntry = (): RealLineEntry | undefined => realLines[cursor++];
    const singleLineOf = (entry: RealLineEntry | undefined): number =>
        entry && entry.kind === 'single' ? entry.line : fallbackLine++;
    const multiLinesOf = (entry: RealLineEntry | undefined): number[] =>
        entry && entry.kind === 'multi' ? entry.lines : [];

    // リスト項目（再帰）に実ソース行番号を振る。
    const walkList = (listNode: ProseNode, listOffset: number): void => {
        listNode.forEach((child, childRelOffset) => {
            if (child.type.name === 'list_item') {
                // list_item の中身先頭（最初の子の中）に widget を置く。
                const itemAbsOffset = listOffset + 1 + childRelOffset;
                anchors.push({ pos: itemAbsOffset + 1, line: singleLineOf(nextEntry()) });

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
        } else if (node.type.name === 'table') {
            const lines = multiLinesOf(nextEntry());
            node.forEach((row, rowRelOffset, rowIndex) => {
                const rowAbsOffset = offset + 1 + rowRelOffset;
                const line = lines[rowIndex] ?? fallbackLine++;
                anchors.push({ pos: rowAbsOffset + 1, line });
            });
        } else if (node.type.name === 'code_block') {
            const lines = multiLinesOf(nextEntry());
            const contentStart = offset + 1;
            const physicalLines = node.textContent.split('\n');
            let runningOffset = 0;

            const language = typeof node.attrs.language === 'string' ? node.attrs.language : '';
            const marker = codeFenceMarker(node.textContent);
            anchors.push({
                pos: contentStart,
                line: lines[0] ?? fallbackLine++,
                fence: `${marker}${language}`
            });
            physicalLines.forEach((lineText, i) => {
                const line = lines[i + 1] ?? fallbackLine++;
                anchors.push({ pos: contentStart + runningOffset, line });
                runningOffset += lineText.length + 1;
            });
            anchors.push({
                pos: contentStart + node.textContent.length,
                line: lines[physicalLines.length + 1] ?? fallbackLine++,
                fence: marker,
                // 本文全体を選択したときに閉じフェンス行まで青く塗られないよう、
                // 終端位置の「後ろ」に置く（LineAnchor.side のコメント参照）。
                //
                // ただし mermaid ブロックだけは従来どおり -1。図として描画される
                // （mermaidDiagramPlugin）ブロックでは、この widget を終端位置の後ろへ
                // 動かすと図内テキストのドラッグ選択が空になってしまうため
                // （test/browser/rendering/mermaidTextSelection.test.ts で検出）。
                // 図の中に「コード本文の最終行」は見えていないので、フェンス行が
                // 選択ハイライトに入る問題自体がそもそも起きない。
                side: language === 'mermaid' ? -1 : 1
            });
        } else {
            const entry = nextEntry();
            let hasHardbreak = false;
            if (node.isTextblock) {
                node.forEach((child) => {
                    if (child.type.name === 'hardbreak') hasHardbreak = true;
                });
            }
            if (hasHardbreak) {
                // mdast 再パースが何行と認識しているかに関わらず（Enter 直後、まだ何も
                // 入力していない状態では末尾 hardbreak が直列化 Markdown 上で脱落し、
                // entry.kind が 'multi' にならず 'single' になることがある）、実際に
                // hardbreak を持つ段落は必ずこの分岐に入り、先頭行 + hardbreak ごとの行を
                // widget として出す。基準となる実ソース行番号の配列は、entry の種別に
                // 応じて 'multi' なら entry.lines、それ以外は1要素配列にそろえる。
                const lines = entry?.kind === 'multi' ? entry.lines : [singleLineOf(entry)];
                anchors.push({ pos: offset + 1, line: lines[0] ?? fallbackLine++ });
                let lineIndex = 1;
                node.forEach((child, childOffset) => {
                    if (child.type.name !== 'hardbreak') return;
                    // 何も文字を打っていない末尾の hardbreak は、直列化した Markdown の
                    // 時点で「その行」が消える（改行を続ける対象が無いため）。そのため
                    // remark 再パースの lines がこの hardbreak 分だけ足りないことが
                    // ある（Enter を連打した直後、まだ何も入力していない状態）。この場合、
                    // 文書全体の最大行 + 1 という「グローバルな」フォールバックを使うと、
                    // 直後の実ブロック（既に実ソース行番号を持つ）より大きい保証が無く、
                    // 番号の前後関係が崩れる（例: 5, 3, 4 のように後退する）。同じ段落内の
                    // 直前の実行番号から連番で補うことで、少なくとも単調増加を保つ。
                    const line = lines[lineIndex]
                        ?? lines[lines.length - 1] + (lineIndex - (lines.length - 1));
                    anchors.push({
                        pos: offset + 1 + childOffset + child.nodeSize,
                        line
                    });
                    lineIndex++;
                });
            } else if (node.isLeaf) {
                // hr などの leaf ブロックは `offset + 1` がノードの外側（次位置）になり、
                // widget が表示対象行に紐付かないため、ノード直前へ置く。
                anchors.push({ pos: offset, line: singleLineOf(entry) });
            } else {
                anchors.push({ pos: offset + 1, line: singleLineOf(entry) });
            }
        }
    });

    return anchors;
}

function lineNumberWidget(n: number, fence?: string): () => HTMLElement {
    return () => {
        const el = document.createElement('span');
        if (fence !== undefined) {
            el.className = 'code-fence-display';
            const gutter = document.createElement('span');
            gutter.className = 'line-number-gutter';
            gutter.textContent = String(n);
            gutter.setAttribute('aria-hidden', 'true');
            el.append(gutter, document.createTextNode(fence));
        } else {
            el.className = 'line-number-gutter';
            el.textContent = String(n);
            el.setAttribute('aria-hidden', 'true');
        }
        el.contentEditable = 'false';
        el.setAttribute('aria-hidden', 'true');
        return el;
    };
}

/**
 * 現在の doc を、milkdown が使っているのと同じ remark パイプラインで再パースする。
 *
 * `serializerCtx` の素の出力は、milkdown の commonmark preset が loose リスト形式
 * （項目間に空行）や空 paragraph の `<br />` プレースホルダを使って直列化するため、
 * そのままではソースの tight リストや実際の空行本数と行番号が対応しない。
 * `postChange`（milkdownApp.ts）がファイルへ書き戻す際に使っているのと同じ正規化
 * （`tightenListSpacing` → `stripPlaceholderLineBreaks` → `stripListItemPlaceholderBr`）
 * を適用してから再パースすることで、Raw モードが実際に表示するテキストと同じ行番号を得る。
 */
function parseCurrentDocAsMdast(ctx: Ctx, doc: ProseNode): Root {
    const serialize = ctx.get(serializerCtx);
    const remark = ctx.get(remarkCtx);
    const rawMarkdown = serialize(doc);
    const markdown = stripListItemPlaceholderBr(stripPlaceholderLineBreaks(tightenListSpacing(rawMarkdown)));
    return remark.runSync(remark.parse(markdown), markdown) as Root;
}

export function createLineNumberGutterPlugin() {
    return $prose((ctx) => {
        let cache: { doc: ProseNode; anchors: LineAnchor[] } | null = null;
        return new Plugin({
            key: new PluginKey('lineNumberGutter'),
            props: {
                decorations(state) {
                    if (!cache || cache.doc !== state.doc) {
                        const tree = parseCurrentDocAsMdast(ctx, state.doc);
                        const realLines = computeRealLineEntries(tree);
                        cache = {
                            doc: state.doc,
                            anchors: computeLineAnchors(state.doc, realLines)
                        };
                    }
                    const decorations = cache.anchors.map((a, i) =>
                        // key にフェンス文字列も含める。純粋な行番号 widget とフェンス widget が
                        // 同一 (i, pos, line) になり得る（例: フォーカスでフェンスが実テキスト
                        // 展開された直後）ため、key が衝突すると ProseMirror が古いフェンス
                        // DOM を使い回し、実テキストのフェンスの上に widget が重なって見える。
                        Decoration.widget(a.pos, lineNumberWidget(a.line, a.fence), {
                            side: a.side ?? -1,
                            // key に side も含める。同じ (i, pos, line, fence) でも side が
                            // 違えば別の widget として作り直させる。
                            key: `ln-${i}-${a.pos}-${a.line}-${a.fence ?? ''}-${a.side ?? -1}`
                        })
                    );
                    return DecorationSet.create(state.doc, decorations);
                }
            }
        });
    });
}
