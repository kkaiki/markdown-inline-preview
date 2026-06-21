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

// 行頭（インデント可）のリスト項目マーカー: `- ` `* ` `+ ` `1. ` `1) ` のほか、
// 中身が空のマーカーだけの行（`*` `-` `1.`）も対象にする。
// `***`（水平線）や `*emphasis*` はマーカー直後が空白/行末でないため除外される。
const LIST_ITEM_LINE = /^(\s*)([-*+]|\d+[.)])(\s|$)/;

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

/**
 * 「普通の段落」の行かどうか。見出し・リスト・引用・テーブル・水平線・
 * インデントコード・フェンスは段落として扱わない（結合の誤爆を防ぐ）。
 */
function isPlainParagraphLine(line: string): boolean {
    if (line.trim() === '') return false;
    if (/^\s{4,}/.test(line) || /^\t/.test(line)) return false;        // インデントコード
    if (/^\s{0,3}#{1,6}(\s|$)/.test(line)) return false;               // 見出し
    if (/^\s*([-*+]|\d+[.)])(\s|$)/.test(line)) return false;          // リスト
    if (/^\s*>/.test(line)) return false;                              // 引用
    if (line.includes('|')) return false;                             // テーブル（保守的に除外）
    if (/^\s{0,3}([-*_])\s*(\1\s*){2,}$/.test(line)) return false;     // 水平線
    if (/^\s*(```|~~~)/.test(line)) return false;                      // フェンス
    return true;
}

/**
 * 普通の段落どうしの間にある空行を取り除き、1 行改行のように詰める。
 * 段落以外（見出し・リスト・テーブル・コード等）に隣接する空行は保持する。
 * フェンスコードブロック内は対象外。
 */
export function tightenParagraphSpacing(markdown: string): string {
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
            if (isPlainParagraphLine(prev) && isPlainParagraphLine(next)) {
                i = j - 1; // 段落に挟まれた空行（複数可）を捨てる
                continue;
            }
        }
        out.push(line);
    }

    return out.join('\n');
}
