/**
 * PDF 書き出し用の完全 HTML を組み立てる（VS Code API 非依存の純関数）。
 *
 * `src/live/host/localExport.ts` から切り出した。ヘッドレス Chrome に渡す HTML を
 * VS Code なしで検証できるようにするため（`test/suite/shared/pdfHtml.test.ts`）。
 *
 * エディタが描いている記法（数式・Mermaid・コールアウト・ハイライト）とコードの色分けも扱う。
 * ここでは置き換え先の要素を作るまでで、実際に描くのは印刷する Chrome の中の `out/pdfRuntime.js`
 * （docs/specifications/fixes/pdf-output-parity-fix.md）。
 *
 * クレジット行は **`credit: false` のとき HTML に一切出さない**。
 */

import { Marked, type Tokens } from 'marked';
import { pdfStylingCss, type PdfStyling, type PdfStylingContext } from './pdfStyling';

/** 無料版の PDF 全ページ下部に入る 1 行。ブランド名なのでロケールによらず英語のまま。 */
export const PDF_CREDIT_TEXT = 'Made with Markdown Inline Preview';

/** 印刷する Chrome に読み込ませる描画部品の URL（file://）。渡さなければ読み込まない */
export interface PdfAssets {
    /** 数式・コードの色分けを描き、終わったら window.__ipreviewReady を解決する（out/pdfRuntime.js） */
    runtimeScript: string;
    /** KaTeX の CSS（media/katex.min.css。フォントは media/fonts） */
    katexCss: string;
    /** Mermaid 本体（out/mermaid.min.js） */
    mermaidScript: string;
}

