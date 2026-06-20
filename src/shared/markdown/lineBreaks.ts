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

// 行頭（インデント可）のリスト項目マーカー: `- ` `* ` `+ ` `1. ` `1) ` 等
const LIST_ITEM_LINE = /^(\s*)([-*+]|\d+[.)])\s/;

/**
 * 連続するリスト項目の間にある空行を取り除き、tight（詰め）リストにする。
 * loose リスト（項目間に空行）を保存し続けないようにするための正規化。
 * フェンスコードブロック内は対象外。
 */
export function tightenListSpacing(markdown: string): string {
    const lines = markdown.split('\n');
    const out: string[] = [];
    let inFence = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/^\s*(```|~~~)/.test(line)) {
            inFence = !inFence;
        }

        if (!inFence && line.trim() === '') {
            const prev = out.length > 0 ? out[out.length - 1] : '';
            let j = i + 1;
            while (j < lines.length && lines[j].trim() === '') j++;
            const next = j < lines.length ? lines[j] : '';
            if (LIST_ITEM_LINE.test(prev) && LIST_ITEM_LINE.test(next)) {
                i = j - 1; // 項目に挟まれた空行（複数可）を捨てる
                continue;
            }
        }
        out.push(line);
    }

    return out.join('\n');
}
