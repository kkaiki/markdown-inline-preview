/**
 * ツールバーのホバー（チートシート）に出すショートカット表示データの純関数テスト。
 *
 * ユーザー要望（2026-08-10）:「上の h1 などにホバーした時に、どのショートカットキーが
 * 対応しているかが見えるようにして欲しい（チートシート）」。
 *
 * 表示は Mac / Windows で記号が変わるため、
 *   - 対応表が `NOTION_BLOCK_KEYMAP` や実際のキーマップとズレないこと
 *   - プラットフォーム判定と文字列整形
 * をここ（jsdom 不要の純関数層）で固定する。DOM に出す部分は
 * `test/browser/live/shortcuts/toolbarTooltip.test.ts` が実ブラウザで担保する。
 */
import * as assert from 'assert';
import {
    BLOCK_SHORTCUTS,
    COMMAND_SHORTCUTS,
    INLINE_SHORTCUTS,
    formatShortcut,
    isMacPlatform,
    shortcutKeys
} from '../../../src/shared/shortcutHints';
import { NOTION_BLOCK_KEYMAP } from '../../../src/shared/notionBlockKeymap';

describe('ショートカットのホバー表示（チートシート）', () => {
    it('ブロック変換は Mac が ⌥⌘数字、Windows が Ctrl+Shift+数字', () => {
        assert.deepStrictEqual(BLOCK_SHORTCUTS.heading1.mac, ['⌥', '⌘', '1']);
        assert.deepStrictEqual(BLOCK_SHORTCUTS.heading1.win, ['Ctrl', 'Shift', '1']);
        assert.deepStrictEqual(BLOCK_SHORTCUTS.blockquote.mac, ['⌥', '⌘', '9']);
        assert.deepStrictEqual(BLOCK_SHORTCUTS.todo.win, ['Ctrl', 'Shift', '4']);
    });

    it('ブロック変換の数字はキーマップ本体（NOTION_BLOCK_KEYMAP）と必ず一致する', () => {
        for (const [n, action] of Object.entries(NOTION_BLOCK_KEYMAP)) {
            const keys = BLOCK_SHORTCUTS[action];
            assert.ok(keys, `${action} のショートカット表示が無い`);
            assert.strictEqual(keys.mac[keys.mac.length - 1], n, `${action} の Mac 表示の数字が違う`);
            assert.strictEqual(keys.win[keys.win.length - 1], n, `${action} の Windows 表示の数字が違う`);
        }
    });

    it('インライン書式は Notion 準拠のキーを表示する', () => {
        assert.deepStrictEqual(INLINE_SHORTCUTS.bold.mac, ['⌘', 'B']);
        assert.deepStrictEqual(INLINE_SHORTCUTS.bold.win, ['Ctrl', 'B']);
        assert.deepStrictEqual(INLINE_SHORTCUTS.strikethrough.mac, ['⌘', '⇧', 'S']);
        assert.deepStrictEqual(INLINE_SHORTCUTS.strikethrough.win, ['Ctrl', 'Shift', 'S']);
        assert.deepStrictEqual(INLINE_SHORTCUTS.code.mac, ['⌘', 'E']);
        assert.deepStrictEqual(INLINE_SHORTCUTS.link.mac, ['⌘', 'K']);
    });

    it('全てのインライン書式にショートカット表示がある', () => {
        for (const format of ['bold', 'italic', 'underline', 'strikethrough', 'code', 'highlight', 'comment', 'link'] as const) {
            assert.ok(INLINE_SHORTCUTS[format], `${format} のショートカット表示が無い`);
        }
    });

    it('モード切替やブロック操作もチートシートに載る', () => {
        assert.deepStrictEqual(COMMAND_SHORTCUTS.switchRaw.mac, ['⌘', '⇧', '.']);
        assert.deepStrictEqual(COMMAND_SHORTCUTS.toggleTask.mac, ['⌘', '⏎']);
        assert.deepStrictEqual(COMMAND_SHORTCUTS.duplicateBlock.win, ['Ctrl', 'D']);
        assert.deepStrictEqual(COMMAND_SHORTCUTS.moveBlockUp.mac, ['⌘', '⇧', '↑']);
    });

    it('プラットフォームに応じて表示するキー列を選ぶ', () => {
        assert.deepStrictEqual(shortcutKeys(BLOCK_SHORTCUTS.heading2, true), ['⌥', '⌘', '2']);
        assert.deepStrictEqual(shortcutKeys(BLOCK_SHORTCUTS.heading2, false), ['Ctrl', 'Shift', '2']);
        assert.deepStrictEqual(shortcutKeys(undefined, true), []);
    });

    it('Mac は記号を続けて、Windows は + で繋いで表示する', () => {
        assert.strictEqual(formatShortcut(BLOCK_SHORTCUTS.heading1, true), '⌥⌘1');
        assert.strictEqual(formatShortcut(BLOCK_SHORTCUTS.heading1, false), 'Ctrl+Shift+1');
        assert.strictEqual(formatShortcut(INLINE_SHORTCUTS.bold, true), '⌘B');
        assert.strictEqual(formatShortcut(undefined, true), '');
    });

    it('Mac 判定は navigator.platform / userAgent のどちらの表記でも効く', () => {
        assert.strictEqual(isMacPlatform('MacIntel'), true);
        assert.strictEqual(isMacPlatform('macOS'), true);
        assert.strictEqual(isMacPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'), true);
        assert.strictEqual(isMacPlatform('Win32'), false);
        assert.strictEqual(isMacPlatform('Linux x86_64'), false);
        assert.strictEqual(isMacPlatform(undefined), false);
    });
});
