/**
 * 表のセル範囲選択。
 *
 * セルを個別の `contenteditable` にしている都合上、ブラウザの選択はセルをまたげない
 * （ユーザー報告 2026-08-05「表の複数選択ができない」）。そこで
 * 「アンカーセル」と「フォーカスセル」で矩形を持ち、自前でハイライトとコピーを行う。
 */

export interface CellPos {
    /** 区切り行を除いた行番号（0 始まり）。 */
    row: number;
    /** 列番号（0 始まり）。 */
    col: number;
}

/** 2点が作る矩形に含まれるセルを、行優先の順で返す。 */
export function cellsInRect(a: CellPos, b: CellPos): CellPos[] {
    const r0 = Math.min(a.row, b.row);
    const r1 = Math.max(a.row, b.row);
    const c0 = Math.min(a.col, b.col);
    const c1 = Math.max(a.col, b.col);
    const out: CellPos[] = [];
    for (let row = r0; row <= r1; row++) {
        for (let col = c0; col <= c1; col++) out.push({ row, col });
    }
    return out;
}

/**
 * 選択セルをクリップボード用テキストにする。
 * 表計算ソフトへ貼れるよう、列はタブ・行は改行で区切る。
 */
export function selectionToMarkdown(rows: string[][], cells: CellPos[]): string {
    if (cells.length === 0) return '';
    const byRow = new Map<number, string[]>();
    for (const c of cells) {
        const value = rows[c.row]?.[c.col];
        if (value === undefined) continue;
        const list = byRow.get(c.row) ?? [];
        list.push(value);
        byRow.set(c.row, list);
    }
    return [...byRow.keys()]
        .sort((x, y) => x - y)
        .map((r) => (byRow.get(r) ?? []).join('\t'))
        .join('\n');
}
