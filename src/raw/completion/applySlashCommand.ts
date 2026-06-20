import * as vscode from 'vscode';

import { debugLog, rawRuntime } from '../../core';
import { isInFencedCodeBlock } from './helpers';
import {
    buildCallout,
    buildCodeBlock,
    buildHeadingLine,
    createDefaultTableTemplate,
    expandShorthandHeading,
    parseHeadingSlashCommand,
    parseSlashCommandLine,
    parseTableNormalizeSlashCommand,
    resolveCalloutType,
    resolveCodeLanguage
} from './slashCommands';
import { updateTableOfContents } from '../toc';

export async function applySlashCommandLine(editor: vscode.TextEditor): Promise<boolean> {
    const document = editor.document;
    if (editor.selections.length !== 1) {
        return false;
    }

    const position = editor.selection.active;
    const lineIdx = position.line;
    if (lineIdx < 0 || lineIdx >= document.lineCount) {
        return false;
    }

    if (isInFencedCodeBlock(document, lineIdx)) {
        return false;
    }

    const rawLineText = document.lineAt(lineIdx).text;
    const lineText = expandShorthandHeading(rawLineText);

    const parsed = parseSlashCommandLine(lineText);
    if (!parsed) {
        return false;
    }

    const command = parsed.command.toLowerCase();
    debugLog(`[slash] Parsed command "${command}" with args "${parsed.argsText}"`);

    if (command === 'toc' || command === '目次') {
        await updateTableOfContents(editor, false);
        return true;
    }

    if (command === 'heading') {
        const heading = parseHeadingSlashCommand(parsed.argsText);
        if (!heading) {
            vscode.window.showWarningMessage('無効な heading スラッシュコマンドです');
            return true;
        }
        const headingLine = buildHeadingLine(heading.level, heading.title);
        await editor.edit(eb => {
            eb.replace(new vscode.Range(lineIdx, 0, lineIdx, rawLineText.length), headingLine);
        });
        const newCursor = new vscode.Position(lineIdx, headingLine.length);
        editor.selection = new vscode.Selection(newCursor, newCursor);
        return true;
    }

    if (command === 'table') {
        const normalizeMode = parseTableNormalizeSlashCommand(parsed.argsText);
        if (normalizeMode === null && /^(?:normalize|normilize)\b/i.test(parsed.argsText)) {
            vscode.window.showWarningMessage('無効な table normalize スラッシュコマンドです');
            return true;
        }
        if (normalizeMode !== null) {
            await vscode.workspace.getConfiguration('markdownInline.advanced')
                .update('autoFormatTables', normalizeMode, vscode.ConfigurationTarget.Workspace);
            rawRuntime.slashTableNormalizeOverride = normalizeMode;
            await editor.edit(eb => {
                eb.replace(new vscode.Range(lineIdx, 0, lineIdx, rawLineText.length), '');
            });
            const targetPos = new vscode.Position(Math.min(lineIdx, document.lineCount - 1), 0);
            editor.selection = new vscode.Selection(targetPos, targetPos);
            vscode.window.showInformationMessage(
                `テーブル自動整形を ${normalizeMode ? '有効' : '無効'} にしました（ワークスペース設定に保存）`
            );
            return true;
        }
        const insertText = createDefaultTableTemplate(2).join('\n');
        await editor.edit(eb => {
            eb.replace(new vscode.Range(lineIdx, 0, lineIdx, rawLineText.length), insertText);
        });
        editor.selection = new vscode.Selection(
            new vscode.Position(lineIdx, 2),
            new vscode.Position(lineIdx, 2)
        );
        return true;
    }

    if (command === 'code') {
        const lang = resolveCodeLanguage(parsed.argsText);
        const lines = buildCodeBlock(lang);
        await editor.edit(eb => {
            eb.replace(new vscode.Range(lineIdx, 0, lineIdx, rawLineText.length), lines.join('\n'));
        });
        const innerLine = lineIdx + 1;
        editor.selection = new vscode.Selection(
            new vscode.Position(innerLine, 0),
            new vscode.Position(innerLine, 0)
        );
        return true;
    }

    if (command === 'quote') {
        const bodyText = parsed.argsText.trim();
        const result = bodyText ? `> ${bodyText}` : '> ';
        await editor.edit(eb => {
            eb.replace(new vscode.Range(lineIdx, 0, lineIdx, rawLineText.length), result);
        });
        editor.selection = new vscode.Selection(
            new vscode.Position(lineIdx, result.length),
            new vscode.Position(lineIdx, result.length)
        );
        return true;
    }

    if (command === 'divider') {
        await editor.edit(eb => {
            eb.replace(new vscode.Range(lineIdx, 0, lineIdx, rawLineText.length), '---');
        });
        editor.selection = new vscode.Selection(
            new vscode.Position(lineIdx, 3),
            new vscode.Position(lineIdx, 3)
        );
        return true;
    }

    if (command === 'callout') {
        const type = resolveCalloutType(parsed.args[0] ?? '');
        const result = buildCallout(type);
        await editor.edit(eb => {
            eb.replace(new vscode.Range(lineIdx, 0, lineIdx, rawLineText.length), result);
        });
        editor.selection = new vscode.Selection(
            new vscode.Position(lineIdx, result.length),
            new vscode.Position(lineIdx, result.length)
        );
        return true;
    }

    if (command === 'bullet') {
        await editor.edit(eb => {
            eb.replace(new vscode.Range(lineIdx, 0, lineIdx, rawLineText.length), '- ');
        });
        editor.selection = new vscode.Selection(
            new vscode.Position(lineIdx, 2),
            new vscode.Position(lineIdx, 2)
        );
        return true;
    }

    if (command === 'numbered') {
        await editor.edit(eb => {
            eb.replace(new vscode.Range(lineIdx, 0, lineIdx, rawLineText.length), '1. ');
        });
        editor.selection = new vscode.Selection(
            new vscode.Position(lineIdx, 3),
            new vscode.Position(lineIdx, 3)
        );
        return true;
    }

    if (command === 'todo') {
        await editor.edit(eb => {
            eb.replace(new vscode.Range(lineIdx, 0, lineIdx, rawLineText.length), '- [ ] ');
        });
        editor.selection = new vscode.Selection(
            new vscode.Position(lineIdx, 6),
            new vscode.Position(lineIdx, 6)
        );
        return true;
    }

    return false;
}
