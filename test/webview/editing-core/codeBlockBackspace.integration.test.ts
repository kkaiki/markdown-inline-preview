/**
 * コードブロックの解除（先頭 Backspace → 段落）統合テスト。
 * 「コードブロックの ``` を消せず編集できない」不具合の回帰防止。
 */
import '../jsdomSetup';
import * as assert from 'assert';
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { TextSelection } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';

import {
    createCodeBlockBackspacePlugin,
    codeBlockAtContentStart
} from '../../../src/preview/webview/codeBlockBackspace';

async function mkEditor(md: string): Promise<{ view: EditorView; destroy: () => void }> {
    const root = document.getElementById('root');
    if (!root) throw new Error('no root');
    root.innerHTML = '';
    const editor = await Editor.make()
        .config((ctx) => {
            ctx.set(rootCtx, root);
            ctx.set(defaultValueCtx, md);
        })
        .use(createCodeBlockBackspacePlugin())
        .use(commonmark)
        .use(gfm)
        .create();
    let view!: EditorView;
    editor.action((ctx) => { view = ctx.get(editorViewCtx); });
    return { view, destroy: () => void editor.destroy() };
}

function topLevelTypes(view: EditorView): string[] {
    const types: string[] = [];
    view.state.doc.forEach((n) => types.push(n.type.name));
    return types;
}

function codeBlockContentStart(view: EditorView): number {
    let pos = -1;
    view.state.doc.descendants((node, p) => {
        if (pos < 0 && node.type.name === 'code_block') { pos = p + 1; return false; }
        return true;
    });
    return pos;
}

function pressBackspace(view: EditorView): void {
    const event = new window.KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true });
    view.dom.dispatchEvent(event);
}

describe('webview統合: コードブロックの解除（先頭 Backspace）', () => {
    let h: { view: EditorView; destroy: () => void };
    afterEach(() => h?.destroy());

    it('コードブロック先頭で Backspace → 段落に解除（中身は残る）', async () => {
        h = await mkEditor('intro\n\n```python\nhello\n```\n');
        const start = codeBlockContentStart(h.view);
        h.view.dispatch(h.view.state.tr.setSelection(TextSelection.create(h.view.state.doc, start)));
        pressBackspace(h.view);
        assert.ok(!topLevelTypes(h.view).includes('code_block'), 'コードブロックが解除されていない');
        assert.ok(h.view.state.doc.textContent.includes('hello'), '中身が消えてしまった');
    });

    it('先頭以外（中身の途中）では解除しない', async () => {
        h = await mkEditor('```\nabcdef\n```\n');
        const start = codeBlockContentStart(h.view);
        h.view.dispatch(h.view.state.tr.setSelection(TextSelection.create(h.view.state.doc, start + 3)));
        assert.strictEqual(codeBlockAtContentStart(h.view.state), -1, '先頭以外では解除対象にしない');
    });

    it('codeBlockAtContentStart: 先頭なら depth>0、それ以外は -1', async () => {
        h = await mkEditor('```\ncode\n```\n');
        const start = codeBlockContentStart(h.view);
        h.view.dispatch(h.view.state.tr.setSelection(TextSelection.create(h.view.state.doc, start)));
        assert.ok(codeBlockAtContentStart(h.view.state) > 0, '先頭で depth>0 を返すべき');
    });
});
