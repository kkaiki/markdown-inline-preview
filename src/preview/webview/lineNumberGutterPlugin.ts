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
 *   focusSyntaxPlugin / blockPrefixEditPlugin が使う `::before` と衝突しないようにするため。
 * - docChanged 時のみ再計算してキャッシュする（decorations は選択変更でも呼ばれるため。
 *   remark の再パースもこのキャッシュ判定の内側でのみ行う）。
 */
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Fragment, Slice, type Node as ProseNode } from '@milkdown/prose/model';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';
import { remarkCtx, serializerCtx } from '@milkdown/kit/core';
import type { Ctx } from '@milkdown/ctx';
import type { Code, List, Root, RootContent } from 'mdast';
import { stripListItemPlaceholderBr, stripPlaceholderLineBreaks, tightenListSpacing } from '../../shared/markdown/lineBreaks';
import { parseCodeFenceRealText } from '../../shared/markdown/focusSyntaxHelpers';
import { getExpandedCodeFence } from './codeFenceEditPlugin';
import { getExpandedBlock } from './blockPrefixEditPlugin';

/** 行番号を出す位置と番号。pos は widget を置くドキュメント位置。 */
export interface LineAnchor {
    pos: number;
    line: number;
    /** コードフェンス行として常時表示する文字列。 */
    fence?: string;
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
 * expandedNodePos は codeFenceEditPlugin が現在実テキスト展開中の code_block の nodePos
 * （展開が無ければ null）。展開中のブロックはフェンスが実テキストとして見えているので、
 * 常時表示フェンス widget を重ねない。内容の文字列からの推定（`` ^``` ``〜`` ```$ `` の
 * 正規表現）は使わない — 内容自体が完全なネストフェンス形を持つブロックで誤発動し、
 * 非フォーカス時に外側フェンスが消えてしまうため。
 */
export function computeLineAnchors(
    doc: ProseNode,
    realLines: RealLineEntry[] = [],
    expandedNodePos: number | null = null
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
            const expandedAsRealText = offset === expandedNodePos;
            let runningOffset = 0;

            if (expandedAsRealText) {
                // フォーカス中は codeFenceEditPlugin がフェンスを実テキスト化している。
                // 常時表示 widget は重ねず、実テキスト各行にだけ番号を付ける。
                physicalLines.forEach((lineText, i) => {
                    const line = lines[i] ?? fallbackLine++;
                    anchors.push({ pos: contentStart + runningOffset, line });
                    runningOffset += lineText.length + 1;
                });
            } else {
                const language = typeof node.attrs.language === 'string' ? node.attrs.language : '';
                anchors.push({
                    pos: contentStart,
                    line: lines[0] ?? fallbackLine++,
                    fence: `\`\`\`${language}`
                });
                physicalLines.forEach((lineText, i) => {
                    const line = lines[i + 1] ?? fallbackLine++;
                    anchors.push({ pos: contentStart + runningOffset, line });
                    runningOffset += lineText.length + 1;
                });
                anchors.push({
                    pos: contentStart + node.textContent.length,
                    line: lines[physicalLines.length + 1] ?? fallbackLine++,
                    fence: '```'
                });
            }
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
 * 展開中（実テキスト化中）の code_block を、行番号の再パース専用に「折り畳んだ」形へ戻す。
 *
 * `codeFenceEditPlugin` はフォーカス中、開き・閉じフェンス（`` ```lang `` / `` ``` ``）を
 * ノードの内容へ**実テキストとして**挿入する（`expandBlock`）。この状態のまま
 * `serializerCtx` で直列化すると、code_block の内容自体が `` ``` `` を含むことになり、
 * commonmark シリアライザは曖昧さ回避のためフェンスを広げて（4個以上の バッククォート）
 * 二重にネストしたフェンスとして出力する。二重フェンスぶん（開き・閉じで2行）だけ
 * 再パース結果の行数が実際のソースより多くなり、この code_block 以降の**すべての**
 * 要素の実ソース行番号が本来より大きい値にズレる（2026-07-24 ユーザー報告）。
 * ファイルへ実際に書き戻される内容（`postChange`）は展開中も常に折り畳み済みの形なので、
 * 行番号計算もそれに合わせて折り畳んだ内容で再パースする。
 * 画面上の展開表示自体は `computeLineAnchors` が `state.doc`（折り畳んでいない実体）を
 * 直接見て処理するため、ここでの折り畳みは行番号計算専用の使い捨てコピーに閉じている。
 */
function collapseExpandedFenceForReparse(doc: ProseNode, expandedNodePos: number | null): ProseNode {
    if (expandedNodePos === null) return doc;
    const node = doc.nodeAt(expandedNodePos);
    if (!node || node.type.name !== 'code_block') return doc;
    const parsed = parseCodeFenceRealText(node.textContent);
    if (!parsed) return doc;
    const contentStart = expandedNodePos + 1;
    const contentEnd = expandedNodePos + node.nodeSize - 1;
    const content = parsed.code.length > 0 ? Fragment.from(doc.type.schema.text(parsed.code)) : Fragment.empty;
    return doc.replace(contentStart, contentEnd, new Slice(content, 0, 0));
}

/**
 * フォーカスで記法展開中のブロックプレフィックス（`## ` / `2. ` / `> `）を、行番号の
 * 再パース専用に取り除く。
 *
 * `blockPrefixEditPlugin` はフォーカス中の見出し/リスト項目/引用に、その Markdown
 * プレフィックスを**実テキストとして**ノード内容へ挿入する。この状態のまま直列化すると、
 * 特にリスト項目は `2. 2. two` のように記法が二重になり、再パース結果には**入れ子の
 * リスト**が現れる。mdast 側の要素数が doc 側の走査と合わなくなるため、そのブロック以降の
 * 行番号が重複・飛躍する（2026-07-26 ユーザー報告のスクリーンショットでは `87, 87, 94`）。
 * ファイルへ書き戻される内容（`postChange`）は展開中も常にプレフィックス無しなので、
 * 行番号計算もそれに合わせる。`collapseExpandedFenceForReparse` と同じ発想で、
 * 使い捨てのコピーに閉じた変換。
 */
function stripExpandedPrefixForReparse(
    doc: ProseNode,
    expanded: { contentStart: number; prefix: string } | null
): ProseNode {
    if (!expanded || expanded.prefix.length === 0) return doc;
    const from = expanded.contentStart;
    const to = from + expanded.prefix.length;
    if (to > doc.content.size) return doc;
    try {
        return doc.replace(from, to, Slice.empty);
    } catch {
        // 展開情報と doc がまだ同期していない過渡状態では位置が不正になりうる。
        // 行番号がその瞬間だけ元のまま（＝従来の挙動）になるだけなので握り潰す。
        return doc;
    }
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
function parseCurrentDocAsMdast(ctx: Ctx, doc: ProseNode, expandedNodePos: number | null): Root {
    const serialize = ctx.get(serializerCtx);
    const remark = ctx.get(remarkCtx);
    // カーソルは常に1箇所なので、コードフェンス展開とブロックプレフィックス展開が
    // 同時に起きることはない（どちらの位置も生の doc 基準なので、片方だけ適用すれば
    // 位置ズレも起きない）。
    const prepared = expandedNodePos !== null
        ? collapseExpandedFenceForReparse(doc, expandedNodePos)
        : stripExpandedPrefixForReparse(doc, getExpandedBlock());
    const rawMarkdown = serialize(prepared);
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
                        const expandedNodePos = getExpandedCodeFence()?.nodePos ?? null;
                        const tree = parseCurrentDocAsMdast(ctx, state.doc, expandedNodePos);
                        const realLines = computeRealLineEntries(tree);
                        // 展開・collapse は必ず docChanged を伴うため、doc をキーにした
                        // このキャッシュで展開状態の変化も漏れなく再計算される。
                        cache = {
                            doc: state.doc,
                            anchors: computeLineAnchors(state.doc, realLines, expandedNodePos)
                        };
                    }
                    const decorations = cache.anchors.map((a, i) =>
                        // key にフェンス文字列も含める。純粋な行番号 widget とフェンス widget が
                        // 同一 (i, pos, line) になり得る（例: フォーカスでフェンスが実テキスト
                        // 展開された直後）ため、key が衝突すると ProseMirror が古いフェンス
                        // DOM を使い回し、実テキストのフェンスの上に widget が重なって見える。
                        Decoration.widget(a.pos, lineNumberWidget(a.line, a.fence), {
                            side: -1,
                            key: `ln-${i}-${a.pos}-${a.line}-${a.fence ?? ''}`
                        })
                    );
                    return DecorationSet.create(state.doc, decorations);
                }
            }
        });
    });
}
