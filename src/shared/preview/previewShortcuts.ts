/**
 * Preview（Milkdown / WebView）のキーボードショートカット判定。
 *
 * ここには「KeyboardEvent 相当の入力 → どのショートカットか」という純粋な分類ロジックだけを
 * 置く（ProseMirror / Milkdown には依存しない）。実際のコマンド実行は previewKeymapPlugin /
 * milkdownApp 側が担当する。こうすることで、どのキー組み合わせが効く／効かないかをユニット
 * テストで網羅的に検証できる。
 */

/** KeyboardEvent から判定に必要な最小限のフィールドだけを抜き出したもの。 */
export interface KeyLike {
    key: string;
    code: string;
    metaKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
}

/** Notion 風ブロック変換の種類。 */
export type NotionBlockAction =
    | 'paragraph'
    | 'heading1'
    | 'heading2'
    | 'heading3'
    | 'todo'
    | 'bulletList'
    | 'orderedList'
    | 'codeBlock'
    | 'blockquote';

/**
 * `Cmd/Ctrl+Opt+<数字>` の数字 → ブロック種別の対応表。
 * 7 は意図的に未割り当て（押しても何も起きない）。
 */
export const NOTION_BLOCK_KEYMAP: Readonly<Record<number, NotionBlockAction>> = {
    0: 'paragraph',
    1: 'heading1',
    2: 'heading2',
    3: 'heading3',
    4: 'todo',
    5: 'bulletList',
    6: 'orderedList',
    8: 'codeBlock',
    9: 'blockquote'
};

/** 数字に対応する Notion ブロック種別を返す。未割り当ては null。 */
export function getNotionBlockAction(n: number): NotionBlockAction | null {
    return NOTION_BLOCK_KEYMAP[n] ?? null;
}

/** Preview で認識するショートカットの分類結果。 */
export type PreviewShortcut =
    | { kind: 'fenceEnter' }
    | { kind: 'notionBlock'; n: number; action: NotionBlockAction }
    | { kind: 'selectAll' }
    | { kind: 'find' }
    | { kind: 'replace' }
    | { kind: 'toggleRaw' }
    | { kind: 'lineStart' }
    | { kind: 'codeBlockTab'; shift: boolean }
    | null;

/** Mod キー（Mac の Cmd / Win・Linux の Ctrl）が押されているか。 */
export function isModPressed(e: KeyLike): boolean {
    return e.metaKey || e.ctrlKey;
}

/**
 * KeyboardEvent 相当の入力を Preview ショートカットに分類する。
 * 該当しない場合は null。
 */
export function classifyPreviewShortcut(e: KeyLike): PreviewShortcut {
    // Enter（修飾なし）: ``` / ```lang の段落をコードブロック化する候補
    if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        return { kind: 'fenceEnter' };
    }

    // Tab / Shift+Tab（Mod・Alt なし）: コードブロック内でのインデント/インデント解除。
    // ブラウザは既定で Tab を「次のフォーカス可能要素へ移動」に使うため、ProseMirror が
    // 何も割り当てていないコンテキスト（code_block 内）では、ブラウザのネイティブ Tab
    // フォーカス移動が発動し、エディタの外（コードブロックの言語選択 <select> 等）へ
    // フォーカスが飛んでしまう。Cmd/Ctrl/Alt+Tab は OS・ブラウザのウィンドウ/タブ切替
    // なので除外する。
    if (e.key === 'Tab' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        return { kind: 'codeBlockTab', shift: e.shiftKey };
    }

    if (!isModPressed(e)) return null;

    // Cmd/Ctrl+Shift+.（ピリオド）: Raw（Markdown ソース）へ戻る。
    // package.json の togglePreview キーバインドと対になるが、WebView 内には
    // VS Code のキーバインドが届かないため、ここで拾ってホストへ通知する。
    // Shift+Period は配列によって key が '>' になるため code で判定する。
    if (e.shiftKey && !e.altKey && (e.code === 'Period' || e.key === '.' || e.key === '>')) {
        return { kind: 'toggleRaw' };
    }

    // Notion 風: Cmd/Ctrl+Opt+<数字>
    // Mac では Alt+数字が記号になるため key ではなく code（DigitN）で判定する。
    if (e.altKey && !e.shiftKey) {
        // Cmd+Opt+F（mac の置換ショートカット）。VS Code の検索/置換に合わせる。
        if (e.code === 'KeyF' || e.key === 'f') return { kind: 'replace' };
        const match = /^Digit(\d)$/.exec(e.code);
        if (match) {
            const n = Number(match[1]);
            const action = getNotionBlockAction(n);
            if (action) return { kind: 'notionBlock', n, action };
        }
        return null;
    }

    // 修飾は Mod のみ（Alt/Shift なし）
    if (!e.altKey && !e.shiftKey) {
        // Cmd/Ctrl+A: 行全体 → テーブル/コードブロック → 文書全体 の段階選択
        if (e.code === 'KeyA' || e.key === 'a') return { kind: 'selectAll' };
        // Cmd/Ctrl+F: Preview 内検索
        if (e.code === 'KeyF' || e.key === 'f') return { kind: 'find' };
        // Ctrl+H（Win/Linux の置換ショートカット）。
        if (e.code === 'KeyH' || e.key === 'h') return { kind: 'replace' };
        // Cmd/Ctrl+←: プレフィックス展開中の 2 段階行頭移動
        if (e.code === 'ArrowLeft' || e.key === 'ArrowLeft') return { kind: 'lineStart' };
    }

    return null;
}
