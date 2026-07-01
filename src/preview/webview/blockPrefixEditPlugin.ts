/**
 * Typora 風「フォーカスで記法展開」プラグイン。
 *
 * カーソルが見出し / リスト項目 / blockquote に入ると、行頭 Markdown 記法
 * （`## ` / `- ` / `- [ ] ` / `1. ` / `> `）を**実テキスト**としてドキュメントに挿入し、
 * そのまま編集できるようにする。カーソルが抜けたらテキストをパースして
 * ノード属性を更新し、プレフィックスを削除する。
 *
 * ### 設計上の注意
 * - プレフィックス挿入/削除は `addToHistory: false` — undo 履歴を汚さない。
 * - `focusSyntaxPlugin` の block marker decoration（CSS `::before`）は展開中はスキップ
 *   （`getExpandedBlock()` を参照）。
 * - `markerBackspace` は展開中はスキップ（プレフィックスが実テキストなので
 *   Backspace で文字を削除するのが自然）。
 * - `markdownUpdated` リスナーは展開中は抑制 — プレフィックスが直列化されて
 *   二重（`## ## Hello`）になるのを防ぐ。カーソルが抜けた後の最初の update で正しく同期。
 *
 * ### 対応ブロック
 * | ブロック    | 挿入されるプレフィックス         |
 * |-------------|----------------------------------|
 * | 見出し H1-6 | `# ` ～ `###### `                |
 * | 箇条書き    | `- `                             |
 * | 番号付き    | `1. ` / `2. ` …                 |
 * | タスク（未）| `- [ ] `                         |
 * | タスク（済）| `- [x] `                         |
 * | blockquote  | `> `                             |
 */
import { Plugin, PluginKey } from '@milkdown/prose/state';
import type { EditorState } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import type { EditorView } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';

/** このプラグインが発行するトランザクションを識別するメタキー。 */
const PLUGIN_META = 'blockPrefixEdit';

export interface ExpandedBlock {
    /** 展開中ノード（heading / list_item / blockquote）の pos（開きトークン直前）。 */
    nodePos: number;
    /** 挿入したプレフィックス文字列（例: `## `, `- [ ] `）。 */
    prefix: string;
    /** プレフィックスを挿入したドキュメント上の位置（テキスト内容の先頭）。 */
    contentStart: number;
    /** ノード種別（collapse 時の分岐に使う）。 */
    nodeType: 'heading' | 'list_item' | 'blockquote';
}

/** 現在展開中のブロック情報。null = 展開なし。 */
let expandedBlock: ExpandedBlock | null = null;

/**
 * 展開を一時的に抑制するフラグ。
 * リスト変換（toggleCheckbox / applyListType）などの「構造変更操作」の実行中に true にすると、
 * プラグインが expand / collapse を発動しなくなる。操作完了後に false に戻す。
 */
let suppressExpansion = false;

/** 展開中かどうか（markdownUpdated 抑制判定に使う）。 */
export function isBlockPrefixActive(): boolean {
    return expandedBlock !== null;
}

/** 展開情報を取得（focusSyntaxPlugin / markerBackspace から参照）。 */
export function getExpandedBlock(): ExpandedBlock | null {
    return expandedBlock;
}

/**
 * 展開抑制フラグを設定する。
 * `true` にすると getFocusedBlockInfo が常に null を返すため、
 * 展開/折りたたみがトリガーされない。操作完了後に必ず `false` に戻すこと。
 */
export function setBlockPrefixExpansionSuppressed(value: boolean): void {
    suppressExpansion = value;
}

/**
 * 現在展開中のブロックを即時折りたたむ（構造変更前の明示的クリーンアップ用）。
 * liftListItem のように document 構造を変える操作の前に呼ぶと、
 * nodePos/contentStart が stale になる前にプレフィックスを削除できる。
 */
export function collapseCurrentExpandedBlock(view: EditorView): void {
    if (!expandedBlock) return;
    const old = expandedBlock;
    expandedBlock = null;
    isHandling = true;
    try {
        collapseBlock(view, old);
    } finally {
        isHandling = false;
    }
}

// ───────────────────────────────────────────
// フォーカス中ブロックの判定
// ───────────────────────────────────────────

interface FocusedBlockInfo {
    nodePos: number;
    prefix: string;
    contentStart: number;
    nodeType: 'heading' | 'list_item' | 'blockquote';
}

