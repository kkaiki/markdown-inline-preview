/**
 * フェンスコードブロック（```lang` 〜 ```）のフォーカス時「実テキスト編集化」プラグイン。
 * `blockPrefixEditPlugin`（見出し等の行頭プレフィックス）と対になる、コードブロック版。
 *
 * カーソルがコードブロックに入ると、開き（`` ```lang\n ``）・閉じ（`` \n``` ``）の両
 * フェンスを**実テキスト**としてブロックの内容へ挿入する。フォーカスが抜けたら、実テキスト
 * 全体を `parseCodeFenceRealText` で解析し、開き・閉じとも完全な形を保っていればマーカー
 * 文字を削除して `language` 属性を更新し、どちらか崩れていればフェンス記法をやめたとみなし
 * `code_block` を `paragraph` へ変換する（`codeBlockBackspace.ts` と同じ発想）。
 *
 * ### 設計上の注意
 * - `addToHistory: false` — undo 履歴を汚さない（`blockPrefixEditPlugin` と同じ方針）。
 * - `nodePos` だけを appendTransaction で追跡する。content の開始/終了は
 *   コード本文の長さに応じて可変なので、都度 `state.doc.nodeAt(nodePos)` から計算する
 *   （`blockPrefixEditPlugin` の `contentStart` 追跡とは異なり、固定オフセットが無い）。
 * - 選択が空でなくても、選択の両端が同じコードブロック内に収まっていれば展開を維持する
 *   （`inline-mark-focus-edit-fix.md` §3.1 と同じ理由・同じ bias 規則）。
 * - `focusSyntaxPlugin` の code_block widget 表示・`codeHighlightPlugin` のハイライト・
 *   `codeBlockBackspace.ts` の先頭 Backspace 解除は、いずれもこのプラグインが展開中かどうか
 *   （`isCodeFenceEditActive()` / `getExpandedCodeFence()`）を見て挙動を調整する。
 */
import type { Node as ProseNode } from '@milkdown/prose/model';
import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';

import { getCodeFenceMarkers, hasBoundaryFenceLine, parseCodeFenceRealText } from '../../shared/markdown/focusSyntaxHelpers';

const PLUGIN_META = 'codeFenceEdit';

export interface ExpandedCodeFence {
    /** 展開中の code_block ノードの pos（開きトークン直前）。 */
    nodePos: number;
}

let expanded: ExpandedCodeFence | null = null;

export function isCodeFenceEditActive(): boolean {
    return expanded !== null;
}

/** 展開中のコードブロック情報を取得（codeHighlightPlugin から参照）。 */
export function getExpandedCodeFence(): ExpandedCodeFence | null {
    return expanded;
}

/**
 * 展開中のフェンス実テキスト（`` ```lang\n `` と `` \n``` ``）の絶対位置レンジ。
 *
 * `previewDiffPlugin` が差分比較用シグネチャから除外するために使う。除外しないと、
 * 未編集のコードブロックにカーソルを入れただけで挿入されたフェンス行が HEAD 側との
 * 差分になり、フォーカス中だけ「変更（青バー）」が出る
 * （`docs/specifications/fixes/inline-mark-focus-edit-fix.md` §3.2 と同じ症状のフェンス版）。
 *
 * フェンスを編集途中で崩している場合（`parseCodeFenceRealText` が null）は、もはや
 * 「挿入したままのマーカー」ではないので除外しない（実編集として差分に出す）。
 */
export function getExpandedCodeFenceRanges(doc: ProseNode): Array<{ from: number; to: number }> {
    if (!expanded) return [];
    const node = doc.nodeAt(expanded.nodePos);
    if (!node || node.type.name !== 'code_block') return [];
    const parsed = parseCodeFenceRealText(node.textContent);
    if (!parsed) return [];

    const contentStart = expanded.nodePos + 1;
    const contentEnd = expanded.nodePos + node.nodeSize - 1;
    return [
        { from: contentStart, to: contentStart + parsed.openLen },
        { from: contentEnd - parsed.closeLen, to: contentEnd }
    ];
}

let onCollapseSync: (() => void) | null = null;

export function setOnCollapseSync(fn: (() => void) | null): void {
    onCollapseSync = fn;
}

