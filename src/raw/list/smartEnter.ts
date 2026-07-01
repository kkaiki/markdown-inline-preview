import * as vscode from 'vscode';

import { debugLog } from '../../core';
import { applySlashCommandLine } from '../completion/applySlashCommand';
import { isInFencedCodeBlock } from '../completion/helpers';
import { formatTableAtLine } from '../table';
import { renumberLists } from './renumberLists';

interface PreEdit {
    range: vscode.Range;
    text: string;
}

export async function smartEnterCommand(): Promise<void> {
    debugLog('[smartEnter] Command called');
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'markdown') {
        debugLog('[smartEnter] Not markdown, using default Enter');
        await vscode.commands.executeCommand('type', { text: '\n' });
        return;
    }
    debugLog('[smartEnter] Processing markdown file');

    if (await applySlashCommandLine(editor)) {
        debugLog('[smartEnter] Slash command handled');
        return;
    }

    const document = editor.document;
    const selections = editor.selections;
    const isSingleCursor = selections.length === 1;

    const preEdits: PreEdit[] = [];
    const continuationTexts: (string | null)[] = new Array(selections.length).fill(null);
    let skipNewlineForSingle = false;
    let hasOrderedList = false;
    let orderedListLine = -1;

    for (let i = 0; i < selections.length; i++) {
        const sel = selections[i];
        const pos = sel.active;
        const lineIdx = pos.line;
        if (lineIdx < 0 || lineIdx >= document.lineCount) continue;
        const lineText = document.lineAt(lineIdx).text;

        if (isInFencedCodeBlock(document, lineIdx)) {
            continuationTexts[i] = null;
            continue;
        }

        let m: RegExpMatchArray | null;

        if ((m = lineText.match(/^(\s*)([-*+])\s+\[(x|X| )\]\s*(.*)$/))) {
            const indent = m[1] || '';
            const marker = m[2];
            const content = (m[4] || '');
            const isEmptyItem = content.trim().length === 0;
            const atEndOfLine = pos.character >= lineText.length;
            const checkboxMarkerEnd = indent.length + marker.length + 5;

            if (isEmptyItem && atEndOfLine) {
                preEdits.push({
                    range: new vscode.Range(lineIdx, 0, lineIdx, lineText.length),
                    text: ''
                });
                continuationTexts[i] = null;
                skipNewlineForSingle = true;
            } else if (pos.character < checkboxMarkerEnd) {
                continuationTexts[i] = null;
            } else {
                continuationTexts[i] = `${indent}${marker} [ ] `;
            }
            continue;
        }

        if ((m = lineText.match(/^(\s*)([-*+])\s+(.*)$/))) {
            debugLog(`[smartEnter] Bullet list detected: "${lineText}"`);
            const indent = m[1] || '';
            const marker = m[2];
            const content = (m[3] || '');
            const isEmptyItem = content.trim().length === 0;
            const atEndOfLine = pos.character >= lineText.length;
            const bulletMarkerEnd = indent.length + marker.length + 1;
            debugLog(`[smartEnter] Cursor at ${pos.character}, markerEnd at ${bulletMarkerEnd}, isEmpty: ${isEmptyItem}, atEnd: ${atEndOfLine}`);

            if (isEmptyItem && atEndOfLine) {
                debugLog('[smartEnter] Empty bullet, removing marker');
                preEdits.push({
                    range: new vscode.Range(lineIdx, 0, lineIdx, lineText.length),
                    text: ''
                });
                continuationTexts[i] = null;
                skipNewlineForSingle = true;
            } else if (pos.character < bulletMarkerEnd) {
                debugLog('[smartEnter] Cursor in marker, no continuation');
                continuationTexts[i] = null;
            } else {
                debugLog(`[smartEnter] Adding bullet continuation: "${indent}${marker} "`);
                continuationTexts[i] = `${indent}${marker} `;
            }
            continue;
        }

        if ((m = lineText.match(/^(\s*)(\d+)([\.)])\s+(.*)$/))) {
            const indent = m[1] || '';
            const num = parseInt(m[2], 10) || 0;
            const punct = m[3];
            const content = (m[4] || '');
            const isEmptyItem = content.trim().length === 0;
            const atEndOfLine = pos.character >= lineText.length;
            const numStr = String(num);
            const numberedMarkerEnd = indent.length + numStr.length + punct.length + 1;
            debugLog(`[smartEnter] Numbered list - Cursor at ${pos.character}, markerEnd at ${numberedMarkerEnd}`);

            if (isEmptyItem && atEndOfLine) {
                preEdits.push({
                    range: new vscode.Range(lineIdx, 0, lineIdx, lineText.length),
                    text: ''
                });
                continuationTexts[i] = null;
                skipNewlineForSingle = true;
            } else if (pos.character < numberedMarkerEnd) {
                debugLog('[smartEnter] Cursor in numbered marker, no continuation');
                continuationTexts[i] = null;
            } else {
                const next = num + 1;
                continuationTexts[i] = `${indent}${next}${punct} `;
                hasOrderedList = true;
                orderedListLine = lineIdx;
            }
            continue;
        }

        if ((m = lineText.match(/^(\s*)([^\s:]+):\s/))) {
            const indent = m[1] || '';
            const currentLabel = m[2];
            const labelMarkerEnd = indent.length + currentLabel.length + 2;

            debugLog(`[smartEnter] Labeled list detected: "${currentLabel}:" at line ${lineIdx}`);

            if (pos.character < labelMarkerEnd) {
                debugLog('[smartEnter] Cursor in label marker, no continuation');
                continuationTexts[i] = null;
                continue;
            }

            const labels: string[] = [];
            let searchLine = lineIdx;

            while (searchLine >= 0) {
                const searchText = document.lineAt(searchLine).text;
                const searchMatch = searchText.match(/^(\s*)([^\s:]+):\s/);

                if (searchMatch && searchMatch[1] === indent) {
                    labels.unshift(searchMatch[2]);
                    searchLine--;
                } else if (searchText.trim() === '') {
                    break;
                } else {
                    break;
                }
            }

            debugLog(`[smartEnter] Found labels: [${labels.join(', ')}]`);

            if (labels.length > 0) {
                const currentIndex = labels.indexOf(currentLabel);
                const nextIndex = (currentIndex + 1) % labels.length;
                const nextLabel = labels[nextIndex];

                debugLog(`[smartEnter] Current: ${currentLabel} (${currentIndex}), Next: ${nextLabel} (${nextIndex})`);

                continuationTexts[i] = `${indent}${nextLabel}: `;
            } else {
                continuationTexts[i] = `${indent}${currentLabel}: `;
            }
            continue;
        }

        continuationTexts[i] = null;
    }

    // カーソルが移動するべき新しい位置（行 offset, 文字数）を事前に計算する。
    // editor.edit の insert() はカーソルを移動させないため、edit 完了後に明示的に設定する。
    const newPositions: vscode.Position[] = selections.map((sel, i) => {
        if (isSingleCursor && skipNewlineForSingle) return sel.active;
        const cont = continuationTexts[i];
        const originalLine = sel.active.line;

        // preEdits はリスト項目のクリア（replace で空文字）が伴い、
        // 同じ行で insert もしない（skipNewlineForSingle=true）ので対象外。
        // 通常の継続入力では originalLine + 1 行目の continuation テキスト末尾へ。
        const newLine = originalLine + 1;
        const newChar = cont ? cont.length : 0;
        return new vscode.Position(newLine, newChar);
    });

    await editor.edit(eb => {
        for (const e of preEdits) {
            eb.replace(e.range, e.text);
        }

        if (!(isSingleCursor && skipNewlineForSingle)) {
            for (let i = 0; i < selections.length; i++) {
                const sel = selections[i];
                const cont = continuationTexts[i];
                const pos = sel.active;

                if (cont) {
                    eb.insert(pos, '\n' + cont);
                } else {
                    eb.insert(pos, '\n');
                }
            }
        }
    });

    debugLog('[smartEnter] Edit complete, moving cursor to new position');

    // カーソルを挿入されたテキストの末尾（新しい行）に明示移動する。
    if (!(isSingleCursor && skipNewlineForSingle)) {
        const newSelections = newPositions.map(p => new vscode.Selection(p, p));
        editor.selections = newSelections;
        editor.revealRange(new vscode.Range(newSelections[0].active, newSelections[0].active));
    }

    try {
        for (const sel of selections) {
            const prevLineIndex = Math.max(0, sel.active.line);
            if (prevLineIndex < editor.document.lineCount) {
                const prevLineText = editor.document.lineAt(prevLineIndex).text;
                if (prevLineText.includes('|')) {
                    formatTableAtLine(editor, prevLineIndex);
                }
            }
        }
    } catch {
        // ignore table format failures after enter
    }

    if (hasOrderedList && orderedListLine >= 0) {
        const currentLine = editor.selection.active.line;
        debugLog('[smartEnter] Renumbering ordered lists from line', currentLine, '(original line was', orderedListLine, ')');
        renumberLists(editor, currentLine);
    }
}
