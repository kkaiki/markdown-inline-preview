/**
 * 段落間の空行が Preview で保持されることの統合テスト。
 * 「`A\n\nB` の空行が preview に入る（= 空 paragraph として読み込まれ、空行ぶんの高さが出る）」の回帰防止。
 *
 * 空行は blankLineRemarkPlugin により本数分の空 paragraph が実体として復元される
 * （blank-line-preservation.md）。
 */
import '../jsdomSetup';
import * as assert from 'assert';

import { createPreviewEditor, type PreviewEditorHandle } from '../milkdownHarness';
import { normalizePreviewMarkdown } from '../../../src/shared/markdown/lineBreaks';

function paragraphCount(h: PreviewEditorHandle): number {
    let n = 0;
    h.view.state.doc.forEach((node) => { if (node.type.name === 'paragraph') n++; });
    return n;
}

describe('webview統合: 段落間の空行の保持', () => {
    let h: PreviewEditorHandle;
    afterEach(() => h?.destroy());

    it('空行で区切られた `A\\n\\nB` は空 paragraph を含む 3 段落として読み込まれる', async () => {
        h = await createPreviewEditor(normalizePreviewMarkdown('para A\n\npara B\n'));
        assert.strictEqual(paragraphCount(h), 3, '空行が実体のある段落として復元されていない');
    });

    it('単一改行 `A\\nB`（ソフトブレイク）は 1 段落のまま', async () => {
        h = await createPreviewEditor(normalizePreviewMarkdown('para A\npara B\n'));
        assert.strictEqual(paragraphCount(h), 1, 'ソフトブレイクが 2 段落に割れている');
    });

    it('複数の空行はその本数ぶんの空 paragraph が復元される（3行なら計5段落）', async () => {
        h = await createPreviewEditor(normalizePreviewMarkdown('para A\n\n\n\npara B\n'));
        assert.strictEqual(paragraphCount(h), 5, '空行の本数ぶんの空 paragraph が復元されていない');
    });
});
