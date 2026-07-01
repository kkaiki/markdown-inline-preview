/**
 * togglePreview（Raw ⇄ Preview 切替）の判定ロジック（純粋関数）。
 *
 * VS Code API から切り離してユニットテストできるようにする（previewTabs.ts と同じ方針）。
 *
 * 重要な不変条件: **いま Raw で編集しているファイルを toggle したら、そのファイルを Preview に
 * する**こと。他ファイルの Preview が別グループに開いていても、それに引きずられて
 * 「別ファイルの Preview を Raw に戻す」操作になってはいけない。
 */

export interface ToggleContext {
    /** アクティブなテキストエディタが Raw の Markdown ファイルか。 */
    activeEditorIsRawMarkdown: boolean;
    /** アクティブな Markdown Raw エディタの URI（あれば）。 */
    activeMarkdownUri?: string;
    /** pickPreviewUri が返す「Raw に戻す対象の Preview」（あれば）。 */
    resolvedPreviewUri?: string;
}

export type ToggleAction =
    | { kind: 'toRaw'; uri: string }
    | { kind: 'toPreview'; uri: string }
    | { kind: 'none' };

/**
 * 切替アクションを決める。
 */
export function decidePreviewToggle(ctx: ToggleContext): ToggleAction {
    // いま Raw で Markdown を編集中なら、そのファイルを Preview にするのが最優先。
    // （他ファイルの Preview が別グループに開いていても、それを Raw に戻す操作に
    //   引きずられない。これがユーザー報告のバグの修正点。）
    if (ctx.activeEditorIsRawMarkdown && ctx.activeMarkdownUri) {
        return { kind: 'toPreview', uri: ctx.activeMarkdownUri };
    }
    // Raw 編集中でなければ（＝ Preview にフォーカス中など）、解決済みの Preview を Raw に戻す。
    if (ctx.resolvedPreviewUri) {
        return { kind: 'toRaw', uri: ctx.resolvedPreviewUri };
    }
    return { kind: 'none' };
}
