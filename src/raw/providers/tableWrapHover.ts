import * as vscode from 'vscode';

import {
    isSeparatorRow,
    parseTableCells,
    formatWrappedTableRow
} from '../../shared/table/tableWrap';

export function registerTableWrapHoverProvider(
    context: vscode.ExtensionContext,
    isEnabled: () => boolean,
    getColWidth: () => number
): vscode.Disposable {
    return vscode.languages.registerHoverProvider('markdown', {
        provideHover(document, position) {
            if (!isEnabled()) return undefined;

            const lineText = document.lineAt(position.line).text;
            const cells = parseTableCells(lineText);
            if (!cells || isSeparatorRow(cells)) return undefined;

            const colWidth = Math.max(8, getColWidth());
            const preview = formatWrappedTableRow(cells, colWidth);
            const md = new vscode.MarkdownString();
            md.appendCodeblock(preview, 'markdown');
            md.appendMarkdown('\n_Wrapped preview (source line unchanged)_');
            return new vscode.Hover(md);
        }
    });
}
