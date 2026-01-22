/**
 * 文字幅計算ユーティリティ
 * テーブル整形などで使用される文字幅計算関数
 */
/**
 * ゼロ幅結合文字かどうかを判定
 */
export declare function isZeroWidthCombining(cp: number): boolean;
/**
 * 全角文字（CJK等）かどうかを判定
 */
export declare function isFullWidthCodePoint(cp: number): boolean;
/**
 * 狭い文字（i, l, 1など）かどうかを判定
 */
export declare function isNarrowChar(char: string): boolean;
/**
 * 広い文字（W, Mなど）かどうかを判定
 */
export declare function isWideChar(char: string): boolean;
/**
 * 文字列の表示幅を計算（基本版）
 */
export declare function getStringWidth(str: string): number;
/**
 * 文字列の表示幅を計算（ヒューリスティック版）
 * 等幅フォントでの見た目に近い幅を計算
 */
export declare function getDisplayWidthWithHeuristics(text: string): number;
/**
 * セル内容をパディング
 */
export declare function padCell(content: string, targetWidth: number, columnHasFullWidth?: boolean): string;
