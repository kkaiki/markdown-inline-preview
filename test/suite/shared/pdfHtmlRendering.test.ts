/**
 * PDF 書き出しで、エディタが描いている記法（数式・Mermaid・コールアウト・ハイライト）と
 * コードの色分けを、PDF 用 HTML でも描けるようにする変換を固定する（`src/shared/pdfHtml.ts`）。
 *
 * ユーザー指摘 2026-09-29:「PDF は ⌘P で PDF にプリントと同じ？ 少し出力された結果が変」→
 * 調査（docs/private/pdf-output-gaps-2026-09-29.md）で、数式・Mermaid・`> [!NOTE]`・`==強調==` が
 * 記号のまま出ていた。「A で全部直して」。
 *
 * 分担: この層（純関数）は「どの要素に置き換えるか」と「描画用の部品（KaTeX の CSS・描画スクリプト・
 * Mermaid）をいつ読み込むか」まで。実際に数式や図が描かれることは、印刷する Chrome の中で
 * `out/pdfRuntime.js` が行うので、test/browser/live/rendering/pdfRendering.test.ts（実 Chromium）で見る。
 */
import * as assert from 'assert';
import { buildPdfBody, buildPdfHtml, type PdfAssets } from '../../../src/shared/pdfHtml';

const ASSETS: PdfAssets = {
    runtimeScript: 'file:///ext/out/pdfRuntime.js',
    katexCss: 'file:///ext/media/katex.min.css',
    mermaidScript: 'file:///ext/out/mermaid.min.js'
};

describe('PDF 用 HTML: エディタと同じ記法を描く', () => {
    describe('ハイライト ==…==', () => {
        it('==重要== は <mark> になる', () => {
            assert.ok(buildPdfBody('これは ==重要== です').includes('<mark>重要</mark>'));
        });

        it('a == b のように空白で囲まれた == はハイライトにしない', () => {
            const html = buildPdfBody('a == b == c');
            assert.ok(!html.includes('<mark>'), html);
        });

        it('インラインコードの中の ==x== はそのまま', () => {
            const html = buildPdfBody('`==x==`');
            assert.ok(html.includes('<code>==x==</code>'), html);
        });
    });

    describe('数式', () => {
        it('インライン $E = mc^2$ は数式の要素になり、TeX がそのまま入る', () => {
            const html = buildPdfBody('式 $E = mc^2$ です');
            assert.ok(html.includes('<span class="ipreview-math">E = mc^2</span>'), html);
        });

        it('数式の中の _ や * は強調として解釈しない', () => {
            const html = buildPdfBody('$x_1 + y_1 * z_2$');
            assert.ok(html.includes('<span class="ipreview-math">x_1 + y_1 * z_2</span>'), html);
            assert.ok(!html.includes('<em>'), html);
        });

        it('$5 と $10 のような金額は数式にしない', () => {
            const html = buildPdfBody('価格は $5 と $10 です');
            assert.ok(!html.includes('ipreview-math'), html);
        });

        it('\\$ でエスケープしたドルは数式にしない', () => {
            const html = buildPdfBody('\\$a$ はドル記号');
            assert.ok(!html.includes('ipreview-math'), html);
        });

        it('$$ で囲んだブロックは表示数式の要素になり、< や & はエスケープされる', () => {
            const html = buildPdfBody('$$\n\\int_0^1 x^2 dx < 1 & 2\n$$\n');
            assert.ok(html.includes('<div class="ipreview-math ipreview-math-display">\\int_0^1 x^2 dx &lt; 1 &amp; 2</div>'), html);
        });
    });

    describe('Mermaid', () => {
        it('```mermaid のコードブロックは図の要素になり、コードブロックとしては出さない', () => {
            const html = buildPdfBody('```mermaid\ngraph LR\n  A --> B\n```\n');
            assert.ok(html.includes('<div class="ipreview-mermaid">graph LR\n  A --&gt; B</div>'), html);
            assert.ok(!html.includes('<pre>'), html);
        });
    });

    describe('コールアウト > [!TYPE]', () => {
        it('> [!NOTE] は種類付きの枠になり、見出しは種類名（Note）になる', () => {
            const html = buildPdfBody('> [!NOTE]\n> 本文です\n');
            assert.ok(html.includes('<div class="ipreview-callout ipreview-callout-note">'), html);
            assert.ok(html.includes('<div class="ipreview-callout-title">Note</div>'), html);
            assert.ok(html.includes('<p>本文です</p>'), html);
            assert.ok(!html.includes('[!NOTE]'), html);
        });

        it('> [!warning] 注意して のように見出しを書けばそれを使い、種類は小文字にそろえる', () => {
            const html = buildPdfBody('> [!warning] 注意して\n> 中身\n');
            assert.ok(html.includes('ipreview-callout-warning'), html);
            assert.ok(html.includes('<div class="ipreview-callout-title">注意して</div>'), html);
        });

        it('本文の中の太字などの書式はそのまま描く', () => {
            const html = buildPdfBody('> [!TIP]\n> **大事** なこと\n');
            assert.ok(html.includes('<strong>大事</strong>'), html);
        });

        it('[!…] で始まらない普通の引用は引用のまま', () => {
            const html = buildPdfBody('> ただの引用\n');
            assert.ok(html.includes('<blockquote>'), html);
            assert.ok(!html.includes('ipreview-callout'), html);
        });
    });

    describe('コードの色分け', () => {
        it('言語を書いたコードブロックは language-<名前> のクラスが付く（色分けは印刷時に行う）', () => {
            const html = buildPdfBody('```ts\nconst a = 1;\n```\n');
            assert.ok(html.includes('<code class="language-ts">'), html);
        });
    });

    describe('描画用の部品を読み込むのは必要なときだけ', () => {
        it('数式があれば KaTeX の CSS と描画スクリプトを読み込む', () => {
            const html = buildPdfHtml('$x$', '', { credit: false, assets: ASSETS });
            assert.ok(html.includes(`<link rel="stylesheet" href="${ASSETS.katexCss}">`), html);
            assert.ok(html.includes(`<script src="${ASSETS.runtimeScript}"></script>`), html);
            assert.ok(!html.includes(ASSETS.mermaidScript), 'Mermaid が無いのに読み込んでいる');
        });

        it('Mermaid があれば Mermaid のスクリプトを描画スクリプトより前に読み込む', () => {
            const html = buildPdfHtml('```mermaid\ngraph LR\nA-->B\n```\n', '', { credit: false, assets: ASSETS });
            const mermaid = html.indexOf(`<script src="${ASSETS.mermaidScript}"></script>`);
            const runtime = html.indexOf(`<script src="${ASSETS.runtimeScript}"></script>`);
            assert.ok(mermaid >= 0 && runtime > mermaid, html);
        });

        it('言語付きのコードブロックがあれば描画スクリプトを読み込む（KaTeX・Mermaid は読み込まない）', () => {
            const html = buildPdfHtml('```ts\nconst a = 1;\n```\n', '', { credit: false, assets: ASSETS });
            assert.ok(html.includes(ASSETS.runtimeScript), html);
            assert.ok(!html.includes(ASSETS.katexCss) && !html.includes(ASSETS.mermaidScript), html);
        });

        it('どれも無い文書にはスクリプトを入れない（印刷を待たせない）', () => {
            const html = buildPdfHtml('# 見出し\n\n本文', '', { credit: false, assets: ASSETS });
            assert.ok(!html.includes('<script'), html);
            assert.ok(!html.includes(ASSETS.katexCss), html);
        });
    });
});
