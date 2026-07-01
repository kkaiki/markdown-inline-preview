/**
 * インライン書式トグル（Cmd+B / Cmd+I）の統合テスト。
 *
 * テキストを選択して Cmd+B で太字、Cmd+I で斜体、もう一度押すと解除という
 * 日常操作の回帰防止。commonmark プリセットのキーマップ（Mod-b / Mod-i）が
 * ハーネスエディタ上で機能することを検証する。
 *
 * 注意: commonmark の keymap は prosemirror-keymap の `Mod` 解決に従う。jsdom では
 * navigator.platform が "" のため `Mod` は Ctrl に解決される（Mac 実機では Cmd）。
 * よってここでは ctrl 修飾で押下する（= 実機の Cmd/Ctrl 押下に相当）。
 */
import './jsdomSetup';
import * as assert from 'assert';
import type { Mark } from '@milkdown/prose/model';

import {
    createPreviewEditor,
    findFirstPosOfType,
    type PreviewEditorHandle
} from './milkdownHarness';

/** 指定 mark を持つテキストが doc 内に存在するか。 */
function hasMark(h: PreviewEditorHandle, markName: string): boolean {
    let found = false;
    h.view.state.doc.descendants((node) => {
        if (found || !node.isText) return true;
        if (node.marks.some((m: Mark) => m.type.name === markName)) { found = true; return false; }
        return true;
    });
    return found;
}

/** 段落本文（"abcde"）全体を選択する。 */
function selectWholeParagraph(h: PreviewEditorHandle): void {
    const pos = findFirstPosOfType(h, 'paragraph');
    const $pos = h.view.state.doc.resolve(pos);
    h.setSelection($pos.start(), $pos.end());
}

describe('webview統合: インライン書式トグル (Cmd+B / Cmd+I)', () => {
    let h: PreviewEditorHandle;
    afterEach(() => h?.destroy());

    it('テキスト選択 + Cmd+B → 太字(strong)になる', async () => {
        h = await createPreviewEditor('abcde\n');
        selectWholeParagraph(h);
        h.pressKey({ key: 'b', code: 'KeyB', ctrl: true });
        assert.strictEqual(hasMark(h, 'strong'), true, '太字になっていない');
    });

    it('太字を選択して再度 Cmd+B → 太字が解除される', async () => {
        h = await createPreviewEditor('**abcde**\n');
        assert.strictEqual(hasMark(h, 'strong'), true, '前提: 太字で読み込まれている');
        selectWholeParagraph(h);
        h.pressKey({ key: 'b', code: 'KeyB', ctrl: true });
        assert.strictEqual(hasMark(h, 'strong'), false, '太字が解除されていない');
    });

    it('テキスト選択 + Cmd+I → 斜体(emphasis)になる', async () => {
        h = await createPreviewEditor('abcde\n');
        selectWholeParagraph(h);
        h.pressKey({ key: 'i', code: 'KeyI', ctrl: true });
        assert.strictEqual(hasMark(h, 'emphasis'), true, '斜体になっていない');
    });

    it('斜体を選択して再度 Cmd+I → 斜体が解除される', async () => {
        h = await createPreviewEditor('*abcde*\n');
        assert.strictEqual(hasMark(h, 'emphasis'), true, '前提: 斜体で読み込まれている');
        selectWholeParagraph(h);
        h.pressKey({ key: 'i', code: 'KeyI', ctrl: true });
        assert.strictEqual(hasMark(h, 'emphasis'), false, '斜体が解除されていない');
    });

    it('太字にしてから Cmd+I → 太字+斜体が共存する', async () => {
        h = await createPreviewEditor('abcde\n');
        selectWholeParagraph(h);
        h.pressKey({ key: 'b', code: 'KeyB', ctrl: true });
        selectWholeParagraph(h);
        h.pressKey({ key: 'i', code: 'KeyI', ctrl: true });
        assert.strictEqual(hasMark(h, 'strong'), true, '太字が失われた');
        assert.strictEqual(hasMark(h, 'emphasis'), true, '斜体が付かなかった');
    });
});
