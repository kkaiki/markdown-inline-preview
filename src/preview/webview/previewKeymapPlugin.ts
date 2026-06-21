/**
 * Preview（Milkdown）向けのキーボードショートカット。
 *
 * - テーブルセル内の `Cmd/Ctrl+A`: セル内容 → テーブル全体 と段階選択（その先は既定の全選択）。
 * - Notion 風ブロック変換 `Cmd/Ctrl+Opt+<数字>`:
 *   0=本文, 1/2/3=見出し, 4=ToDo, 5=箇条書き, 6=番号付き, 8=コード, 9=引用。
 *
 * VS Code のキーバインドは WebView 内には届かないため、ここで直接 handleKeyDown する。
 */
import { commandsCtx } from '@milkdown/kit/core';
import type { Ctx } from '@milkdown/ctx';
import {
    turnIntoTextCommand,
    wrapInHeadingCommand,
    wrapInBulletListCommand,
    wrapInOrderedListCommand,
    createCodeBlockCommand,
    wrapInBlockquoteCommand,
    splitListItemCommand
} from '@milkdown/kit/preset/commonmark';
import { selectTableCommand } from '@milkdown/kit/preset/gfm';
import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';
import { CellSelection } from '@milkdown/prose/tables';
import type { ResolvedPos } from '@milkdown/prose/model';
import type { EditorView } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';
import { classifyPreviewShortcut, type NotionBlockAction } from '../../shared/preview/previewShortcuts';

function findDepth($pos: ResolvedPos, names: string[]): number {
    for (let depth = $pos.depth; depth > 0; depth--) {
        if (names.includes($pos.node(depth).type.name)) return depth;
    }
    return -1;
}

/**
 * テーブルセルの depth を返す。ノード名ではなく prosemirror-tables の tableRole
 * （`cell` / `header_cell`）で判定する（プリセットによりノード名が異なっても確実）。
 */
function tableCellDepth($pos: ResolvedPos): number {
    for (let depth = $pos.depth; depth > 0; depth--) {
        const role = $pos.node(depth).type.spec.tableRole;
        if (role === 'cell' || role === 'header_cell') return depth;
    }
    return -1;
}

/**
 * Cmd+A 段階選択:
 * - テーブルセル内: セルの中身 → 行全体 → 表全体 → 文書全体。
 * - コードブロック内: ブロック内容 → 文書全体。
 * - それ以外: false（既定の全選択に委ねる）。
 */
export function handleSelectAll(view: EditorView, ctx: Ctx): boolean {
    const { state } = view;
    const sel = state.selection;

    // 既にテーブルのセル選択（行 or 表）の場合の段階遷移
    if (sel instanceof CellSelection) {
        // 行選択（複数列の表で全列に跨る = 表全体）→ 文書全体へ
        if (sel.isRowSelection() && sel.isColSelection()) return false;
        // 行選択 → 表全体
        ctx.get(commandsCtx).call(selectTableCommand.key);
        return true;
    }

    const $from = sel.$from;

    // コードブロック
    const codeDepth = findDepth($from, ['code_block']);
    if (codeDepth > 0) {
        const codeContent = TextSelection.create(state.doc, $from.start(codeDepth), $from.end(codeDepth));
        const isCodeSelected =
            sel instanceof TextSelection && sel.from === codeContent.from && sel.to === codeContent.to;
        if (isCodeSelected) return false; // 2 回目 → 既定の全選択
        view.dispatch(state.tr.setSelection(codeContent).scrollIntoView());
        return true;
    }

    // テーブルセル（tableRole で判定）。セルをクリックした場合は NodeSelection に
    // なり $from がセル階層を指すため、段落 depth に依存せずセル範囲から算出する。
    const cellDepth = tableCellDepth($from);
    if (cellDepth < 0) return false; // セル外 → 既定の全選択

    const cellContent = TextSelection.between(
        state.doc.resolve($from.start(cellDepth)),
        state.doc.resolve($from.end(cellDepth))
    );
    const isCellSelected =
        sel instanceof TextSelection && sel.from === cellContent.from && sel.to === cellContent.to;

    if (isCellSelected) {
        // 2 回目: 行全体を選択（CellSelection の行選択）
        const $cell = state.doc.resolve($from.before(cellDepth));
        view.dispatch(state.tr.setSelection(CellSelection.rowSelection($cell)).scrollIntoView());
        return true;
    }

    // 1 回目: セルの中身だけ
    view.dispatch(state.tr.setSelection(cellContent).scrollIntoView());
    return true;
}

function makeTodo(view: EditorView, ctx: Ctx): void {
    const commands = ctx.get(commandsCtx);
    if (findDepth(view.state.selection.$from, ['list_item']) < 0) {
        commands.call(wrapInBulletListCommand.key);
    }
    const { state } = view;
    const depth = findDepth(state.selection.$from, ['list_item']);
    if (depth < 0) return;
    const pos = state.selection.$from.before(depth);
    view.dispatch(state.tr.setNodeAttribute(pos, 'checked', false));
}

