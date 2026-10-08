/**
 * Live モードの画像パスの解決（requirements.md §2 の画像ウィジェット）。
 *
 * webview は Markdown ファイルの場所を知らないので、`./img.gif` のような相対パスは
 * host から渡された「md ファイルのディレクトリ」の webview URL（`base`、末尾 `/`）を基準に解決する。
 * スキーム付きの URL（`https:` / `data:` など）とルート相対（`/` 始まり）はそのまま返す。
 */
export function resolveImageSrc(src: string, base: string | undefined): string {
    if (!base) return src;
    if (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('/')) return src;
    try {
        return new URL(src, base).href;
    } catch {
        return src;
    }
}
