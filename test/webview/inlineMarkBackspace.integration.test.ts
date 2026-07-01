/**
 * インライン記法マーカーの削除（インラインコード等の解除）統合テスト。
 *
 * 「`` ` `` が消せず記法を解除できない（編集できない）」不具合の回帰防止。
 * 実 Milkdown（jsdom）で、マーク範囲の端で Backspace/Delete するとそのマークが外れることを検証。
 */
import './jsdomSetup';
import * as assert from 'assert';
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { TextSelection } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import type { Mark } from '@milkdown/prose/model';

import {
    createInlineMarkBackspacePlugin,
    computeInlineMarkRemoval
} from '../../src/preview/webview/inlineMarkBackspace';

async function mkEditor(md: string): Promise<{ view: EditorView; destroy: () => void }> {
    const root = document.getElementById('root');
    if (!root) throw new Error('no root');
    root.innerHTML = '';
    const editor = await Editor.make()
        .config((ctx) => {
            ctx.set(rootCtx, root);
            ctx.set(defaultValueCtx, md);
        })
        .use(createInlineMarkBackspacePlugin())
        .use(commonmark)
        .use(gfm)
        .create();
    let view!: EditorView;
    editor.action((ctx) => { view = ctx.get(editorViewCtx); });
    return { view, destroy: () => void editor.destroy() };
}

function setCursor(view: EditorView, pos: number): void {
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
}

function pressKey(view: EditorView, key: string): void {
    const event = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    view.dom.dispatchEvent(event);
}

/** 指定 mark を持つ最初のテキストの [from, to]。 */
function markRange(view: EditorView, markName: string): { from: number; to: number } | null {
    let found: { from: number; to: number } | null = null;
    view.state.doc.descendants((node, pos) => {
        if (found || !node.isText) return true;
        if (node.marks.some((m: Mark) => m.type.name === markName)) {
            found = { from: pos, to: pos + (node.text?.length ?? 0) };
            return false;
        }
        return true;
    });
    return found;
}

function hasMark(view: EditorView, markName: string): boolean {
    return markRange(view, markName) !== null;
}

describe('webview統合: インライン記法マーカーの削除', () => {
    let h: { view: EditorView; destroy: () => void };
    afterEach(() => h?.destroy());

    it('インラインコードの末尾で Backspace → コード装飾が外れる（文字は残る）', async () => {
        h = await mkEditor('`code` rest\n');
        const range = markRange(h.view, 'inlineCode');
        assert.ok(range, 'inlineCode が見つからない');
        setCursor(h.view, range.to); // コードの閉じ位置（末尾）
        pressKey(h.view, 'Backspace');
        assert.strictEqual(hasMark(h.view, 'inlineCode'), false, 'inlineCode が外れていない');
        assert.ok(h.view.state.doc.textContent.includes('code'), '文字が消えてしまった');
    });

    it('インラインコードの先頭で Delete → コード装飾が外れる', async () => {
        h = await mkEditor('`code` rest\n');
        const range = markRange(h.view, 'inlineCode');
        assert.ok(range, 'inlineCode が見つからない');
        setCursor(h.view, range.from); // コードの開き位置（先頭）
        pressKey(h.view, 'Delete');
        assert.strictEqual(hasMark(h.view, 'inlineCode'), false, 'inlineCode が外れていない');
    });

    it('太字(strong)の末尾で Backspace → 太字が外れる', async () => {
        h = await mkEditor('**bold** rest\n');
        const range = markRange(h.view, 'strong');
        assert.ok(range, 'strong が見つからない');
        setCursor(h.view, range.to);
        pressKey(h.view, 'Backspace');
        assert.strictEqual(hasMark(h.view, 'strong'), false, 'strong が外れていない');
    });

    it('マーク中ほどでの Backspace は通常削除（マークは外さない）', async () => {
        h = await mkEditor('`code` rest\n');
        const range = markRange(h.view, 'inlineCode');
        assert.ok(range, 'inlineCode が見つからない');
        // 範囲の途中（"co|de"）では removal は null
        setCursor(h.view, range.from + 2);
        const removal = computeInlineMarkRemoval(h.view.state, 'backward');
        assert.strictEqual(removal, null, '中ほどではマーク解除しない');
    });

    it('マークが無い箇所では何もしない（null）', async () => {
        h = await mkEditor('plain text only\n');
        setCursor(h.view, 5);
        assert.strictEqual(computeInlineMarkRemoval(h.view.state, 'backward'), null);
        assert.strictEqual(computeInlineMarkRemoval(h.view.state, 'forward'), null);
    });
});
