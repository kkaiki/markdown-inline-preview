/**
 * Preview（Milkdown）向けのキーボードショートカット。
 *
 * - `Cmd/Ctrl+A`: まずカーソルのある「行（テキストブロック）」全体を選択し、もう一度押すと
 *   既定の全選択（文書全体）へ。テーブルセル内はセル内容 → 行 → 表全体 と段階選択。
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
    createCodeBlockCommand,
    wrapInBlockquoteCommand,
    splitListItemCommand
} from '@milkdown/kit/preset/commonmark';
import { selectTableCommand } from '@milkdown/kit/preset/gfm';
import { wrapInList, liftListItem } from '@milkdown/prose/schema-list';
import { Plugin, PluginKey, TextSelection, AllSelection } from '@milkdown/prose/state';
import { CellSelection } from '@milkdown/prose/tables';
import type { ResolvedPos } from '@milkdown/prose/model';
import type { EditorView } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';
import { classifyPreviewShortcut, type NotionBlockAction } from '../../shared/preview/previewShortcuts';
import { getExpandedBlock, setBlockPrefixExpansionSuppressed, collapseCurrentExpandedBlock } from './blockPrefixEditPlugin';

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
 * 現在の選択で `handleSelectAll` が「段階選択を行う（true を返す）」かどうかを判定する。
 *
 * 実際の選択変更は必ず ProseMirror の handleKeyDown 経路（＝PM のイベント処理内）で
 * 行う必要がある。capture フェーズ（PM の外）で CellSelection を dispatch すると、
 * 直後の selectionchange を domObserver が読み戻して行/表選択が即取り消されるため。
 * capture 側はこの述語で「native の Select All を抑止すべきか」だけを判断する。
 */
export function previewSelectAllApplies(view: EditorView): boolean {
    const { state } = view;
    const sel = state.selection;

    // 既に文書全体（AllSelection）まで来たら、以降は何もしない。
    if (sel instanceof AllSelection) return false;
    // セル選択（行/表）・コード・セル・テキストブロックのいずれの段階でも、
    // handleSelectAll はまだ次の段階（最終は文書全体）へ進めるので true。
    if (sel instanceof CellSelection) return true;

    const $from = sel.$from;
    if (findDepth($from, ['code_block']) > 0) return true;
    if (tableCellDepth($from) >= 0) return true;
    if ($from.parent.isTextblock) return true;
    return false; // テキストブロック外（画像など）→ 既定に委ねる
}


/** 文書全体を選択する（AllSelection）。`scrollIntoView` はしない（先頭へ飛ばさない）。 */
function selectWholeDoc(view: EditorView): boolean {
    view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));
    return true;
}

/**
 * Cmd+A 段階選択:
 * - 通常のテキストブロック（段落・見出し・リスト項目など）: 行全体 → 文書全体。
 * - テーブルセル内: セルの中身 → 行全体 → 表全体 → 文書全体。
 * - コードブロック内: ブロック内容 → 文書全体。
 * - テキストブロック外（画像など）: false（既定の全選択に委ねる）。
 *
 * 「文書全体」段階は **AllSelection を明示的に dispatch** する（以前は false を返して
 * ブラウザ/Electron の native「Select All」に委ねていたが、webview では効かず・効いても
 * 先頭行へ巻き戻る等で不安定だった）。これにより 2 回目で確実に文書全体になり、テストでも
 * 検証できる。
 */
