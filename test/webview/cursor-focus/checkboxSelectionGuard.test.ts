/**
 * blockPrefixEditPlugin 内 `pendingCheckboxSelectionGuard`（1000ms のチェックボックス
 * 変換直後カーソル保護ガード）の内部ロジック単体テスト。
 *
 * 症状レベルの再現（実 Chromium・`test/browser/cursor-focus/checkboxCursorJump.test.ts`）は
 * 既に対称カバレッジ済みだが、ガード自身の「armedAt からの経過判定」「実タイプでは
 * 追跡位置と selection が一致し続けるので誤爆しない」「ドキュメントを変えない
 * transaction（selectionchange 由来）でズレたら復元する」という内部の時間窓・判定ロジックは
 * jsdom 上で直接 transaction を発行することで、実ブラウザより高速かつ決定的に検証できる。
 */
import '../jsdomSetup';
import * as assert from 'assert';
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { TextSelection } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import type { Node as ProseNode } from '@milkdown/prose/model';

import { createBlockPrefixEditPlugin } from '../../../src/preview/webview/blockPrefixEditPlugin';

/** listItemBlockComponent なしの最小エディタ（jsdom で SVGElement が不要）。 */
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

/** 最初の list_item の pos（開きトークン直前）を返す。 */
function firstListItemPos(view: EditorView): number {
    let pos = -1;
    view.state.doc.descendants((node, p) => {
        if (pos < 0 && node.type.name === 'list_item') { pos = p; return false; }
        return true;
    });
    if (pos < 0) throw new Error('list_item not found');
    return pos;
}

/** 指定 pos の list_item ノードの checked 属性を boolean へ変更する（変換をシミュレート）。 */
function convertToChecked(view: EditorView, listItemPos: number, checked: boolean): void {
    const node = view.state.doc.nodeAt(listItemPos) as ProseNode;
    view.dispatch(view.state.tr.setNodeMarkup(listItemPos, undefined, { ...node.attrs, checked }));
}

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('blockPrefixEditPlugin: pendingCheckboxSelectionGuard（変換直後カーソル保護ガード）', () => {
    let h: { view: EditorView; destroy: () => void };
    afterEach(() => { h?.destroy(); });

    it('checked が null→boolean に変わった直後、ドキュメントを変えない selectionchange でカーソルがズレても元の位置へ復元される', async () => {
        h = await mkEditor('Other\n\n- item\n');
        const liPos = firstListItemPos(h.view);
        const contentStart = liPos + 2; // list_item 開き + paragraph 開き

        // カーソルを項目内に置いてから checked を null→boolean へ変更（変換をシミュレート）。
        h.view.dispatch(h.view.state.tr.setSelection(TextSelection.create(h.view.state.doc, contentStart)));
        convertToChecked(h.view, liPos, true);
        const guardedPos = h.view.state.selection.from;

        // Web Component 再マウントによる selectionchange 由来の誤爆: ドキュメントを変えず
        // 別の位置（段落 "Other" の中）へ selection だけを動かす。
        h.view.dispatch(h.view.state.tr.setSelection(TextSelection.create(h.view.state.doc, 1)));

        assert.strictEqual(
            h.view.state.selection.from,
            guardedPos,
            `誤爆した selectionchange が復元されず、カーソルが別ブロックへ残った: ${h.view.state.selection.from} (期待値 ${guardedPos})`
        );
    });

    it('変換直後に実際にタイプを続けても、ガードは追跡位置を更新するだけで誤って元に戻さない', async () => {
        h = await mkEditor('Other\n\n- item\n');
        const liPos = firstListItemPos(h.view);
        const contentStart = liPos + 2;

        h.view.dispatch(h.view.state.tr.setSelection(TextSelection.create(h.view.state.doc, contentStart)));
        convertToChecked(h.view, liPos, true);
        const guardedPos = h.view.state.selection.from;

        // 実タイプ（ドキュメントを変える transaction）で 1 文字挿入。
        h.view.dispatch(h.view.state.tr.insertText('x', guardedPos));

        const afterTypeText = h.view.state.doc.nodeAt(liPos)?.textContent ?? '';
        assert.ok(afterTypeText.includes('xitem') || afterTypeText.includes('x item') || afterTypeText.startsWith('x'),
            `タイプした文字が失われた: ${afterTypeText}`);
        assert.strictEqual(
            h.view.state.selection.from,
            guardedPos + 1,
            `実タイプ後のカーソルが誤ってガードに巻き戻された: ${h.view.state.selection.from} (期待値 ${guardedPos + 1})`
        );
    });

    it('ガード窓（1000ms）経過後は、ドキュメントを変えない selectionchange があっても復元しない', async function () {
        this.timeout(3000);
        h = await mkEditor('Other\n\n- item\n');
        const liPos = firstListItemPos(h.view);
        const contentStart = liPos + 2;

        h.view.dispatch(h.view.state.tr.setSelection(TextSelection.create(h.view.state.doc, contentStart)));
        convertToChecked(h.view, liPos, true);

        await wait(1100);

        // ガード失効後に selection だけを動かしても、もう保護対象ではないので復元されない。
        h.view.dispatch(h.view.state.tr.setSelection(TextSelection.create(h.view.state.doc, 1)));

        assert.strictEqual(
            h.view.state.selection.from,
            1,
            `ガード失効後のはずなのに selection が復元されてしまった: ${h.view.state.selection.from}`
        );
    });
});
