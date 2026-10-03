import * as vscode from 'vscode';
import { spreadsheetToMarkdownTable, surroundTableForInsertion } from '../../shared/table/spreadsheetPaste';
import { findFenceBlocks } from '../../live/shared/fenceBlocks';

/**
 * Excel・Google スプレッドシート・Numbers の範囲を貼り付けたら Markdown の表にする（Raw モード）。
 *
 * 変換規則は `src/shared/table/spreadsheetPaste.ts`（純関数・Live と共通）。VS Code の
 * 貼り付けプロバイダとして登録し、表にしないときは何も返さずに通常の貼り付けへ任せる
 * （docs/specifications/live-mode/requirements.md §2.7.3）。
 */

function insideFence(document: vscode.TextDocument, line: number): boolean {
    const lines: string[] = [];
    for (let i = 0; i < document.lineCount; i++) lines.push(document.lineAt(i).text);
    return findFenceBlocks(lines).some(
        (b) => line > b.openLine && (b.closeLine === null || line < b.closeLine)
    );
}

function createProvider(kind: vscode.DocumentDropOrPasteEditKind): vscode.DocumentPasteEditProvider {
    return {
    async provideDocumentPasteEdits(document, ranges, dataTransfer) {
        if (ranges.length !== 1) return undefined; // マルチカーソルは通常の貼り付けに任せる

        const text = await dataTransfer.get('text/plain')?.asString();
        if (!text) return undefined;
        const html = await dataTransfer.get('text/html')?.asString();
        const table = spreadsheetToMarkdownTable(text, html);
        if (!table) return undefined;

        const range = ranges[0];
        if (insideFence(document, range.start.line)) return undefined;

        const startLine = document.lineAt(range.start.line);
        const endLine = document.lineAt(range.end.line);
        const insert = surroundTableForInsertion(table, {
            before: startLine.text.slice(0, range.start.character),
            after: endLine.text.slice(range.end.character),
            prevLine: range.start.line > 0 ? document.lineAt(range.start.line - 1).text : '',
            nextLine: range.end.line + 1 < document.lineCount ? document.lineAt(range.end.line + 1).text : ''
        });

        return [new vscode.DocumentPasteEdit(insert, vscode.l10n.t('Insert as Markdown table'), kind)];
    }
    };
}

export function registerSpreadsheetPasteProvider(context: vscode.ExtensionContext): void {
    // 貼り付けプロバイダは VS Code 1.97 で確定した API。古い本体では登録しない（通常の貼り付けのまま）
    // （DocumentDropOrPasteEditKind も同じ版からなので、存在を確かめてから触る）
    if (typeof vscode.languages.registerDocumentPasteEditProvider !== 'function') return;
    // 1.96 以前でも関数は存在するが、提案段階の API なので**呼ぶと例外になる**。
    // ここで落ちると activate 全体が失敗して拡張が丸ごと使えなくなるので、登録できなければ黙ってやめる。
    try {
        const kind = vscode.DocumentDropOrPasteEditKind.Empty.append('markdown', 'table');
        context.subscriptions.push(
            vscode.languages.registerDocumentPasteEditProvider({ language: 'markdown' }, createProvider(kind), {
                providedPasteEditKinds: [kind],
                pasteMimeTypes: ['text/plain', 'text/html']
            })
        );
    } catch {
        // 古い本体: 表への貼り付け変換だけ無効（通常の貼り付けはそのまま動く）
    }
}
