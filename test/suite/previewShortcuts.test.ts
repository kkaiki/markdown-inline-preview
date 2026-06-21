import * as assert from 'assert';

import {
    classifyPreviewShortcut,
    getNotionBlockAction,
    isModPressed,
    NOTION_BLOCK_KEYMAP,
    type KeyLike,
    type NotionBlockAction
} from '../../src/shared/preview/previewShortcuts';

/** テスト用の KeyLike を作る。既定は修飾なし。 */
function key(over: Partial<KeyLike>): KeyLike {
    return {
        key: '',
        code: '',
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        ...over
    };
}

/** Mac の Cmd+Opt+<数字>。 */
function macNotion(digit: number): KeyLike {
    return key({ code: `Digit${digit}`, key: String(digit), metaKey: true, altKey: true });
}

/** Windows/Linux の Ctrl+Alt+<数字>。 */
function winNotion(digit: number): KeyLike {
    return key({ code: `Digit${digit}`, key: String(digit), ctrlKey: true, altKey: true });
}

describe('previewShortcuts: getNotionBlockAction', () => {
    const expected: Array<[number, NotionBlockAction | null]> = [
        [0, 'paragraph'],
        [1, 'heading1'],
        [2, 'heading2'],
        [3, 'heading3'],
        [4, 'todo'],
        [5, 'bulletList'],
        [6, 'orderedList'],
        [7, null], // 意図的に未割り当て
        [8, 'codeBlock'],
        [9, 'blockquote']
    ];

    for (const [n, action] of expected) {
        it(`${n} -> ${action ?? 'null'}`, () => {
            assert.strictEqual(getNotionBlockAction(n), action);
        });
    }

    it('keymap has no entry for 7', () => {
        assert.ok(!(7 in NOTION_BLOCK_KEYMAP));
    });
});

describe('previewShortcuts: isModPressed', () => {
    it('true for Cmd (meta)', () => {
        assert.strictEqual(isModPressed(key({ metaKey: true })), true);
    });
    it('true for Ctrl', () => {
        assert.strictEqual(isModPressed(key({ ctrlKey: true })), true);
    });
    it('false for Alt/Shift only', () => {
        assert.strictEqual(isModPressed(key({ altKey: true, shiftKey: true })), false);
    });
});

describe('previewShortcuts: classifyPreviewShortcut - Notion blocks', () => {
    it('Cmd+Opt+5 (Mac) -> bulletList', () => {
        assert.deepStrictEqual(classifyPreviewShortcut(macNotion(5)), {
            kind: 'notionBlock',
            n: 5,
            action: 'bulletList'
        });
    });

    it('Ctrl+Alt+5 (Win/Linux) -> bulletList', () => {
        assert.deepStrictEqual(classifyPreviewShortcut(winNotion(5)), {
            kind: 'notionBlock',
            n: 5,
            action: 'bulletList'
        });
    });

    it('Cmd+Opt+1 -> heading1', () => {
        assert.deepStrictEqual(classifyPreviewShortcut(macNotion(1)), {
            kind: 'notionBlock',
            n: 1,
            action: 'heading1'
        });
    });

    it('Cmd+Opt+7 -> null (未割り当て)', () => {
        assert.strictEqual(classifyPreviewShortcut(macNotion(7)), null);
    });

    it('Mac の Alt+数字で key が記号でも code で判定できる', () => {
        // Mac だと Cmd+Opt+5 の event.key は "∞" などになるが code は Digit5
        const e = key({ code: 'Digit5', key: '∞', metaKey: true, altKey: true });
        assert.deepStrictEqual(classifyPreviewShortcut(e), {
            kind: 'notionBlock',
            n: 5,
            action: 'bulletList'
        });
    });

    it('Opt+5（Mod なし）は無効', () => {
        assert.strictEqual(classifyPreviewShortcut(key({ code: 'Digit5', altKey: true })), null);
    });

    it('Cmd+5（Opt なし）は Notion ブロックではない', () => {
        assert.strictEqual(classifyPreviewShortcut(key({ code: 'Digit5', metaKey: true })), null);
    });

    it('Cmd+Opt+Shift+5 は無効（Shift 付き）', () => {
        const e = key({ code: 'Digit5', metaKey: true, altKey: true, shiftKey: true });
        assert.strictEqual(classifyPreviewShortcut(e), null);
    });
});

describe('previewShortcuts: classifyPreviewShortcut - selectAll / find', () => {
    it('Cmd+A -> selectAll', () => {
        assert.deepStrictEqual(classifyPreviewShortcut(key({ code: 'KeyA', key: 'a', metaKey: true })), {
            kind: 'selectAll'
        });
    });
    it('Ctrl+A -> selectAll', () => {
        assert.deepStrictEqual(classifyPreviewShortcut(key({ code: 'KeyA', key: 'a', ctrlKey: true })), {
            kind: 'selectAll'
        });
    });
    it('Cmd+F -> find', () => {
        assert.deepStrictEqual(classifyPreviewShortcut(key({ code: 'KeyF', key: 'f', metaKey: true })), {
            kind: 'find'
        });
    });
    it('Cmd+Opt+A は selectAll ではない（Alt 付き）', () => {
        assert.strictEqual(classifyPreviewShortcut(key({ code: 'KeyA', key: 'a', metaKey: true, altKey: true })), null);
    });
    it('A 単体は無効', () => {
        assert.strictEqual(classifyPreviewShortcut(key({ code: 'KeyA', key: 'a' })), null);
    });
});

describe('previewShortcuts: classifyPreviewShortcut - toggleRaw', () => {
    it('Cmd+Shift+M -> toggleRaw', () => {
        assert.deepStrictEqual(
            classifyPreviewShortcut(key({ code: 'KeyM', key: 'm', metaKey: true, shiftKey: true })),
            { kind: 'toggleRaw' }
        );
    });
    it('Ctrl+Shift+M -> toggleRaw', () => {
        assert.deepStrictEqual(
            classifyPreviewShortcut(key({ code: 'KeyM', key: 'M', ctrlKey: true, shiftKey: true })),
            { kind: 'toggleRaw' }
        );
    });
    it('Cmd+M（Shift なし）は無効', () => {
        assert.strictEqual(classifyPreviewShortcut(key({ code: 'KeyM', key: 'm', metaKey: true })), null);
    });
    it('Cmd+Shift+Opt+M（Alt 付き）は toggleRaw ではない', () => {
        assert.strictEqual(
            classifyPreviewShortcut(key({ code: 'KeyM', key: 'm', metaKey: true, shiftKey: true, altKey: true })),
            null
        );
    });
});

describe('previewShortcuts: classifyPreviewShortcut - fenceEnter', () => {
    it('Enter（修飾なし）-> fenceEnter', () => {
        assert.deepStrictEqual(classifyPreviewShortcut(key({ key: 'Enter' })), { kind: 'fenceEnter' });
    });
    it('Shift+Enter は fenceEnter ではない', () => {
        assert.strictEqual(classifyPreviewShortcut(key({ key: 'Enter', shiftKey: true })), null);
    });
    it('Cmd+Enter は fenceEnter ではない', () => {
        assert.strictEqual(classifyPreviewShortcut(key({ key: 'Enter', metaKey: true })), null);
    });
});

describe('previewShortcuts: 関係ないキー', () => {
    it('Cmd+S -> null', () => {
        assert.strictEqual(classifyPreviewShortcut(key({ code: 'KeyS', key: 's', metaKey: true })), null);
    });
    it('修飾なしの普通の文字 -> null', () => {
        assert.strictEqual(classifyPreviewShortcut(key({ code: 'KeyB', key: 'b' })), null);
    });
});
