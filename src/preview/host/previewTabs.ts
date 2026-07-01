/**
 * Preview タブの選択ロジック（純粋関数）。
 *
 * 「いまどの Preview を Raw に戻すべきか」を VS Code API から切り離して判定する。
 * `previewPanel.ts` の `findPreviewUri` がここを使い、ユニットテストで網羅できるようにする。
 *
 * 重要な不変条件: **どの Preview を対象にするか曖昧なときは、勝手に別ファイルを選ばない**。
 * 以前はアクティブタブが取れないと「最初に見つかった Preview タブ」を返していたため、
 * 複数の Preview を開いていると Raw に戻したとき**別のファイルへ飛ぶ**バグがあった。
 */

/** タブ 1 枚ぶんの、判定に必要な最小情報。 */
export interface PreviewTabInfo {
    /** このタブが属するグループがアクティブか。 */
    isActiveGroup: boolean;
    /** グループ内でこのタブがアクティブ（前面）か。 */
    isActiveTab: boolean;
    /** Preview（カスタムエディタ）タブならその対象 URI 文字列。Preview でなければ undefined。 */
    previewUri?: string;
}

/**
 * Raw に戻す対象の Preview URI を 1 つ選ぶ。優先順位:
 *  1. アクティブグループのアクティブタブが Preview ならそれ（＝今フォーカスしている Preview）。
 *  2. アクティブグループ内のアクティブな Preview タブ。
 *  3. それでも決まらない場合、**Preview がちょうど 1 枚だけ**ならそれ。
 *     複数あって特定できないときは曖昧として `undefined`（何もしない＝誤って別ファイルへ飛ばない）。
 */
export function pickPreviewUri(tabs: PreviewTabInfo[]): string | undefined {
    // 1 & 2: アクティブグループのアクティブタブのうち Preview のもの。
    for (const tab of tabs) {
        if (tab.isActiveGroup && tab.isActiveTab && tab.previewUri) {
            return tab.previewUri;
        }
    }

    // 3: 全体で Preview がちょうど 1 枚なら一意に決まる。複数なら曖昧 → undefined。
    const previewUris = tabs
        .map((t) => t.previewUri)
        .filter((uri): uri is string => uri !== undefined);
    const unique = Array.from(new Set(previewUris));
    return unique.length === 1 ? unique[0] : undefined;
}
