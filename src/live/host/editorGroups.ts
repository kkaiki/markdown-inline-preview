/**
 * Markdown をどのエディタグループで開くかの判定（`vscode` に依存しない純ロジック）。
 *
 * VS Code は新しいエディタを**アクティブなグループ**に開く。そのため Claude Code の
 * セッションやターミナルを開いている側のグループにフォーカスがあると、左サイドバーから
 * .md をクリックしたときに作業していない方のグループへ開いてしまう
 * （ユーザー報告 2026-09-12）。開いた直後に「文書を並べているグループ」へ移すため、
 * その移動先をここで決める。
 */

/** タブの最小情報。`document` は本文を編集するタブ（テキスト・カスタム・差分・ノートブック）。 */
export interface GroupTabLike {
    kind: 'document' | 'panel';
    /** 文書タブのときの URI 文字列。 */
    uri?: string;
}

/**
 * `movingUri` を開いたグループ `landing` から移すべき移動先のグループ index を返す。
 * 動かす必要が無ければ `null`。
 *
 * - 開いたグループに**他の**文書タブがあれば、そこは文書グループなので動かさない。
 * - 動かす先は文書タブを持つ最も近いグループ。左右が同距離なら**左**（ユーザー指示）。
 * - どこにも文書グループが無ければ動かさない（唯一の編集場所を奪わない）。
 */
export function chooseDocumentGroup(
    groups: readonly (readonly GroupTabLike[])[],
    landing: number,
    movingUri: string
): number | null {
    const hasOtherDocument = (index: number): boolean =>
        (groups[index] ?? []).some(
            (t) => t.kind === 'document' && !(index === landing && t.uri === movingUri)
        );

    if (landing < 0 || landing >= groups.length) return null;
    if (hasOtherDocument(landing)) return null;

    for (let d = 1; d < groups.length; d++) {
        const left = landing - d;
        if (left >= 0 && hasOtherDocument(left)) return left;
        const right = landing + d;
        if (right < groups.length && hasOtherDocument(right)) return right;
    }
    return null;
}
