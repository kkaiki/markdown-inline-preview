import * as path from 'path';

const IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g;

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
    const rewritten = markdown.replace(IMAGE_PATTERN, (full, alt: string, url: string, title?: string) => {
        const trimmed = url.trim();
        if (isAbsoluteWebUri(trimmed)) {
            return full;
        }
        const filePath = resolveImageFilePath(trimmed, documentPath);
        const webviewUri = webview.asWebviewUri(filePath);
        uriMap.set(webviewUri, trimmed);
        const titleSuffix = title ? ` "${title}"` : '';
        return `![${alt}](${webviewUri}${titleSuffix})`;
    });
    return { markdown: rewritten, uriMap };
}

/** WebView から戻った Markdown 内の WebView 画像 URI を元の相対パスへ復元する */
export function restoreMarkdownImagesFromWebview(markdown: string, uriMap: Map<string, string>): string {
    if (uriMap.size === 0) return markdown;
    let result = markdown;
    for (const [webviewUri, original] of uriMap) {
        result = result.split(webviewUri).join(original);
    }
    return result;
}
