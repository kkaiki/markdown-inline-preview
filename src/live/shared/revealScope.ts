/**
 * Live モードの中核判定: 「この記法は今、生テキストとして見えているべきか」。
 *
 * 判定規則は Obsidian 1.13.4 の実測に一致させてある
 * （docs/specifications/live-mode/obsidian-observed-spec.md §1）。
 *
 *   - トークンスコープ: `from <= cursor <= to`（**両端を含む**）。
 *     `to` はトークン最終文字の**次**のオフセットなので、閉じ記号を打ち終わった直後も
 *     まだ展開状態になる。逆に `from - 1` では展開しない。
 *   - 行 / ブロックスコープ: 判定範囲がその行 / そのブロック全体になるだけで、式は同じ。
 *   - 常時変換（never）: カーソルが真上にあっても展開しない（リストの "-"、引用の ">"、表）。
 *   - フォーカスを失っていたら、何であれ展開しない。
 *
 * ここは Live モードの操作感そのものなので、実測値以外の「気の利いた」調整を
 * 入れないこと。
 */

/** 記法をどの粒度で展開するか。 */
export type RevealScope = 'token' | 'line' | 'block' | 'never';

/** 展開判定に必要な最小限の情報。 */
export interface RevealTarget {
    /** 展開判定に使う開始オフセット。 */
    revealFrom: number;
    /** 展開判定に使う終了オフセット（最終文字の次）。この位置も展開に含む。 */
    revealTo: number;
    scope: RevealScope;
}

/** カーソル or 選択範囲。カーソルは `from === to`。 */
export interface SelectionRange {
    from: number;
    to: number;
}

/**
 * `target` が今、生テキストとして表示されるべきかを返す。
 *
 * @param selections 現在のカーソル・選択範囲（複数選択に対応）
 * @param hasFocus エディタが DOM フォーカスを持っているか
 */
export function isRevealed(
    target: RevealTarget,
    selections: readonly SelectionRange[],
    hasFocus: boolean
): boolean {
    if (!hasFocus) return false;
    if (target.scope === 'never') return false;
    const { revealFrom, revealTo } = target;
    // 選択範囲が判定範囲に「触れて」いれば展開する（両端を含む）。
    return selections.some((s) => s.to >= revealFrom && s.from <= revealTo);
}
