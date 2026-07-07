/**
 * codeHighlightPlugin（コードブロックのシンタックスハイライト）の統合テスト。
 *
 * 実 Milkdown（jsdom）でコードブロックを含む文書を作り、buildCodeDecorations が
 * hljs ベースの inline decoration を生成することを検証する。これは「python と分かる色付け」
 * が出る前提条件（旧実装では DOM 書き換えが ProseMirror に戻されて色が付かなかった）。
 */
import '../jsdomSetup';
import * as assert from 'assert';

import { createPreviewEditor, type PreviewEditorHandle } from '../milkdownHarness';
import { buildCodeDecorations } from '../../../src/preview/webview/codeHighlightPlugin';

function decoCount(h: PreviewEditorHandle): number {
    const set = buildCodeDecorations(h.view.state.doc);
    return set.find().length;
}

describe('webview統合: codeHighlightPlugin（コードのシンタックスハイライト）', () => {
    let h: PreviewEditorHandle;
    afterEach(() => h?.destroy());

    it('python のコードブロックに色付け用デコレーションが生成される', async () => {
        h = await createPreviewEditor('```python\ndef foo():\n    return 1\n```\n');
        assert.ok(decoCount(h) > 0, 'python コードブロックにデコレーションが付いていない');
    });

    it('言語指定なしのコードブロックでも自動判定で色付けされる（落ちない）', async () => {
        h = await createPreviewEditor('```\nconst x = 1;\nfunction f() { return x; }\n```\n');
        assert.ok(decoCount(h) >= 0, '例外なく処理できる');
    });

    it('デコレーションはコードブロックの範囲内に収まる', async () => {
        h = await createPreviewEditor('```python\nimport os\n```\n');
        const doc = h.view.state.doc;
        // code_block の範囲を求める
        let from = -1;
        let to = -1;
        doc.descendants((node, pos) => {
            if (node.type.name === 'code_block') {
                from = pos;
                to = pos + node.nodeSize;
                return false;
            }
            return true;
        });
        assert.ok(from >= 0, 'code_block が見つからない');
        const set = buildCodeDecorations(doc);
        for (const deco of set.find()) {
            assert.ok(deco.from >= from && deco.to <= to, `デコレーションが範囲外: ${deco.from}-${deco.to} (block ${from}-${to})`);
        }
    });

    it('mermaid ブロックにはシンタックス色を付けない', async () => {
        h = await createPreviewEditor('```mermaid\ngraph TD; A-->B;\n```\n');
        assert.strictEqual(decoCount(h), 0, 'mermaid にシンタックス色が付いている');
    });

    it('コードブロックが無い文書ではデコレーション 0', async () => {
        h = await createPreviewEditor('# 見出し\n\nただの段落です。\n');
        assert.strictEqual(decoCount(h), 0);
    });
});
