/**
 * PDF 書き出し用 HTML の組み立て（`src/shared/pdfHtml.ts`）を固定する。
 *
 * 無料版の PDF には全ページ下部にクレジット行を入れ、購入者は入らない。
 * 購入者の HTML にはクレジットの文字列を**一切出さない**（CSS で隠すのではない）。
 *
 * ## クレジット行の置き方（2026-09-29 に変更）
 *
 * 以前は本文を `<table>` で包み、印刷時に各ページへ繰り返される `<tfoot>` に入れていた
 * （`position: fixed` は本文と重なり、`@page` の余白 + 負の bottom は上部へ回り込んだため。2026-08-13）。
 * しかし tfoot は**最後のページでは本文の直後**に出てしまう（ユーザー指摘 2026-09-29「出力された結果が変」）。
 *
 * いまは **`@page` の余白ボックス（`@bottom-center`）** に置く。ページ番号・フッター（PDF の体裁）と同じ仕組みで、
 * どのページでも紙の下端に出る。本文の HTML は無料版と購入者で同一になる（違いは CSS の数行だけ）。
 * 余白ボックスは Chrome / Edge 131 以降で効く。
 *
 * 各ページの下端に出ることそのものは test/browser/live/rendering/pdfRendering.test.ts（実 Chrome の PDF）で見る。
 */
import * as assert from 'assert';
import { buildPdfHtml, PDF_CREDIT_TEXT } from '../../../src/shared/pdfHtml';
import { DEFAULT_PDF_STYLING } from '../../../src/shared/pdfStyling';

describe('PDF 書き出し用 HTML の組み立て', () => {
    describe('無料版（credit: true）', () => {
        it('クレジット行は @page の下中央の余白ボックスに入る（最後のページでも紙の下端に出る）', () => {
            const html = buildPdfHtml('# Hello', '', { credit: true });
            assert.match(html, new RegExp(`@bottom-center\\s*\\{[^}]*content:\\s*"${PDF_CREDIT_TEXT}"`), html);
        });

        it('本文を table で包まない（無料版と購入者で本文の HTML が同じ）', () => {
            const free = buildPdfHtml('# Hello\n\n本文', '', { credit: true });
            const paid = buildPdfHtml('# Hello\n\n本文', '', { credit: false });
            assert.ok(!free.includes('<table class="ipreview-page">'), free);
            const body = (html: string) => html.slice(html.indexOf('<body'));
            assert.strictEqual(body(free), body(paid));
        });

        it('ページ番号（右下）・フッター（左下）と重ならない', () => {
            const html = buildPdfHtml('# Hello', '', {
                credit: true,
                styling: { ...DEFAULT_PDF_STYLING, pageNumbers: true, footerText: 'フッター' },
                context: { title: 't', date: '2026-09-29' }
            });
            assert.ok(html.includes('@bottom-center') && html.includes('@bottom-right') && html.includes('@bottom-left'), html);
            assert.strictEqual((html.match(/@bottom-center/g) ?? []).length, 1);
        });

        it('body には markdown-body クラスが付く', () => {
            const html = buildPdfHtml('# Hello', '', { credit: true });
            assert.match(html, /<body class="[^"]*\bmarkdown-body\b[^"]*">/);
        });
    });

    describe('購入済み（credit: false）', () => {
        it('クレジット行の文字列も余白ボックスも HTML に一切含まれない', () => {
            const html = buildPdfHtml('# Hello', '', { credit: false });
            assert.ok(!html.includes(PDF_CREDIT_TEXT), 'クレジット文字列が残っている');
            assert.ok(!html.includes('@bottom-center'), '余白ボックスが残っている');
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
            assert.ok(!html.includes('@bottom-center'), 'クレジットの余白ボックスが混入している');
        });
    });
});
