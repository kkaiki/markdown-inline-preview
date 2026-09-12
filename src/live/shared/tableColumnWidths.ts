/**
 * 表の列幅（ドラッグで一時的に調整する分）の計算。`vscode` にも DOM にも依存しない。
 *
 * ユーザー指示（2026-09-12）:「表について、一時的にでいいので開いている間
 * 列の幅を調整できるようにつまみを選べるようにしてほしい」。
 * 幅は Markdown には書かない（パイプ記法に列幅の表現が無いため）。開いているあいだ
 * だけ webview 側で覚える。
 */

/** これ以上は狭くしない幅（px）。掴めなくなるのを防ぐ。 */
export const MIN_COLUMN_WIDTH = 48;

/** `index` 列の幅を `deltaPx` だけ変える。他の列は動かさない。 */
export function resizeColumn(widths: readonly number[], index: number, deltaPx: number): number[] {
    const next = widths.map((w) => Math.round(w));
    if (index < 0 || index >= next.length) return next;
    next[index] = Math.max(MIN_COLUMN_WIDTH, Math.round(widths[index] + deltaPx));
    return next;
}

/**
 * 記憶している幅を、今の列数（実測幅）に合わせる。
 * 列が増えた分は実測値で埋め、減った分は切り詰める。
 */
export function normalizeWidths(
    remembered: readonly number[] | undefined,
    measured: readonly number[]
): number[] {
    return measured.map((m, i) => Math.round(remembered?.[i] ?? m));
}
