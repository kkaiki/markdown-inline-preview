/**
 * 表の行・列編集（純関数）。
 *
 * Live モードは表を畳んだまま編集する（requirements.md §2.7）ので、生のパイプ記法が
 * 見えない。つまり「行を1行書き足す」ができない。そこでセルの右クリックメニュー
 * （§2.7.2）から行・列を増減させる。ここはその**ソース変換だけ**を持ち、DOM には
 * 触らない（webview 側はメニュー表示と CodeMirror への差分適用だけを行う）。
 *
 * 行番号は区切り行を除いた 0 始まり（＝セルの `data-row`）で、行0 がヘッダ。
 *
 * 既存行のパディングには触らない。挿入する空セルの幅だけ**区切り行に揃える**ので、
 * 整形済みの表に行を足しても縦線がズレず、整形していない表を勝手に整形もしない。
 */
import { isTableDelimiterRow } from './tableCells';
import type { CellPos } from './tableSelection';

export type TableCommand =
    | 'selectRow'
    | 'selectColumn'
    | 'insertRowAbove'
    | 'insertRowBelow'
    | 'insertColumnLeft'
    | 'insertColumnRight'
    | 'deleteRow'
    | 'deleteColumn'
    | 'deleteTable';

export interface TableMenuItem {
    id: TableCommand;
    label: string;
    enabled: boolean;
    /** この項目の前に区切り線を引くか（表示上のグループ分け）。 */
    separatorBefore?: boolean;
}

/** 新しく作る列のセル幅（`| --- |` と同じ見た目になる）。 */
const NEW_COLUMN_WIDTH = 5;

/**
 * 1行を「パイプの外側」と「パイプ間の生セグメント（パディング込み）」に分ける。
 * `\|` はセルの中身なので区切りにしない（`tableCells.ts` の分割と同じ規則）。
 *
 * パイプが2本未満の行（`a | b` のような両端パイプ無しの行）は、この機能では
 * 触らずそのまま残す（null を返す）。壊れた表を壊し返さないための保険。
 */
interface RowParts {
    head: string;
    segments: string[];
    tail: string;
}

function splitRow(line: string): RowParts | null {
    const pipes: number[] = [];
    for (let i = 0; i < line.length; i++) {
        if (line[i] === '\\') {
            i += 1;
            continue;
        }
        if (line[i] === '|') pipes.push(i);
    }
    if (pipes.length < 2) return null;
    const segments: string[] = [];
    for (let i = 0; i < pipes.length - 1; i++) {
        segments.push(line.slice(pipes[i] + 1, pipes[i + 1]));
    }
    return {
        head: line.slice(0, pipes[0] + 1),
        segments,
        tail: line.slice(pipes[pipes.length - 1])
    };
}

function joinRow(parts: RowParts): string {
    return parts.head + parts.segments.join('|') + parts.tail;
}

/** 区切り行のセル幅（列ごと）。新しい空セルはこの幅に合わせる。 */
function delimiterWidths(lines: string[]): number[] {
    const delimiter = lines.find((l) => isTableDelimiterRow(l));
    const parts = delimiter ? splitRow(delimiter) : null;
    return parts ? parts.segments.map((s) => s.length) : [];
}

/**
 * 区切り行を除いた行（`data-row` の順）のソース行番号。
 *
 * 数え方は `parseTableCells`（＝画面のセルの `data-row`）と揃える。パイプが1本しか
 * 無い行はあちらがセル無しとして飛ばすので、ここでも行として数えない。ズレると
 * 1つ下の行を消してしまう。
 */
function contentLineIndexes(lines: string[]): number[] {
    const out: number[] = [];
    lines.forEach((line, i) => {
        if (!isTableDelimiterRow(line) && splitRow(line) !== null) out.push(i);
    });
    return out;
}

/** 対象セルから見た列数（＝その表の最大列数）。 */
function columnCount(lines: string[]): number {
    let max = 0;
    for (const line of lines) {
        const parts = splitRow(line);
        if (parts) max = Math.max(max, parts.segments.length);
    }
    return max;
}

/** 空セル1つ分の文字列（区切り行の幅に合わせる）。 */
function blankSegment(widths: number[], col: number): string {
    return ' '.repeat(Math.max(2, widths[col] ?? NEW_COLUMN_WIDTH));
}

/** 対象行と同じ列数の空行を作る。 */
function blankRow(lines: string[], reference: string): string | null {
    const parts = splitRow(reference);
    if (!parts) return null;
    const widths = delimiterWidths(lines);
    return joinRow({
        ...parts,
        segments: parts.segments.map((_, i) => blankSegment(widths, i))
    });
}

/** 新しい列の区切りセル（`| --- |`）。 */
function newDelimiterSegment(): string {
    return ' ' + '-'.repeat(NEW_COLUMN_WIDTH - 2) + ' ';
}

