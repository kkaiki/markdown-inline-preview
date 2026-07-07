/**
 * Preview でテーブルセル内の改行（hardbreak）を含む範囲をコピーすると、クリップボードの
 * text/plain に markdown 用の `<br>` がそのまま入ってしまう不具合の回帰テスト。
 *
 * `overrideHardbreakSerializer` はセル内 hardbreak を保存用 markdown として `<br>` に
 * するが、`@milkdown/plugin-clipboard` の既定 `clipboardTextSerializer` は
 * コピー時にも同じ markdown シリアライザをそのまま使うため、他アプリへ貼り付けたときに
 * 読める改行ではなく文字列 `<br>` が入ってしまう。
 */
import '../jsdomSetup';
import * as assert from 'assert';
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { clipboard } from '@milkdown/kit/plugin/clipboard';
import { TextSelection } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';

import { overrideHardbreakSerializer } from '../../../src/preview/webview/hardbreakSerializer';
import { createClipboardPlainTextPlugin } from '../../../src/preview/webview/clipboardPlainTextPlugin';

async function mkEditor(md: string): Promise<{ view: EditorView; destroy: () => void }> {
    const root = document.getElementById('root');
    if (!root) throw new Error('no root');
    root.innerHTML = '';
    const editor = await Editor.make()
        .config((ctx) => {
            ctx.set(rootCtx, root);
            ctx.set(defaultValueCtx, md);
            overrideHardbreakSerializer(ctx);
        })
        .use(commonmark)
        .use(gfm)
        // clipboard より前に登録（someProp は先勝ちのため上書きできる）
        .use(createClipboardPlainTextPlugin())
        .use(clipboard)
        .create();
    let view!: EditorView;
    editor.action((ctx) => { view = ctx.get(editorViewCtx); });
    return { view, destroy: () => void editor.destroy() };
}

describe('Preview: セル内改行を含む範囲のコピーで <br> が漏れない', () => {
    it('表セル内の hardbreak を含む選択をコピーすると、clipboardTextSerializer の出力に <br> ではなく改行が入る', async () => {
        const h = await mkEditor('| a | b |\n| --- | --- |\n| xz | y |\n');

        // セル "xz" の x と z の間に hardbreak を挿入（Enter 操作と同等の結果）。
        let hbPos = -1;
        h.view.state.doc.descendants((n, p) => {
            if (hbPos < 0 && n.isText && n.text === 'xz') hbPos = p + 1;
        });
        const hb = h.view.state.schema.nodes.hardbreak;
        let tr = h.view.state.tr.setSelection(TextSelection.create(h.view.state.doc, hbPos));
        tr = tr.replaceSelectionWith(hb.create({ isInline: false }), false);
        h.view.dispatch(tr);

        // セル全体（"x" + hardbreak + "z"）を選択してコピー相当のシリアライズを取得する。
        let cellFrom = -1;
        let cellTo = -1;
        h.view.state.doc.descendants((n, p) => {
            if (n.type.name === 'table_cell' && cellFrom < 0 && n.textContent.includes('x')) {
                cellFrom = p + 1;
                cellTo = p + n.nodeSize - 1;
            }
        });
        const selection = TextSelection.create(h.view.state.doc, cellFrom, cellTo);
        const slice = selection.content();

        const text = h.view.someProp('clipboardTextSerializer', (f) => f(slice, h.view));

        assert.ok(text !== undefined, 'clipboardTextSerializer が結果を返さなかった');
        assert.ok(!text.includes('<br'), `コピー結果に markdown 用の <br> が漏れている: ${JSON.stringify(text)}`);
        assert.ok(text.includes('\n'), `改行として貼り付けられる文字が入っていない: ${JSON.stringify(text)}`);

        h.destroy();
    });
});
