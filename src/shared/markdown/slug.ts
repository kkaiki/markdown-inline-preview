/** 見出しテキストからアンカーリンク用のスラッグを生成 */
export function generateSlug(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
}