function getFocusedBlockInfo(state: EditorState): FocusedBlockInfo | null {
    if (suppressExpansion) return null;
    if (!state.selection.empty) return null;
    const { $from } = state.selection;

    for (let depth = $from.depth; depth > 0; depth--) {
        const node = $from.node(depth);

        if (node.type.name === 'heading') {
            const nodePos = $from.before(depth);
            const level = Math.max(1, Math.min(6, (node.attrs.level as number) || 1));
            return {
                nodePos,
                prefix: '#'.repeat(level) + ' ',
                contentStart: nodePos + 1,
                nodeType: 'heading'
            };
        }

        if (node.type.name === 'list_item') {
            // チェックボックス項目は展開しない。
            // 展開すると label-wrapper（視覚的チェックボックス）が md-prefix-expanded クラスで
            // 隠れてしまい、クリックでのトグルが動作しなくなる。チェックボックスは
            // クリック / Cmd+Enter でトグルし、プレフィックス記法展開は行わない。
            if (typeof node.attrs.checked === 'boolean') return null;

            const nodePos = $from.before(depth);
            const parentNode = $from.node(depth - 1);
            let prefix: string;

            if (parentNode.type.name === 'ordered_list') {
                const index = $from.index(depth - 1) + 1;
                prefix = `${index}. `;
            } else {
                prefix = '- ';
            }
            // contentStart = nodePos+1（list_item 開き）+ 1（paragraph 開き）
            return { nodePos, prefix, contentStart: nodePos + 2, nodeType: 'list_item' };
        }

        // blockquote の中の paragraph
        if (node.type.name === 'paragraph' && depth > 0 && $from.node(depth - 1).type.name === 'blockquote') {
            const bqDepth = depth - 1;
            const nodePos = $from.before(bqDepth);
            return {
                nodePos,
                prefix: '> ',
                contentStart: nodePos + 2, // blockquote 開き + paragraph 開き
                nodeType: 'blockquote'
            };
        }
    }
    return null;
}

// ───────────────────────────────────────────
// 展開 / 折りたたみ
// ───────────────────────────────────────────

function expandBlock(view: EditorView, info: FocusedBlockInfo): ExpandedBlock {
    const { state } = view;
    const tr = state.tr.insertText(info.prefix, info.contentStart);
    tr.setMeta('addToHistory', false);
    tr.setMeta(PLUGIN_META, 'expand');
    view.dispatch(tr);

    return {
        nodePos: info.nodePos,
        prefix: info.prefix,
        contentStart: info.contentStart,
        nodeType: info.nodeType
    };
}

function collapseBlock(view: EditorView, expanded: ExpandedBlock): void {
    const { state } = view;
    const nodeAt = state.doc.nodeAt(expanded.nodePos);
    if (!nodeAt) return;

    if (expanded.nodeType === 'heading') {
        collapseHeading(view, expanded, nodeAt.attrs.level as number);
    } else if (expanded.nodeType === 'list_item') {
        collapseListItem(view, expanded, nodeAt);
    } else {
        collapseBlockquote(view, expanded);
    }
}

