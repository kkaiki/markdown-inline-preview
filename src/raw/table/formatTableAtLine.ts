import * as vscode from 'vscode';

import { debugLog } from '../../core';
import {
    calculateColumnWidths,
    findTableBlock,
    formatTableRow,
    parseTableRows
} from '../../shared/table/table';
import { isInFencedCodeBlock } from '../completion/helpers';

export function formatTableAtLine(editor: vscode.TextEditor, lineIndex: number): void {
    debugLog(`formatTableAtLine called for line ${lineIndex}`);

    if (!editor) {
        debugLog('No editor, aborting');
        return;
    }

    const document = editor.document;
    if (lineIndex < 0 || lineIndex >= document.lineCount) {
        debugLog(`Invalid line index ${lineIndex} (lineCount: ${document.lineCount})`);
        return;
    }

    if (isInFencedCodeBlock(document, lineIndex)) {
        debugLog('Line is inside fenced code block, skipping');
        return;
    }

    const { start, end } = findTableBlock(document, lineIndex);
    debugLog(`Table block found: lines ${start} to ${end}`);

    const { rows, maxCols } = parseTableRows(document, start, end);
    debugLog(`Parsed ${rows.length} rows, max columns: ${maxCols}`);

    if (rows.length < 2) {
        debugLog('Not enough rows (< 2), aborting');
        return;
    }

    if (!rows.some(r => r.isSep)) {
        debugLog('No separator row found, aborting');
        return;
    }

    const { colWidths, colHasFullWidth } = calculateColumnWidths(rows, maxCols);
    debugLog(`Column widths: ${colWidths.join(', ')}`);
    debugLog(`Column full-width flags: ${colHasFullWidth.join(', ')}`);

    const replacements: Array<{ line: number; text: string }> = [];
    for (const row of rows) {
        replacements.push({
            line: row.line,
            text: formatTableRow(row, colWidths, colHasFullWidth, maxCols)
        });
    }

    debugLog(`Applying ${replacements.length} replacements`);
    let replacedCount = 0;

    editor.edit(editBuilder => {
        for (const rep of replacements) {
            const orig = document.lineAt(rep.line).text;
            if (orig === rep.text) {
                debugLog(`Line ${rep.line}: No changes needed`);
                continue;
            }
            debugLog(`Line ${rep.line}: "${orig}" -> "${rep.text}"`);
            const range = new vscode.Range(rep.line, 0, rep.line, orig.length);
            editBuilder.replace(range, rep.text);
            replacedCount++;
        }
    }).then(success => {
        if (success) {
            debugLog(`✓ Table formatting completed: ${replacedCount} lines modified`);
        } else {
            debugLog('✗ Table formatting failed');
        }
    });
}
