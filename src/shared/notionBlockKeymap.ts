/**
 * Notion 風のブロック変換キーマップ（数字 → ブロック種別）。
 *
 * Raw（`package.json` の keybindings）と Live（CodeMirror の keymap）が
 * 同じ対応表を見ることで、両モードで同じ数字が同じブロックになる。
 *
 * 仕様: docs/specifications/notion-shortcuts.md §1.2
 */

/** Notion 風ブロック変換の種類。 */
export type NotionBlockAction =
    | 'paragraph'
    | 'heading1'
    | 'heading2'
    | 'heading3'
    | 'todo'
    | 'bulletList'
    | 'orderedList'
    | 'toggleList'
    | 'codeBlock'
    | 'blockquote';

/**
 * `Cmd/Ctrl+Opt+<数字>`（Windows は `Ctrl+Shift+<数字>` も）の数字 → ブロック種別の対応表。
 * Notion の割り当てをそのまま採用する（docs/specifications/notion-shortcuts.md §1.2）。
 *
 * 9 だけ Notion と意味が違う: Notion の「ページ化」は 1 つの .md に表現できないため、
 * Notion に数字ショートカットが無い引用（blockquote）を割り当てている。
 */
export const NOTION_BLOCK_KEYMAP: Readonly<Record<number, NotionBlockAction>> = {
    0: 'paragraph',
    1: 'heading1',
    2: 'heading2',
    3: 'heading3',
    4: 'todo',
    5: 'bulletList',
    6: 'orderedList',
    7: 'toggleList',
    8: 'codeBlock',
    9: 'blockquote'
};

/** 数字に対応する Notion ブロック種別を返す。未割り当ては null。 */
export function getNotionBlockAction(n: number): NotionBlockAction | null {
    return NOTION_BLOCK_KEYMAP[n] ?? null;
}
