/**
 * 段落間の空行が Preview で保持されることの統合テスト。
 * 「`A\n\nB` の空行が preview に入る（= 2 段落として読み込まれ、空行ぶんの隙間が出る）」の回帰防止。
 */
import './jsdomSetup';
import * as assert from 'assert';

import { createPreviewEditor, type PreviewEditorHandle } from './milkdownHarness';
import { normalizePreviewMarkdown } from '../../src/shared/markdown/lineBreaks';

function paragraphCount(h: PreviewEditorHandle): number {
    let n = 0;
    h.view.state.doc.forEach((node) => { if (node.type.name === 'paragraph') n++; });
    return n;
}

describe('webview統合: 段落間の空行の保持', () => {
    let h: PreviewEditorHandle;
    afterEach(() => h?.destroy());

    it('空行で区切られた `A\\n\\nB` は 2 段落として読み込まれる', async () => {
        h = await createPreviewEditor(normalizePreviewMarkdown('para A\n\npara B\n'));
        assert.strictEqual(paragraphCount(h), 2, '2 段落になっていない（空行が消えた）');
    });

    it('単一改行 `A\\nB`（ソフトブレイク）は 1 段落のまま', async () => {
        h = await createPreviewEditor(normalizePreviewMarkdown('para A\npara B\n'));
        assert.strictEqual(paragraphCount(h), 1, 'ソフトブレイクが 2 段落に割れている');
    });

    it('複数の空行があっても本文が 2 段落で保持される', async () => {
        h = await createPreviewEditor(normalizePreviewMarkdown('para A\n\n\n\npara B\n'));
        assert.strictEqual(paragraphCount(h), 2);
    });
});
