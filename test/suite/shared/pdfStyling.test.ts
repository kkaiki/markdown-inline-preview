/**
 * PDF の体裁（PRO+）の純関数（`src/shared/pdfStyling.ts`）と、目次の組み立て（`src/shared/pdfHtml.ts`）を固定する。
 *
 * ユーザー決定（2026-09-28）: 「PDF の体裁（用紙サイズ・ページ番号・目次・テーマ）」は PRO+ に含める。
 * 設定（`markdownInline.export.pdf.*`）が既定のままなら今までと同じ PDF になること、
 * 既定から変えたときだけ PRO+ の判定に回ること、変えた内容が印刷用 CSS / HTML に正しく出ることをここで守る。
 * 用紙サイズが実際の PDF に反映されること（CLI の --print-to-pdf が @page size に従うこと）は
 * 実 Chromium のテスト（test/browser/live/rendering/pdfLayout.test.ts）で確かめる。
 */
import * as assert from 'assert';
import {
    DEFAULT_PDF_STYLING,
    isDefaultPdfStyling,
    pdfStylingCss,
    readPdfStyling,
    type PdfStyling
} from '../../../src/shared/pdfStyling';
import { buildPdfHtml } from '../../../src/shared/pdfHtml';

const CTX = { title: '週報', date: '2026-09-29' };

function styling(over: Partial<PdfStyling>): PdfStyling {
    return { ...DEFAULT_PDF_STYLING, ...over };
}

describe('PDF の体裁: 設定の読み取り', () => {
    it('設定が無ければ既定値になる', () => {
        assert.deepStrictEqual(readPdfStyling(() => undefined), DEFAULT_PDF_STYLING);
    });

    it('知らない値（手で書き換えた設定など）は既定値に戻す', () => {
        const values: Record<string, unknown> = { paperSize: 'A0', margins: 'huge', theme: 'neon', pageNumbers: 'yes' };
        assert.deepStrictEqual(readPdfStyling((key) => values[key]), DEFAULT_PDF_STYLING);
    });

    it('正しい値はそのまま読む', () => {
        const values: Record<string, unknown> = {
            paperSize: 'A4', margins: 'wide', pageNumbers: true, tableOfContents: true,
            theme: 'serif', headerText: '{title}', footerText: '社外秘'
        };
        assert.deepStrictEqual(readPdfStyling((key) => values[key]), {
            paperSize: 'A4', margins: 'wide', pageNumbers: true, tableOfContents: true,
            theme: 'serif', headerText: '{title}', footerText: '社外秘'
        });
    });
});

describe('PDF の体裁: 既定かどうか（既定なら PRO+ の判定に回さない）', () => {
    it('すべて既定なら true', () => {
        assert.strictEqual(isDefaultPdfStyling(DEFAULT_PDF_STYLING), true);
    });

    it('どれか 1 つでも変えたら false', () => {
        assert.strictEqual(isDefaultPdfStyling(styling({ paperSize: 'A4' })), false);
        assert.strictEqual(isDefaultPdfStyling(styling({ pageNumbers: true })), false);
        assert.strictEqual(isDefaultPdfStyling(styling({ headerText: 'x' })), false);
    });

    it('ヘッダー・フッターが空白だけなら既定扱い', () => {
        assert.strictEqual(isDefaultPdfStyling(styling({ headerText: '   ', footerText: '' })), true);
    });
});

describe('PDF の体裁: 印刷用 CSS', () => {
    it('既定なら何も足さない（今までと同じ PDF）', () => {
        assert.strictEqual(pdfStylingCss(DEFAULT_PDF_STYLING, CTX), '');
    });

    it('用紙サイズは @page size に出る', () => {
        assert.ok(pdfStylingCss(styling({ paperSize: 'A4' }), CTX).includes('size: A4;'));
        assert.ok(pdfStylingCss(styling({ paperSize: 'Letter' }), CTX).includes('size: letter;'));
    });

    it('余白は @page margin に出る', () => {
        assert.ok(pdfStylingCss(styling({ margins: 'narrow' }), CTX).includes('margin: 10mm;'));
        assert.ok(pdfStylingCss(styling({ margins: 'wide' }), CTX).includes('margin: 25mm;'));
    });

    it('ページ番号は下端右の余白に「n / 全体」で出る', () => {
        const css = pdfStylingCss(styling({ pageNumbers: true }), CTX);
        assert.ok(/@bottom-right\s*\{[^}]*content:\s*counter\(page\) " \/ " counter\(pages\)/.test(css), css);
    });

    it('ヘッダー・フッターの {title} と {date} を置き換える', () => {
        const css = pdfStylingCss(styling({ headerText: '{title} ({date})', footerText: '社外秘' }), CTX);
        assert.ok(css.includes('@top-center'), css);
        assert.ok(css.includes('content: "週報 (2026-09-29)"'), css);
        assert.ok(css.includes('@bottom-left') && css.includes('content: "社外秘"'), css);
    });

    it('ヘッダーの文字列に " や \\ が入っていても CSS を壊さない', () => {
        const css = pdfStylingCss(styling({ headerText: 'a"b\\c' }), CTX);
        assert.ok(css.includes('content: "a\\"b\\\\c"'), css);
        assert.ok(!css.includes('</style'), css);
    });

    it('テーマは本文の書体・大きさを変える', () => {
        assert.ok(/font-family:[^;]*Mincho/.test(pdfStylingCss(styling({ theme: 'serif' }), CTX)));
        assert.ok(/font-size:\s*11/.test(pdfStylingCss(styling({ theme: 'compact' }), CTX)));
    });
});

describe('PDF の体裁: 目次', () => {
    const MD = '# 表題\n\n## 背景\n\n本文\n\n### 詳細\n\n## 結論\n';

    it('目次を有効にすると、見出し（h1〜h3）へのリンク一覧が本文の前に入る', () => {
        const html = buildPdfHtml(MD, '', { credit: false, styling: styling({ tableOfContents: true }), context: CTX });
        const toc = /<nav class="ipreview-toc">([\s\S]*?)<\/nav>/.exec(html);
        assert.ok(toc, '目次が無い');
        const links = [...toc[1].matchAll(/<a href="#([^"]+)">([^<]+)<\/a>/g)].map((m) => m[2]);
        assert.deepStrictEqual(links, ['表題', '背景', '詳細', '結論']);
        assert.ok(html.indexOf('ipreview-toc') < html.indexOf('<h1'), '目次が本文より後にある');
    });

    it('リンク先の id が見出しに付く（同じ見出しが 2 つあっても別の id）', () => {
        const html = buildPdfHtml('## A\n\n## A\n', '', { credit: false, styling: styling({ tableOfContents: true }), context: CTX });
        const ids = [...html.matchAll(/<h2 id="([^"]+)">/g)].map((m) => m[1]);
        assert.strictEqual(ids.length, 2);
        assert.notStrictEqual(ids[0], ids[1]);
        for (const id of ids) assert.ok(html.includes(`href="#${id}"`), id);
    });

    it('目次を有効にしなければ、今までと同じ HTML（目次も id も入らない）', () => {
        const html = buildPdfHtml(MD, '', { credit: false });
        assert.ok(!html.includes('ipreview-toc'));
        assert.ok(html.includes('<h2>背景</h2>'));
    });

    it('体裁の CSS は本文の CSS の後に入る（上書きできるように）', () => {
        const html = buildPdfHtml(MD, 'body{color:red}', { credit: false, styling: styling({ paperSize: 'A4' }), context: CTX });
        assert.ok(html.indexOf('body{color:red}') < html.indexOf('size: A4;'));
    });
});
