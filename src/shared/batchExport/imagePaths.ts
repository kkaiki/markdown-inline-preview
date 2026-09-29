/**
 * まとめて書き出し: <img src="相対パス"> を file:// の絶対 URL にする（純関数）。
 *
 * 一時 HTML を文書の隣ではなく OS の一時フォルダに置くため、相対パスのままだと画像が読めない。
 * http(s):・data:・file: などスキーム付き、`#`、`//` はそのまま。
 * 仕様: docs/private/specifications/pro-batch-export.md §4.4
 */
import * as path from 'path';
import { pathToFileURL } from 'url';

export function decodeHtmlEntities(text: string): string {
    return text
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}

/** スキーム付き・ページ内・プロトコル相対の参照か */
export function isNonLocalReference(ref: string): boolean {
    return /^[a-z][a-z0-9+.-]*:/i.test(ref) || ref.startsWith('#') || ref.startsWith('//');
}

function safeDecodeUri(text: string): string {
    try { return decodeURI(text); } catch { return text; }
}

export function rewriteImageSources(html: string, baseDir: string): string {
    return html.replace(/(<img\b[^>]*?\bsrc=)(["'])(.*?)\2/gi, (match, pre: string, quote: string, raw: string) => {
        const src = decodeHtmlEntities(raw);
        if (isNonLocalReference(src)) return match;
        const [filePath] = safeDecodeUri(src).split(/[?#]/);
        const abs = path.isAbsolute(filePath) ? filePath : path.resolve(baseDir, filePath);
        // pathToFileURL は " と ' をエンコードしないので、囲みの引用符を壊さないよう自分で逃がす
        const url = pathToFileURL(abs).href.replace(/"/g, '%22').replace(/'/g, '%27');
        return `${pre}${quote}${url}${quote}`;
    });
}
