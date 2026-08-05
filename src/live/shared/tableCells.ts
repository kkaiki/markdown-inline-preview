/**
 * 表のセル範囲解析。
 *
 * Live モードは表を畳んだまま**セルの中で直接編集**する（Phase 4b）。そのため
 * 「画面上のセル」と「ソースの範囲」を1文字もズラさずに対応付ける必要がある。
 * ここがズレると入力が隣のセルへ入り、パイプ記法が壊れてドキュメントが破損する。
 *
 * 返すオフセットは `baseOffset`（表ブロックの先頭オフセット）を足した**絶対位置**。
 */

export interface TableCell {
    /** セル本文のソース開始オフセット（前後の空白は含まない）。 */
    from: number;
    /** セル本文のソース終了オフセット。空セルなら from と同じ。 */
    to: number;
    /** セル本文。 */
    text: string;
    /** 区切り行から読んだ配置（'left' | 'right' | 'center' | ''）。 */
    align: string;
}

export interface TableRow {
    /** ヘッダ行（区切り行の直前）か。 */
    isHeader: boolean;
    cells: TableCell[];
}

/** 1行を `|` で分割し、各セルの範囲を返す（エスケープ `\|` では分割しない）。 */
function splitCells(line: string, lineStart: number): { from: number; to: number; text: string }[] {
    const bounds: number[] = [];
    for (let i = 0; i < line.length; i++) {
        if (line[i] === '\\') {
            i += 1;
            continue;
        }
        if (line[i] === '|') bounds.push(i);
    }
    if (bounds.length === 0) return [];

    const cells: { from: number; to: number; text: string }[] = [];
    for (let i = 0; i < bounds.length - 1; i++) {
        const rawFrom = bounds[i] + 1;
        const rawTo = bounds[i + 1];
        const raw = line.slice(rawFrom, rawTo);
        const lead = raw.length - raw.trimStart().length;
        const trail = raw.length - raw.trimEnd().length;
        const from = rawFrom + lead;
        const to = raw.trim() === '' ? from : rawTo - trail;
        cells.push({ from: lineStart + from, to: lineStart + to, text: raw.trim() });
    }
    return cells;
}

/** 区切り行のセルから配置を読む。 */
function alignOf(cell: string): string {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    if (left) return 'left';
    return '';
}

/**
 * 区切り行（`| --- | :--: |`）か。
 * GFM はダッシュ1個以上を認めるので `:--:` のような指定も通す。
 * 表の検出（syntaxRanges）と判定がズレると「表なのにセルが取れない」事故になるため、
 * 判定はこの関数に集約して両方から使う。
 */
export function isTableDelimiterRow(line: string): boolean {
    return /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(line) && line.includes('-');
}

/**
 * 表ブロックのソースを解析して、区切り行を除いた行とセルの範囲を返す。
 *
 * @param source 表ブロックのソース（改行区切り）
 * @param baseOffset ソース先頭のドキュメント上のオフセット
 */
export function parseTableCells(source: string, baseOffset: number): TableRow[] {
    const lines = source.split('\n');
    const aligns: string[] = [];
    const rows: TableRow[] = [];

    let offset = baseOffset;
    let delimiterIndex = -1;
    lines.forEach((line, i) => {
        if (isTableDelimiterRow(line)) {
            delimiterIndex = i;
            for (const c of splitCells(line, offset)) aligns.push(alignOf(c.text));
        }
        offset += line.length + 1;
    });

    offset = baseOffset;
    lines.forEach((line, i) => {
        if (i !== delimiterIndex && line.includes('|')) {
            const cells = splitCells(line, offset).map((c, ci) => ({ ...c, align: aligns[ci] ?? '' }));
            if (cells.length > 0) rows.push({ isHeader: i < delimiterIndex, cells });
        }
        offset += line.length + 1;
    });
    return rows;
}
