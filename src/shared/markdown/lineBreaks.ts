/**
 * Milkdown の commonmark preset は空段落・空セルを `<br />` として保存する
 * （remark-preserve-empty-line）。本拡張ではこの挙動を無効化しているが、
 * 過去に保存されたファイルには `<br />` プレースホルダが残るため、
 * Preview に読み込む際に通常の空行・空セルへ正規化する。
 */

// 空セルのみを内容とする `<br />`（前後はパイプ＋空白のみ）
const EMPTY_CELL_BREAK = /(?<=\|)([ \t]*)<br\s*\/?>([ \t]*)(?=\|)/gi;
// 行全体が `<br />` だけのプレースホルダ
const STANDALONE_BREAK = /^[ \t]*<br\s*\/?>[ \t]*$/gim;

/**
 * `<br />` プレースホルダ（空行・空セル）を通常の空行・空セルへ戻す。
 * 本文中の意図的なインライン `<br />`（例: `foo<br />bar`）は対象にしない。
 */
export function stripPlaceholderLineBreaks(markdown: string): string {
    return markdown
        .replace(EMPTY_CELL_BREAK, '$1$2')
        .replace(STANDALONE_BREAK, '');
}
