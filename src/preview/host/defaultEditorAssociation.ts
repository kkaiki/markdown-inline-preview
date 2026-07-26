/**
 * `.md` の既定エディタ（VS Code 本体の `workbench.editorAssociations`）を、現在の
 * Raw/Preview モードへ追従させるための純粋関数。
 *
 * customEditor の `priority: "default"` は拡張機能側の「希望」にすぎず、同じ
 * ファイルパターンに対して同じ優先度を主張する拡張機能が他にあると（実例:
 * cweijan.vscode-office の cweijan.markdownViewer）どちらが解決されるか一意に決まらない。
 * 一方 `workbench.editorAssociations` はユーザー設定であり、拡張機能の宣言より強い。
 * ここをモードに同期させることで「ファイルを開く前から解決先が1つに確定している」
 * 状態を作り、Raw モードでも Preview の Custom Editor が一度生成されてから跳ね返る
 * （bounceToRawEditor）過渡状態そのものを無くす。
 *
 * 詳細: docs/specifications/default-editor-association-sync.md
 */

export type PreviewMode = 'raw' | 'preview';

/** 本拡張機能の Preview（Custom Editor）の viewType。 */
export const PREVIEW_VIEW_TYPE = 'ipreview.preview';

/** VS Code 標準テキストエディタを指す予約 viewType。 */
export const TEXT_EDITOR_VIEW_TYPE = 'default';

/**
 * 関連付けを管理するファイルパターン。`package.json` の
 * `contributes.customEditors[0].selector` と一致させる（片方だけ増やすと、
 * 一方のパターンだけ跳ね返し経路に残る不整合が起きる）。
 */
export const MANAGED_ASSOCIATION_PATTERNS = ['*.md', '*.markdown'] as const;

/** 拡張機能が書き込みうる値。制御 OFF 時にこれらだけを取り除く判定に使う。 */
const MANAGED_VIEW_TYPES: readonly string[] = [PREVIEW_VIEW_TYPE, TEXT_EDITOR_VIEW_TYPE];

/**
 * 次に開く Markdown をどちらのモードで開くか。
 *
 * 記憶モード（`preview.rememberMode` 有効時のみ値が入る）を優先し、無ければ
 * `preview.defaultMode` 設定、それも無ければ `preview`（package.json の既定値）。
 * 設定を手書きして未知の値になっていた場合も `preview` へ丸める。
 */
export function resolveDefaultOpenMode(input: {
    remembered?: PreviewMode;
    defaultMode?: string;
}): PreviewMode {
    if (input.remembered === 'raw' || input.remembered === 'preview') {
        return input.remembered;
    }
    return input.defaultMode === 'raw' ? 'raw' : 'preview';
}

/**
 * `workbench.editorAssociations` へ書き戻す新しい値を計算する。
 *
 * @param desired 追従させるモード。`null` は「制御しない」（設定 OFF）を意味し、
 *   拡張機能が書いた値だけを取り除く。ユーザーが自分の意思で他拡張のビューアへ
 *   向けている場合（例: `"*.md": "cweijan.markdownViewer"`）はそれを残す。
 */
export function computeEditorAssociations(
    current: Record<string, string> | undefined,
    desired: PreviewMode | null
): Record<string, string> {
    const next: Record<string, string> = { ...(current ?? {}) };
    for (const pattern of MANAGED_ASSOCIATION_PATTERNS) {
        if (desired === null) {
            if (MANAGED_VIEW_TYPES.includes(next[pattern])) {
                delete next[pattern];
            }
            continue;
        }
        next[pattern] = desired === 'preview' ? PREVIEW_VIEW_TYPE : TEXT_EDITOR_VIEW_TYPE;
    }
    return next;
}

/**
 * 関連付けが実質的に同じか。モード切替のたびに `settings.json` を書き直すのを避ける
 * ため（書き込みは他拡張の設定監視も起こすので、無変化なら触らない）。
 * キーの順序差は無視し、未設定（`undefined`）と空オブジェクトは同一扱いにする。
 */
export function editorAssociationsEqual(
    a: Record<string, string> | undefined,
    b: Record<string, string> | undefined
): boolean {
    const left = a ?? {};
    const right = b ?? {};
    const leftKeys = Object.keys(left);
    if (leftKeys.length !== Object.keys(right).length) return false;
    return leftKeys.every(key => left[key] === right[key]);
}
