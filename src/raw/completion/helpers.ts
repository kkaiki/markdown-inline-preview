import type * as vscode from 'vscode';

export function isInFencedCodeBlock(document: vscode.TextDocument, lineIndex: number): boolean {
    let inFence = false;
    for (let i = 0; i <= lineIndex; i++) {
        const t = document.lineAt(i).text;
        if (t.startsWith('```')) {
            inFence = !inFence;
        }
    }
    return inFence;
}
