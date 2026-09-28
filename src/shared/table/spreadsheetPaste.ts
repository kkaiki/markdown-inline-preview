/**
 * Excel・Google スプレッドシート・Numbers からコピーした範囲を Markdown の表にする（純関数）。
 *
 * スプレッドシートはクリップボードにタブ区切り（text/plain）と HTML の表（text/html）を両方入れる。
 * VS Code 等からコピーしたコードもタブを含むので、HTML に表があるときだけを確実な合図とする
 * （docs/specifications/live-mode/requirements.md §2.7.3）。
 */

import { getStringWidth } from './width';

/**
 * タブ区切りを行列に分解する。Excel / Sheets は改行・タブ・`"` を含むセルを `"` で囲み、
 * 中の `"` を `""` にするので、その規則どおりに戻す。
 */
function parseTsv(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let i = 0;
    let atCellStart = true;

    const endCell = (): void => {
        row.push(cell);
        cell = '';
        atCellStart = true;
    };
    const endRow = (): void => {
        endCell();
        rows.push(row);
        row = [];
    };

    while (i < text.length) {
        const ch = text[i];
        if (atCellStart && ch === '"') {
            // 引用されたセル: 対応する閉じ " まで（"" は " 1 文字）
            let j = i + 1;
            let quoted = '';
            let closed = false;
            while (j < text.length) {
                if (text[j] === '"') {
                    if (text[j + 1] === '"') {
                        quoted += '"';
                        j += 2;
                        continue;
                    }
                    closed = true;
                    j++;
                    break;
                }
                quoted += text[j];
                j++;
            }
            if (closed && (j >= text.length || text[j] === '\t' || text[j] === '\n' || text[j] === '\r')) {
                cell = quoted;
                i = j;
                atCellStart = false;
                continue;
            }
            // 閉じていない・後ろに文字が続く " は、ただの文字として扱う
        }
        atCellStart = false;
        if (ch === '\t') {
            endCell();
        } else if (ch === '\r' && text[i + 1] === '\n') {
            endRow();
            i++;
        } else if (ch === '\n' || ch === '\r') {
            endRow();
        } else {
            cell += ch;
        }
        i++;
    }
    // 末尾の改行（Excel は付ける）の後に空行を作らない
    if (cell !== '' || row.length > 0) endRow();
    return rows;
}

/** セルの中身を 1 行の Markdown にする。 */
function escapeCell(cell: string): string {
    return cell
        .replace(/\r\n|\r|\n/g, '<br>')
        .replace(/\|/g, '\\|')
        .trim();
}

function pad(text: string, width: number): string {
    return text + ' '.repeat(Math.max(0, width - getStringWidth(text)));
}

/**
 * クリップボードの中身がスプレッドシートの範囲なら、1 行目を見出しにした Markdown の表を返す。
 * 表でなければ null（呼び出し側は通常の貼り付けに任せる）。
 *
 * @param text `text/plain`
 * @param html `text/html`。取れない環境では undefined / 空文字
 */
export function spreadsheetToMarkdownTable(text: string, html: string | undefined): string | null {
    if (!text.includes('\t')) return null;

    const rows = parseTsv(text);
    if (rows.length === 0) return null;
    const cols = Math.max(...rows.map((r) => r.length));
    if (cols < 2) return null;
    const rectangular = rows.every((r) => r.length === cols);

    if (html) {
        // HTML はあるが表ではない＝スプレッドシートではない（コードのコピー等）
        if (!/<table[\s>]/i.test(html)) return null;
    } else {
        // 合図が無いので厳しめに判定する
        if (rows.length < 2 || !rectangular) return null;
        if (rows.every((r) => r[0].trim() === '')) return null; // 行頭タブのインデント
    }

    const cells = rows.map((r) => Array.from({ length: cols }, (_, c) => escapeCell(r[c] ?? '')));
    const widths = Array.from({ length: cols }, (_, c) =>
        Math.max(3, ...cells.map((r) => getStringWidth(r[c])))
    );

    const line = (r: string[]): string => `| ${r.map((cell, c) => pad(cell, widths[c])).join(' | ')} |`;
    const separator = `| ${widths.map((w) => '-'.repeat(w)).join(' | ')} |`;
    return [line(cells[0]), separator, ...cells.slice(1).map(line)].join('\n');
}

export interface InsertionContext {
    /** 貼り付け位置より前の、同じ行の文字 */
    before: string;
    /** 貼り付け範囲より後ろの、同じ行の文字 */
    after: string;
    /** 1 つ上の行（無ければ空文字） */
    prevLine: string;
    /** 1 つ下の行（無ければ空文字） */
    nextLine: string;
}

/**
 * 表を貼り付け位置に入れるときの前後の改行を足す。
 * 行の途中なら前後に空行を作り、段落の直後・直前でも空行を挟む
 * （表の行として吸い込まれたり、段落の続きと読まれたりしないように）。
 */
export function surroundTableForInsertion(table: string, ctx: InsertionContext): string {
    const head = ctx.before !== '' ? '\n\n' : ctx.prevLine.trim() !== '' ? '\n' : '';
    const tail = ctx.after !== '' ? '\n\n' : ctx.nextLine.trim() !== '' ? '\n' : '';
    return `${head}${table}${tail}`;
}