export function handleSelectAll(view: EditorView, ctx: Ctx): boolean {
    const { state } = view;
    const sel = state.selection;

    // 既に文書全体（AllSelection）なら、これ以上広げない（先頭行へ巻き戻さない）。
    if (sel instanceof AllSelection) return false;

    // 既にテーブルのセル選択（行 or 表）の場合の段階遷移
    if (sel instanceof CellSelection) {
        // 行選択（複数列の表で全列に跨る = 表全体）→ 文書全体へ
        if (sel.isRowSelection() && sel.isColSelection()) return selectWholeDoc(view);
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
        if (isCodeSelected) return selectWholeDoc(view); // 2 回目 → 文書全体
        view.dispatch(state.tr.setSelection(codeContent).scrollIntoView());
        return true;
    }

    // テーブルセル（tableRole で判定）。セルをクリックした場合は NodeSelection に
    // なり $from がセル階層を指すため、段落 depth に依存せずセル範囲から算出する。
    const cellDepth = tableCellDepth($from);
    if (cellDepth >= 0) {
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

    // 通常のテキストブロック（段落・見出し・リスト項目など）:
    // 1 回目はカーソルのある「行（テキストブロック）」の中身を丸ごと選択。
    // 2 回目（既に行全体が選択済み）は文書全体（AllSelection）にする。
    if ($from.parent.isTextblock) {
        // blockPrefixEditPlugin が展開中のとき、$from.start() はプレフィックス挿入後に
        // プレフィックス末尾を指す場合がある。contentStart を使って明示的にプレフィックスを
        // 含む範囲（## や - [ ] を含む）から選択する。
        const expanded = getExpandedBlock();
        const blockStart = expanded ? expanded.contentStart : $from.start();
        const blockEnd = $from.end();

        const isBlockSelected =
            sel instanceof TextSelection && sel.from === blockStart && sel.to === blockEnd && blockStart < blockEnd;
        if (isBlockSelected) return selectWholeDoc(view);

        const lineContent = TextSelection.create(state.doc, blockStart, blockEnd);
        view.dispatch(state.tr.setSelection(lineContent).scrollIntoView());
        return true;
    }

    return false; // テキストブロック外 → 既定の全選択
}

/** `handleSelectAllCapture` が受け取るイベントの最小インターフェース（テスト容易化のため）。 */
export interface SelectAllCaptureEvent {
    preventDefault(): void;
    stopPropagation(): void;
}

/**
 * `document` の **capture フェーズ**（`milkdownApp.ts` の keydown リスナ）から呼ぶ
 * Cmd/Ctrl+A ハンドラ。段階選択を実行できたら `preventDefault` + `stopPropagation` する。
 *
 * capture でここまで行うのは次の 2 つを同時に満たすため:
 *  1. `preventDefault` で **ブラウザ/Electron の native「Select All」を抑止**する。これを
 *     plugin の `handleKeyDown`（bubble 相当）に任せると、読み込み順により native が先に
 *     走って段階選択が無視されることがある（＝「`Cmd+A` で全部選択されてしまう」バグ）。
 *  2. `stopPropagation` で同じ keydown を **plugin の `handleKeyDown` へ流さない**。両方が
 *     `handleSelectAll` を呼ぶと 1 回の押下で 2 段階進んでしまう（capture=セル内容 → plugin=行）。
 *
 * フォーカスが無い／段階選択が不要な段階（`handleSelectAll` が `false`）のときは何もしない
 * （`false` を返し、native の全選択に委ねる）。
 *
 * @returns 抑止した（preventDefault/stopPropagation した）場合 true
 */
export function handleSelectAllCapture(
    view: EditorView,
    ctx: Ctx,
    event: SelectAllCaptureEvent
): boolean {
    if (!view.hasFocus()) return false;
    if (!handleSelectAll(view, ctx)) return false;
    event.preventDefault();
    event.stopPropagation();
    return true;
}

function makeTodo(view: EditorView, ctx: Ctx): void {
    // 展開抑制: wrapInBulletList 後に blockPrefixEditPlugin が "- " を展開し、
    // 続く setNodeAttribute(checked=false) で collapse が走って checked が null に
    // 戻るのを防ぐ（Bug1）。
    setBlockPrefixExpansionSuppressed(true);
    try {
        const commands = ctx.get(commandsCtx);
        if (findDepth(view.state.selection.$from, ['list_item']) < 0) {
            commands.call(wrapInBulletListCommand.key);
        }
        const { state } = view;
        const depth = findDepth(state.selection.$from, ['list_item']);
        if (depth < 0) return;
        const pos = state.selection.$from.before(depth);
        view.dispatch(state.tr.setNodeAttribute(pos, 'checked', false));
    } finally {
        setBlockPrefixExpansionSuppressed(false);
    }
}

/**
 * 箇条書き / 番号付きリストの適用・相互変換・解除。
 *
 * Milkdown 既定の `wrapInBulletList` / `wrapInOrderedList` は「リストでないブロックを
 * 囲む」だけで、既存の箇条書きを番号付きに変える（その逆も）ことができない。
 * そのため箇条書きの中で番号付きショートカットを押しても何も起きなかった。
 * ここでは選択中のリストを直接別種へ変換し、番号も振り直す。
 *
 * - リスト外: 指定種別で囲む。
 * - 別種のリスト内: リストノードの種別を変換し、各項目の listType/label を更新。
 * - 同種のリスト内: リストを解除（項目を持ち上げて段落へ戻す）。
 */
export function applyListType(view: EditorView, target: 'bullet' | 'ordered'): boolean {
    const { state } = view;
    const { schema } = state;
    const bulletType = schema.nodes.bullet_list;
    const orderedType = schema.nodes.ordered_list;
    const listItemType = schema.nodes.list_item;
    if (!bulletType || !orderedType || !listItemType) return false;
    const targetType = target === 'ordered' ? orderedType : bulletType;

    const { $from } = state.selection;
    let listDepth = -1;
    for (let depth = $from.depth; depth > 0; depth--) {
        const type = $from.node(depth).type;
        if (type === bulletType || type === orderedType) {
            listDepth = depth;
            break;
        }
    }

    // リスト外 → 指定種別で囲む。
    if (listDepth < 0) {
        const wrapped = wrapInList(targetType)(state, view.dispatch, view);
        view.focus();
        return wrapped;
    }

    const listNode = $from.node(listDepth);

    // 同種のリスト内 → 解除（段落へ戻す）。ツールバーのアクティブ表示と対になる。
    // liftListItem 後は nodePos が無効になるため、先にプレフィックスを畳む（Bug3）。
    if (listNode.type === targetType) {
        collapseCurrentExpandedBlock(view);
        const lifted = liftListItem(listItemType)(view.state, view.dispatch, view);
        view.focus();
        return lifted;
    }

    // 別種のリスト内 → ノード種別を変換し、各項目の listType/label を更新する。
    const listPos = $from.before(listDepth);
    const tr = state.tr.setNodeMarkup(listPos, targetType);
    listNode.forEach((child, offset, index) => {
        if (child.type !== listItemType) return;
        const childPos = listPos + 1 + offset;
        tr.setNodeMarkup(childPos, undefined, {
            ...child.attrs,
            listType: target === 'ordered' ? 'ordered' : 'bullet',
            label: target === 'ordered' ? `${index + 1}.` : '•'
        });
    });
    view.dispatch(tr);
    view.focus();
    return true;
}

/** カーソルのあるテキストブロックが見出しなら、その level を返す（でなければ null）。 */
function currentHeadingLevel(view: EditorView): number | null {
    const { $from } = view.state.selection;
    for (let depth = $from.depth; depth >= 0; depth--) {
        const node = $from.node(depth);
        if (node.type.name === 'heading') return node.attrs.level as number;
    }
    return null;
}

/**
 * 段落へ戻す（Cmd/Ctrl+Opt+0）。見出し・コードブロックは turnIntoText で本文化するが、
 * リスト項目の中にいる場合は先にリストを持ち上げて段落へ戻す（Notion の挙動に合わせる）。
 */
function turnIntoParagraph(view: EditorView, ctx: Ctx): boolean {
    const listItemType = view.state.schema.nodes.list_item;
    if (listItemType && findDepth(view.state.selection.$from, ['list_item']) >= 0) {
        // ネストの分だけ、リスト外に出るまで項目を持ち上げる。
        let guard = 0;
        while (findDepth(view.state.selection.$from, ['list_item']) >= 0 && guard < 10) {
            const lifted = liftListItem(listItemType)(view.state, view.dispatch, view);
            if (!lifted) break;
            guard++;
        }
        view.focus();
        return true;
    }
    ctx.get(commandsCtx).call(turnIntoTextCommand.key);
    return true;
}

/**
 * 見出し化（Cmd/Ctrl+Opt+1〜3）。すでに同じレベルの見出しなら段落へ戻す（トグル）。
 * Notion で同じ見出しショートカットをもう一度押すと本文に戻るのと同じ操作感。
 */
function applyHeading(view: EditorView, ctx: Ctx, level: number): boolean {
    if (currentHeadingLevel(view) === level) {
        ctx.get(commandsCtx).call(turnIntoTextCommand.key);
        return true;
    }
    ctx.get(commandsCtx).call(wrapInHeadingCommand.key, level);
    return true;
}

/** Notion 風ブロック変換。種別ごとに対応する Milkdown コマンドを実行する。 */
function runNotionBlock(view: EditorView, ctx: Ctx, action: NotionBlockAction): boolean {
    const commands = ctx.get(commandsCtx);
    switch (action) {
        case 'paragraph': return turnIntoParagraph(view, ctx);
        case 'heading1': return applyHeading(view, ctx, 1);
        case 'heading2': return applyHeading(view, ctx, 2);
        case 'heading3': return applyHeading(view, ctx, 3);
        case 'todo': makeTodo(view, ctx); return true;
        case 'bulletList': return applyListType(view, 'bullet');
        case 'orderedList': return applyListType(view, 'ordered');
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

/**
 * Cmd/Ctrl+← の 2 段階行頭移動。
 *
 * blockPrefixEditPlugin がプレフィックスを展開中のとき：
 *   1. カーソルがコンテンツ内（プレフィックス後）→ プレフィックス直後（コンテンツ先頭）へ
 *   2. カーソルがコンテンツ先頭         → ブロック先頭（プレフィックス前）へ
 *   3. カーソルがブロック先頭           → return false（ブラウザ既定に委ねる）
 *
 * 展開中でなければ return false（ブラウザ既定の Cmd+← に委ねる）。
 */
function handleLineStart(view: EditorView): boolean {
    const expanded = getExpandedBlock();
    if (!expanded) return false;

    const { state } = view;
    const { $from, empty } = state.selection;
    if (!empty) return false;

    const { contentStart, prefix } = expanded;
    const contentBodyStart = contentStart + prefix.length; // プレフィックス後のコンテンツ先頭

    if ($from.pos > contentBodyStart) {
        // コンテンツ内 → コンテンツ先頭へ
        view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, contentBodyStart)));
        return true;
    }
    if ($from.pos > contentStart) {
        // プレフィックス内 or コンテンツ先頭 → ブロック先頭へ
        view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, contentStart)));
        return true;
    }
    // 既にブロック先頭 → ブラウザ既定に委ねる
    return false;
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
                        case 'lineStart':
                            // Cmd/Ctrl+←: プレフィックス展開中の 2 段階行頭移動
                            if (handleLineStart(view)) {
                                event.preventDefault();
                                return true;
                            }
                            return false;
                        default:
                            // find は milkdownApp の capture リスナが処理する
                            return false;
                    }
                }
            }
        });
    });
}