function collapseHeading(view: EditorView, expanded: ExpandedBlock, currentLevel: number): void {
    const { state } = view;
    const node = state.doc.nodeAt(expanded.nodePos);
    if (!node) return;

    const fullText = node.textContent;
    const m = /^(#{1,6}) /.exec(fullText);
    const newLevel = m ? m[1].length : currentLevel;
    const prefixLen = m ? m[1].length + 1 : 0;

    const tr = state.tr;
    if (prefixLen > 0) {
        tr.delete(expanded.contentStart, expanded.contentStart + prefixLen);
    }
    if (newLevel !== currentLevel) {
        tr.setNodeMarkup(expanded.nodePos, undefined, { ...node.attrs, level: newLevel });
    }
    tr.setMeta('addToHistory', false);
    tr.setMeta(PLUGIN_META, 'collapse');
    view.dispatch(tr);
}

function collapseListItem(view: EditorView, expanded: ExpandedBlock, _listItemNode: { attrs: Record<string, unknown>; firstChild: { type: { name: string }; textContent: string } | null }): void {
    const { state } = view;
    const node = state.doc.nodeAt(expanded.nodePos);
    if (!node) return;

    const paragraph = node.firstChild;
    if (!paragraph || paragraph.type.name !== 'paragraph') return;

    const fullText = paragraph.textContent;
    let newChecked: boolean | null | undefined;
    let prefixLen = 0;

    if (/^- \[x\] /i.test(fullText)) {
        newChecked = true;
        prefixLen = 6;
    } else if (/^- \[ \] /.test(fullText)) {
        newChecked = false;
        prefixLen = 6;
    } else if (/^- /.test(fullText)) {
        // 通常の箇条書き prefix、またはタスク記法が `- ` だけになった場合
        newChecked = typeof node.attrs.checked === 'boolean' ? null : undefined;
        prefixLen = 2;
    } else {
        const orderMatch = /^(\d+\. )/.exec(fullText);
        if (orderMatch) {
            prefixLen = orderMatch[1].length;
            newChecked = undefined;
        }
    }

    const tr = state.tr;
    if (prefixLen > 0) {
        tr.delete(expanded.contentStart, expanded.contentStart + prefixLen);
    }
    const oldChecked = node.attrs.checked;
    if (newChecked !== undefined && newChecked !== oldChecked) {
        tr.setNodeMarkup(expanded.nodePos, undefined, { ...node.attrs, checked: newChecked });
    }
    tr.setMeta('addToHistory', false);
    tr.setMeta(PLUGIN_META, 'collapse');
    view.dispatch(tr);
}

function collapseBlockquote(view: EditorView, expanded: ExpandedBlock): void {
    const { state } = view;
    const node = state.doc.nodeAt(expanded.nodePos);
    if (!node) return;
    const paragraph = node.firstChild;
    if (!paragraph) return;

    const prefixLen = /^> /.test(paragraph.textContent) ? 2 : 0;
    if (prefixLen === 0) return;

    const tr = state.tr
        .delete(expanded.contentStart, expanded.contentStart + prefixLen)
        .setMeta('addToHistory', false)
        .setMeta(PLUGIN_META, 'collapse');
    view.dispatch(tr);
}

// ───────────────────────────────────────────
// プラグイン本体
// ───────────────────────────────────────────

/** 再入防止フラグ（collapse/expand 自身が view.update を呼ぶのを無視する）。 */
let isHandling = false;

export function createBlockPrefixEditPlugin() {
    return $prose(() => new Plugin({
        key: new PluginKey('blockPrefixEdit'),

        // 外部トランザクション（自プラグイン以外）が document を変更したとき、
        // expandedBlock の nodePos/contentStart を tr.mapping で更新する。
        // これにより、展開中のブロックより前に挿入/削除が起きても collapse が
        // 正しい位置で実行される（Bug2: 見出しプレフィックス累積の防止）。
        appendTransaction(transactions, _oldState, _newState) {
            if (expandedBlock === null) return null;
            let { nodePos, contentStart } = expandedBlock;
            for (const tr of transactions) {
                if (tr.getMeta(PLUGIN_META)) continue; // 自プラグインの tr はスキップ
                nodePos = tr.mapping.map(nodePos, -1);
                // assoc: -1（左側にバイアス）。デフォルト（+1）だと、contentStart ちょうどの
                // 位置に文字が挿入されたとき（例: "## " の直前に "#" を追加して "### " に
                // する操作）、新しい文字を「プレフィックスの外」として扱ってしまい、
                // contentStart が 1 つ先にズレる。-1 にすることで、その位置への挿入は
                // 常にプレフィックス側（contentStart 以降）に含まれるようにする。
                contentStart = tr.mapping.map(contentStart, -1);
            }
            if (nodePos !== expandedBlock.nodePos || contentStart !== expandedBlock.contentStart) {
                expandedBlock = { ...expandedBlock, nodePos, contentStart };
            }
            return null;
        },

        // リスト項目展開中は label-wrapper（チェックボックスや bullet 記号）を非表示にする。
        // 展開したプレフィックステキストと二重表示になるのを防ぐ。
        props: {
            decorations(state) {
                if (!expandedBlock || expandedBlock.nodeType !== 'list_item') return DecorationSet.empty;
                const node = state.doc.nodeAt(expandedBlock.nodePos);
                if (!node) return DecorationSet.empty;
                const from = expandedBlock.nodePos;
                const to = from + node.nodeSize;
                return DecorationSet.create(state.doc, [
                    Decoration.node(from, to, { class: 'md-prefix-expanded' })
                ]);
            }
        },

        view(_editorView) {
            return {
                update(view: EditorView) {
                    if (isHandling) return;

                    // 自プラグインが発行したトランザクションは無視。
                    // （ProseMirror は apply 後に view.update を同期呼びするため、
                    //   ここで meta を確認しても直前のトランザクションは取れない。
                    //   isHandling フラグで再入を防ぐ。）

                    const focusedInfo = getFocusedBlockInfo(view.state);
                    const focusedPos = focusedInfo?.nodePos ?? null;
                    const expandedPos = expandedBlock?.nodePos ?? null;

                    if (focusedPos === expandedPos) return; // 同じブロック or どちらも null

                    isHandling = true;
                    try {
                        // 旧ブロックを折りたたむ
                        if (expandedBlock !== null) {
                            const old = expandedBlock;
                            expandedBlock = null;
                            collapseBlock(view, old);
                        }

                        // 折りたたみ後に state が変わっているので再取得
                        const newInfo = getFocusedBlockInfo(view.state);
                        if (newInfo !== null) {
                            // expandedBlock を先にセット → decorations() が呼ばれたとき
                            // 既に値があるので label-wrapper が正しく非表示になる
                            expandedBlock = {
                                nodePos: newInfo.nodePos,
                                prefix: newInfo.prefix,
                                contentStart: newInfo.contentStart,
                                nodeType: newInfo.nodeType
                            };
                            expandBlock(view, newInfo);
                        }
                    } finally {
                        isHandling = false;
                    }
                },
                destroy() {
                    expandedBlock = null;
                }
            };
        }
    }));
}
