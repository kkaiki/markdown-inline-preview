/**
 * Preview の Git 差分ガター（previewDiffPlugin）× インライン記法のフォーカス展開
 * （inlineMarkEditPlugin）の相互作用テスト。
 *
 * 不具合: `` `code` `` / `**bold**` / `[text](url)` を含むブロックにカーソルを入れただけ
 * （実編集なし）で、inlineMarkEditPlugin がマーカー文字を**実テキスト**として挿入する
 * ため、previewDiffPlugin が比較する「現在ブロックのシグネチャ」が Git HEAD と無変更でも
 * 変わり、フォーカスした瞬間だけブロックが「変更（青バー）」として表示されてしまう。
 * ブロックプレフィックス（`## ` 等）側は既に除外済みだが、インライン側は未対応だった。
 *
 * 表の中のセルにインラインコードがある場合、トップレベルノードは table なので
 * テーブル全体に青バーが出る（ユーザー報告の見た目）。ここもレイヤーとして検証する。
 */
import '../jsdomSetup';
import * as assert from 'assert';
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { TextSelection } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';

import { createInlineMarkEditPlugin, getExpandedInlineMarkRanges } from '../../../src/preview/webview/inlineMarkEditPlugin';
import { blockSignatures, createPreviewDiffPlugin, setDiffBase } from '../../../src/preview/webview/previewDiffPlugin';
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
        .use(createInlineMarkEditPlugin())
        .use(commonmark)
        .use(gfm)
        .create();
    let view!: EditorView;
    editor.action((ctx) => { view = ctx.get(editorViewCtx); });
    return { view, destroy: () => void editor.destroy() };
}

/** previewDiffPlugin まで含めた本番構成のエディタ（HEAD 基準＝初期内容）。 */
async function mkEditorWithDiff(md: string): Promise<{ view: EditorView; destroy: () => void }> {
    const root = document.getElementById('root');
    if (!root) throw new Error('no root');
    root.innerHTML = '';
    const editor = await Editor.make()
        .config((ctx) => {
            ctx.set(rootCtx, root);
            ctx.set(defaultValueCtx, md);
        })
        .use(createInlineMarkEditPlugin())
        .use(createPreviewDiffPlugin())
        .use(commonmark)
        .use(gfm)
        .create();
    let view!: EditorView;
    editor.action((ctx) => {
        view = ctx.get(editorViewCtx);
        setDiffBase(ctx, md); // HEAD = 現在の内容（＝未編集）
    });
    return {
        view,
        destroy: () => {
            editor.action((ctx) => setDiffBase(ctx, null));
            void editor.destroy();
        }
    };
}

/** index 番目のトップレベルブロックの content 先頭にカーソルを置く。 */
function cursorInBlock(view: EditorView, index: number): void {
    let i = 0;
    let pos = -1;
    view.state.doc.forEach((node, offset) => {
        if (i++ === index) pos = offset + 1;
    });
    if (pos < 0) throw new Error(`block[${index}] not found`);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
}

/** インラインコードを含む最初のテーブルセル内の段落の content 先頭にカーソルを置く。 */
function cursorInTableCellWithInlineCode(view: EditorView): void {
    let pos = -1;
    view.state.doc.descendants((node, p) => {
        if (pos >= 0) return false;
        if (node.type.name !== 'table_cell' && node.type.name !== 'table_header') return true;
        let hasCode = false;
        node.descendants((child) => {
            if (child.marks.some((m) => m.type.name === 'inlineCode')) hasCode = true;
            return true;
        });
        if (hasCode) pos = p + 2; // cell の中の paragraph の content 先頭
        return false;
    });
    if (pos < 0) throw new Error('inlineCode を含む table cell が見つからない');
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
}

function hasChange(statuses: string[]): boolean {
    return statuses.some((s) => s !== 'unchanged');
}

