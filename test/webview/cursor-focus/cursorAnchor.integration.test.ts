/**
 * Preview（ProseMirror）側のカーソル ⇄ ブロックアンカー変換の統合テスト。
 * Raw ⇄ Preview のカーソル引き継ぎの中核（往復で同じ位置に戻ること）。
 */
import '../jsdomSetup';
import * as assert from 'assert';
import { TextSelection } from '@milkdown/prose/state';

import { createPreviewEditor, type PreviewEditorHandle } from '../milkdownHarness';
import { getPreviewCursorAnchor, applyPreviewCursorAnchor } from '../../../src/preview/webview/cursorAnchor';

function paragraphStarts(h: PreviewEditorHandle): number[] {
    const starts: number[] = [];
    h.view.state.doc.forEach((node, offset) => {
        if (node.type.name === 'paragraph') starts.push(offset + 1);
    });
    return starts;
}

function setCursor(h: PreviewEditorHandle, pos: number): void {
    h.view.dispatch(h.view.state.tr.setSelection(TextSelection.create(h.view.state.doc, pos)));
}

describe('webview統合: カーソル ⇄ ブロックアンカー', () => {
    let h: PreviewEditorHandle;
    afterEach(() => h?.destroy());

    it('2 番目の段落のカーソルは block=2, offset=その位置', async () => {
        // blankLineRemarkPlugin により空行1つごとに空 paragraph が実体化されるため、
        // "first para" と "second para" の間にも空段落（block=1）が入り、
        // "second para" 自体は block=2 になる。
        h = await createPreviewEditor('first para\n\nsecond para\n\nthird');
        const starts = paragraphStarts(h);
        assert.ok(starts.length >= 5, '段落が5つ未満');
        setCursor(h, starts[2] + 3); // 2番目の実段落（"second para"）、3文字目
        const anchor = getPreviewCursorAnchor(h.view);
        assert.strictEqual(anchor.block, 2);
        assert.strictEqual(anchor.offset, 3);
    });

    it('アンカー → カーソル復元で元の位置に戻る（往復）', async () => {
        h = await createPreviewEditor('alpha\n\nbravo line\n\ncharlie');
        const starts = paragraphStarts(h);
        const target = starts[1] + 4; // bravo の5文字目
        setCursor(h, target);
        const anchor = getPreviewCursorAnchor(h.view);

        // いったん別の場所へ
        setCursor(h, starts[0]);
        // 復元
        applyPreviewCursorAnchor(h.view, anchor);
        assert.strictEqual(h.view.state.selection.from, target, 'カーソルが元の位置に戻っていない');
    });

    it('オフセットが行末を超えてもクランプして落ちない', async () => {
        h = await createPreviewEditor('short\n\nx');
        applyPreviewCursorAnchor(h.view, { block: 0, offset: 999 });
        const sel = h.view.state.selection;
        assert.ok(sel.from > 0 && sel.from <= h.view.state.doc.content.size);
    });

    it('範囲外ブロックはクランプ（最後のブロックへ）', async () => {
        h = await createPreviewEditor('one\n\ntwo');
        applyPreviewCursorAnchor(h.view, { block: 50, offset: 0 });
        // 落ちずに有効な選択になっていればよい
        assert.ok(h.view.state.selection.from >= 0);
    });
});
