/**
 * Live モード Phase 5: 水平線・数式ブロック・コールアウト・画像・インライン数式の走査（純関数）。
 *
 * Obsidian 実測（obsidian-observed-spec.md §2.6・§2.9〜§2.11）:
 *   - 水平線 `---` は **行スコープ**。カーソルがその行に来ると生の `---` に戻る。
 *   - 数式ブロック `$$ … $$` は **ブロックスコープ**。
 *   - コールアウト `> [!note]` + 続く `>` 行は **ブロックスコープ**で、
 *     展開すると素の引用行に戻る。
 *   - 画像 `![alt](url)` とインライン数式 `$…$` は **トークンスコープ**。
 *   - frontmatter は Obsidian ではプロパティパネルに置換されるが、我々は
 *     生表示のまま（requirements.md §2.9 の意図的な逸脱）。ただし水平線として
 *     誤検出しないこと。
 */
import * as assert from 'assert';
import { scanSyntaxRanges, type SyntaxRange } from '../../../../src/live/shared/syntaxRanges';

function pick(ranges: SyntaxRange[], kind: string): SyntaxRange[] {
    return ranges.filter((r) => r.kind === kind);
}

describe('Live モード: 水平線', () => {
    it('"---" を行スコープの水平線として検出する', () => {
        const doc = 'あ\n\n---\n\nい\n';
        const r = pick(scanSyntaxRanges(doc), 'horizontalRule')[0];
        assert.ok(r, '水平線が検出されない');
        assert.strictEqual(r.scope, 'line');
        assert.strictEqual(doc.slice(r.revealFrom, r.revealTo), '---');
    });

    it('"***" と "___" も水平線', () => {
        assert.strictEqual(pick(scanSyntaxRanges('あ\n\n***\n'), 'horizontalRule').length, 1);
        assert.strictEqual(pick(scanSyntaxRanges('あ\n\n___\n'), 'horizontalRule').length, 1);
    });

    it('4文字以上でも水平線', () => {
        assert.strictEqual(pick(scanSyntaxRanges('あ\n\n-----\n'), 'horizontalRule').length, 1);
    });

    it('2文字は水平線ではない', () => {
        assert.deepStrictEqual(pick(scanSyntaxRanges('あ\n\n--\n'), 'horizontalRule'), []);
    });

    it('表の区切り行は水平線にしない', () => {
        const doc = '| a | b |\n| --- | --- |\n| 1 | 2 |\n';
        assert.deepStrictEqual(pick(scanSyntaxRanges(doc), 'horizontalRule'), []);
    });

    it('文書先頭の "---" は frontmatter なので水平線にしない', () => {
        const doc = '---\ntitle: x\n---\n\n本文\n';
        assert.deepStrictEqual(pick(scanSyntaxRanges(doc), 'horizontalRule'), []);
    });

    it('frontmatter は生表示のまま（never スコープ）で1ブロックとして検出する', () => {
        const doc = '---\ntitle: x\n---\n\n本文\n';
        const r = pick(scanSyntaxRanges(doc), 'frontmatter')[0];
        assert.ok(r, 'frontmatter が検出されない');
        assert.strictEqual(r.scope, 'never');
        assert.deepStrictEqual(r.hidden, [], '生表示のままなので隠さない');
        assert.strictEqual(doc.slice(r.revealFrom, r.revealTo), '---\ntitle: x\n---');
    });
});

