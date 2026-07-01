/**
 * ブロックの行頭マーカーを Backspace で **1 段階ずつ** 外すための純粋ロジック。
 *
 * Raw（テキスト）では `## x` の `#` を 1 つずつ消すと `# x`（H1 相当）→ 段落、と段階的に
 * 変わる。Preview（WYSIWYG）でも同じ感覚にするため、見出しは「レベルを 1 つ下げる →
 * 最後は段落」と段階的に降格する（一度に全部消さない）。
 */

/**
 * 見出しレベル `level` で行頭 Backspace したときの遷移先レベル。
 * - 2 以上: 1 つ下のレベル（`##` → `#`）。
 * - 1: `null`（段落へ降格）。
 */
export function headingDowngradeLevel(level: number): number | null {
    const safe = Math.min(6, Math.max(1, Math.floor(level) || 1));
    return safe > 1 ? safe - 1 : null;
}

export function isAtHeadingContentStart(
    nodeName: string,
    pos: number,
    contentStart: number
): boolean {
    return nodeName === 'heading' && pos === contentStart;
}
