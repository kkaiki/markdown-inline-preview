/**
 * Markdown を Marp のスライド HTML（印刷用）にする純関数（VS Code 非依存）。
 *
 * PDF 化は既存の PDF 書き出しと同じローカル Chrome の --print-to-pdf が行う。ここは
 *   - スライドの分け方を決める（marp: true なら Marp 記法どおり、無ければ # / ## ごと）
 *   - 外部へ何も取りに行かない HTML にする（KaTeX フォント・絵文字画像・テーマの Web フォント）
 *   - 1 スライド 1 ページで印刷できる @page を付ける
 * まで。仕様: docs/private/specifications/pro-marp-export.md §3.2・§3.4・§4
 *
 * 拡張本体からは `out/marp.js`（scripts/build-lazy-bundles.mjs が作る別バンドル）経由で、書き出し時にだけ読む。
 */
import { Marp } from '@marp-team/marp-core';

export interface MarpHtmlOptions {
    /** KaTeX のフォントを置いたフォルダの URL（末尾 `/`）。拡張同梱の media/fonts を file:// で渡す */
    katexFontPath: string;
    /** <title> に入れる文書名 */
    title: string;
}

export interface MarpHtmlResult {
    html: string;
    slideCount: number;
    /** スライドの大きさ（px）。@page と PDF の用紙になる */
    width: number;
    height: number;
    /** スライドごとのスピーカーノート（HTML コメント）。PDF には出さない */
    notes: string[][];
}

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/**
 * marp: true が無い普通の文書には headingDivider: 2 を足して、# と ## の見出しごとに 1 枚にする。
 * 自分で headingDivider を書いていればそれを尊重する。
 */
function withSlideSplitting(markdown: string): string {
    const fm = FRONT_MATTER.exec(markdown);
    if (!fm) return `---\nheadingDivider: 2\n---\n\n${markdown}`;
    const body = fm[1];
    if (/^marp:\s*true\s*$/m.test(body) || /^headingDivider:/m.test(body)) return markdown;
    return markdown.replace(FRONT_MATTER, `---\n${body}\nheadingDivider: 2\n---\n`);
}

function escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function buildMarpHtml(markdown: string, options: MarpHtmlOptions): MarpHtmlResult {
    const marp = new Marp({
        // 生 HTML は出さない（XSS とローカルファイル参照を避ける。Marp for VS Code の既定と同じ）
        html: false,
        // KaTeX フォントは既定だと jsDelivr を取りに行くので、同梱フォントを指す
        math: { lib: 'katex', katexFontPath: options.katexFontPath },
        // 絵文字は既定だと twemoji の画像（jsDelivr）に置き換わるので、文字のまま OS のフォントに任せる
        emoji: { shortcode: true, unicode: false },
        inlineSVG: true,
        script: false
    });

    const rendered = marp.render(withSlideSplitting(markdown));
    // gaia テーマは fonts.bunny.net の Web フォントを @import する。外部通信をしないので外す
    const css = rendered.css.replace(/@import\s+(?:url\()?["']?https?:[^;]*;/g, '');

    // 大きさは描画結果の viewBox から取る（テーマ CSS の section の幅は size: 4:3 のとき基底値のまま）
    const size = /<svg data-marpit-svg="" viewBox="0 0 (\d+) (\d+)"/.exec(rendered.html);
    const width = size ? Number(size[1]) : 1280;
    const height = size ? Number(size[2]) : 720;

    const printCss = `
@page { size: ${width}px ${height}px; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; }
div.marpit > svg { display: block; width: ${width}px; height: ${height}px; break-after: page; }
div.marpit > svg:last-child { break-after: auto; }`;

    const html = `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"><title>${escapeHtml(options.title)}</title>
<style>${css}</style><style>${printCss}</style></head>
<body>${rendered.html}</body></html>`;

    return {
        html,
        slideCount: (rendered.html.match(/<svg data-marpit-svg/g) ?? []).length,
        width,
        height,
        notes: rendered.comments
    };
}
