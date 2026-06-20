import * as vscode from 'vscode';

import { debugLog } from '../../core';
import { collectHeadings, generateTableOfContents } from '../../shared/structure/toc';
import { isInFencedCodeBlock } from '../completion/helpers';

export async function updateTableOfContents(
    editor: vscode.TextEditor,
    autoMode = false
): Promise<void> {
    const document = editor.document;
    const text = document.getText();

    const tocMarkerRegex = /^(\/目次|\/toc)(\s*)?$/gm;
    let match: RegExpExecArray | null;
    let foundMarker = false;

    while ((match = tocMarkerRegex.exec(text)) !== null) {
        foundMarker = true;
        const markerPos = document.positionAt(match.index);
        const markerLine = markerPos.line;

        if (isInFencedCodeBlock(document, markerLine)) {
            continue;
        }

        const headings = collectHeadings(document).filter(h => h.line !== markerLine);

        const config = vscode.workspace.getConfiguration('markdownInline');
        const minLevel = config.get<number>('toc.minLevel', 1);
        const maxLevel = config.get<number>('toc.maxLevel', 6);

        const tocContent = generateTableOfContents(headings, minLevel, maxLevel);

        if (!tocContent) {
            debugLog('[TOC] No headings found');
            continue;
        }

        const tocStartLine = markerLine + 1;
        let tocEndLine = tocStartLine;

        for (let i = tocStartLine; i < document.lineCount; i++) {
            const lineText = document.lineAt(i).text;
            if (lineText.trim() === '') {
                if (i + 1 < document.lineCount) {
                    const nextLine = document.lineAt(i + 1).text;
                    if (nextLine.match(/^\s*-\s+\[.+\]\(#.+\)/)) {
                        continue;
                    }
                }
                tocEndLine = i;
                break;
            }
            if (!lineText.match(/^\s*-\s+\[.+\]\(#.+\)/)) {
                tocEndLine = i;
                break;
            }
            tocEndLine = i + 1;
        }

        let existingToc = '';
        if (tocEndLine > tocStartLine) {
            const existingRange = new vscode.Range(
                new vscode.Position(tocStartLine, 0),
                new vscode.Position(tocEndLine - 1, document.lineAt(tocEndLine - 1).text.length)
            );
            existingToc = document.getText(existingRange);
        }

        if (autoMode && existingToc.trim() === tocContent.trim()) {
            debugLog('[TOC] No changes needed');
            continue;
        }

        await editor.edit(editBuilder => {
            if (tocEndLine > tocStartLine) {
                const replaceRange = new vscode.Range(
                    new vscode.Position(tocStartLine, 0),
                    new vscode.Position(tocEndLine, 0)
                );
                editBuilder.replace(replaceRange, tocContent + '\n\n');
            } else {
                const insertPos = new vscode.Position(markerLine + 1, 0);
                editBuilder.insert(insertPos, '\n' + tocContent + '\n');
            }
        });

        debugLog(`[TOC] Updated table of contents at line ${markerLine}`);
    }

    if (!foundMarker && !autoMode) {
        vscode.window.showInformationMessage('目次マーカー (/目次 または /toc) が見つかりません');
    }
}