describe('webview統合: Git差分ガター × インライン記法のフォーカス展開', () => {
    let h: { view: EditorView; destroy: () => void };
    afterEach(() => h?.destroy());

    it('インラインコードを含む段落にフォーカスしただけ（未編集）で誤って「変更」と判定される（不具合の再現）', async () => {
        h = await mkEditor('Intro\n\n`docs/spec.md` を参照\n');
        const base = blockSignatures(h.view.state.doc);

        cursorInBlock(h.view, 1); // バッククォートが実テキストとして挿入される
        const currentUnfixed = blockSignatures(h.view.state.doc);

        const { statuses } = diffBlocks(base, currentUnfixed);
        assert.ok(hasChange(statuses), '未編集でフォーカスしただけなのに差分が出ていない（再現できていない）');
    });

    it('インラインコードにフォーカスしても、展開中マーカーを除いて比較すれば差分は出ない', async () => {
        h = await mkEditor('Intro\n\n`docs/spec.md` を参照\n');
        const base = blockSignatures(h.view.state.doc);

        cursorInBlock(h.view, 1);
        const currentFixed = blockSignatures(h.view.state.doc, getExpandedInlineMarkRanges(h.view.state.doc));

        const { statuses } = diffBlocks(base, currentFixed);
        assert.strictEqual(hasChange(statuses), false, `フォーカスだけで変更扱いになった: ${statuses.join(',')}`);
    });

    it('太字・斜体・取り消し線を含む段落にフォーカスしても差分は出ない', async () => {
        h = await mkEditor('Intro\n\n**bold** と *italic* と ~~strike~~\n');
        const base = blockSignatures(h.view.state.doc);

        cursorInBlock(h.view, 1);
        const currentFixed = blockSignatures(h.view.state.doc, getExpandedInlineMarkRanges(h.view.state.doc));

        const { statuses } = diffBlocks(base, currentFixed);
        assert.strictEqual(hasChange(statuses), false, `フォーカスだけで変更扱いになった: ${statuses.join(',')}`);
    });

    it('リンクを含む段落にフォーカスしても差分は出ない', async () => {
        h = await mkEditor('Intro\n\n[text](https://example.com) を見る\n');
        const base = blockSignatures(h.view.state.doc);

        cursorInBlock(h.view, 1);
        const currentFixed = blockSignatures(h.view.state.doc, getExpandedInlineMarkRanges(h.view.state.doc));

        const { statuses } = diffBlocks(base, currentFixed);
        assert.strictEqual(hasChange(statuses), false, `フォーカスだけで変更扱いになった: ${statuses.join(',')}`);
    });

    it('テーブルセル内のインラインコードにフォーカスしてもテーブル全体が変更扱いにならない', async () => {
        const md = 'Intro\n\n| 仕様書 | 症状 |\n| --- | --- |\n| `docs/spec.md` | カーソルが飛ぶ |\n';
        h = await mkEditor(md);
        const base = blockSignatures(h.view.state.doc);

        cursorInTableCellWithInlineCode(h.view);
        // 除外なしだとテーブル全体（トップレベルノード）が「変更」になる＝ユーザー報告の見た目
        const unfixed = diffBlocks(base, blockSignatures(h.view.state.doc));
        assert.ok(hasChange(unfixed.statuses), '再現できていない（テーブルに差分が出ていない）');

        const expanded = getExpandedInlineMarkRanges(h.view.state.doc);
        assert.ok(expanded.length > 0, 'テーブルセル内で記法展開が起きていない（再現条件を満たしていない）');
        const currentFixed = blockSignatures(h.view.state.doc, expanded);

        const { statuses } = diffBlocks(base, currentFixed);
        assert.strictEqual(hasChange(statuses), false, `フォーカスだけでテーブルが変更扱いになった: ${statuses.join(',')}`);
    });

    it('未編集のインラインコード行にフォーカスした直後、差分ガターの青バーが DOM に出ない', async () => {
        h = await mkEditorWithDiff('Intro\n\n`docs/spec.md` を参照\n');
        assert.strictEqual(h.view.dom.querySelector('.diff-modified'), null, 'フォーカス前から変更扱いになっている');

        cursorInBlock(h.view, 1);

        assert.strictEqual(
            h.view.dom.querySelector('.diff-modified'),
            null,
            'フォーカスしただけで青バー（.diff-modified）が出ている'
        );
    });

    it('未編集のテーブル内インラインコードにフォーカスした直後、テーブルに青バーが出ない', async () => {
        h = await mkEditorWithDiff('Intro\n\n| 仕様書 | 症状 |\n| --- | --- |\n| `docs/spec.md` | カーソルが飛ぶ |\n');

        cursorInTableCellWithInlineCode(h.view);

        assert.strictEqual(
            h.view.dom.querySelector('.diff-modified'),
            null,
            'フォーカスしただけでテーブルに青バー（.diff-modified）が出ている'
        );
    });

    it('展開中のマーカーを1文字消しても、比較対象の本文テキストが欠けない', async () => {
        h = await mkEditor('Intro\n\nX**bold** の話\n');
        cursorInBlock(h.view, 1); // "X**bold** の話" に展開される

        // 開きマーカー `**` の 1 文字目を削除（挿入時の長さのまま除外すると本文 "X" が落ちる）
        const marks = getExpandedInlineMarkRanges(h.view.state.doc);
        const openRange = marks[0];
        h.view.dispatch(h.view.state.tr.delete(openRange.from, openRange.from + 1));

        const sigs = blockSignatures(h.view.state.doc, getExpandedInlineMarkRanges(h.view.state.doc));
        assert.ok(sigs[1].includes('X'), `本文の文字が除外されて消えた: ${sigs[1]}`);
        assert.ok(sigs[1].includes('bold'), `本文の文字が除外されて消えた: ${sigs[1]}`);
    });

    it('フォーカス展開中に実際に文字を編集したブロックは「変更」と判定される', async () => {
        h = await mkEditor('Intro\n\n`docs/spec.md` を参照\n');
        const base = blockSignatures(h.view.state.doc);

        cursorInBlock(h.view, 1);
        // 展開後のブロック末尾に実テキストを追加する（マーカーの外側＝本文の編集）
        const doc = h.view.state.doc;
        let end = -1;
        let i = 0;
        doc.forEach((node, offset) => {
            if (i++ === 1) end = offset + node.nodeSize - 1;
        });
        h.view.dispatch(h.view.state.tr.insertText('追記', end));

        const currentFixed = blockSignatures(h.view.state.doc, getExpandedInlineMarkRanges(h.view.state.doc));
        const { statuses } = diffBlocks(base, currentFixed);
        assert.ok(hasChange(statuses), '本文を編集したのに差分が出ていない（除外しすぎ）');
    });
});