/**
 * 各行に列を1つ挿入する。セル数が足りない行では末尾に足す
 * （崩れた表でも、行ごとのセル数を勝手に増やしすぎない）。
 */
function insertColumn(lines: string[], at: number): string[] {
    return lines.map((line) => {
        const parts = splitRow(line);
        if (!parts) return line;
        const index = Math.min(at, parts.segments.length);
        const segment = isTableDelimiterRow(line) ? newDelimiterSegment() : ' '.repeat(NEW_COLUMN_WIDTH);
        const segments = [...parts.segments];
        segments.splice(index, 0, segment);
        return joinRow({ ...parts, segments });
    });
}

/** 各行から列を1つ削除する。 */
function deleteColumn(lines: string[], at: number): string[] {
    return lines.map((line) => {
        const parts = splitRow(line);
        if (!parts || at >= parts.segments.length) return line;
        const segments = [...parts.segments];
        segments.splice(at, 1);
        return joinRow({ ...parts, segments });
    });
}

/**
 * 表を削除するときに、一緒に消す改行まで含めた範囲。
 *
 * 表ブロックだけを消すと、前後の空行が残って**空行が2つ**並ぶ。段落の間に表が
 * ある文書はこれが普通なので、行末の改行に加えて「前が空行（または文書の先頭）
 * かつ後ろが空行」のときだけ空行を1つ寄せる。
 *
 * @param doc 文書全体
 * @param from 表ブロックの開始オフセット
 * @param to 表ブロックの終了オフセット（最終行の末尾。改行は含まない）
 */
export function tableDeletionRange(doc: string, from: number, to: number): { from: number; to: number } {
    let end = to;
    if (doc[end] === '\n') end += 1;
    const blankBefore = from === 0 || (from >= 2 && doc[from - 1] === '\n' && doc[from - 2] === '\n');
    if (blankBefore && doc[end] === '\n') end += 1;
    return { from, to: end };
}

/** 右クリックメニューの項目（表示順）。無効な条件は §2.7.2 のとおり。 */
export function tableMenuItems(source: string, target: CellPos): TableMenuItem[] {
    const lines = source.split('\n');
    const isHeader = target.row === 0;
    const canDeleteColumn = columnCount(lines) > 1;
    return [
        { id: 'selectRow', label: '行を選択', enabled: true },
        { id: 'selectColumn', label: '列を選択', enabled: true },
        { id: 'insertRowAbove', label: '上に行を挿入', enabled: !isHeader, separatorBefore: true },
        { id: 'insertRowBelow', label: '下に行を挿入', enabled: true },
        { id: 'insertColumnLeft', label: '左に列を挿入', enabled: true },
        { id: 'insertColumnRight', label: '右に列を挿入', enabled: true },
        { id: 'deleteRow', label: '行を削除', enabled: !isHeader, separatorBefore: true },
        { id: 'deleteColumn', label: '列を削除', enabled: canDeleteColumn },
        { id: 'deleteTable', label: '表を削除', enabled: true }
    ];
}

/**
 * コマンドを表ブロックのソースへ適用する。
 *
 * @returns 新しいソース。`deleteTable` は空文字（呼び出し側がブロックごと消す）。
 *          選択系・無効なコマンド・解析できない表では **null**（何もしない）。
 */
export function applyTableCommand(
    source: string,
    target: CellPos,
    command: TableCommand
): string | null {
    if (command === 'selectRow' || command === 'selectColumn') return null;
    if (command === 'deleteTable') return '';

    const item = tableMenuItems(source, target).find((i) => i.id === command);
    if (!item || !item.enabled) return null;

    const lines = source.split('\n');
    const contentLines = contentLineIndexes(lines);
    const lineIndex = contentLines[target.row];
    if (lineIndex === undefined) return null;

    switch (command) {
        case 'insertRowAbove':
        case 'insertRowBelow': {
            const row = blankRow(lines, lines[lineIndex]);
            if (row === null) return null;
            // ヘッダ行の「下」は区切り行の次（区切り行は動かさない）
            const at =
                command === 'insertRowAbove'
                    ? lineIndex
                    : (target.row === 0 ? contentLines[1] ?? lines.length : lineIndex + 1);
            const next = [...lines];
            next.splice(at, 0, row);
            return next.join('\n');
        }
        case 'deleteRow': {
            const next = [...lines];
            next.splice(lineIndex, 1);
            return next.join('\n');
        }
        case 'insertColumnLeft':
            return insertColumn(lines, target.col).join('\n');
        case 'insertColumnRight':
            return insertColumn(lines, target.col + 1).join('\n');
        case 'deleteColumn':
            return deleteColumn(lines, target.col).join('\n');
    }
}
