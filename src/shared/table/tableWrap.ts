export function parseTableCells(lineText: string): string[] | undefined {
    const trimmed = lineText.trim();
    if (!trimmed.startsWith('|')) return undefined;
    const parts = trimmed.split('|');
    if (parts.length < 3) return undefined;
    return parts.slice(1, -1).map(cell => cell.trim());
}

export function isSeparatorRow(cells: string[]): boolean {
    return cells.every(cell => /^:?-{3,}:?$/.test(cell));
}

export function wrapCell(text: string, maxWidth: number): string[] {
    if (maxWidth <= 0 || text.length <= maxWidth) return [text];

    const lines: string[] = [];
    let remaining = text;
    while (remaining.length > maxWidth) {
        let breakAt = remaining.lastIndexOf(' ', maxWidth);
        if (breakAt <= 0) breakAt = maxWidth;
        lines.push(remaining.slice(0, breakAt).trimEnd());
        remaining = remaining.slice(breakAt).trimStart();
    }
    if (remaining.length > 0) lines.push(remaining);
    return lines.length > 0 ? lines : [''];
}

export function formatWrappedTableRow(cells: string[], colWidth: number): string {
    const wrapped = cells.map(cell => wrapCell(cell, colWidth));
    const rowCount = Math.max(...wrapped.map(lines => lines.length));
    const lines: string[] = [];

    for (let row = 0; row < rowCount; row++) {
        const parts = wrapped.map(cellLines => (cellLines[row] ?? '').padEnd(colWidth, ' '));
        lines.push(`| ${parts.join(' | ')} |`);
    }
    return lines.join('\n');
}

/** エディタ after 装飾用に1行へ圧縮した折り返しプレビュー */
export function formatWrappedTablePreview(cells: string[], colWidth: number, maxChars = 120): string {
    const full = formatWrappedTableRow(cells, colWidth).replace(/\n/g, ' ↵ ');
    if (full.length <= maxChars) return full;
    return `${full.slice(0, maxChars - 1)}…`;
}
