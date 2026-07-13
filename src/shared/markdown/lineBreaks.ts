/**
 * Milkdown の commonmark preset は空段落・空セルを `<br />` として保存する
 * （remark-preserve-empty-line）。空チェックボックス項目のシリアライズを正しく
 * 保つためにこのプラグインを有効にしつつ、Raw エディタへ送る前に `<br />` を除去する。
 */

// 空セルのみを内容とする `<br />`（前後はパイプ＋空白のみ）
const EMPTY_CELL_BREAK = /(?<=\|)([ \t]*)<br\s*\/?>([ \t]*)(?=\|)/gi;
// 行全体が `<br />` だけのプレースホルダ
const STANDALONE_BREAK = /^[ \t]*<br\s*\/?>[ \t]*$/gim;
// リスト項目行（箇条書き・番号付き）末尾の `<br />` プレースホルダ。
// "* [ ] <br />" → "* [ ] " のようにチェックボックス構文を保ちつつ <br /> を除去する。
const LIST_ITEM_TRAILING_BR = /^([ \t]*[-*+][ \t]+(?:\[[x ]\][ \t]*)?)<br\s*\/?>[ \t]*$/gm;

// 連続する空 paragraph（blankLineRemarkPlugin.ts が復元したもの）の連鎖。
// remark-stringify は各空 paragraph を前後 1 空行のセパレータで囲んで出力するため、
// N 個の空 paragraph は素の出力で `\n\n<br />` が N 回連なる形になる
// （前後のセパレータと重なり合うため、単純に <br /> を取り除くだけでは
// 2*N-1 行の空行になってしまい、元の N 行と本数が合わない）。
// ここで連鎖の長さ（<br /> の個数）から逆算し、正しい本数の空行に一括で戻す。
const BLANK_PARAGRAPH_CHAIN = /(?:\n\n<br\s*\/?>)+\n\n/g;

/**
 * `blankLineRemarkPlugin.ts` が復元した連続空 paragraph の直列化結果を、
 * 元のソースと同じ本数の空行に戻す。`stripPlaceholderLineBreaks` より前に適用する。
 */
export function collapseBlankLineChains(markdown: string): string {
    return markdown.replace(BLANK_PARAGRAPH_CHAIN, (chain) => {
        const brCount = (chain.match(/<br\s*\/?>/gi) ?? []).length;
        // brCount 個の空 paragraph → brCount 行の空行 → (brCount + 1) 個の改行文字。
        return '\n'.repeat(brCount + 1);
    });
}

/**
 * `<br />` プレースホルダ（空行・空セル）を通常の空行・空セルへ戻す。
 * 本文中の意図的なインライン `<br />`（例: `foo<br />bar`）は対象にしない。
 * 連続空 paragraph の連鎖は本数がずれるため、先に `collapseBlankLineChains` で
 * 正しい本数へ変換してから、残った単発の `<br />` を除去する。
 */
export function stripPlaceholderLineBreaks(markdown: string): string {
    return collapseBlankLineChains(markdown)
        .replace(EMPTY_CELL_BREAK, '$1$2')
        .replace(STANDALONE_BREAK, '');
}

/**
 * リスト項目行末尾の `<br />` プレースホルダを除去する。
 *
 * `remark-preserve-empty-line` は空の list_item を `* [ ] <br />` と直列化する。
 * このまま Raw エディタへ送ると `<br />` がユーザーに見えてしまう。
 * ここでは `* [ ] ` のようにチェックボックス構文だけを残して `<br />` を削る。
 */
export function stripListItemPlaceholderBr(markdown: string): string {
    return markdown.replace(LIST_ITEM_TRAILING_BR, '$1');
}

// テーブル行（インデント可、`|` で始まり `|` で終わる行）。区切り行 `| --- |` も含むが
// そこに `<br>` は無いので無害。フェンスコード内は別途除外する。
const TABLE_ROW_LINE = /^\s{0,3}\|.*\|\s*$/;
// セル内改行を表す HTML。`<br>` `<br/>` `<br />`（大小文字問わず）。
const INLINE_BR = /<br\s*\/?>/gi;

/**
 * テーブルセル内の `<br>` を改行エンティティ `&#10;` に変換する。
 *
 * GFM テーブルのセルはリテラル改行を持てないため、セル内改行は `<br>` で表す。
 * Milkdown のパーサは `<br>` をセル内改行として解釈できない（無視して結合する）が、
 * `&#10;` なら改行 → hardbreak に変換できる。そこで取り込み時にテーブル行内の
 * `<br>` だけを `&#10;` へ置換し、セル内改行が hardbreak として編集できるようにする。
 * 段落など表の外の `<br>` は利用者の意図を尊重してそのまま残す。
 */
export function convertTableCellBreaksToEntities(markdown: string): string {
    const lines = markdown.split('\n');
    let inFence = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/^\s*(```|~~~)/.test(line)) {
            inFence = !inFence;
            continue;
        }
        if (!inFence && TABLE_ROW_LINE.test(line)) {
            lines[i] = line.replace(INLINE_BR, '&#10;');
        }
    }
    return lines.join('\n');
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

/**
 * Preview（Milkdown）が読み込む Markdown の正規形。
 * - `<br />` プレースホルダ（空行・空セル）除去
 * - テーブルセル内 `<br>` → `&#10;`（hardbreak として編集できるように）
 * - リストの余分な空行詰め（tight リスト化）
 *
 * **段落どうしの空行は詰めない**（保持する）。`A\n\nB` は 2 段落として読み込み、Preview でも
 * 空行ぶんの余白を見せる。以前は `tightenParagraphSpacing` で詰めていたが、ユーザーが意図して
 * 入れた空行が消えて（表示・保存とも）しまうため廃止した。
 *
 * Preview の本文ドキュメントと **Git 差分の基準（HEAD 本文）の両方**をこの同じ形に
 * 揃えることが重要。揃えないと、Raw では無変更なのに Preview のガターだけ変更（青）に
 * 見える（例: 表セルの `<br>` が基準側だけ素のまま → セル本文が食い違う）。
 */
export function normalizePreviewMarkdown(markdown: string): string {
    return tightenListSpacing(
        convertTableCellBreaksToEntities(
            stripListItemPlaceholderBr(stripPlaceholderLineBreaks(markdown))
        )
    );
}
