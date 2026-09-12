/**
 * 「この操作に対応するショートカットキー」の**表示用**データ（チートシート）。
 *
 * ユーザー要望（2026-08-10）: ツールバーの H1 などにホバーしたら、その操作の
 * ショートカットキーが見えるようにする。
 *
 * キーの割り当て自体は Live が `liveKeymap.ts`、Raw が `package.json` の
 * `contributes.keybindings` に持つ。ここはあくまで**人に見せる文字列**だけを扱う純関数層で、
 * ブロック変換の数字だけは `NOTION_BLOCK_KEYMAP` から生成して割り当て本体とズレないようにする。
 *
 * 仕様: docs/specifications/notion-shortcuts.md §1、
 *       docs/specifications/live-mode/requirements.md §4.6.1
 */
import type { InlineFormat } from './inlineFormat';
import { NOTION_BLOCK_KEYMAP, type NotionBlockAction } from './notionBlockKeymap';

/** 1 キー 1 要素で並べる表示用のキー列（Mac と Windows / Linux で別）。 */
export interface ShortcutKeys {
    /** macOS の表示。例: `['⌥', '⌘', '1']` */
    mac: string[];
    /** Windows / Linux の表示。例: `['Ctrl', 'Shift', '1']` */
    win: string[];
}

/** ツールバー以外も含めた、キーの付いた操作の名前。 */
export type ShortcutCommand =
    | 'switchRaw'
    | 'toggleTask'
    | 'duplicateBlock'
    | 'moveBlockUp'
    | 'moveBlockDown'
    | 'blockNewline';

/** ブロック変換（⌥⌘0〜9 / Ctrl+Shift+0〜9）。対応表は `NOTION_BLOCK_KEYMAP` が正。 */
export const BLOCK_SHORTCUTS: Readonly<Record<NotionBlockAction, ShortcutKeys>> = buildBlockShortcuts();

function buildBlockShortcuts(): Record<NotionBlockAction, ShortcutKeys> {
    const table = {} as Record<NotionBlockAction, ShortcutKeys>;
    for (const [n, action] of Object.entries(NOTION_BLOCK_KEYMAP)) {
        // Notion の割り当て: Mac は ⌥⌘数字、Windows / Linux は Ctrl+Shift+数字
        table[action] = { mac: ['⌥', '⌘', n], win: ['Ctrl', 'Shift', n] };
    }
    return table;
}

/** インライン書式（docs/specifications/notion-shortcuts.md §1.1）。 */
export const INLINE_SHORTCUTS: Readonly<Record<InlineFormat, ShortcutKeys>> = {
    bold: { mac: ['⌘', 'B'], win: ['Ctrl', 'B'] },
    italic: { mac: ['⌘', 'I'], win: ['Ctrl', 'I'] },
    underline: { mac: ['⌘', 'U'], win: ['Ctrl', 'U'] },
    strikethrough: { mac: ['⌘', '⇧', 'S'], win: ['Ctrl', 'Shift', 'S'] },
    code: { mac: ['⌘', 'E'], win: ['Ctrl', 'E'] },
    link: { mac: ['⌘', 'K'], win: ['Ctrl', 'K'] },
    highlight: { mac: ['⌘', '⇧', 'H'], win: ['Ctrl', 'Shift', 'H'] },
    comment: { mac: ['⌘', '⇧', 'M'], win: ['Ctrl', 'Shift', 'M'] }
};

/** ブロック操作・モード切替（docs/specifications/notion-shortcuts.md §1.3, §2）。 */
export const COMMAND_SHORTCUTS: Readonly<Record<ShortcutCommand, ShortcutKeys>> = {
    switchRaw: { mac: ['⌘', '⇧', '.'], win: ['Ctrl', 'Shift', '.'] },
    toggleTask: { mac: ['⌘', '⏎'], win: ['Ctrl', 'Enter'] },
    duplicateBlock: { mac: ['⌘', 'D'], win: ['Ctrl', 'D'] },
    moveBlockUp: { mac: ['⌘', '⇧', '↑'], win: ['Ctrl', 'Shift', '↑'] },
    moveBlockDown: { mac: ['⌘', '⇧', '↓'], win: ['Ctrl', 'Shift', '↓'] },
    blockNewline: { mac: ['⇧', '⏎'], win: ['Shift', 'Enter'] }
};

/** `navigator.platform` / `navigator.userAgent` のどちらを渡しても Mac を判定する。 */
export function isMacPlatform(platform: string | undefined | null): boolean {
    return /mac|iphone|ipad|ipod/i.test(platform ?? '');
}

/** プラットフォームに応じた表示用キー列。未定義なら空配列。 */
export function shortcutKeys(keys: ShortcutKeys | undefined, isMac: boolean): string[] {
    if (!keys) return [];
    return isMac ? keys.mac : keys.win;
}

/**
 * 1 行の文字列にする（`aria-keyshortcuts` や 1 行表示用）。
 * Mac は記号を続けて `⌥⌘1`、Windows / Linux は `Ctrl+Shift+1`。
 */
export function formatShortcut(keys: ShortcutKeys | undefined, isMac: boolean): string {
    const list = shortcutKeys(keys, isMac);
    return isMac ? list.join('') : list.join('+');
}
