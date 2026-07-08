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
import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';
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

/**
 * リスト項目の段落内容が「まだチェックボックス記法 `[ ]` / `[x]` を打っている途中」に
 * 見えるかどうか（空も含む）。
 *
 * GFM の `wrapInTaskListInputRule`（`[ ] ` や `[x] ` で checked を設定する InputRule）は、
 * リスト項目の段落先頭（`^`）にちょうどマッチする必要がある。`- ` を打ってリスト化した
 * 直後、段落はまだ空だが、ここで即座に `- ` をプレフィックス展開（実テキストとして挿入）
 * すると、続けて `[ ] ` を打っても段落の先頭に展開済みの `- ` が残ってしまい、InputRule が
 * `^` にマッチできず、チェックボックスへ変換されない（「- [ ] タスク」と1文字ずつ打っても
 * チェックボックスの見た目にならない不具合）。
 * 段落内容がチェックボックス記法を打っている途中に見えるあいだは展開を保留し、InputRule に
 * マッチする機会を残す。記法として成立しない内容（`a` など）を打ち始めたら、通常どおり
 * プレフィックス展開を再開する。
 *
 * ブラウザは contenteditable 内でスペースキーを押すと、末尾の空白が視覚的に潰れない
 * よう ` `（non-breaking space）として挿入することがある（ProseMirror の
 * domObserver はこれをそのままモデルへ反映する）。`\s` は ` ` にもマッチするため
 * `[ xX]` ではなく `[\sxX]` を使う（素の半角スペースだけを見ていると、実際にタイプした
 * 場合は常に不一致になり展開抑制が効かない）。
 */
function isPendingTaskMarkerText(content: string): boolean {
    return content === '' || /^\[[\sxX]?\]?$/.test(content);
}

/** カーソルを含む list_item の `checked` 属性（無ければ `undefined`）。 */
function enclosingListItemChecked(state: EditorState): boolean | null | undefined {
    const { $from } = state.selection;
    for (let depth = $from.depth; depth > 0; depth--) {
        const node = $from.node(depth);
        if (node.type.name === 'list_item') return node.attrs.checked as boolean | null;
    }
    return undefined;
}

/**
 * チェックボックス変換直後の「正しいカーソル位置」を一定時間だけ追跡するガード。
 *
 * GFM 既定の `wrapInTaskListInputRule`（`[ ] ` / `[x] ` で checked を設定する
 * InputRule）は、`checked` を null → boolean に変える単一 transaction で完結する。
 * それでもこの変換は `list_item` を「素の `<li>`」から `list-item-block` Web
 * Component へ再マウントさせるため、ブラウザのネイティブ selection が失われ、
 * **少し遅れて**（次の実タイプより後になることもある）届く、ドキュメントは変えない
 * selectionchange 由来の transaction でカーソルが別ブロックへ飛ぶことがある
 * （`wrapInBulletListAndSetChecked` と同種の問題だが、今回は Milkdown 組み込みの
 * InputRule 自体が原因のため、呼び出し側で dispatch をまとめる対処ができない）。
 *
 * 変換直後に「正しい位置」を覚え、以降の transaction ごとに `tr.mapping` で
 * 追跡位置を更新し続ける（実際のタイプが続けば selection も同じだけ前進するため、
 * 追跡位置と selection は一致し続ける）。ドキュメントを変えない transaction
 * （＝タイプではなく selectionchange 由来）で selection が追跡位置からズレたら、
 * 誤爆とみなして元へ戻す。一定時間（`CHECKBOX_SELECTION_GUARD_WINDOW_MS`）経過したら
 * 追跡をやめる。
 */
let pendingCheckboxSelectionGuard: { pos: number; armedAt: number } | null = null;
const CHECKBOX_SELECTION_GUARD_WINDOW_MS = 1000;

/**
 * markerBackspace がチェックボックスを箇条書きへ降格（`checked: boolean → null`）した
 * 直後の list_item 位置を、短い時間窓つきで記録する。
 *
 * 降格直後はまだカーソルがこの項目内にあり、`checked` が `null` になったことで
 * `getFocusedBlockInfo` は「フォーカス中の普通の箇条書き」と区別が付かなくなる。
 * list-item-block コンポーネントの非同期再描画が少し遅れて追加の selectionchange を
 * 発火させることがあり、その回でも誤って "- " を実テキスト展開してしまわないよう、
 * このノードだけを時間窓のあいだ展開対象から除外する（`pendingCheckboxSelectionGuard`
 * と同じ「位置追跡 + 時間窓」方式。詳細: `checkbox-cursor-jump-fix.md` 系の非同期再描画レース）。
 */
