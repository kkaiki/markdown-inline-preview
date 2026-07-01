import * as path from 'path';

// 画像 URL は (1) 山括弧囲み `<...>`（スペース等を含められる CommonMark 正式形）か、
// (2) 裸のパス `[^)\s]+`。グループ2=山括弧の中身、グループ3=裸パス、のどちらかが入る。
const IMAGE_PATTERN = /!\[([^\]]*)\]\(\s*(?:<([^>]+)>|([^)\s]+))(?:\s+"([^"]*)")?\s*\)/g;

export interface WebviewUriConverter {
    asWebviewUri(filePath: string): string;
}

function isAbsoluteWebUri(url: string): boolean {
    return /^(https?:|data:|vscode-webview:|vscode-file:)/i.test(url);
}

function resolveImageFilePath(url: string, documentPath: string): string {
    const trimmed = url.trim();
    if (trimmed.startsWith('/')) {
        return trimmed;
    }
    const docDir = path.dirname(documentPath);
    return path.resolve(docDir, trimmed);
}

/**
 * Preview 表示用に相対画像パスを WebView URI へ変換する。
 * 保存時に元へ戻すため、webviewUri → 元パスの対応表も返す。
 */
export function prepareMarkdownImagesForWebview(
    markdown: string,
    documentPath: string,
    webview: WebviewUriConverter
): { markdown: string; uriMap: Map<string, string> } {
    const uriMap = new Map<string, string>();
    const rewritten = markdown.replace(
        IMAGE_PATTERN,
        (full, alt: string, angleUrl: string | undefined, bareUrl: string | undefined, title?: string) => {
            const url = angleUrl ?? bareUrl ?? '';
            const trimmed = url.trim();
            if (isAbsoluteWebUri(trimmed)) {
                return full;
            }
            const filePath = resolveImageFilePath(trimmed, documentPath);
            const webviewUri = webview.asWebviewUri(filePath);
            uriMap.set(webviewUri, trimmed);
            const titleSuffix = title ? ` "${title}"` : '';
            // webview URI 自体に空白は無いので山括弧は不要。素の形で出力する。
            return `![${alt}](${webviewUri}${titleSuffix})`;
        }
    );
    return { markdown: rewritten, uriMap };
}

/** 正規表現メタ文字をエスケープする。 */
function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * webview URI を「各文字の直前に任意で `\` が入りうる」正規表現に変換する。
 *
 * Milkdown は再シリアライズ時に URL 内の一部記号（実測で `(` `)` `[` `&` 等）を
 * `\(` のようにエスケープする。しかも `[` はエスケープするが `]` はしない、など部分的。
 * そのため「URI 全体を一律エスケープした形」では実際の保存形と一致しない。
 * ここでは各文字の前に `\\?` を挟んだパターンにし、どの組み合わせのエスケープでも一致させる。 */
function buildEscapeTolerantPattern(webviewUri: string): RegExp {
    const body = Array.from(webviewUri)
        .map((ch) => `\\\\?${escapeRegExp(ch)}`)
        .join('');
    return new RegExp(body, 'g');
}

/** WebView から戻った Markdown 内の WebView 画像 URI を元の相対パスへ復元する。
 *
 * 文字列完全一致だけだと、Milkdown が URL 内の記号を `\` でエスケープした場合に戻せず、
 * 壊れた webview URI のままファイルへ保存される（＝Preview→Raw で画像が壊れる＝データ損失）。
 * まず完全一致で戻し、残った分はエスケープ耐性のある正規表現で戻す。 */
export function restoreMarkdownImagesFromWebview(markdown: string, uriMap: Map<string, string>): string {
    if (uriMap.size === 0) return markdown;
    let result = markdown;
    for (const [webviewUri, original] of uriMap) {
        // 速い完全一致を先に戻し、残ったエスケープ形を正規表現で戻す。
        // （`$` などの衝突を避けるため置換値は関数で渡す。）
        result = result.split(webviewUri).join(original);
        result = result.replace(buildEscapeTolerantPattern(webviewUri), () => original);
    }
    return result;
}
