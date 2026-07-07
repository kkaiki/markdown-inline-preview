/**
 * 表境界をまたぐ範囲選択（Shift+↓/↑ で表の外→中へ伸ばした選択）の正規化テスト。
 *
 * prosemirror-tables の normalizeSelection は「表の外→中」をまたぐ TextSelection を壊す
 * （最初のセルにスナップ/collapse）。fixTableCrossingSelection はそれを「表全体を含む」形に
 * 直す。マウスドラッグと同じく、表をまたいでも選択を保てるようにするのが目的。
 */
import '../jsdomSetup';
import * as assert from 'assert';
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { TextSelection } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import type { Node as ProseNode } from '@milkdown/prose/model';

import { createPreviewEditor, type PreviewEditorHandle } from '../milkdownHarness';
import { fixTableCrossingSelection, createTableSelectionFixPlugin } from '../../../src/preview/webview/tableSelectionFix';

/** アプリと同じく「fix プラグイン → gfm」の順で組んだエディタ（end-to-end 用）。 */
async function mkEditorWithFix(md: string): Promise<EditorView> {
    const root = document.getElementById('root');
    if (!root) throw new Error('no root');
    root.innerHTML = '';
    const editor = await Editor.make()
        .config((ctx) => {
            ctx.set(rootCtx, root);
            ctx.set(defaultValueCtx, md);
        })
        .use(createTableSelectionFixPlugin())
        .use(commonmark)
        .use(gfm)
        .create();
    let view!: EditorView;
    editor.action((ctx) => { view = ctx.get(editorViewCtx); });
    return view;
}

const MD = ['above para', '', '| a | b |', '| --- | --- |', '| 1 | 2 |', '', 'below para'].join('\n');

function tableRange(h: PreviewEditorHandle): { before: number; after: number } {
    let before = -1;
    let after = -1;
    h.view.state.doc.forEach((node: ProseNode, offset: number) => {
        if (node.type.name === 'table') { before = offset; after = offset + node.nodeSize; }
    });
    return { before, after };
}

/** 指定テキストの位置（先頭）。 */
function posOf(h: PreviewEditorHandle, text: string): number {
    let pos = -1;
    h.view.state.doc.descendants((node, p) => {
        if (pos < 0 && node.isText && node.text === text) { pos = p; return false; }
        return true;
    });
    return pos;
}

function setSelection(h: PreviewEditorHandle, anchor: number, head: number): void {
    h.view.dispatch(h.view.state.tr.setSelection(TextSelection.create(h.view.state.doc, anchor, head)));
}

describe('webview統合: 表境界をまたぐ選択の正規化', () => {
    let h: PreviewEditorHandle;
    afterEach(() => h?.destroy());

    it('段落 → 表の中（下方向）の選択は、表全体を含む形へ広がる', async () => {
        h = await createPreviewEditor(MD);
        const { before, after } = tableRange(h);
        assert.ok(before > 0, 'table が見つからない');
        const anchor = posOf(h, 'above para'); // 上の段落の中
        const headInCell = posOf(h, 'a') + 1;   // 1セル目の中
        setSelection(h, anchor, headInCell);

        const fixed = fixTableCrossingSelection(h.view.state);
        assert.ok(fixed, '正規化されるべき（null が返った）');
        // 選択範囲が表全体を含む（end が表の後ろ以降）。
        assert.ok(fixed.to >= after - 1, `表全体を含んでいない: to=${fixed.to} after=${after}`);
        assert.ok(fixed.from <= before, `start が表より前でない: from=${fixed.from} before=${before}`);
    });

    it('表の中 → 下の段落（上方向に anchor が表内）でも表全体を含む', async () => {
        h = await createPreviewEditor(MD);
        const { before } = tableRange(h);
        const anchorInCell = posOf(h, '2') + 1; // 表内
        const head = posOf(h, 'below para') + 3; // 下の段落
        setSelection(h, anchorInCell, head);
        const fixed = fixTableCrossingSelection(h.view.state);
        assert.ok(fixed, '正規化されるべき');
        assert.ok(fixed.from <= before, `表全体を含んでいない: from=${fixed.from} before=${before}`);
    });

    it('表の外だけの選択は触らない（null）', async () => {
        h = await createPreviewEditor(MD);
        const a = posOf(h, 'above para');
        setSelection(h, a, a + 3);
        assert.strictEqual(fixTableCrossingSelection(h.view.state), null);
    });

    it('カーソル（空選択）は触らない（null）', async () => {
        h = await createPreviewEditor(MD);
        const a = posOf(h, 'above para');
        setSelection(h, a, a);
        assert.strictEqual(fixTableCrossingSelection(h.view.state), null);
    });

    it('end-to-end: プラグインを載せて dispatch すると、表をまたぐ選択が保持される（壊れない）', async () => {
        const view = await mkEditorWithFix(MD);
        try {
            // 表の範囲とセル内の位置を求める
            let after = -1;
            view.state.doc.forEach((node: ProseNode, offset: number) => {
                if (node.type.name === 'table') after = offset + node.nodeSize;
            });
            let anchor = -1;
            let headInCell = -1;
            view.state.doc.descendants((node, p) => {
                if (node.isText && node.text === 'above para') anchor = p;
                if (node.isText && node.text === 'a' && headInCell < 0) headInCell = p + 1;
                return true;
            });
            assert.ok(anchor >= 0 && headInCell >= 0 && after >= 0, '位置が取れない');

            // 実際に dispatch（fix の appendTransaction → tables の normalizeSelection の順で走る）
            view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, anchor, headInCell)));

            const sel = view.state.selection;
            assert.ok(!sel.empty, '選択が collapse してしまった（fix プラグインが効いていない）');
            assert.ok(sel.to >= after - 1, `表全体を含んでいない: to=${sel.to} after=${after}`);
        } finally {
            // cleanup
        }
    });
});
