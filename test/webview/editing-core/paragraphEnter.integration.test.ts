/**
 * 段落での Enter / Shift+Enter の統合テスト。
 *
 * 日常で最も多い操作（改行）の回帰防止:
 *  - 段落末尾の Enter → 新しい空段落
 *  - 段落途中の Enter → カーソル位置で分割
 *  - Shift+Enter → 同一段落内のソフトブレイク（hardBreak）
 *
 * previewKeymapPlugin を載せたハーネスエディタで、DOM keydown を送って検証する。
 * （Enter の段落分割自体は commonmark の baseKeymap が担うが、previewKeymapPlugin が
 *  Enter を奪っていない＝通常の改行を妨げないことの回帰防止も兼ねる。）
 */
import '../jsdomSetup';
import * as assert from 'assert';

import {
    createPreviewEditor,
    findFirstPosOfType,
    type PreviewEditorHandle
} from '../milkdownHarness';

function paragraphCount(h: PreviewEditorHandle): number {
    let n = 0;
    h.view.state.doc.forEach((node) => { if (node.type.name === 'paragraph') n++; });
    return n;
}

/** 各段落の textContent を配列で返す。 */
function paragraphTexts(h: PreviewEditorHandle): string[] {
    const texts: string[] = [];
    h.view.state.doc.forEach((node) => {
        if (node.type.name === 'paragraph') texts.push(node.textContent);
    });
    return texts;
}

/** doc 内に hardBreak ノードがいくつあるか。 */
function hardBreakCount(h: PreviewEditorHandle): number {
    let n = 0;
    h.view.state.doc.descendants((node) => { if (node.type.name === 'hardbreak') n++; });
    return n;
}

describe('webview統合: 段落での Enter / Shift+Enter', () => {
    let h: PreviewEditorHandle;
    afterEach(() => h?.destroy());

    it('段落末尾で Enter → 段落が1つ増える', async () => {
        h = await createPreviewEditor('hello\n');
        const pos = findFirstPosOfType(h, 'paragraph');
        h.setCursor(h.view.state.doc.resolve(pos).end());
        const before = paragraphCount(h);
        h.pressKey({ key: 'Enter', code: 'Enter' });
        assert.strictEqual(paragraphCount(h), before + 1, 'Enter で段落が増えていない');
    });

    it('段落途中で Enter → カーソル位置で2段落に分割される', async () => {
        h = await createPreviewEditor('helloworld\n');
        // "hello|world" の位置（段落中身の先頭 + 5）
        const start = findFirstPosOfType(h, 'paragraph');
        h.setCursor(start + 5);
        h.pressKey({ key: 'Enter', code: 'Enter' });
        assert.deepStrictEqual(paragraphTexts(h), ['hello', 'world'], '分割位置が想定外');
    });

    it('段落先頭で Enter → 上に空段落が入り、本文は2段落目になる', async () => {
        h = await createPreviewEditor('content\n');
        const start = findFirstPosOfType(h, 'paragraph');
        h.setCursor(start);
        h.pressKey({ key: 'Enter', code: 'Enter' });
        assert.deepStrictEqual(paragraphTexts(h), ['', 'content']);
    });

    it('Shift+Enter → 段落は増えず、hardBreak が1つ挿入される', async () => {
        h = await createPreviewEditor('line\n');
        const pos = findFirstPosOfType(h, 'paragraph');
        h.setCursor(h.view.state.doc.resolve(pos).end());
        const beforeParas = paragraphCount(h);
        h.pressKey({ key: 'Enter', code: 'Enter', shift: true });
        assert.strictEqual(paragraphCount(h), beforeParas, 'Shift+Enter で段落が分割されてはいけない');
        assert.strictEqual(hardBreakCount(h), 1, 'hardBreak（ソフトブレイク）が挿入されていない');
    });

    it('空段落で Enter → さらに空段落が増える（エラーにならない）', async () => {
        h = await createPreviewEditor('\n');
        const pos = findFirstPosOfType(h, 'paragraph');
        h.setCursor(pos);
        const before = paragraphCount(h);
        h.pressKey({ key: 'Enter', code: 'Enter' });
        assert.strictEqual(paragraphCount(h), before + 1);
    });
});
