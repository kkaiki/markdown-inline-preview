/**
 * 表・Mermaid・コールアウト・数式（ブロックの部品）の**高さの推定**。
 *
 * CodeMirror は画面の外の行の高さを推定して描く。ブロックの部品は、画面に入って描き終わるまで
 * 本当の高さが分からず、推定（`WidgetType.estimatedHeight`）を渡さないと「1 行分」とみなされる。
 * 表が多い文書では、描くたびに全体の高さが数百〜千 px 単位で変わり、スクロール位置が飛ぶ
 * （2026-10-05 の報告。表 8 つ・Mermaid 2 つの文書で実測: 表は 1 行あたり 60〜170px、図は約 520〜550px）。
 *
 * ぴったりでなくてよい。「1 行分」と比べて桁が合えば、描いたあとのずれが小さくなる。
 */

/** 本文の 1 行の高さ（`defaultLineHeight`）。 */
export const LINE_HEIGHT = 24;

/** 表の本文幅の目安（編集画面の本文の幅 800px）。 */
const CONTENT_WIDTH = 800;
/** セルの左右の余白（1 セルあたり）。 */
const CELL_PADDING = 24;
/** セルの文字が折り返せる限界の幅（全角 2 文字ぶん）。 */
const MIN_CELL_TEXT = 26;
/** 1 行あたりの上下の余白と罫線。 */
const ROW_PADDING = 14;
/** 表の上下の余白。 */
const TABLE_MARGIN = 24;

/** Mermaid の図の推定の高さ（実測 約 520〜550px）。 */
export const MERMAID_ESTIMATE = 520;
/** ブロックの数式の推定の高さ。 */
export const MATH_BLOCK_ESTIMATE = 64;

/**
 * 画面に表示される文字だけにする。セルの中の HTML タグ（`<span style="…">` など）や
 * Markdown の記号は、描画されると見えなくなるので、幅に数えない。
 */
function visibleText(text: string): string {
    return text
        .replace(/<[^>]*>/g, '')
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/[*_`~]/g, '');
}

/** 文字の描画幅の目安（日本語などの全角は広く、半角は狭い）。 */
function textWidth(text: string): number {
    let width = 0;
    for (const ch of visibleText(text)) width += (ch.codePointAt(0) ?? 0) >= 0x2e80 ? 13 : 7.5;
    return width;
}

/** 途中で折り返せない英数字の連なり（`V1-STS-001`、`sukeriku-aix` など）のうち、いちばん長いものの幅。 */
function longestWordWidth(text: string): number {
    let longest = 0;
    for (const word of visibleText(text).match(/[A-Za-z0-9_\-./:@#]+/g) ?? []) {
        longest = Math.max(longest, word.length * 7.5);
    }
    return longest;
}

/** 折り返せない部品（`white-space: nowrap` のラベルなど）かどうか。 */
function isNoWrap(text: string): boolean {
    return /white-space:\s*nowrap/i.test(text);
}

/** 折り返せないラベルは、文字の幅に、ラベルの左右の余白を足した幅になる。 */
const NOWRAP_EXTRA = 20;

/**
 * 表の高さの推定。`rows` は行ごとのセルの文字列。
 *
 * ブラウザの表の自動レイアウトに近い手順で、列の幅を決めてから、セルごとの折り返しの行数を数える。
 *   - 列の最大幅 W（いちばん長いセルを折り返さずに置いた幅）と、最小幅 m（折り返せる限界）を出す。
 *     折り返せないラベル（`white-space: nowrap`）は、その幅がそのまま最小幅になる
 *   - 全部の最大幅が収まるなら、各列は最大幅。収まらないなら、最小幅を確保したうえで、
 *     余りを「最大幅 − 最小幅」の比で分け合う
 *   - セルの折り返しの行数 = 文字の幅 ÷ 列の文字幅。行の高さは、その行でいちばん多い行数
 */
export function estimateTableHeight(rows: string[][]): number {
    if (rows.length === 0) return LINE_HEIGHT;
    const columns = Math.max(1, ...rows.map((r) => r.length));

    const maxWidth: number[] = Array(columns).fill(0);
    const minWidth: number[] = Array(columns).fill(MIN_CELL_TEXT);
    const widths = rows.map((row) =>
        row.map((cell, j) => {
            const wrapless = isNoWrap(cell);
            const w = textWidth(cell) + (wrapless ? NOWRAP_EXTRA : 0);
            maxWidth[j] = Math.max(maxWidth[j], w);
            if (wrapless) minWidth[j] = Math.max(minWidth[j], w);
            // 英数字の連なりは途中で折り返せないので、その幅が最小幅になる
            minWidth[j] = Math.max(minWidth[j], Math.min(w, longestWordWidth(cell)));
            return w;
        })
    );

    // 表の幅（セルの余白を含む）を、列に割り当てる
    const natural = maxWidth.map((w) => w + CELL_PADDING);
    const naturalSum = natural.reduce((a, b) => a + b, 0);
    let columnWidth: number[];
    if (naturalSum <= CONTENT_WIDTH) {
        columnWidth = natural;
    } else {
        const mins = minWidth.map((m, j) => Math.min(m, maxWidth[j]) + CELL_PADDING);
        const minSum = mins.reduce((a, b) => a + b, 0);
        const spare = Math.max(0, CONTENT_WIDTH - minSum);
        const growth = natural.map((n, j) => Math.max(0, n - mins[j]));
        const growthSum = growth.reduce((a, b) => a + b, 0) || 1;
        columnWidth = mins.map((m, j) => m + (spare * growth[j]) / growthSum);
    }

    let height = TABLE_MARGIN;
    for (const row of widths) {
        let lines = 1;
        row.forEach((w, j) => {
            const textArea = Math.max(MIN_CELL_TEXT, columnWidth[j] - CELL_PADDING);
            lines = Math.max(lines, Math.ceil(w / textArea));
        });
        height += lines * LINE_HEIGHT + ROW_PADDING;
    }
    return height;
}

/** コールアウトの高さの推定。`source` は `> ` 付きの元の行。 */
export function estimateCalloutHeight(source: string): number {
    const lines = source.split('\n').length;
    // 枠の上下の余白・見出しの行
    return lines * LINE_HEIGHT + 32;
}