/** Notion 風ブロック変換。種別ごとに対応する Milkdown コマンドを実行する。 */
function runNotionBlock(view: EditorView, ctx: Ctx, action: NotionBlockAction): boolean {
    const commands = ctx.get(commandsCtx);
    switch (action) {
        case 'paragraph': commands.call(turnIntoTextCommand.key); return true;
        case 'heading1': commands.call(wrapInHeadingCommand.key, 1); return true;
        case 'heading2': commands.call(wrapInHeadingCommand.key, 2); return true;
        case 'heading3': commands.call(wrapInHeadingCommand.key, 3); return true;
        case 'todo': makeTodo(view, ctx); return true;
        case 'bulletList': commands.call(wrapInBulletListCommand.key); return true;
        case 'orderedList': commands.call(wrapInOrderedListCommand.key); return true;
        case 'codeBlock': commands.call(createCodeBlockCommand.key); return true;
        case 'blockquote': commands.call(wrapInBlockquoteCommand.key); return true;
        default: return false;
    }
}

/**
 * チェックボックス（タスクリスト）項目で Enter を押したときの継続。
 *
 * Milkdown 既定の splitListItem は新項目に元の属性（checked）を引き継ぐため、
 * `- [x]` で改行すると新項目も `- [x]` になってしまう。新しい項目は常に未チェック
 * （`- [ ]`）にしたいので、分割後にその checked を false に戻す。
 * タスク項目（checked が boolean）以外には関与しない。
 */
function handleTaskListEnter(view: EditorView, ctx: Ctx): boolean {
    const { state } = view;
    const { $from, empty } = state.selection;
    if (!empty) return false;

    const depth = findDepth($from, ['list_item']);
    if (depth < 0) return false;
    if (typeof $from.node(depth).attrs.checked !== 'boolean') return false; // タスク項目のみ

    if (!ctx.get(commandsCtx).call(splitListItemCommand.key)) return false;

    // 分割後はカーソルが新しい項目に入っている。その項目が checked なら false へ。
    const after = view.state;
    const newDepth = findDepth(after.selection.$from, ['list_item']);
    if (newDepth >= 0) {
        const pos = after.selection.$from.before(newDepth);
        if (after.doc.nodeAt(pos)?.attrs.checked === true) {
            view.dispatch(after.tr.setNodeAttribute(pos, 'checked', false));
        }
    }
    return true;
}

/**
 * Enter 押下時、カーソル行が ``` または ```lang だけの段落なら、コードブロックに
 * 変換する（入力ルールは Enter では発火しないため、ここで Enter を拾う）。
 */
function handleFenceEnter(view: EditorView): boolean {
    const { state } = view;
    const { $from, empty } = state.selection;
    if (!empty) return false;
    if ($from.parent.type.name !== 'paragraph') return false;

    const match = /^```([a-zA-Z0-9+#-]*)$/.exec($from.parent.textContent.trim());
    if (!match) return false;

    const codeType = state.schema.nodes.code_block;
    if (!codeType) return false;

    const language = match[1] ?? '';
    const node = codeType.createAndFill({ language });
    if (!node) return false;

    const start = $from.before();
    const end = $from.after();
    const tr = state.tr.replaceRangeWith(start, end, node);
    tr.setSelection(TextSelection.create(tr.doc, start + 1));
    view.dispatch(tr.scrollIntoView());
    return true;
}

export function createPreviewKeymapPlugin() {
    return $prose((ctx) => {
        return new Plugin({
            key: new PluginKey('previewKeymap'),
            props: {
                handleKeyDown(view, event) {
                    const shortcut = classifyPreviewShortcut(event);
                    if (!shortcut) return false;

                    switch (shortcut.kind) {
                        case 'fenceEnter':
                            // Enter: ``` / ```lang の段落をコードブロック化
                            if (handleFenceEnter(view)) {
                                event.preventDefault();
                                return true;
                            }
                            // fence でなければタスク項目の継続を試す
                            if (handleTaskListEnter(view, ctx)) {
                                event.preventDefault();
                                return true;
                            }
                            return false;
                        case 'notionBlock':
                            // Notion 風: Cmd/Ctrl+Opt+<数字>
                            if (runNotionBlock(view, ctx, shortcut.action)) {
                                event.preventDefault();
                                view.focus();
                                return true;
                            }
                            return false;
                        case 'selectAll':
                            // Cmd/Ctrl+A: テーブルセル/コードブロックの段階選択
                            return handleSelectAll(view, ctx);
                        default:
                            // find は milkdownApp の capture リスナが処理する
                            return false;
                    }
                }
            }
        });
    });
}
