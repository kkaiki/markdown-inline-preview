/**
 * applyExternalContent の統合テスト（jsdom 上の実 Milkdown）。
 *
 * 「Preview 表示中に外部（Raw / AI / 他ツール）が .md を編集した内容が WebView に反映される」
 * 経路の中核。外部 Markdown でエディタ本文が置き換わること、選択位置が新しい文書サイズへ
 * クランプされて落ちないことを検証する。
 */
import './jsdomSetup';
import * as assert from 'assert';
import { TextSelection } from '@milkdown/prose/state';

import { createPreviewEditor, type PreviewEditorHandle } from './milkdownHarness';
import { applyExternalContent } from '../../src/preview/webview/applyExternalContent';

function apply(h: PreviewEditorHandle, markdown: string): boolean {
    let result = false;
    h.editor.action((ctx) => {
        result = applyExternalContent(ctx, markdown);
    });
    return result;
}

describe('webview統合: applyExternalContent（外部編集の反映）', () => {
    let h: PreviewEditorHandle;
    afterEach(() => h?.destroy());

    it('外部 Markdown でエディタ本文が置き換わる', async () => {
        h = await createPreviewEditor('hello world\n');
        const applied = apply(h, '# Title\n\nnew body text\n');
        assert.strictEqual(applied, true);
        assert.ok(h.topLevelTypes().includes('heading'), `見出しに置換されていない: ${h.topLevelTypes().join(',')}`);
        assert.ok(h.view.state.doc.textContent.includes('new body text'), '新しい本文が反映されていない');
        assert.ok(!h.view.state.doc.textContent.includes('hello world'), '古い本文が残っている');
    });

    it('追記された内容も反映される', async () => {
        h = await createPreviewEditor('line one\n');
        apply(h, 'line one\n\nline two\n\nline three\n');
        const text = h.view.state.doc.textContent;
        assert.ok(text.includes('line two') && text.includes('line three'), `追記が反映されていない: ${text}`);
    });

    it('置換後にカーソルが新しい文書サイズへクランプされ、落ちない', async () => {
        h = await createPreviewEditor('a fairly long first paragraph here\n');
        // 末尾近くにカーソルを置く
        const end = h.view.state.doc.content.size - 1;
        h.view.dispatch(h.view.state.tr.setSelection(TextSelection.create(h.view.state.doc, end)));
        // 置換後はずっと短い文書
        apply(h, 'x\n');
        const sel = h.view.state.selection;
        assert.ok(sel.from <= h.view.state.doc.content.size, 'カーソルが文書サイズを超えている');
        assert.ok(h.view.state.doc.textContent.includes('x'), '置換結果が反映されていない');
    });

    it('空文書への置換でも落ちない', async () => {
        h = await createPreviewEditor('something\n');
        const applied = apply(h, '\n');
        assert.strictEqual(applied, true);
        assert.ok(!h.view.state.doc.textContent.includes('something'), '空置換が反映されていない');
    });
});
