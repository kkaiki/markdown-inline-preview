/**
 * Live モードの目次（ドロワー）の中身を決める純関数を固定する。
 *
 * GitHub issue #5（2026-10-15）: 長い md を見出しで移動したい。設計は
 * `docs/specifications/live-mode/outline-drawer-design.md`。見出しの判定は Live の描画と同じ
 * `scanSyntaxRanges` を使うので、コードブロックや frontmatter の中の `#` は拾わない。
 */
import * as assert from 'assert';
import { buildOutline, currentOutlineIndex } from '../../../../src/live/shared/outline';

describe('Live モード: 目次の項目', () => {
    it('H1〜H3 を深さ付きで拾い、H4 以下は出さない', () => {
        const doc = '# A\n本文\n## B\n### C\n#### D\n';
        assert.deepStrictEqual(
            buildOutline(doc).map((i) => [i.level, i.text]),
            [[1, 'A'], [2, 'B'], [3, 'C']]
        );
    });

    it('各項目はその見出しの行の先頭と行末のオフセットを持つ', () => {
        const doc = '# A\n本文\n## B\n';
        const [a, b] = buildOutline(doc);
        assert.deepStrictEqual([a.from, a.to], [0, 3]);
        assert.deepStrictEqual([b.from, b.to], [7, 11]);
    });

    it('見出しの中の記法は外して表示する', () => {
        const doc = '## **重要** な [話](https://x.test) と `code`\n';
        assert.strictEqual(buildOutline(doc)[0].text, '重要 な 話 と code');
    });

    it('コードブロック（``` と ~~~）と frontmatter の中の # は見出しにしない', () => {
        const doc = '---\ntitle: x\n# no\n---\n# 本当\n```\n# no\n```\n~~~\n## no\n~~~\n## 本当2\n';
        assert.deepStrictEqual(buildOutline(doc).map((i) => i.text), ['本当', '本当2']);
    });

    it('見出しが無ければ空', () => {
        assert.deepStrictEqual(buildOutline('本文だけ\n'), []);
    });
});

describe('Live モード: 今いる節', () => {
    const doc = '前置き\n# A\naaa\n## B\nbbb\n';
    const items = buildOutline(doc);

    it('最初の見出しより前なら -1', () => {
        assert.strictEqual(currentOutlineIndex(items, 0), -1);
    });

    it('見出しの行やその下の本文なら、その見出し', () => {
        assert.strictEqual(currentOutlineIndex(items, doc.indexOf('# A')), 0);
        assert.strictEqual(currentOutlineIndex(items, doc.indexOf('aaa')), 0);
        assert.strictEqual(currentOutlineIndex(items, doc.indexOf('bbb')), 1);
    });
});
