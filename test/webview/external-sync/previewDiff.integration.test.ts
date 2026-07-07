/**
 * Git 差分（Preview ガター）の基準正規化テスト。
 *
 * 不具合: Preview 本文は `normalizePreviewMarkdown` を通して読み込むのに、差分の基準
 * （Git HEAD 本文）は素のまま比較していた。そのため Raw では無変更でも、表セルの
 * `<br>`（→ `&#10;` に正規化）などで本文テキストが食い違い、Preview のガターだけ
 * 「変更（青）」に見えていた。
 *
 * ここでは「基準も本文と同じ正規形にすれば差分が出ない」ことを、実際の Milkdown
 * パーサ（jsdom）でブロックシグネチャを作って検証する。
 */
import '../jsdomSetup';
import * as assert from 'assert';
import { Editor, rootCtx, defaultValueCtx, parserCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';

import { blockSignatures } from '../../../src/preview/webview/previewDiffPlugin';
import { normalizePreviewMarkdown } from '../../../src/shared/markdown/lineBreaks';
import { diffBlocks } from '../../../src/shared/markdown/blockDiff';

async function mkEditor(): Promise<Editor> {
    const root = document.getElementById('root');
    if (!root) throw new Error('no root');
    root.innerHTML = '';
    return Editor.make()
        .config((ctx) => {
            ctx.set(rootCtx, root);
            ctx.set(defaultValueCtx, '');
        })
        .use(commonmark)
        .use(gfm)
        .create();
}

function sigsOf(editor: Editor, markdown: string): string[] {
    let sigs: string[] = [];
    editor.action((ctx) => {
        const doc = ctx.get(parserCtx)(markdown);
        if (doc) sigs = blockSignatures(doc);
    });
    return sigs;
}

function hasChange(statuses: string[]): boolean {
    return statuses.some((s) => s !== 'unchanged');
}

describe('webview統合: Git 差分の基準正規化', () => {
    let editor: Editor;
    afterEach(() => editor?.destroy());

    // 表セル内に改行（`<br>`）を含む Markdown。Preview は `<br>` を `&#10;` に
    // 正規化して読み込むので、基準を素のままにすると本文と食い違う。
    const HEAD = ['| col |', '| --- |', '| a<br>b |', ''].join('\n');

    it('（前提）正規化で Markdown が実際に変わる（表セルの <br>）', async () => {
        editor = await mkEditor();
        assert.notStrictEqual(
            normalizePreviewMarkdown(HEAD),
            HEAD,
            '正規化が何も変えていない（テストの前提が崩れた）'
        );
    });

    it('素の基準 vs 正規化済み本文 → 誤って「変更」と判定される（不具合の再現）', async () => {
        editor = await mkEditor();
        const baseRaw = sigsOf(editor, HEAD); // 正規化せず比較していた旧挙動
        const current = sigsOf(editor, normalizePreviewMarkdown(HEAD));
        const { statuses } = diffBlocks(baseRaw, current);
        assert.ok(hasChange(statuses), '旧挙動では差分が出ていたはず（再現できていない）');
    });

    it('基準も本文と同じ正規形にすると差分が出ない（修正後）', async () => {
        editor = await mkEditor();
        const baseNorm = sigsOf(editor, normalizePreviewMarkdown(HEAD));
        const current = sigsOf(editor, normalizePreviewMarkdown(HEAD));
        const { statuses, deletionsBefore } = diffBlocks(baseNorm, current);
        assert.strictEqual(hasChange(statuses), false, `変更扱いのブロックが残った: ${statuses.join(',')}`);
        assert.strictEqual(deletionsBefore.some((n) => n > 0), false, '削除マーカーが出てはいけない');
    });

    it('本文を実際に編集したら差分は出る（正規化が差分を消し過ぎない）', async () => {
        editor = await mkEditor();
        const baseNorm = sigsOf(editor, normalizePreviewMarkdown(HEAD));
        const edited = ['| col |', '| --- |', '| a<br>CHANGED |', ''].join('\n');
        const current = sigsOf(editor, normalizePreviewMarkdown(edited));
        const { statuses } = diffBlocks(baseNorm, current);
        assert.ok(hasChange(statuses), '実変更が差分として出ていない');
    });
});
