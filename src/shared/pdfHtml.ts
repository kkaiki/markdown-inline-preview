/**
 * PDF 書き出し用の完全 HTML を組み立てる（VS Code API 非依存の純関数）。
 *
 * `src/live/host/localExport.ts` から切り出した。ヘッドレス Chrome に渡す HTML を
 * VS Code なしで検証できるようにするため（`test/suite/shared/pdfHtml.test.ts`）。
 *
 * クレジット行は **`credit: false` のとき DOM に出さない**。CSS で `display: none` に
 * するのではないのは、生成された HTML を書き換えるだけで消せてしまうため。
 */

import { marked } from 'marked';
import { pdfStylingCss, type PdfStyling, type PdfStylingContext } from './pdfStyling';

/** 無料版の PDF 全ページ下部に入る 1 行。ブランド名なのでロケールによらず英語のまま。 */
export const PDF_CREDIT_TEXT = 'Made with Markdown Inline Preview';

export interface BuildPdfHtmlOptions {
    /** true なら全ページ下部にクレジット行を入れる（無料版） */
    credit: boolean;
    /** PDF の体裁（PRO+）。省略・既定値なら今までと同じ HTML */
    styling?: PdfStyling;
    /** ヘッダー・フッターの `{title}` / `{date}` と目次の見出し */
    context?: PdfStylingContext & { tocTitle?: string };
}

/** 目次を作るために、h1〜h3 に連番の id を付けてリンク一覧を作る。 */
function addTableOfContents(html: string, tocTitle: string): string {
    const items: string[] = [];
    let n = 0;
    const body = html.replace(/<h([1-3])>([\s\S]*?)<\/h\1>/g, (_, level: string, inner: string) => {
        const id = `ipreview-h-${++n}`;
        const text = inner.replace(/<[^>]+>/g, '').trim();
        items.push(`<li class="toc-h${level}"><a href="#${id}">${text}</a></li>`);
        return `<h${level} id="${id}">${inner}</h${level}>`;
    });
    if (items.length === 0) return html;
    const nav = `<nav class="ipreview-toc"><p class="ipreview-toc-title">${tocTitle}</p><ul>${items.join('')}</ul></nav>`;
    return `${nav}\n${body}`;
}

/**
 * タスクリストアイテムのテキストノードを <span class="task-label"> で囲む。
 * marked は <li><input ...> text</li> と出力するが、テキストノードは CSS で
 * 直接選択できないため、取り消し線などのスタイルを当てるためにラップする。
 */
function wrapTaskLabels(html: string): string {
    return html.replace(
        /(<li>)(<input[^>]*type="checkbox"[^>]*>)([\s\S]*?)(<\/li>)/g,
        (_, liOpen, input, content, liClose) =>
            `${liOpen}${input}<span class="task-label">${content.trim()}</span>${liClose}`
    );
}

/**
 * クレジット行を各ページの下端へ繰り返すための包み。
 *
 * **`<tfoot>` が印刷時に各ページの下端へ繰り返される**という挙動を使う。
 * `position: fixed` では本文と重なり（実測 2026-08-13）、`@page { margin-bottom }` と
 * 負の `bottom` の組み合わせではページ上部へ回り込んで悪化した。tfoot だけが安定した。
 *
 * `<tfoot>` は `<tbody>` より**前**に書く必要がある（HTML の規定であり、
 * ブラウザが各ページへ繰り返す条件でもある）。
 */
function wrapWithCreditFooter(htmlBody: string): string {
    return `<table class="ipreview-page">
<tfoot><tr><td><div class="ipreview-credit">${PDF_CREDIT_TEXT}</div></td></tr></tfoot>
<tbody><tr><td>
${htmlBody}
</td></tr></tbody>
</table>`;
}

/** Markdown 本文 + CSS から PDF 用の完全 HTML 文字列を組み立てる。 */
export function buildPdfHtml(
    markdownBody: string,
    css: string,
    options: BuildPdfHtmlOptions
): string {
    const rawHtml = marked.parse(markdownBody) as string;
    let htmlBody = wrapTaskLabels(rawHtml);
    const context = options.context ?? { title: '', date: '' };
    if (options.styling?.tableOfContents) {
        htmlBody = addTableOfContents(htmlBody, context.tocTitle ?? 'Contents');
    }
    const stylingCss = options.styling ? pdfStylingCss(options.styling, context) : '';

    // 購入者には table を被せない。今までと同一の HTML のままにして、
    // 金を払った人の出力にレイアウト変更のリスクを持ち込まない。
    const content = options.credit ? wrapWithCreditFooter(htmlBody) : htmlBody;

    return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>${css}${stylingCss ? `\n${stylingCss}` : ''}</style>
</head>
<body class="markdown-body">
${content}
</body>
</html>`;
}