function getFocusedCodeBlockPos(view: EditorView): number | null {
    const { state } = view;
    const { $from, $to, empty } = state.selection;

    let depth = -1;
    for (let d = $from.depth; d > 0; d--) {
        if ($from.node(d).type.name === 'code_block') { depth = d; break; }
    }
    if (depth < 0) return null;

    // mermaid コードブロックは図として描画され、その生テキストは mermaidDiagramPlugin が
    // 直接パースする（フェンス実テキストが混ざるとパースが壊れる）。ハイライトを
    // 付けない codeHighlightPlugin と同じ理由で、実テキスト展開の対象外にする。
    const language = $from.node(depth).attrs.language;
    if (language === 'mermaid') return null;

    const nodePos = $from.before(depth);

    // 内容自体の1行目/最終行が既にフェンス行（ネストフェンス等）のブロックは対象外。
    // preview の時点で内容の ``` が見えており、外側フェンスを実テキスト挿入すると
    // 同一に見えるフェンス行が2行並んでしまう（code-fence-real-text-edit-fix.md）。
    // この判定を expandBlock 側でなくここで行うのは、展開せずに expanded 状態だけが
    // 立つと collapse が内容からマーカーを剥ぎ取り／段落化してしまうため。
    // ただし「現在展開中のブロック自身」は判定しない — 展開中は挿入したマーカーに
    // よって内容が必ず ``` で始まるため、自分自身に反応して即 collapse してしまう。
    if (expanded?.nodePos !== nodePos && hasBoundaryFenceLine($from.node(depth).textContent)) {
        return null;
    }

    if (!empty) {
        // 選択の両端が同じコードブロック内に収まっている場合のみ展開を維持する
        // （複数ブロックにまたがる選択は対象外）。
        let toDepth = -1;
        for (let d = $to.depth; d > 0; d--) {
            if ($to.node(d).type.name === 'code_block') { toDepth = d; break; }
        }
        if (toDepth < 0 || $to.before(toDepth) !== nodePos) return null;
    }

    return nodePos;
}

function expandBlock(view: EditorView, nodePos: number): void {
    const { state } = view;
    const node = state.doc.nodeAt(nodePos);
    if (!node) return;
    const markers = getCodeFenceMarkers(node);
    if (!markers) return;

    const contentStart = nodePos + 1;
    const contentEnd = nodePos + node.nodeSize - 1;
    const openText = `${markers.open}\n`;
    const closeText = `\n${markers.close}`;

    const { empty, from: originalFrom, to: originalTo, anchor: originalAnchor } = state.selection;
    let tr = state.tr;
    tr = tr.insert(contentEnd, state.schema.text(closeText));
    tr = tr.insert(contentStart, state.schema.text(openText));

    // 選択の維持。範囲選択なら開始 +1・終了 -1 で、新しく挿入したマーカー文字を
    // 選択に巻き込まないようにする（inlineMarkEditPlugin.expandBlock と同じ規則）。
    //
    // 空選択（カーソルのみ）の場合、コードフェンスは開き・閉じの**両方**の挿入位置
    // （contentStart / contentEnd）を持つ点が inlineMarkEditPlugin と異なる。
    // カーソルがちょうど contentStart と一致する（＝コード本文の一番先頭にいた）場合、
    // bias -1 で単純に処理すると、後から挿入する開きマーカーの**前**（ブロックの本当の
    // 先頭）へ弾き飛ばされてしまう。この場合はカーソルが「開きマーカーの直後 = 実際の
    // コード本文の先頭」に留まってほしいので bias +1 を使う。逆にカーソルが
    // contentEnd 側（またはそれ以外の本文中）にある場合は、閉じマーカーの挿入位置と
    // 一致していても本文側に留まってほしいので bias -1 のままでよい。
    let newAnchor: number;
    let newHead: number;
    if (empty) {
        const bias = originalFrom <= contentStart ? 1 : -1;
        const mapped = tr.mapping.map(originalFrom, bias);
        newAnchor = mapped;
        newHead = mapped;
    } else {
        const mappedFrom = tr.mapping.map(originalFrom, 1);
        const mappedTo = tr.mapping.map(originalTo, -1);
        const backward = originalAnchor === originalTo;
        newAnchor = backward ? mappedTo : mappedFrom;
        newHead = backward ? mappedFrom : mappedTo;
    }
    tr = tr.setSelection(TextSelection.create(tr.doc, newAnchor, newHead));
    tr.setMeta('addToHistory', false);
    tr.setMeta(PLUGIN_META, 'expand');
    // dispatch の**前**に expanded を確定させる。decoration プラグイン
    // （codeHighlightPlugin・lineNumberGutterPlugin）はこの dispatch 中の再計算で
    // `getExpandedCodeFence()` を参照するため、後から設定すると「展開済みの実テキスト」を
    // 非展開ブロックとして描画してしまう（フェンスの誤ハイライト・widget の重複表示）。
    expanded = { nodePos };
    view.dispatch(tr);
}

