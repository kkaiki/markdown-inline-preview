/**
 * Notion 準拠のショートカット（Raw モード側）。
 *
 * インライン書式（⌘B ⌘I ⌘U ⌘E ⌘⇧S ⌘K ⌘⇧M ⌘⇧H）・ブロック複製（⌘D）・
 * まとめて包むブロック変換（⌥⌘7 トグルリスト / ⌥⌘8 コードブロック）を扱う。
 *
 * **文字列の組み立てとカーソル位置の計算は `src/shared/` の純関数に任せる**。
 * Live モード（CodeMirror）も同じ関数を呼ぶので、同じキーを押せば両モードで
 * 必ず同じ Markdown になる。
 *
 * 仕様: docs/specifications/notion-shortcuts.md
 */
import * as vscode from 'vscode';
import { applyInlineFormat, type InlineFormat } from '../../shared/inlineFormat';
import { duplicateBlock } from '../../shared/blockOps';
import { repairNestedCodeFences } from '../../shared/markdown/codeFence';
import { applyBlockAction, wrapBlockAction, type WrappingBlockAction } from '../../live/shared/blockActions';

/** アクティブな Markdown エディタ（無ければ undefined）。 */
function markdownEditor(): vscode.TextEditor | undefined {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'markdown') return undefined;
    return editor;
}

/**
 * インライン書式コマンドのハンドラを作る。
 * 選択が無ければ空選択として扱い、記号だけ入れてカーソルを内側へ置く。
 */
export function createInlineFormatHandler(format: InlineFormat): () => Promise<void> {
    return async () => {
        const editor = markdownEditor();
        if (!editor) return;
        const doc = editor.document;
        const selection = editor.selection;
        const selected = doc.getText(selection);

        // 記号が選択の外側にある場合（囲んだ直後）に外せるよう、前後の行内テキストも渡す
        const startLine = doc.lineAt(selection.start.line);
        const endLine = doc.lineAt(selection.end.line);
        const before = doc.getText(new vscode.Range(startLine.range.start, selection.start));
        const after = doc.getText(new vscode.Range(selection.end, endLine.range.end));
        const r = applyInlineFormat(selected, format, before, after);

        const from = doc.positionAt(doc.offsetAt(selection.start) - r.extendBefore);
        const to = doc.positionAt(doc.offsetAt(selection.end) + r.extendAfter);
        const fromOffset = doc.offsetAt(from);
        await editor.edit((b) => b.replace(new vscode.Range(from, to), r.insert));

        // 置き換えた文字列の先頭からの相対位置を、そのままオフセットへ足す
        const anchor = editor.document.positionAt(fromOffset + r.selectionStart);
        const head = editor.document.positionAt(fromOffset + r.selectionEnd);
        editor.selection = new vscode.Selection(anchor, head);
    };
}

/** ⌘D: カーソル行（選択があればその範囲）のブロックを子ごと複製する。 */
export function createDuplicateBlockHandler(): () => Promise<void> {
    return async () => {
        const editor = markdownEditor();
        if (!editor) return;
        const doc = editor.document;
        const lines: string[] = [];
        for (let i = 0; i < doc.lineCount; i++) lines.push(doc.lineAt(i).text);

        const edit = duplicateBlock(lines, editor.selection.start.line, editor.selection.end.line);
        const range = new vscode.Range(
            edit.fromLine,
            0,
            edit.toLine,
            doc.lineAt(edit.toLine).text.length
        );
        await editor.edit((b) => b.replace(range, edit.text));

        const column = editor.selection.active.character;
        const targetLine = edit.selectionFromLine;
        const target = new vscode.Position(
            targetLine,
            Math.min(column, editor.document.lineAt(targetLine).text.length)
        );
        editor.selection = new vscode.Selection(target, target);
    };
}

/**
 * 二重フェンスになったコードブロックを1重に戻す。
 *
 * `package.json` にコマンドが宣言され、実 VS Code テストもあったが、
 * Preview モード削除の際に登録側が失われて "command not found" になっていた
 * （2026-08-08 に再登録）。
 */
export function createRepairNestedCodeFencesHandler(): () => Promise<void> {
    return async () => {
        const editor = markdownEditor();
        if (!editor) return;
        const doc = editor.document;
        const result = repairNestedCodeFences(doc.getText());
        if (result.fixed === 0) return;

        const whole = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
        await editor.edit((b) => b.replace(whole, result.markdown));
        void vscode.window.showInformationMessage(
            vscode.l10n.t('Markdown Inline Preview: repaired {0} double-fenced code block(s).', String(result.fixed))
        );
    };
}

/** ⌥⌘9: カーソル行（選択範囲）を引用にする。 */
export function createConvertToQuoteHandler(): () => Promise<void> {
    return async () => {
        const editor = markdownEditor();
        if (!editor) return;
        const doc = editor.document;
        await editor.edit((b) => {
            for (let n = editor.selection.start.line; n <= editor.selection.end.line; n++) {
                const line = doc.lineAt(n);
                const r = applyBlockAction(line.text, 'blockquote');
                if (r) b.replace(line.range, r.text);
            }
        });
    };
}

/** ⌥⌘7 / ⌥⌘8: 選択範囲をトグルリスト（`<details>`）またはコードフェンスで包む。 */
export function createWrapBlockHandler(action: WrappingBlockAction): () => Promise<void> {
    return async () => {
        const editor = markdownEditor();
        if (!editor) return;
        const doc = editor.document;
        const firstLine = editor.selection.start.line;
        const lastLine = editor.selection.end.line;
        const range = new vscode.Range(firstLine, 0, lastLine, doc.lineAt(lastLine).text.length);
        const body = doc.getText(range);
        await editor.edit((b) => b.replace(range, wrapBlockAction(body, action)));
    };
}
