/**
 * スラッシュコマンド（`/` メニュー）。
 *
 * 項目定義は Raw / Preview と共通の `SLASH_MENU_ITEMS` を使う（3モードで
 * 同じコマンドが同じ名前で出るようにするため）。Live モードはドキュメントが
 * 生 Markdown なので、`previewMarkdown` の文字列をそのまま挿入すればよい。
 *
 * CodeMirror の autocomplete を使うので、絞り込み・キーボード選択・
 * Escape での取り消しは標準の挙動に乗る。
 */
import { autocompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import { SLASH_MENU_ITEMS } from '../../shared/slash/slashMenuItems';

/**
 * `/` で始まる語を拾う。行頭か空白の直後の `/` だけを対象にして、
 * URL（`https://`）やコードの中のスラッシュで誤発火しないようにする。
 */
function slashSource(context: CompletionContext): CompletionResult | null {
    const match = context.matchBefore(/(^|\s)\/[\w-]*/);
    if (!match) return null;
    const slashAt = match.text.indexOf('/');
    const from = match.from + slashAt;
    if (!context.explicit && from === context.pos) return null;

    const options: Completion[] = SLASH_MENU_ITEMS.map((item) => ({
        label: `/${item.label}`,
        detail: item.detail,
        type: 'keyword',
        apply: (view, _completion, applyFrom, applyTo) => {
            const insert = item.previewMarkdown;
            view.dispatch({
                changes: { from: applyFrom, to: applyTo, insert },
                // 複数行のスニペット（表・コードブロック）は先頭行の末尾にカーソルを置く
                selection: { anchor: applyFrom + firstLineLength(insert) },
                userEvent: 'input.complete'
            });
        }
    }));
    return { from, options, filter: true };
}

function firstLineLength(text: string): number {
    const i = text.indexOf('\n');
    return i < 0 ? text.length : i;
}

export const liveSlashMenu: Extension = autocompletion({
    override: [slashSource],
    activateOnTyping: true,
    icons: false
});