describe('Live モード: 数式ブロック', () => {
    const DOC = 'あ\n\n$$\nE = mc^2\n$$\n\nい\n';

    it('"$$ … $$" を検出し、ソースは常に表示する（mermaid と同じ見せ方）', () => {
        const r = pick(scanSyntaxRanges(DOC), 'mathBlock')[0];
        assert.ok(r, '数式ブロックが検出されない');
        // ユーザー指示（2026-08-05）: 数式はソースを編集できるまま、下にプレビューを出す。
        // したがってソースを畳まない = never スコープ。
        assert.strictEqual(r.scope, 'never');
        assert.strictEqual(DOC.slice(r.revealFrom, r.revealTo), '$$\nE = mc^2\n$$');
    });

    it('数式本体を持つ', () => {
        assert.strictEqual(pick(scanSyntaxRanges(DOC), 'mathBlock')[0].info, 'E = mc^2');
    });

    it('ソースを隠さない（hidden は空）', () => {
        const r = pick(scanSyntaxRanges(DOC), 'mathBlock')[0];
        assert.deepStrictEqual(r.hidden, [], '数式はソースを常に見せるので隠す範囲は無い');
    });

    it('数式ブロックの中身は他の記法として解釈しない', () => {
        const doc = '$$\na_*b*_c\n$$\n';
        assert.deepStrictEqual(pick(scanSyntaxRanges(doc), 'em'), []);
    });
});

describe('Live モード: コールアウト', () => {
    const DOC = '前\n\n> [!note] 見出し\n> 本文です。\n\n後\n';

    it('"> [!type]" から始まる引用ブロックをコールアウトとして検出する', () => {
        const r = pick(scanSyntaxRanges(DOC), 'callout')[0];
        assert.ok(r, 'コールアウトが検出されない');
        assert.strictEqual(r.scope, 'block');
        assert.strictEqual(DOC.slice(r.revealFrom, r.revealTo), '> [!note] 見出し\n> 本文です。');
    });

    it('種別（note / warning など）を持つ', () => {
        assert.strictEqual(pick(scanSyntaxRanges(DOC), 'callout')[0].info, 'note');
        assert.strictEqual(
            pick(scanSyntaxRanges('> [!WARNING] w\n'), 'callout')[0].info,
            'warning',
            '種別は小文字に正規化する'
        );
    });

    it('コールアウトの行は素の引用マーカーとして二重検出しない', () => {
        assert.deepStrictEqual(pick(scanSyntaxRanges(DOC), 'quoteMarker'), []);
    });

    it('"[!" が無い引用は普通の引用のまま', () => {
        const doc = '> ただの引用\n';
        assert.deepStrictEqual(pick(scanSyntaxRanges(doc), 'callout'), []);
        assert.strictEqual(pick(scanSyntaxRanges(doc), 'quoteMarker').length, 1);
    });

    it('1行だけのコールアウトも検出する', () => {
        assert.strictEqual(pick(scanSyntaxRanges('> [!tip] ひとこと\n'), 'callout').length, 1);
    });
});

describe('Live モード: 画像とインライン数式', () => {
    it('画像はトークンスコープで URL を持つ', () => {
        const doc = 'x ![alt](https://e.com/a.png) y';
        const r = pick(scanSyntaxRanges(doc), 'image')[0];
        assert.ok(r);
        assert.strictEqual(r.scope, 'token');
        assert.strictEqual(r.info, 'https://e.com/a.png');
        assert.strictEqual(doc.slice(r.markFrom, r.markTo), 'alt');
    });

    it('インライン数式 "$…$" をトークンスコープで検出する', () => {
        const doc = 'インライン数式 $a^2 + b^2 = c^2$ の行。';
        const r = pick(scanSyntaxRanges(doc), 'inlineMath')[0];
        assert.ok(r, 'インライン数式が検出されない');
        assert.strictEqual(r.revealFrom, 8);
        assert.strictEqual(r.revealTo, 25);
        assert.strictEqual(r.info, 'a^2 + b^2 = c^2');
    });

    it('金額のような単独の "$" は数式にしない', () => {
        assert.deepStrictEqual(pick(scanSyntaxRanges('価格は $100 です。'), 'inlineMath'), []);
    });

    it('インラインコードの中の "$" は数式にしない', () => {
        assert.deepStrictEqual(pick(scanSyntaxRanges('`$a$`'), 'inlineMath'), []);
    });
});