function collapseBlock(view: EditorView, nodePos: number): void {
    const { state } = view;
    const node = state.doc.nodeAt(nodePos);
    if (!node || node.type.name !== 'code_block') return;

    const fullText = node.textContent;
    const contentStart = nodePos + 1;
    const parsed = parseCodeFenceRealText(fullText);

    const tr = state.tr;
    if (parsed) {
        tr.delete(contentStart + fullText.length - parsed.closeLen, contentStart + fullText.length);
        tr.delete(contentStart, contentStart + parsed.openLen);
        const currentLanguage = typeof node.attrs.language === 'string' ? node.attrs.language : '';
        if (parsed.language !== currentLanguage) {
            tr.setNodeMarkup(nodePos, undefined, { ...node.attrs, language: parsed.language });
        }
    } else {
        // 開き・閉じのどちらか（または両方）が崩れている = フェンス記法として
        // 成立しない → コードブロックをやめて段落へ変換する（codeBlockBackspace.ts
        // の先頭 Backspace 解除と同じ発想。中身のテキストはそのまま残す）。
        // 崩れていない側のマーカーは独立して判定・除去する（heading-prefix-
        // zero-hash-collapse-fix.md と同じく、区切り文字の残骸を残さないため）。
        let remaining = fullText;
        const openMatch = /^```(\S*)\n/.exec(remaining);
        if (openMatch) remaining = remaining.slice(openMatch[0].length);
        const closeMatch = /\n```$/.exec(remaining);
        if (closeMatch) remaining = remaining.slice(0, remaining.length - closeMatch[0].length);

        const paragraphType = state.schema.nodes.paragraph;
        if (paragraphType) {
            const textNode = remaining ? state.schema.text(remaining) : undefined;
            const paragraph = paragraphType.create(null, textNode);
            tr.replaceWith(nodePos, nodePos + node.nodeSize, paragraph);
        }
    }
    tr.setMeta('addToHistory', false);
    tr.setMeta(PLUGIN_META, 'collapse');
    view.dispatch(tr);
    onCollapseSync?.();
}

let isHandling = false;
let isDragging = false;

export function createCodeFenceEditPlugin() {
    return $prose(() => new Plugin({
        key: new PluginKey('codeFenceEdit'),

        appendTransaction(transactions, _oldState, _newState) {
            if (expanded === null) return null;
            let nodePos = expanded.nodePos;
            for (const tr of transactions) {
                if (tr.getMeta(PLUGIN_META)) continue;
                nodePos = tr.mapping.map(nodePos, -1);
            }
            if (nodePos !== expanded.nodePos) {
                expanded = { nodePos };
            }
            return null;
        },

        view(editorView) {
            const sync = (view: EditorView): void => {
                const focusedPos = getFocusedCodeBlockPos(view);
                const expandedPos = expanded?.nodePos ?? null;

                if (focusedPos === expandedPos) return; // 同じブロック or どちらも null

                isHandling = true;
                try {
                    if (expanded !== null) {
                        const oldPos = expanded.nodePos;
                        expanded = null;
                        collapseBlock(view, oldPos);
                    }

                    const newFocusedPos = getFocusedCodeBlockPos(view);
                    if (newFocusedPos !== null) {
                        // expanded の設定は expandBlock 内（dispatch 直前）で行う。
                        // 早期 return（ノード消失等）した場合は expanded が立たないので、
                        // 挿入していないのに collapse だけが走る事故も起きない。
                        expandBlock(view, newFocusedPos);
                    }
                } finally {
                    isHandling = false;
                }
            };

            const onMouseDown = (): void => { isDragging = true; };
            const onMouseUp = (): void => {
                if (!isDragging) return;
                isDragging = false;
                setTimeout(() => sync(editorView), 0);
            };
            document.addEventListener('mousedown', onMouseDown);
            document.addEventListener('mouseup', onMouseUp);

            return {
                update(view: EditorView) {
                    if (isHandling) return;
                    if (isDragging) return;
                    sync(view);
                },
                destroy() {
                    document.removeEventListener('mousedown', onMouseDown);
                    document.removeEventListener('mouseup', onMouseUp);
                    expanded = null;
                    isDragging = false;
                }
            };
        }
    }));
}
