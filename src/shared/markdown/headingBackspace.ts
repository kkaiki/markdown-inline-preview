/**
 * 見出しブロック先頭で Backspace したとき、Obsidian 風に
 * `# ` → 段落の `#テキスト`（スペースなし）へ降格させる。
 */
export function buildHeadingDowngradeText(level: number, content: string): string {
    const safeLevel = Math.min(6, Math.max(1, Math.floor(level) || 1));
    return '#'.repeat(safeLevel) + content;
}

export function isAtHeadingContentStart(
    nodeName: string,
    pos: number,
    contentStart: number
): boolean {
    return nodeName === 'heading' && pos === contentStart;
}