let recentCheckboxDemotion: { pos: number; armedAt: number } | null = null;
const CHECKBOX_DEMOTION_GUARD_WINDOW_MS = 500;

/** markerBackspace から呼ぶ: 直前にチェックボックスを降格した list_item の位置を記録する。 */
export function markRecentCheckboxDemotion(pos: number): void {
    recentCheckboxDemotion = { pos, armedAt: Date.now() };
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
                // 末尾は non-breaking space（` `）。プレフィックスの直後は展開時点では
                // 空（ユーザーはまだ何も打っていない）ため、この空白がテキストブロックの
                // 末尾に来る。素の半角スペースだと、ブラウザが「末尾の空白」をレンダリング上
                // 潰してしまい、続けて実際にキーを打つと（domObserver が DOM とモデルの差分を
                // 取る際に）空白が消えて文字だけが挿入されたかのように扱われることがあった
                // （例: `## ` の直後に `h` と打つと `##h` になり、空白が失われる）。
                prefix: '#'.repeat(level) + ' ',
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
            if (isPendingTaskMarkerText(node.textContent)) return null;

            const nodePos = $from.before(depth);
            if (recentCheckboxDemotion !== null
                && recentCheckboxDemotion.pos === nodePos
                && Date.now() - recentCheckboxDemotion.armedAt <= CHECKBOX_DEMOTION_GUARD_WINDOW_MS) {
                return null;
            }
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
                prefix: '> ',
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
    // `insertText` はカーソル位置の周辺マーク（`resolve(pos).marks()`）を継承する。
    // contentStart はブロック内容の先頭（テキストブロックの開始位置）なので、内容が
    // リンク等のマーク付きテキストで始まっていると、そのマークが挿入したプレフィックスへ
    // 継承されてしまい（例: `- [1. 見出し](#anchor)` の "- " がリンクの `[...]` の中に
    // 入り込む）、見出しでない部分までリンク化されて見える不具合になる。マークなしの
    // テキストノードを明示的に作って挿入することで、これを防ぐ。
    const tr = state.tr.insert(info.contentStart, state.schema.text(info.prefix));
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

/**
 * collapse 完了後にホストへの markdown 同期を強制する外部フック。
 *
 * expand/collapse の transaction は Undo 履歴を汚さないため `addToHistory: false` を
 * 付けている。ところが Milkdown の `@milkdown/plugin-listener`（`markdownUpdated` の
 * 実体）は `tr.getMeta('addToHistory') === false` の transaction を **完全に無視**する
 * （`state.apply` で早期 return し、内部の `latestTr`/`prevDoc` を更新しない）。
 * そのため collapse で確定した最終テキスト（例: `## heading` → `heading`、
 * `- item` → `item`）が、その後 **何も他の編集が起きなければ永久に** ホストへ
 * 送られず、直前の（プレフィックスが実テキストとして残ったままの、あるいはそれ以前の）
 * 内容が保存され続けてしまう不具合があった。collapse のたびにこのフックで明示的に
 * 現在の doc を再シリアライズしてホストへ送ることで、Milkdown 側のリスナーの
 * 取りこぼしに依存しないようにする（`milkdownApp.ts` の `setOnCollapseSync` で
 * 実際のシリアライズ + postChange を登録）。
 */
let onCollapseSync: (() => void) | null = null;

/** collapse 完了後の同期フックを設定する（`null` で解除）。 */
export function setOnCollapseSync(fn: (() => void) | null): void {
    onCollapseSync = fn;
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
    onCollapseSync?.();
}

function collapseHeading(view: EditorView, expanded: ExpandedBlock, currentLevel: number): void {
    const { state } = view;
    const node = state.doc.nodeAt(expanded.nodePos);
    if (!node) return;

    const fullText = node.textContent;
    // 展開時に挿入した区切り文字は non-breaking space（\s でマッチ）。ユーザーが手で
    // 半角スペースへ打ち替えた場合にも対応できるよう両方許容する。
    const m = /^(#{1,6})\s/.exec(fullText);

    const tr = state.tr;
    if (m) {
        const newLevel = m[1].length;
        const prefixLen = m[1].length + 1;
        tr.delete(expanded.contentStart, expanded.contentStart + prefixLen);
        if (newLevel !== currentLevel) {
            tr.setNodeMarkup(expanded.nodePos, undefined, { ...node.attrs, level: newLevel });
        }
    } else {
        // `#` が1個も残っていない = 見出し記法として成立しない → 段落へ変換する。
        // ここで何もしない（レベルを維持する）と、展開時に挿入した区切り文字（NBSP）が
        // 削除されないまま本文に残り続け、見出しレベルも固着してしまう
        // （heading-prefix-zero-hash-collapse-fix.md）。
        const leadingWhitespace = /^\s+/.exec(fullText);
        if (leadingWhitespace) {
            tr.delete(expanded.contentStart, expanded.contentStart + leadingWhitespace[0].length);
        }
        tr.setNodeMarkup(expanded.nodePos, state.schema.nodes.paragraph);
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

    // 展開時に挿入した区切り文字は non-breaking space（\s でマッチ）。
    const prefixLen = /^>\s/.test(paragraph.textContent) ? 2 : 0;
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

/**
 * マウスドラッグ中（mousedown〜mouseup）は true。
 *
 * ドラッグで範囲選択している最中に selection が変化するたびに expand/collapse の
 * transaction を発火させると、ブラウザが内部で追跡しているネイティブ選択の
 * anchor/focus ノードがドキュメント変更（プレフィックスの挿入/削除）で無効になり、
 * mouseup 時点の最終選択が反映されない（選択が空になる）不具合があった
 * （例: 見出しが auto-expand されたままの状態で、他の箇条書き項目をドラッグ選択
 * しようとすると選択できない）。ドラッグ中は同期を止め、mouseup 後にまとめて
 * 1 回だけ最終状態に同期する。
 */
let isDragging = false;

export function createBlockPrefixEditPlugin() {
    return $prose(() => new Plugin({
        key: new PluginKey('blockPrefixEdit'),

        // 外部トランザクション（自プラグイン以外）が document を変更したとき、
        // expandedBlock の nodePos/contentStart を tr.mapping で更新する。
        // これにより、展開中のブロックより前に挿入/削除が起きても collapse が
        // 正しい位置で実行される（Bug2: 見出しプレフィックス累積の防止）。
        appendTransaction(transactions, oldState, newState) {
            // ガードが有効なら、タイプで前進する selection と追跡位置がズレないよう
            // 全ての transaction で位置をマッピングし続ける（selectionchange 由来の
            // 誤爆は docChanged=false で mapping が恒等になるため、実タイプでは
            // 一致し続け、誤爆時だけ selection との差が生まれる）。
            if (pendingCheckboxSelectionGuard !== null) {
                if (Date.now() - pendingCheckboxSelectionGuard.armedAt > CHECKBOX_SELECTION_GUARD_WINDOW_MS) {
                    pendingCheckboxSelectionGuard = null;
                } else {
                    let pos = pendingCheckboxSelectionGuard.pos;
                    for (const tr of transactions) {
                        if (tr.getMeta(PLUGIN_META)) continue;
                        pos = tr.mapping.map(pos);
                    }
                    pendingCheckboxSelectionGuard = { ...pendingCheckboxSelectionGuard, pos };
                }
            }

            // recentCheckboxDemotion も同様に、時間窓を過ぎたら破棄し、それ以外は
            // 対象 list_item の位置を tr.mapping で追跡し続ける（この位置より前で
            // 挿入/削除が起きても、降格した項目自身を正しく指し続けるため）。
            if (recentCheckboxDemotion !== null) {
                if (Date.now() - recentCheckboxDemotion.armedAt > CHECKBOX_DEMOTION_GUARD_WINDOW_MS) {
                    recentCheckboxDemotion = null;
                } else {
                    let pos = recentCheckboxDemotion.pos;
                    for (const tr of transactions) {
                        if (tr.getMeta(PLUGIN_META)) continue;
                        pos = tr.mapping.map(pos, -1);
                    }
                    recentCheckboxDemotion = { ...recentCheckboxDemotion, pos };
                }
            }

            // チェックボックス変換（checked: null → boolean）を検知したら、直後の
            // 正しい selection 位置を保護する（list-item-block Web Component の
            // 再マウントでカーソルが別ブロックへ飛ぶことがあるため）。
            if (transactions.some(tr => tr.docChanged)) {
                const oldChecked = enclosingListItemChecked(oldState);
                const newChecked = enclosingListItemChecked(newState);
                if (oldChecked === null && typeof newChecked === 'boolean') {
                    pendingCheckboxSelectionGuard = {
                        pos: newState.selection.from,
                        armedAt: Date.now()
                    };
                }
            }

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

        view(editorView) {
            // 現在の focus 位置に合わせて展開中ブロックを同期する（旧ブロックの collapse
            // → 新ブロックの expand）。update() から毎回呼ぶほか、ドラッグ完了
            // （mouseup）直後にもまとめて 1 回呼ぶ。
            const syncExpandedBlock = (view: EditorView): void => {
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
            };

            const onMouseDown = (): void => {
                isDragging = true;
            };
            // mouseup はドラッグでポインタがエディタ外に出てから離されることもあるため、
            // document で拾う（view.dom だけだと取りこぼす）。
            //
            // mouseup 発火の時点では、ブラウザのネイティブ selection（クリックによる
            // カーソル移動）がまだ ProseMirror 側の state.selection に同期されている
            // とは限らない（selectionchange → domObserver 経由の反映は非同期になりうる）。
            // ここで同期的に syncExpandedBlock を呼ぶと、まだ古い selection のまま
            // 「ブロックは変わっていない」と誤判定し、展開中ブロックの折りたたみが
            // 一切起きなくなる不具合があった（ドラッグを伴わない単純クリックでも
            // isDragging が一瞬 true になるため影響を受ける）。selectionchange が
            // 反映される猶予を与えるため、次のタスクへ遅延させてから同期する。
            const onMouseUp = (): void => {
                if (!isDragging) return;
                isDragging = false;
                setTimeout(() => syncExpandedBlock(editorView), 0);
            };
            document.addEventListener('mousedown', onMouseDown);
            document.addEventListener('mouseup', onMouseUp);

            return {
                update(view: EditorView) {
                    if (isHandling) return;
                    // ドラッグ中は selection の変化に追従して collapse/expand しない
                    // （mouseup 後に syncExpandedBlock でまとめて同期する）。
                    if (isDragging) return;

                    // チェックボックス変換直後の selection 保護。
                    // 実タイプが続くあいだは追跡位置（appendTransaction で mapping 済み）が
                    // selection と一致し続けるはずなので、ズレていたら Web Component
                    // 再マウントによる selectionchange の誤爆とみなして元へ戻す。
                    if (pendingCheckboxSelectionGuard !== null) {
                        const guard = pendingCheckboxSelectionGuard;
                        if (Date.now() - guard.armedAt > CHECKBOX_SELECTION_GUARD_WINDOW_MS) {
                            pendingCheckboxSelectionGuard = null;
                        } else if (view.state.selection.from !== guard.pos) {
                            pendingCheckboxSelectionGuard = null;
                            isHandling = true;
                            try {
                                const $pos = view.state.doc.resolve(
                                    Math.min(guard.pos, view.state.doc.content.size)
                                );
                                const tr = view.state.tr.setSelection(TextSelection.near($pos));
                                tr.setMeta(PLUGIN_META, 'restore-checkbox-selection');
                                view.dispatch(tr);
                            } finally {
                                isHandling = false;
                            }
                            return;
                        }
                    }

                    // 自プラグインが発行したトランザクションは無視。
                    // （ProseMirror は apply 後に view.update を同期呼びするため、
                    //   ここで meta を確認しても直前のトランザクションは取れない。
                    //   isHandling フラグで再入を防ぐ。）

                    syncExpandedBlock(view);
                },
                destroy() {
                    document.removeEventListener('mousedown', onMouseDown);
                    document.removeEventListener('mouseup', onMouseUp);
                    expandedBlock = null;
                    pendingCheckboxSelectionGuard = null;
                    recentCheckboxDemotion = null;
                    isDragging = false;
                }
            };
        }
    }));
}
