/**
 * 文字幅計算ユーティリティ
 * テーブル整形などで使用される文字幅計算関数
 */

/**
 * ゼロ幅結合文字かどうかを判定
 */
export function isZeroWidthCombining(cp: number): boolean {
    return (cp >= 0x0300 && cp <= 0x036F) ||   // Combining Diacritical Marks
           (cp >= 0x1AB0 && cp <= 0x1AFF) ||   // Combining Diacritical Marks Extended
           (cp >= 0x1DC0 && cp <= 0x1DFF) ||   // Combining Diacritical Marks Supplement
           (cp >= 0x20D0 && cp <= 0x20FF) ||   // Combining Diacritical Marks for Symbols
           (cp >= 0xFE00 && cp <= 0xFE0F) ||   // Variation Selectors
           (cp >= 0xFE20 && cp <= 0xFE2F) ||   // Combining Half Marks
           cp === 0x200B ||                     // Zero Width Space
           cp === 0x200C ||                     // Zero Width Non-Joiner
           cp === 0x200D ||                     // Zero Width Joiner
           cp === 0xFEFF;                       // BOM
}

/**
 * 全角文字（CJK等）かどうかを判定
 */
export function isFullWidthCodePoint(cp: number): boolean {
    return (cp >= 0x1100 && cp <= 0x115F) ||   // Hangul Jamo
           (cp >= 0x2E80 && cp <= 0x9FFF) ||   // CJK
           (cp >= 0xAC00 && cp <= 0xD7A3) ||   // Hangul Syllables
           (cp >= 0xF900 && cp <= 0xFAFF) ||   // CJK Compatibility Ideographs
           (cp >= 0xFE10 && cp <= 0xFE1F) ||   // Vertical forms
           (cp >= 0xFE30 && cp <= 0xFE6F) ||   // CJK Compatibility Forms
           (cp >= 0xFF00 && cp <= 0xFF60) ||   // Fullwidth Forms
           (cp >= 0xFFE0 && cp <= 0xFFE6) ||   // Fullwidth Symbol Variants
           (cp >= 0x20000 && cp <= 0x2FA1F) || // CJK Extension B-F
           (cp >= 0x30000 && cp <= 0x3FFFF);   // CJK Extension G
}

/**
 * 狭い文字（i, l, 1など）かどうかを判定
 */
export function isNarrowChar(char: string): boolean {
    return /[il1|!:;.,']/.test(char);
}

/**
 * 広い文字（W, Mなど）かどうかを判定
 */
export function isWideChar(char: string): boolean {
    return /[WMwm@#%]/.test(char);
}

/**
 * 文字列の表示幅を計算（基本版）
 */
export function getStringWidth(str: string): number {
    let width = 0;
    for (const char of str) {
        const cp = char.codePointAt(0);
        if (cp === undefined) continue;
        if (isZeroWidthCombining(cp)) continue;
        if (isFullWidthCodePoint(cp)) {
            width += 2;
        } else {
            width += 1;
        }
    }
    return width;
}

/**
 * 文字列の表示幅を計算（ヒューリスティック版）
 * 等幅フォントでの見た目に近い幅を計算
 */
export function getDisplayWidthWithHeuristics(text: string): number {
    let width = 0;
    for (const char of text) {
        const cp = char.codePointAt(0);
        if (cp === undefined) continue;
        if (isZeroWidthCombining(cp)) continue;
        if (isFullWidthCodePoint(cp)) {
            width += 2;
        } else {
            width += 1;
        }
    }
    return width;
}

/**
 * セル内容をパディング
 */
export function padCell(
    content: string,
    targetWidth: number,
    columnHasFullWidth: boolean = false
): string {
    const trimmed = content.trim();
    const contentWidth = getDisplayWidthWithHeuristics(trimmed);
    const totalPadding = targetWidth - contentWidth;
    const leftPad = 1;
    const rightPad = Math.max(1, totalPadding - leftPad);
    return ' '.repeat(leftPad) + trimmed + ' '.repeat(rightPad);
}
