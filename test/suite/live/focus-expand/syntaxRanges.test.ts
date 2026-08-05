/**
 * Live モードの記法スキャナ（ソース文字列 → 記法トークンの範囲）の純関数テスト。
 *
 * Live モードは Markdown を別のドキュメントモデルへ変換しない（requirements.md R1.1）。
 * 代わりに「生テキストのどこからどこまでが何の記法か」を切り出し、その範囲へ
 * decoration を当てる。したがってこのスキャナの出す `from`/`to` が1文字でもズレると、
 * 隠す文字がズレて表示が壊れる。
 *
 * 期待値は Obsidian 実測仕様（obsidian-observed-spec.md §2）に一致させること。
 * 特に `revealFrom`/`revealTo` は展開判定に直接使われるので、
 * 実測した「`**太字bold**` は オフセット 4〜14 で展開」と厳密に対応する。
 */
import * as assert from 'assert';
import { scanSyntaxRanges, type SyntaxRange } from '../../../../src/live/shared/syntaxRanges';

/** kind で絞り込む。 */
function pick(ranges: SyntaxRange[], kind: string): SyntaxRange[] {
    return ranges.filter((r) => r.kind === kind);
}

/** 隠される文字列（hidden 範囲を実際に切り出したもの）。 */
function hiddenTexts(doc: string, r: SyntaxRange): string[] {
    return r.hidden.map((h) => doc.slice(h.from, h.to));
}

describe('Live モード: 記法スキャナ scanSyntaxRanges', () => {
    describe('見出し（行スコープ）', () => {
        it('H1〜H6 をレベル付きで検出する', () => {
            const doc = '# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6\n';
            const headings = pick(scanSyntaxRanges(doc), 'heading');
            assert.deepStrictEqual(headings.map((h) => h.level), [1, 2, 3, 4, 5, 6]);
        });

        it('隠す範囲は "#"＋直後の空白（実測: "# " が消える）', () => {
            const doc = '## 見出し2\n';
            const h = pick(scanSyntaxRanges(doc), 'heading')[0];
            assert.deepStrictEqual(hiddenTexts(doc, h), ['## ']);
        });

        it('展開範囲は行全体（実測: 行内のどこにカーソルがあっても "# " が出る）', () => {
            const doc = 'あ\n# 見出し\n';
            const h = pick(scanSyntaxRanges(doc), 'heading')[0];
            assert.strictEqual(h.scope, 'line');
            assert.strictEqual(h.revealFrom, 2, '行頭オフセット');
            assert.strictEqual(h.revealTo, 7, '行末オフセット');
        });

        it('"#" の後ろに空白が無いものは見出しではない', () => {
            assert.deepStrictEqual(pick(scanSyntaxRanges('#タグ\n'), 'heading'), []);
        });

        it('"#" が7個以上は見出しではない', () => {
            assert.deepStrictEqual(pick(scanSyntaxRanges('####### x\n'), 'heading'), []);
        });
    });

    describe('インライン記法（トークンスコープ）', () => {
        // 実測に使ったのと同じ行。オフセットも実測値と一致させる。
        const doc = 'これは **太字bold** と *斜体italic* と ***太字斜体*** の行です。';

        it('太字の範囲が実測どおり [4, 14)', () => {
            const strong = pick(scanSyntaxRanges(doc), 'strong')[0];
            assert.strictEqual(strong.revealFrom, 4);
            assert.strictEqual(strong.revealTo, 14);
            assert.strictEqual(strong.scope, 'token');
        });

        it('斜体の範囲が実測どおり [17, 27)', () => {
            const em = pick(scanSyntaxRanges(doc), 'em')[0];
            assert.strictEqual(em.revealFrom, 17);
            assert.strictEqual(em.revealTo, 27);
        });

        it('*** は1つのトークンとして扱う（実測: 6文字が同時に出入りする）', () => {
            const both = pick(scanSyntaxRanges(doc), 'strongEm')[0];
            assert.strictEqual(both.revealFrom, 30);
            assert.strictEqual(both.revealTo, 40);
            assert.deepStrictEqual(hiddenTexts(doc, both), ['***', '***']);
        });

        it('隠すのは前後のマーカーだけで、本文は隠さない', () => {
            const strong = pick(scanSyntaxRanges(doc), 'strong')[0];
            assert.deepStrictEqual(hiddenTexts(doc, strong), ['**', '**']);
            assert.strictEqual(doc.slice(strong.markFrom, strong.markTo), '太字bold');
        });

        it('取り消し線・ハイライト・インラインコードを検出する', () => {
            const d = 'a ~~s~~ b ==h== c `code` d';
            const kinds = scanSyntaxRanges(d).map((r) => r.kind);
            assert.ok(kinds.includes('strike'), `strike が無い: ${kinds.join(',')}`);
            assert.ok(kinds.includes('highlight'), `highlight が無い: ${kinds.join(',')}`);
            assert.ok(kinds.includes('code'), `code が無い: ${kinds.join(',')}`);
        });

        it('インラインコードの中の "*" は強調として扱わない', () => {
            const d = 'a `**not bold**` b';
            assert.deepStrictEqual(pick(scanSyntaxRanges(d), 'strong'), []);
        });

        it('バックスラッシュでエスケープした "*" は強調にしない', () => {
            const d = 'a \\*not em\\* b';
            assert.deepStrictEqual(pick(scanSyntaxRanges(d), 'em'), []);
        });

        it('閉じ記号が無い強調は検出しない', () => {
            assert.deepStrictEqual(pick(scanSyntaxRanges('a **open only'), 'strong'), []);
        });

        it('強調は行をまたがない', () => {
            assert.deepStrictEqual(pick(scanSyntaxRanges('a **open\nclose** b'), 'strong'), []);
        });
    });

    describe('リンク（トークンスコープ・URL 部分を隠す）', () => {
        it('[表示](URL) は "](URL)" と "[" を隠して表示テキストだけ残す', () => {
            const doc = 'x [表示](https://e.com) y';
            const link = pick(scanSyntaxRanges(doc), 'link')[0];
            assert.strictEqual(doc.slice(link.markFrom, link.markTo), '表示');
            assert.deepStrictEqual(hiddenTexts(doc, link), ['[', '](https://e.com)']);
            assert.strictEqual(link.revealFrom, 2);
            assert.strictEqual(link.revealTo, 21);
        });

        it('生 URL は記法トークンではない（実測: 常に生表示）', () => {
            assert.deepStrictEqual(pick(scanSyntaxRanges('見て https://e.com ね'), 'link'), []);
        });
    });

    describe('コードフェンスの内側は走査しない', () => {
        it('フェンス内の "**" を強調として拾わない', () => {
            const doc = '```\n**not bold**\n```\n';
            assert.deepStrictEqual(pick(scanSyntaxRanges(doc), 'strong'), []);
        });

        it('フェンス内の "# " を見出しとして拾わない', () => {
            const doc = '```\n# not heading\n```\n';
            assert.deepStrictEqual(pick(scanSyntaxRanges(doc), 'heading'), []);
        });
    });
});
