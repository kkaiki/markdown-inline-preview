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
    wrapInBlockquoteCommand
} from '@milkdown/kit/preset/commonmark';
import { selectTableCommand } from '@milkdown/kit/preset/gfm';
import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';
import { CellSelection } from '@milkdown/prose/tables';
import type { ResolvedPos } from '@milkdown/prose/model';
import type { EditorView } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';

function findDepth($pos: ResolvedPos, names: string[]): number {
    for (let depth = $pos.depth; depth > 0; depth--) {
        if (names.includes($pos.node(depth).type.name)) return depth;
    }
    return -1;
}

/**
 * Cmd+A 段階選択:
 * - テーブルセル内: セル内容 → 全セル → （既定の全選択）。
 * - コードブロック内: ブロック内容 →（既定の全選択）。
 * - それ以外: false（既定の全選択に委ねる）。
 */
function handleSelectAll(view: EditorView, ctx: Ctx): boolean {
    const { state } = view;
    const sel = state.selection;

    // 既に全セル選択（CellSelection）→ 次は既定の全選択（ドキュメント全体）
    if (sel instanceof CellSelection) return false;

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

    // テーブルセル
    const cellDepth = findDepth($from, ['table_cell', 'table_header']);
    if (cellDepth < 0) return false; // セル外 → 既定の全選択

    const paraDepth = cellDepth + 1;
    if ($from.depth < paraDepth) return false;

    const cellContent = TextSelection.create(state.doc, $from.start(paraDepth), $from.end(paraDepth));
    const isCellSelected =
        sel instanceof TextSelection && sel.from === cellContent.from && sel.to === cellContent.to;

    if (isCellSelected) {
        // 2 回目: テーブルの全セルを選択（CellSelection）
        ctx.get(commandsCtx).call(selectTableCommand.key);
        return true;
    }

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

/** Notion 風ブロック変換。対応していない数字は false を返す。 */
function runNotionBlock(view: EditorView, ctx: Ctx, n: number): boolean {
    const commands = ctx.get(commandsCtx);
    switch (n) {
        case 0: commands.call(turnIntoTextCommand.key); return true;
        case 1: commands.call(wrapInHeadingCommand.key, 1); return true;
        case 2: commands.call(wrapInHeadingCommand.key, 2); return true;
        case 3: commands.call(wrapInHeadingCommand.key, 3); return true;
        case 4: makeTodo(view, ctx); return true;
        case 5: commands.call(wrapInBulletListCommand.key); return true;
        case 6: commands.call(wrapInOrderedListCommand.key); return true;
        case 8: commands.call(createCodeBlockCommand.key); return true;
        case 9: commands.call(wrapInBlockquoteCommand.key); return true;
        default: return false;
    }
}

export function createPreviewKeymapPlugin() {
    return $prose((ctx) => {
        return new Plugin({
            key: new PluginKey('previewKeymap'),
            props: {
                handleKeyDown(view, event) {
                    const mod = event.metaKey || event.ctrlKey;
                    if (!mod) return false;

                    // Notion 風: Cmd/Ctrl+Opt+<数字>（Mac の Alt+数字は記号になるため code を見る）
                    if (event.altKey && !event.shiftKey) {
                        const match = /^Digit(\d)$/.exec(event.code);
                        if (match) {
                            const handled = runNotionBlock(view, ctx, Number(match[1]));
                            if (handled) {
                                event.preventDefault();
                                view.focus();
                                return true;
                            }
                        }
                        return false;
                    }

                    // Cmd/Ctrl+A（修飾は Mod のみ）: テーブルセル/コードブロックの段階選択
                    if (!event.altKey && !event.shiftKey && (event.code === 'KeyA' || event.key === 'a')) {
                        return handleSelectAll(view, ctx);
                    }

                    return false;
                }
            }
        });
    });
}
