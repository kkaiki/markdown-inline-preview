/**
 * PDF 書き出し用 HTML の組み立て（`src/shared/pdfHtml.ts`）を固定する。
 *
 * 無料版の PDF には全ページ下部にクレジット行を入れ、購入者は入らない。
 * 「CSS で消す」のではなく **DOM に要素を出さない** ことが要件なので、
 * 生成される HTML 文字列そのものをこの層で検証する。
 *
 * ## なぜ table + tfoot なのか
 *
 * 当初は `position: fixed` で各ページ下端に出そうとしたが、実際に複数ページの PDF を
 * 生成して目視したところ **本文と重なった**（2026-08-13）。ページ媒体では
 * `body { padding-bottom }` は文書の末尾に一度きり効くだけで、各ページには効かない。
 * `@page { margin-bottom }` と負の `bottom` を組み合わせる案も試したが、
 * クレジットがページ上部へ回り込んでさらに悪化した。
 *
 * **`<tfoot>` は印刷時に各ページの下端へ繰り返される**という古くからの挙動が唯一安定した。
 * 本文はテーブルの `<tbody>` に入る。
 *
 * **購入者（credit: false）には table を被せない** — 今までと同一の HTML のままにして、
 * 金を払った人の出力にレイアウト変更のリスクを持ち込まない。
 *
 * 全ページに出ることそのものは実際に PDF を作らないと確かめられない。ここが守るのは
 * 「出す／出さない」と「どの構造で出すか」まで。
 */
import * as assert from 'assert';
import { buildPdfHtml, PDF_CREDIT_TEXT } from '../../../src/shared/pdfHtml';

describe('PDF 書き出し用 HTML の組み立て', () => {
    describe('無料版（credit: true）', () => {
        it('クレジット行の要素が HTML に含まれる', () => {
            const html = buildPdfHtml('# Hello', '', { credit: true });
            assert.ok(
                html.includes('<div class="ipreview-credit">'),
                `クレジット要素が無い: ${html}`
            );
            assert.ok(html.includes(PDF_CREDIT_TEXT));
        });

        it('本文が table の tbody に入る', () => {
            const html = buildPdfHtml('# Hello', '', { credit: true });
            assert.ok(html.includes('<table class="ipreview-page">'), html);
            assert.match(html, /<tbody>[\s\S]*<h1[^>]*>Hello<\/h1>[\s\S]*<\/tbody>/);
        });

        it('クレジットは tfoot の中に入る（印刷時に各ページ下端へ繰り返されるため）', () => {
            const html = buildPdfHtml('# Hello', '', { credit: true });
            assert.match(
                html,
                /<tfoot>[\s\S]*<div class="ipreview-credit">[\s\S]*<\/tfoot>/,
                'クレジットが tfoot の外にある。これだと 1 ページ目にしか出ない'
            );
        });

        it('tfoot は tbody より前に置く（ブラウザが各ページへ繰り返すための条件）', () => {
            const html = buildPdfHtml('# Hello', '', { credit: true });
            assert.ok(html.indexOf('<tfoot>') < html.indexOf('<tbody>'), html);
        });

        it('body には markdown-body クラスが付く', () => {
            const html = buildPdfHtml('# Hello', '', { credit: true });
            assert.match(html, /<body class="[^"]*\bmarkdown-body\b[^"]*">/);
        });
    });

    describe('購入済み（credit: false）', () => {
        it('クレジット行の要素が HTML に一切含まれない', () => {
            const html = buildPdfHtml('# Hello', '', { credit: false });
            assert.ok(!html.includes('ipreview-credit'), 'クレジット要素が残っている');
            assert.ok(!html.includes(PDF_CREDIT_TEXT), 'クレジット文字列が残っている');
        });

        it('table で包まない（払った人の出力にレイアウト変更を持ち込まない）', () => {
            const html = buildPdfHtml('# Hello', '', { credit: false });
            assert.ok(!html.includes('ipreview-page'), 'table が被さっている');
            assert.ok(!html.includes('<tfoot>'), 'tfoot が残っている');
        });

        it('本文が body 直下に来る（従来と同じ構造）', () => {
            const html = buildPdfHtml('# Hello', '', { credit: false });
            assert.match(html, /<body class="markdown-body">\n<h1[^>]*>Hello<\/h1>/);
        });
    });

    describe('本文の変換は従来どおり', () => {
        it('Markdown が HTML に変換される', () => {
            const html = buildPdfHtml('# Hello', '', { credit: false });
            assert.match(html, /<h1[^>]*>Hello<\/h1>/);
        });

        it('渡した CSS が <style> に埋め込まれる', () => {
            const html = buildPdfHtml('x', 'body { color: red; }', { credit: false });
            assert.ok(html.includes('body { color: red; }'));
        });

        it('タスクリストのラベルが task-label で包まれる', () => {
            const html = buildPdfHtml('- [x] done', '', { credit: false });
            assert.ok(html.includes('<span class="task-label">'), html);
        });

        it('本文に同じ文字列が書かれていてもクレジット判定には影響しない', () => {
            // 本文中の "Made with Markdown Inline Preview" は単なるテキストであって
            // クレジット要素ではない。credit:false でも本文は消さない。
            const html = buildPdfHtml(PDF_CREDIT_TEXT, '', { credit: false });
            assert.ok(html.includes(PDF_CREDIT_TEXT), '本文が消えている');
            assert.ok(!html.includes('ipreview-credit'), 'クレジット要素が混入している');
        });
    });
});
