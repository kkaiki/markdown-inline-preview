/**
 * テキストエスケープ無効化（disableTextEscape）の round-trip テスト。
 * - Milkdown 既定では段落中の `[` 等が `\[` にエスケープされる。
 * - disableTextEscape を適用すると、テキストは素のまま（バックスラッシュなし）で
 *   シリアライズされ、Raw に戻しても汚れない。
 */
import './jsdomSetup';
import * as assert from 'assert';
import { Editor, rootCtx, defaultValueCtx, editorViewCtx, serializerCtx, parserCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';

import { disableTextEscape } from '../../src/preview/webview/disableTextEscape';

async function mkEditor(md: string, opts: { disableEscape: boolean }) {
    const root = document.getElementById('root');
    if (!root) throw new Error('no root');
    root.innerHTML = '';
    return Editor.make()
        .config((ctx) => {
            ctx.set(rootCtx, root);
            ctx.set(defaultValueCtx, md);
            if (opts.disableEscape) disableTextEscape(ctx);
        })
        .use(commonmark)
        .use(gfm)
        .create();
}

function serialize(editor: Editor): string {
    let out = '';
    editor.action((ctx) => {
        out = ctx.get(serializerCtx)(ctx.get(editorViewCtx).state.doc);
    });
    return out;
}

describe('テキストエスケープ無効化', () => {
    it('（前提）既定では段落中の `[` が `\\[` にエスケープされる', async () => {
        const editor = await mkEditor('これは [括弧] を含む段落です。\n', { disableEscape: false });
        const out = serialize(editor);
        assert.ok(out.includes('\\['), `既定でエスケープされていない（前提が崩れた）: ${out}`);
    });

    it('disableTextEscape で `[` `]` はエスケープされない', async () => {
        const editor = await mkEditor('これは [括弧] を含む段落です。\n', { disableEscape: true });
        const out = serialize(editor);
        assert.ok(out.includes('[括弧]'), `素の角括弧が保てていない: ${out}`);
        assert.ok(!out.includes('\\['), `角括弧がエスケープされている: ${out}`);
    });

    it('配列風テキスト a[0] / a[1] もエスケープされない', async () => {
        const editor = await mkEditor('配列 a[0] と a[1] を参照する。\n', { disableEscape: true });
        const out = serialize(editor);
        assert.ok(out.includes('a[0]') && out.includes('a[1]'), `配列添字が保てていない: ${out}`);
        assert.ok(!out.includes('\\'), `バックスラッシュが混入している: ${out}`);
    });

    it('複数の特殊文字を含む段落でバックスラッシュが一切混入しない', async () => {
        const src = '記号テスト [a] *b* _c_ # d < e > の混在行。\n';
        const editor = await mkEditor(src, { disableEscape: true });
        const out = serialize(editor);
        assert.ok(!out.includes('\\'), `エスケープが残っている: ${out}`);
    });

    it('round-trip が安定（[括弧] → parse → serialize → [括弧]）', async () => {
        const src = '注記: [TODO] を後で消す。\n';
        const editor = await mkEditor(src, { disableEscape: true });
        let out = '';
        editor.action((ctx) => {
            const first = ctx.get(serializerCtx)(ctx.get(editorViewCtx).state.doc);
            // 1 回目の出力を再パースして再シリアライズしても変化しないこと
            const reparsed = ctx.get(parserCtx)(first);
            out = ctx.get(serializerCtx)(reparsed);
        });
        assert.ok(out.includes('[TODO]') && !out.includes('\\['), `round-trip が安定していない: ${out}`);
    });
});
