/**
 * まとめて書き出し: 複数の .md を 1 つの PDF（本）用 HTML に束ねる（純関数。読み込み済みの内容を受け取る）。
 *
 * - ファイルごとに <section> で包み、2 本目以降は改ページ
 * - 見出し id をファイルごとの接頭辞付きにして衝突させない
 * - 画像はファイルごとのフォルダ基準で file:// にする
 * - 先頭に「ファイル（最初の h1、無ければファイル名）＋ h1/h2」の目次
 * - 束ねたファイルへの .md リンクは PDF 内のアンカーにする
 * 仕様: docs/private/specifications/pro-batch-export.md §4.5
 */
import * as path from 'path';
import { splitFrontmatter } from '../markdown/frontmatter';
import { buildPdfBody, creditCss, pdfAssetTags, type PdfAssets } from '../pdfHtml';
import { MARKDOWN_FILE } from './fileOrder';
import { decodeHtmlEntities, isNonLocalReference, rewriteImageSources } from './imagePaths';

export interface MergedSource {
    /** 絶対パス */
    path: string;
    markdown: string;
}

export interface MergedOptions {
    title: string;
    tocTitle: string;
    /** 呼び出し側が shouldIncludeCredit で決めた値 */
    credit: boolean;
    /** 数式・Mermaid・コードの色分けの描画部品（単体の PDF と同じ） */
    assets?: PdfAssets;
}

function escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function safeDecodeUri(text: string): string {
    try { return decodeURI(text); } catch { return text; }
}

const BOOK_CSS = `
.ipreview-doc + .ipreview-doc { break-before: page; page-break-before: always; }
.ipreview-book-toc { break-after: page; page-break-after: always; }
.ipreview-book-toc ul { list-style: none; padding-left: 0; }
.ipreview-book-toc .toc-file { font-weight: 600; margin-top: 0.4em; }
.ipreview-book-toc .toc-h1, .ipreview-book-toc .toc-h2 { padding-left: 1.2em; }`;

export function buildMergedPdfHtml(docs: readonly MergedSource[], css: string, options: MergedOptions): string {
    const docIdOf = new Map(docs.map((d, i) => [path.resolve(d.path), `doc-${i + 1}`]));
    const tocItems: string[] = [];

    const sections = docs.map((doc, i) => {
        const docId = `doc-${i + 1}`;
        const baseDir = path.dirname(doc.path);
        let html = rewriteImageSources(buildPdfBody(splitFrontmatter(doc.markdown).body), baseDir);

        let n = 0;
        let docTitle: string | undefined;
        const subItems: string[] = [];
        html = html.replace(/<h([1-3])>([\s\S]*?)<\/h\1>/g, (_, level: string, inner: string) => {
            const id = `${docId}-h-${++n}`;
            const text = inner.replace(/<[^>]+>/g, '').trim();
            if (docTitle === undefined && level === '1') docTitle = text;
            else if (level !== '3') subItems.push(`<li class="toc-h${level}"><a href="#${id}">${text}</a></li>`);
            return `<h${level} id="${id}">${inner}</h${level}>`;
        });

        html = html.replace(/(<a\b[^>]*?\bhref=)(["'])(.*?)\2/gi, (match, pre: string, quote: string, href: string) => {
            const ref = decodeHtmlEntities(href);
            if (isNonLocalReference(ref)) return match;
            const [filePath] = safeDecodeUri(ref).split(/[?#]/);
            if (!MARKDOWN_FILE.test(filePath)) return match;
            const target = docIdOf.get(path.resolve(baseDir, filePath));
            return target ? `${pre}${quote}#${target}${quote}` : match;
        });

        const label = docTitle ?? escapeHtml(path.basename(doc.path).replace(MARKDOWN_FILE, ''));
        tocItems.push(`<li class="toc-file"><a href="#${docId}">${label}</a></li>`, ...subItems);
        return `<section class="ipreview-doc" id="${docId}">\n${html}\n</section>`;
    });

    const toc = `<nav class="ipreview-toc ipreview-book-toc"><p class="ipreview-toc-title">${escapeHtml(options.tocTitle)}</p><ul>${tocItems.join('')}</ul></nav>`;
    const content = `${toc}\n${sections.join('\n')}`;
    const { head, scripts } = pdfAssetTags(content, options.assets);

    return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(options.title)}</title>
${head}<style>${css}${BOOK_CSS}${options.credit ? `\n${creditCss()}` : ''}</style>
</head>
<body class="markdown-body">
${content}${scripts}
</body>
</html>`;
}
