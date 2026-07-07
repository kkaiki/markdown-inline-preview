/**
 * Preview の Git 差分ガター（previewDiffPlugin）× Typora 風フォーカス展開
 * （blockPrefixEditPlugin）の相互作用テスト。
 *
 * 不具合: 見出し / 箇条書き / blockquote にカーソルを合わせただけ（実編集なし）で、
 * blockPrefixEditPlugin が行頭記法（`## ` 等）を実テキストとしてドキュメントに
 * 挿入するため、previewDiffPlugin が比較する「現在ブロックのシグネチャ」が
 * Git HEAD と無変更でも変わってしまい、フォーカスした瞬間だけブロックが
 * 「変更（青）」として表示されてしまう。
 */
import '../jsdomSetup';
import * as assert from 'assert';
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { TextSelection } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';

import { createBlockPrefixEditPlugin, getExpandedBlock } from '../../../src/preview/webview/blockPrefixEditPlugin';
import { blockSignatures } from '../../../src/preview/webview/previewDiffPlugin';
import { diffBlocks } from '../../../src/shared/markdown/blockDiff';

async function mkEditor(md: string): Promise<{ view: EditorView; destroy: () => void }> {
    const root = document.getElementById('root');
    if (!root) throw new Error('no root');
    root.innerHTML = '';
    const editor = await Editor.make()
        .config((ctx) => {
            ctx.set(rootCtx, root);
            ctx.set(defaultValueCtx, md);
        })
        .use(createBlockPrefixEditPlugin())
        .use(commonmark)
        .use(gfm)
        .create();
    let view!: EditorView;
    editor.action((ctx) => { view = ctx.get(editorViewCtx); });
    return { view, destroy: () => void editor.destroy() };
}

function cursorInBlock(view: EditorView, index: number): void {
    let i = 0;
    let pos = -1;
    view.state.doc.forEach((node, offset) => {
        if (i++ === index) pos = offset + 1;
    });
    if (pos < 0) throw new Error(`block[${index}] not found`);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
}

/** 最初の list_item の段落の content start にカーソルを置く。 */
function cursorInFirstListItem(view: EditorView): void {
    let pos = -1;
    view.state.doc.descendants((node, p) => {
        if (pos < 0 && node.type.name === 'list_item') { pos = p + 2; return false; }
        return true;
    });
    if (pos < 0) throw new Error('list_item not found');
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
}

/** 最初の blockquote 内の段落の content start にカーソルを置く。 */
function cursorInFirstBlockquote(view: EditorView): void {
    let pos = -1;
    view.state.doc.descendants((node, p) => {
        if (pos < 0 && node.type.name === 'blockquote') { pos = p + 2; return false; }
        return true;
    });
    if (pos < 0) throw new Error('blockquote not found');
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
}

/** 現在展開中のプレフィックスの絶対位置レンジ（previewDiffPlugin に渡す想定）。 */
function expandedRangeOf(): { from: number; to: number } | null {
    const eb = getExpandedBlock();
    if (!eb) return null;
    return { from: eb.contentStart, to: eb.contentStart + eb.prefix.length };
}

function hasChange(statuses: string[]): boolean {
    return statuses.some((s) => s !== 'unchanged');
}

describe('webview統合: Git差分ガター × フォーカス展開の相互作用', () => {
    let h: { view: EditorView; destroy: () => void };
    afterEach(() => h?.destroy());

    const MD = 'Intro\n\n## Heading\n';

    it('見出しにフォーカスしただけ（未編集）で誤って「変更」と判定される（不具合の再現）', async () => {
        h = await mkEditor(MD);
        // ベース（Git HEAD 相当）= フォーカスしていない状態のシグネチャ
        const base = blockSignatures(h.view.state.doc);

        cursorInBlock(h.view, 1); // 見出しにフォーカス → "## " が実テキストとして挿入される
        const currentUnfixed = blockSignatures(h.view.state.doc);

        const { statuses } = diffBlocks(base, currentUnfixed);
        assert.ok(hasChange(statuses), '未編集でフォーカスしただけなのに差分が出ていない（再現できていない）');
    });

    it('見出しにフォーカスしても、展開中プレフィックスを除いて比較すれば差分は出ない（修正後）', async () => {
        h = await mkEditor(MD);
        const base = blockSignatures(h.view.state.doc);

        cursorInBlock(h.view, 1); // 見出しにフォーカス
        const currentFixed = blockSignatures(h.view.state.doc, expandedRangeOf());

        const { statuses } = diffBlocks(base, currentFixed);
        assert.strictEqual(hasChange(statuses), false, `フォーカスだけで変更扱いになった: ${statuses.join(',')}`);
    });

    it('箇条書きにフォーカスしても、展開中プレフィックスを除いて比較すれば差分は出ない（修正後）', async () => {
        h = await mkEditor('Intro\n\n- item\n');
        const base = blockSignatures(h.view.state.doc);

        cursorInFirstListItem(h.view); // 箇条書きにフォーカス → "- " が実テキストとして挿入される
        const currentFixed = blockSignatures(h.view.state.doc, expandedRangeOf());

        const { statuses } = diffBlocks(base, currentFixed);
        assert.strictEqual(hasChange(statuses), false, `フォーカスだけで変更扱いになった: ${statuses.join(',')}`);
    });

    it('blockquote にフォーカスしても、展開中プレフィックスを除いて比較すれば差分は出ない（修正後）', async () => {
        h = await mkEditor('Intro\n\n> quoted\n');
        const base = blockSignatures(h.view.state.doc);

        cursorInFirstBlockquote(h.view); // blockquote にフォーカス → "> " が実テキストとして挿入される
        const currentFixed = blockSignatures(h.view.state.doc, expandedRangeOf());

        const { statuses } = diffBlocks(base, currentFixed);
        assert.strictEqual(hasChange(statuses), false, `フォーカスだけで変更扱いになった: ${statuses.join(',')}`);
    });
});
