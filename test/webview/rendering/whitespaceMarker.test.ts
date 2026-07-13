/**
 * whitespaceMarkerPlugin（空白のみのコンテンツを視覚的に区別する）の統合テスト。
 *
 * ユーザー報告: 「行に文字がなく全角スペースだけ／表セルの中に全角スペースだけ／
 * 行末に全角・半角スペースだけ入っている」場合、Preview 上では見た目上の空白と
 * 区別が付かない。これらを ProseMirror デコレーション（`ipreview-whitespace-marker`
 * クラス）でマークし、視覚的に判別できるようにする（表示のみ・doc は不変更）。
 *
 * `blankLineRemarkPlugin` が空行本数の往復のために作る「真に空」の paragraph
 * （テキストノードを一切持たない）は対象外（このプラグインの対象は「1文字以上の
 * 空白文字」を持つテキストノード）。code_block・インラインコードも対象外
 * （ソースの逐語的な内容のため）。
 */
import '../jsdomSetup';
import * as assert from 'assert';

import { createPreviewEditor, type PreviewEditorHandle } from '../milkdownHarness';
import { buildWhitespaceDecorations } from '../../../src/preview/webview/whitespaceMarkerPlugin';

interface DecoRange { from: number; to: number; class: string }

function whitespaceDecorations(h: PreviewEditorHandle): DecoRange[] {
    const set = buildWhitespaceDecorations(h.view.state.doc);
    return set.find().map((d) => ({
        from: d.from,
        to: d.to,
        class: (d as unknown as { type: { attrs?: { class?: string } } }).type.attrs?.class ?? ''
    }));
}

describe('webview統合: whitespaceMarkerPlugin（空白のみコンテンツの可視化）', () => {
    let h: PreviewEditorHandle;
    afterEach(() => h?.destroy());

    it('全角スペースのみの段落全体にマーカーが付く', async () => {
        h = await createPreviewEditor('foo\n\n　\n\nbar\n');
        const decos = whitespaceDecorations(h);
        assert.strictEqual(decos.length, 1);
        assert.strictEqual(decos[0].class, 'ipreview-whitespace-marker');
        assert.strictEqual(decos[0].to - decos[0].from, 1);
    });

    it('半角スペースのみの段落全体にマーカーが付く', async () => {
        h = await createPreviewEditor('x\n');
        // markdown 由来だと半角スペースのみの行は空行扱いで消えるため、実編集を模して
        // 直接 doc を書き換える（ブラウザで既存テキストを全選択してスペースへ置換した状態）。
        h.view.dispatch(h.view.state.tr.insertText('   ', 1, 2));
        const decos = whitespaceDecorations(h);
        assert.strictEqual(decos.length, 1);
        assert.strictEqual(decos[0].class, 'ipreview-whitespace-marker');
        assert.strictEqual(decos[0].to - decos[0].from, 3);
    });

    it('表セルの中身が全角スペースのみのときそのセルにマーカーが付く', async () => {
        h = await createPreviewEditor('| A | B |\n| --- | --- |\n| 　 | x |\n');
        const decos = whitespaceDecorations(h);
        assert.strictEqual(decos.length, 1);
        assert.strictEqual(decos[0].class, 'ipreview-whitespace-marker');
        assert.strictEqual(decos[0].to - decos[0].from, 1);
    });

    it('行末の全角スペースにマーカーが付く（本文部分は対象外）', async () => {
        h = await createPreviewEditor('hello　\n\nbar\n');
        const decos = whitespaceDecorations(h);
        assert.strictEqual(decos.length, 1);
        assert.strictEqual(decos[0].class, 'ipreview-whitespace-marker');
        assert.strictEqual(decos[0].to - decos[0].from, 1, '末尾の全角スペース1文字だけがマークされる');
    });

    it('行末の半角スペース複数にマーカーが付く（本文部分は対象外）', async () => {
        h = await createPreviewEditor('hello\n');
        const end = h.view.state.doc.content.size - 1;
        h.view.dispatch(h.view.state.tr.insertText('   ', end));
        const decos = whitespaceDecorations(h);
        assert.strictEqual(decos.length, 1);
        assert.strictEqual(decos[0].class, 'ipreview-whitespace-marker');
        assert.strictEqual(decos[0].to - decos[0].from, 3, '末尾の半角スペース3文字だけがマークされる');
    });

    it('通常の文字だけの段落にはマーカーが付かない', async () => {
        h = await createPreviewEditor('普通の本文です。\n');
        assert.strictEqual(whitespaceDecorations(h).length, 0);
    });

    it('blankLineRemarkPluginが作る真に空の段落（空行保持用）は対象外', async () => {
        h = await createPreviewEditor('foo\n\n\nbar\n');
        assert.deepStrictEqual(h.topLevelTypes(), ['paragraph', 'paragraph', 'paragraph']);
        assert.strictEqual(whitespaceDecorations(h).length, 0);
    });

    it('コードブロック内の行末・内部の空白は対象外', async () => {
        h = await createPreviewEditor('```\nfoo   \nbar\n```\n');
        assert.strictEqual(whitespaceDecorations(h).length, 0);
    });
});
