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
import { NodeSelection, Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';
import type { ResolvedPos } from '@milkdown/prose/model';
import type { EditorView } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';

function findDepth($pos: ResolvedPos, names: string[]): number {
    for (let depth = $pos.depth; depth > 0; depth--) {
        if (names.includes($pos.node(depth).type.name)) return depth;
    }
    return -1;
}

/** テーブルセル内 Cmd+A: セル内容 → テーブル全体（その先は既定の全選択に委ねる）。 */
function handleCellSelectAll(view: EditorView): boolean {
    const { state } = view;
    const sel = state.selection;
    const $from = sel.$from;

    const cellDepth = findDepth($from, ['table_cell', 'table_header']);
    if (cellDepth < 0) return false; // セル外 → 既定の全選択

    const paraDepth = cellDepth + 1;
    if ($from.depth < paraDepth) return false;

    const cellContent = TextSelection.create(state.doc, $from.start(paraDepth), $from.end(paraDepth));
    const isCellSelected =
        sel instanceof TextSelection && sel.from === cellContent.from && sel.to === cellContent.to;

    const tableDepth = findDepth($from, ['table']);
    if (isCellSelected && tableDepth > 0) {
        view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, $from.before(tableDepth))));
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

                    // Cmd/Ctrl+A（修飾は Mod のみ）: テーブルセル段階選択
                    if (!event.altKey && !event.shiftKey && (event.code === 'KeyA' || event.key === 'a')) {
                        return handleCellSelectAll(view);
                    }

                    return false;
                }
            }
        });
    });
}
