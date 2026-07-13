/**
 * ソースMarkdown中の「連続した複数の空行」を Preview に実体のある空 paragraph
 * ノードとして復元し、保存時にも同じ本数の空行として書き戻せることを検証する。
 *
 * 従来: `remark-parse` は空行そのものをノード化しないため、隣接する2ブロック間に
 * 何行空行があったかという情報はパース時点で失われていた（1行でも5行でも同じ
 * 2ブロック構成になる）。このテストは、その本数がドキュメントモデル（空 paragraph
 * ノードの個数）として復元され、round-trip でも往復することを固定する。
 */
import '../jsdomSetup';
import * as assert from 'assert';
import { createPreviewEditor } from '../milkdownHarness';
import { normalizePreviewMarkdown } from '../../../src/shared/markdown/lineBreaks';

describe('webview統合: 連続する空行の復元とround-trip', () => {
    it('空行1つも空 paragraph として復元される', async () => {
        const h = await createPreviewEditor('para A\n\npara B\n');
        assert.deepStrictEqual(h.topLevelTypes(), ['paragraph', 'paragraph', 'paragraph']);
        const out = normalizePreviewMarkdown(h.serialize()).trimEnd();
        assert.deepStrictEqual(out.split('\n'), ['para A', '', 'para B']);
        h.destroy();
    });

    it('空行2つは間に空 paragraph が2つ復元される', async () => {
        const h = await createPreviewEditor('para A\n\n\npara B\n');
        assert.deepStrictEqual(h.topLevelTypes(), ['paragraph', 'paragraph', 'paragraph', 'paragraph']);
        const out = normalizePreviewMarkdown(h.serialize()).trimEnd();
        assert.deepStrictEqual(out.split('\n'), ['para A', '', '', 'para B']);
        h.destroy();
    });

    it('空行3つは間に空 paragraph が3つ復元される', async () => {
        const h = await createPreviewEditor('para A\n\n\n\npara B\n');
        assert.deepStrictEqual(h.topLevelTypes(), ['paragraph', 'paragraph', 'paragraph', 'paragraph', 'paragraph']);
        const out = normalizePreviewMarkdown(h.serialize()).trimEnd();
        assert.deepStrictEqual(out.split('\n'), ['para A', '', '', '', 'para B']);
        h.destroy();
    });

    it('見出しと本文の間の空行2つも復元される（段落以外の組み合わせ）', async () => {
        const h = await createPreviewEditor('# Title\n\n\nbody\n');
        assert.deepStrictEqual(h.topLevelTypes(), ['heading', 'paragraph', 'paragraph', 'paragraph']);
        const out = normalizePreviewMarkdown(h.serialize()).trimEnd();
        assert.deepStrictEqual(out.split('\n'), ['# Title', '', '', 'body']);
        h.destroy();
    });
});