export interface BuildPdfHtmlOptions {
    /** true なら全ページ下部にクレジット行を入れる（無料版） */
    credit: boolean;
    /** 数式・Mermaid・コードの色分けの描画部品。省略すると置き換えた要素のまま（テスト用） */
    assets?: PdfAssets;
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
 * クレジット行を各ページの下端に置く CSS。
 *
 * `@page` の下中央の余白ボックスに置く（ページ番号は右下・フッターは左下なので重ならない）。
 * 以前は本文を `<table>` で包んで `<tfoot>` に入れていたが、tfoot は最後のページで本文の直後に
 * 出てしまった（2026-09-29）。余白ボックスは Chrome / Edge 131 以降で効く。
 */
export function creditCss(): string {
    return `@page {
  @bottom-center {
    content: "${PDF_CREDIT_TEXT}";
    font-size: 8pt;
    color: #9aa0a6;
    letter-spacing: 0.02em;
    font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
  }
}`;
}

function escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 最初の「\\ で逃がしていない $」の位置 */
function firstUnescapedDollar(src: string): number | undefined {
    for (let i = 0; i < src.length; i++) {
        if (src[i] === '\\') { i++; continue; }
        if (src[i] === '$') return i;
    }
    return undefined;
}

/**
 * エディタと同じ記法を足した Markdown 変換。グローバルの `marked` の設定は変えない。
 */
const pdfMarked: Marked = new Marked({
    gfm: true,
    extensions: [
        {
            // $$ だけの行で囲んだ表示数式
            name: 'ipreviewMathBlock',
            level: 'block',
            start(src: string) {
                return /^\$\$[ \t]*$/m.exec(src)?.index;
            },
            tokenizer(src: string) {
                const m = /^\$\$[ \t]*\n([\s\S]*?)\n\$\$[ \t]*(?:\n|$)/.exec(src);
                if (m) return { type: 'ipreviewMathBlock', raw: m[0], text: m[1] };
                return undefined;
            },
            renderer(token) {
                return `<div class="ipreview-math ipreview-math-display">${escapeHtml(String(token.text))}</div>\n`;
            }
        },
        {
            // $…$。金額（$5 と $10）を数式にしないよう、内側の端は空白不可・閉じの直後に数字不可
            name: 'ipreviewMathInline',
            level: 'inline',
            start: firstUnescapedDollar,
            tokenizer(src: string) {
                const m = /^\$(?![\s$])((?:\\.|[^\\$\n])*?[^\s\\])\$(?!\d)/.exec(src)
                    ?? /^\$([^\s$\\])\$(?!\d)/.exec(src);
                if (m) return { type: 'ipreviewMathInline', raw: m[0], text: m[1] };
                return undefined;
            },
            renderer(token) {
                return `<span class="ipreview-math">${escapeHtml(String(token.text))}</span>`;
            }
        },
        {
            // ==ハイライト==（エディタの liveDecorations と同じ記法）
            name: 'ipreviewMark',
            level: 'inline',
            start(src: string) {
                const i = src.indexOf('==');
                return i >= 0 ? i : undefined;
            },
            tokenizer(src: string) {
                const m = /^==(?![\s=])([\s\S]*?[^\s=])==(?!=)/.exec(src);
                if (!m) return undefined;
                return { type: 'ipreviewMark', raw: m[0], text: m[1], tokens: this.lexer.inlineTokens(m[1]) };
            },
            renderer(token) {
                return `<mark>${this.parser.parseInline(token.tokens ?? [])}</mark>`;
            }
        }
    ],
    renderer: {
        code(token: Tokens.Code) {
            if ((token.lang ?? '').trim().toLowerCase() !== 'mermaid') return false;
            return `<div class="ipreview-mermaid">${escapeHtml(token.text)}</div>\n`;
        },
        blockquote(token: Tokens.Blockquote) {
            // > [!NOTE] 見出し … をコールアウトの枠にする（Obsidian / GitHub 形式）
            const [first, ...rest] = token.tokens;
            if (first?.type !== 'paragraph') return false;
            const m = /^\[!([A-Za-z][A-Za-z-]*)\][+-]?[ \t]*(.*)(?:\n|$)/.exec((first as Tokens.Paragraph).text);
            if (!m) return false;
            const type = m[1].toLowerCase();
            const title = m[2].trim() !== ''
                ? this.parser.parseInline(pdfMarked.Lexer.lexInline(m[2].trim()))
                : escapeHtml(type.charAt(0).toUpperCase() + type.slice(1));
            const remainder = (first as Tokens.Paragraph).text.slice(m[0].length);
            const body = [...(remainder.trim() !== '' ? pdfMarked.lexer(remainder) : []), ...rest];
            return `<div class="ipreview-callout ipreview-callout-${type}">\n<div class="ipreview-callout-title">${title}</div>\n${this.parser.parse(body)}</div>\n`;
        }
    }
});

/** 本文に必要な描画部品のタグ。要らなければ空（印刷を待たせない） */
export function pdfAssetTags(bodyHtml: string, assets: PdfAssets | undefined): { head: string; scripts: string } {
    if (!assets) return { head: '', scripts: '' };
    const math = bodyHtml.includes('class="ipreview-math');
    const mermaid = bodyHtml.includes('class="ipreview-mermaid"');
    const code = /<code class="language-/.test(bodyHtml);
    const head = math ? `<link rel="stylesheet" href="${escapeHtml(assets.katexCss)}">\n` : '';
    const scripts = [
        mermaid ? `<script src="${escapeHtml(assets.mermaidScript)}"></script>` : '',
        math || mermaid || code ? `<script src="${escapeHtml(assets.runtimeScript)}"></script>` : ''
    ].filter((t) => t !== '').join('\n');
    return { head, scripts: scripts ? `\n${scripts}` : '' };
}

/** Markdown 本文を PDF 用の本文 HTML にする（まとめて書き出しの「1 冊に束ねる」でも使う）。 */
export function buildPdfBody(markdownBody: string): string {
    return wrapTaskLabels(pdfMarked.parse(markdownBody, { async: false }));
}

/** Markdown 本文 + CSS から PDF 用の完全 HTML 文字列を組み立てる。 */
export function buildPdfHtml(
    markdownBody: string,
    css: string,
    options: BuildPdfHtmlOptions
): string {
    let htmlBody = buildPdfBody(markdownBody);
    const context = options.context ?? { title: '', date: '' };
    if (options.styling?.tableOfContents) {
        htmlBody = addTableOfContents(htmlBody, context.tocTitle ?? 'Contents');
    }
    const stylingCss = options.styling ? pdfStylingCss(options.styling, context) : '';
    const extraCss = [stylingCss, options.credit ? creditCss() : ''].filter((c) => c !== '').join('\n');
    const { head, scripts } = pdfAssetTags(htmlBody, options.assets);

    return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
${head}<style>${css}${extraCss ? `\n${extraCss}` : ''}</style>
</head>
<body class="markdown-body">
${htmlBody}${scripts}
</body>
</html>`;
}
