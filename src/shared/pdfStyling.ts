/**
 * PDF の体裁（PRO+）の設定と、それを印刷用 CSS にする純関数。
 *
 * 設定 `markdownInline.export.pdf.*` が既定のままなら何も足さない（今までと同じ PDF）。
 * 仕様: docs/private/specifications/pro-export-pdf-onetime.md §2.2.1
 */

export type PaperSize = 'default' | 'A4' | 'Letter' | 'Legal' | 'A5' | 'B5';
export type PdfMargins = 'default' | 'narrow' | 'normal' | 'wide';
export type PdfTheme = 'default' | 'serif' | 'compact';

export interface PdfStyling {
    paperSize: PaperSize;
    margins: PdfMargins;
    pageNumbers: boolean;
    tableOfContents: boolean;
    theme: PdfTheme;
    /** 上端中央。`{title}` / `{date}` を置き換える */
    headerText: string;
    /** 下端左。`{title}` / `{date}` を置き換える */
    footerText: string;
}

export const DEFAULT_PDF_STYLING: PdfStyling = {
    paperSize: 'default',
    margins: 'default',
    pageNumbers: false,
    tableOfContents: false,
    theme: 'default',
    headerText: '',
    footerText: ''
};

/** ヘッダー・フッターの置き換えに使う値。 */
export interface PdfStylingContext {
    /** 文書の名前（ファイル名から拡張子を除いたもの） */
    title: string;
    /** 書き出した日（YYYY-MM-DD） */
    date: string;
}

const PAPER_SIZES: readonly PaperSize[] = ['default', 'A4', 'Letter', 'Legal', 'A5', 'B5'];
const MARGINS: readonly PdfMargins[] = ['default', 'narrow', 'normal', 'wide'];
const THEMES: readonly PdfTheme[] = ['default', 'serif', 'compact'];

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
    return allowed.includes(value as T) ? (value as T) : fallback;
}

/**
 * 設定を読む。`get` は `markdownInline.export.pdf.` 以下のキー（`paperSize` など）を受け取る。
 * 知らない値（手で書き換えた設定など）は既定値に戻す。
 */
export function readPdfStyling(get: (key: keyof PdfStyling) => unknown): PdfStyling {
    const d = DEFAULT_PDF_STYLING;
    const bool = (key: keyof PdfStyling, fallback: boolean): boolean => {
        const v = get(key);
        return typeof v === 'boolean' ? v : fallback;
    };
    const text = (key: keyof PdfStyling): string => {
        const v = get(key);
        return typeof v === 'string' ? v : '';
    };
    return {
        paperSize: oneOf(get('paperSize'), PAPER_SIZES, d.paperSize),
        margins: oneOf(get('margins'), MARGINS, d.margins),
        pageNumbers: bool('pageNumbers', d.pageNumbers),
        tableOfContents: bool('tableOfContents', d.tableOfContents),
        theme: oneOf(get('theme'), THEMES, d.theme),
        headerText: text('headerText'),
        footerText: text('footerText')
    };
}

/** すべて既定か。既定なら PRO+ の判定に回さない。 */
export function isDefaultPdfStyling(s: PdfStyling): boolean {
    return (
        s.paperSize === 'default' &&
        s.margins === 'default' &&
        !s.pageNumbers &&
        !s.tableOfContents &&
        s.theme === 'default' &&
        s.headerText.trim() === '' &&
        s.footerText.trim() === ''
    );
}

const PAPER_CSS: Record<Exclude<PaperSize, 'default'>, string> = {
    A4: 'A4',
    Letter: 'letter',
    Legal: 'legal',
    A5: 'A5',
    B5: 'B5'
};

const MARGIN_CSS: Record<Exclude<PdfMargins, 'default'>, string> = {
    narrow: '10mm',
    normal: '18mm',
    wide: '25mm'
};

const MARGIN_BOX_STYLE = 'font-size: 8pt; color: #6b7280; font-family: -apple-system, "Hiragino Sans", "Yu Gothic", sans-serif;';

const THEME_CSS: Record<Exclude<PdfTheme, 'default'>, string> = {
    serif: `
body {
  font-family: "Hiragino Mincho ProN", "Yu Mincho", YuMincho, "Noto Serif JP", "Times New Roman", serif;
  line-height: 1.85;
}
h1, h2, h3, h4, h5, h6 { font-family: inherit; }
h1, h2 { border-bottom-color: #d4d4d4; }`,
    compact: `
body { font-size: 11px; line-height: 1.5; }
h1 { font-size: 1.7em; }
h2 { font-size: 1.35em; }
p { margin: 0.4em 0; }
pre, table, blockquote { margin: 0.5em 0; }`
};

/** CSS の文字列リテラルにする（`"` と `\` をエスケープし、改行は空白にする）。 */
function cssString(text: string): string {
    return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ').replace(/</g, '\\3C ')}"`;
}

function fill(template: string, ctx: PdfStylingContext): string {
    return template.replace(/\{title\}/g, ctx.title).replace(/\{date\}/g, ctx.date);
}

/** 体裁を印刷用 CSS にする。既定なら空文字（今までと同じ PDF）。 */
export function pdfStylingCss(s: PdfStyling, ctx: PdfStylingContext): string {
    if (isDefaultPdfStyling(s)) return '';

    const page: string[] = [];
    if (s.paperSize !== 'default') page.push(`  size: ${PAPER_CSS[s.paperSize]};`);
    if (s.margins !== 'default') page.push(`  margin: ${MARGIN_CSS[s.margins]};`);
    if (s.pageNumbers) {
        page.push(`  @bottom-right { content: counter(page) " / " counter(pages); ${MARGIN_BOX_STYLE} }`);
    }
    if (s.headerText.trim() !== '') {
        page.push(`  @top-center { content: ${cssString(fill(s.headerText, ctx))}; ${MARGIN_BOX_STYLE} }`);
    }
    if (s.footerText.trim() !== '') {
        page.push(`  @bottom-left { content: ${cssString(fill(s.footerText, ctx))}; ${MARGIN_BOX_STYLE} }`);
    }

    const parts: string[] = [];
    if (page.length > 0) parts.push(`@page {\n${page.join('\n')}\n}`);
    if (s.theme !== 'default') parts.push(THEME_CSS[s.theme].trim());
    if (s.tableOfContents) {
        parts.push(`.ipreview-toc { margin: 0 0 1.6em; padding: 0.8em 1.2em; border: 1px solid #e5e7eb; border-radius: 6px; page-break-after: always; }
.ipreview-toc-title { font-weight: 700; margin: 0 0 0.4em; }
.ipreview-toc ul { margin: 0; padding-left: 0; list-style: none; }
.ipreview-toc li { margin: 0.2em 0; }
.ipreview-toc li.toc-h2 { margin-left: 1em; }
.ipreview-toc li.toc-h3 { margin-left: 2em; }
.ipreview-toc a { color: inherit; text-decoration: none; }`);
    }
    return parts.join('\n\n');
}
