/**
 * blockPrefixEditPlugin: 展開中に「別ブロック」で起きた編集による nodePos/contentStart の
 * 再マッピング（`appendTransaction` の `tr.mapping.map`）を単体で固定するテスト。
 *
 * test-directory-design.md §5 の「blockPrefixEditPlugin の expand/collapse が走る瞬間の
 * selection.map（トランザクションによるカーソル位置の写像）を単体で固定するテスト」の
 * ギャップを埋める。既存の `blockPrefixEdit.integration.test.ts`
 * 「複数ブロック間の移動」は H2→H3 の直接移動のみを検証しており、「展開中のブロックより
 * 前のブロックが編集されて文書長が変わる」ケース（ソースコメントで言及されている
 * Bug2 防止ロジックの本体）は未カバーだった。
 */
import '../jsdomSetup';
import * as assert from 'assert';
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { TextSelection } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';

import { createBlockPrefixEditPlugin, getExpandedBlock } from '../../../src/preview/webview/blockPrefixEditPlugin';

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

function nodeInfo(view: EditorView, index: number): { name: string; level?: number } {
    const node = view.state.doc.maybeChild(index);
    if (!node) return { name: '(empty)' };
    if (node.type.name === 'heading') return { name: 'heading', level: node.attrs.level as number };
    return { name: node.type.name };
}

describe('blockPrefixEditPlugin: 展開中の別ブロック編集による位置の再マッピング', () => {
    let h: { view: EditorView; destroy: () => void };
    afterEach(() => { h?.destroy(); });

    it('展開中のブロックより前のブロックへテキストを追加すると、nodePos/contentStart が挿入分だけ前進する', async () => {
        h = await mkEditor('Para1\n\n## Heading\n');
        cursorInBlock(h.view, 1); // H2 を展開
        const before = getExpandedBlock();
        assert.ok(before !== null, '展開されていない');

        // 展開中のブロック(index 1)より前のブロック(index 0)へテキストを追加する
        // （blockPrefixEditPlugin のメタを付けない「外部」トランザクション）。
        const insertText = 'EXTRA';
        h.view.dispatch(h.view.state.tr.insertText(insertText, 1));

        const after = getExpandedBlock();
        assert.ok(after !== null, '別ブロック編集で展開状態が失われた');
        assert.strictEqual(
            after.nodePos, before.nodePos + insertText.length,
            `nodePos が挿入分だけ再マッピングされていない: before=${before.nodePos} after=${after.nodePos}`
        );
        assert.strictEqual(
            after.contentStart, before.contentStart + insertText.length,
            `contentStart が挿入分だけ再マッピングされていない: before=${before.contentStart} after=${after.contentStart}`
        );
    });

    it('再マッピング後に別ブロックへ抜けても、見出しは正しく collapse される（プレフィックス残存しない）', async () => {
        h = await mkEditor('Para1\n\n## Heading\n');
        cursorInBlock(h.view, 1); // H2 を展開
        h.view.dispatch(h.view.state.tr.insertText('EXTRA', 1)); // 前のブロックを編集して長さを変える

        cursorInBlock(h.view, 0); // 抜けて collapse

        assert.deepStrictEqual(nodeInfo(h.view, 1), { name: 'heading', level: 2 },
            '再マッピング後の collapse で見出しレベルが壊れた');
        const headingText = h.view.state.doc.child(1).textContent;
        assert.strictEqual(headingText, 'Heading', `プレフィックスが残った、またはテキストが壊れた: ${headingText}`);
    });

    it('展開中のブロックより前のブロックからテキストを削除すると、nodePos/contentStart が削除分だけ後退する', async () => {
        h = await mkEditor('Para1Extra\n\n## Heading\n');
        cursorInBlock(h.view, 1); // H2 を展開
        const before = getExpandedBlock();
        assert.ok(before !== null);

        // ブロック0の "Extra"（5文字）を削除する。
        h.view.dispatch(h.view.state.tr.delete(6, 11));

        const after = getExpandedBlock();
        assert.ok(after !== null, '別ブロック編集で展開状態が失われた');
        assert.strictEqual(
            after.nodePos, before.nodePos - 5,
            `nodePos が削除分だけ再マッピングされていない: before=${before.nodePos} after=${after.nodePos}`
        );
    });

    it('複数回の別ブロック編集を経ても、最終的な collapse でプレフィックスが二重化しない', async () => {
        h = await mkEditor('Para1\n\n## Heading\n');
        cursorInBlock(h.view, 1); // H2 を展開

        // 前のブロックを何度も編集する（挿入・削除を繰り返す＝mapping の累積適用）。
        h.view.dispatch(h.view.state.tr.insertText('A', 1));
        h.view.dispatch(h.view.state.tr.insertText('BB', 2));
        h.view.dispatch(h.view.state.tr.delete(1, 2)); // 'A' を削除

        cursorInBlock(h.view, 0); // 抜けて collapse

        const headingText = h.view.state.doc.child(1).textContent;
        assert.strictEqual(headingText, 'Heading',
            `累積した mapping の適用後にプレフィックスが二重化/残存した: ${headingText}`);
        assert.deepStrictEqual(nodeInfo(h.view, 1), { name: 'heading', level: 2 });
    });
});
