import * as vscode from 'vscode';

import { updateImageInlineDecorations } from './imageInline';
import { updateTableWrapInlineDecorations } from './tableWrapInline';
import { getRawDecorationDeps } from './deps';
import { rawDecorationState, type CodeBlock } from './state';

const s = rawDecorationState;

export function updateAllDecorations(editor: vscode.TextEditor): void {
    if (!editor || !s.checkedDecoration) return;

    if (!getRawDecorationDeps().isPreviewEnabled()) {
        clearAllDecorations(editor);
        return;
    }

    getRawDecorationDeps().debugLog(`[updateAllDecorations] Starting update (editing line: ${s.currentEditingLine})`);

    const document = editor.document;
    const ranges: vscode.Range[] = [];

    for (let i = 0; i < document.lineCount; i++) {
        if (getRawDecorationDeps().shouldHideStrikethroughOnEditingLine(i)) {
            getRawDecorationDeps().debugLog(`[updateAllDecorations] Skipping editing line ${i}`);
            continue;
        }

        const line = document.lineAt(i).text;

        const match = line.match(/^\s*-\s\[[xX]\]\s*/);
        if (match) {
            const startPos = match[0].length;
            if (startPos < line.length) {
                const range = new vscode.Range(
                    new vscode.Position(i, startPos),
                    new vscode.Position(i, line.length)
                );
                ranges.push(range);
                getRawDecorationDeps().debugLog(`[updateAllDecorations] Adding range for line ${i}: "${line.substring(startPos)}"`);
            }
        }
    }

    editor.setDecorations(s.checkedDecoration, ranges);
    getRawDecorationDeps().debugLog(`[updateAllDecorations] Applied ${ranges.length} checkbox decorations`);

    updateHeadingDecorations(editor);
    updateCodeBlockDecorations(editor);
    updateHorizontalRuleDecorations(editor);
    if (s.imageInlineDecoration) {
        updateImageInlineDecorations(editor, s.imageInlineDecoration, s.currentEditingLine, getRawDecorationDeps().isImageThumbnailEnabled());
    }
    if (s.tableWrapInlineDecoration) {
        updateTableWrapInlineDecorations(
            editor,
            s.tableWrapInlineDecoration,
            s.currentEditingLine,
            getRawDecorationDeps().isTableWrapHoverEnabled(),
            getRawDecorationDeps().getTableWrapMaxWidth()
        );
    }
    // 記法マーカー（##, ** 等）の隠蔽は Preview（Milkdown）モードのみ。Raw では常にソースをそのまま表示する。
    clearInlineEmphasisDecorations(editor);
}

export function clearInlineEmphasisDecorations(editor: vscode.TextEditor): void {
    if (s.markerConcealDecoration) editor.setDecorations(s.markerConcealDecoration, []);
    if (s.inlineBoldDecoration) editor.setDecorations(s.inlineBoldDecoration, []);
    if (s.inlineItalicDecoration) editor.setDecorations(s.inlineItalicDecoration, []);
    if (s.inlineStrikethroughDecoration) editor.setDecorations(s.inlineStrikethroughDecoration, []);
    if (s.inlineCodeContentDecoration) editor.setDecorations(s.inlineCodeContentDecoration, []);
}

export function clearLanguageDecorations(editor: vscode.TextEditor): void {
    for (const decorations of s.languageDecorations.values()) {
        for (const decoration of decorations.values()) {
            editor.setDecorations(decoration, []);
        }
    }
}

export function clearAllDecorations(editor: vscode.TextEditor): void {
    if (s.checkedDecoration) editor.setDecorations(s.checkedDecoration, []);

    for (const decoration of s.headingDecorations) {
        editor.setDecorations(decoration, []);
    }

    if (s.codeBlockDecoration) {
        editor.setDecorations(s.codeBlockDecoration, []);
    }

    if (s.horizontalRuleDecoration) {
        editor.setDecorations(s.horizontalRuleDecoration, []);
    }

    clearInlineEmphasisDecorations(editor);

    clearLanguageDecorations(editor);

    if (s.imageInlineDecoration) editor.setDecorations(s.imageInlineDecoration, []);
    if (s.tableWrapInlineDecoration) editor.setDecorations(s.tableWrapInlineDecoration, []);
}

export function updateHeadingDecorations(editor: vscode.TextEditor): void {
    if (!editor || s.headingDecorations.length !== 6) return;

    if (!getRawDecorationDeps().isHeadingDecorationsEnabled()) {
        for (const decoration of s.headingDecorations) {
            editor.setDecorations(decoration, []);
        }
        return;
    }

    const document = editor.document;
    const perLevel: vscode.Range[][] = [[], [], [], [], [], []];

    for (let i = 0; i < document.lineCount; i++) {
        const lineText = document.lineAt(i).text;
        const m = lineText.match(/^(#{1,6})\s+.+/);
        if (!m) continue;

        const level = Math.min(m[1].length, 6) - 1;
        const range = new vscode.Range(new vscode.Position(i, 0), new vscode.Position(i, lineText.length));
        perLevel[level].push(range);
    }

    for (let l = 0; l < 6; l++) {
        editor.setDecorations(s.headingDecorations[l], perLevel[l]);
    }
}

export function updateCodeBlockDecorations(editor: vscode.TextEditor): void {
    if (!editor || !s.codeBlockDecoration) return;

    if (!getRawDecorationDeps().isCodeBlockDecorationsEnabled()) {
        editor.setDecorations(s.codeBlockDecoration, []);
        clearLanguageDecorations(editor);
        return;
    }

    const document = editor.document;
    const backgroundRanges: vscode.Range[] = [];
    const codeBlocks: CodeBlock[] = [];

    let inFence = false;
    let fenceStart = -1;
    let fenceLanguage = '';

    for (let i = 0; i < document.lineCount; i++) {
        const lineText = document.lineAt(i).text;
        if (lineText.startsWith('```')) {
            if (!inFence) {
                inFence = true;
                fenceStart = i;
                const langMatch = lineText.match(/^```([a-zA-Z0-9_+\-#]+)/);
                fenceLanguage = langMatch ? langMatch[1].toLowerCase() : '';
            } else {
                if (fenceStart >= 0) {
                    const range = new vscode.Range(new vscode.Position(fenceStart, 0), new vscode.Position(i, lineText.length));
                    backgroundRanges.push(range);

                    if (fenceLanguage) {
                        codeBlocks.push({
                            language: fenceLanguage,
                            startLine: fenceStart + 1,
                            endLine: i - 1
                        });
                    }
                }
                inFence = false;
                fenceStart = -1;
                fenceLanguage = '';
            }
        }
    }

    if (inFence && fenceStart >= 0) {
        const lastLine = document.lineCount - 1;
        const range = new vscode.Range(new vscode.Position(fenceStart, 0), new vscode.Position(lastLine, document.lineAt(lastLine).text.length));
        backgroundRanges.push(range);

        if (fenceLanguage) {
            codeBlocks.push({
                language: fenceLanguage,
                startLine: fenceStart + 1,
                endLine: lastLine
            });
        }
    }

    editor.setDecorations(s.codeBlockDecoration, backgroundRanges);

    applyLanguageHighlighting(editor, codeBlocks);
}

export function applyLanguageHighlighting(editor: vscode.TextEditor, codeBlocks: CodeBlock[]): void {
    const document = editor.document;

    clearLanguageDecorations(editor);
    s.languageDecorations.clear();

    for (const block of codeBlocks) {
        const { language, startLine, endLine } = block;
        const syntaxRanges = getSyntaxRanges(document, language, startLine, endLine);

        if (!s.languageDecorations.has(language)) {
            s.languageDecorations.set(language, new Map());
        }

        const langDecorations = s.languageDecorations.get(language) ?? new Map<string, vscode.TextEditorDecorationType>();

        for (const [tokenType, ranges] of syntaxRanges) {
            if (!langDecorations.has(tokenType)) {
                const decoration = createDecorationForToken(tokenType);
                if (decoration) {
                    langDecorations.set(tokenType, decoration);
                }
            }

            const decoration = langDecorations.get(tokenType);
            if (decoration) {
                editor.setDecorations(decoration, ranges);
            }
        }
    }
}

export function createDecorationForToken(tokenType: string): vscode.TextEditorDecorationType | null {
    const colors: Record<string, string> = {
        'keyword': '#c678dd',
        'string': '#98c379',
        'comment': '#5c6370',
        'number': '#d19a66',
        'function': '#61afef',
        'class': '#e5c07b',
        'variable': '#e06c75',
        'operator': '#56b6c2',
        'type': '#e5c07b',
        'decorator': '#d19a66',
        'tag': '#e06c75',
        'attribute': '#d19a66',
        'property': '#61afef',
        'preprocessor': '#d19a66',
        'macro': '#d19a66',
        'namespace': '#56b6c2',
        'section': '#e5c07b',
        'key': '#61afef',
        'boolean': '#c678dd',
        'constant': '#e06c75',
        'builtin': '#56b6c2',
        'symbol': '#56b6c2'
    };

    const color = colors[tokenType];
    if (!color) return null;

    const options: vscode.DecorationRenderOptions = {
        color: color,
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
    };

    if (tokenType === 'keyword' || tokenType === 'class' || tokenType === 'type' || tokenType === 'section') {
        options.fontWeight = 'bold';
    }
    if (tokenType === 'comment') {
        options.fontStyle = 'italic';
    }

    return vscode.window.createTextEditorDecorationType(options);
}

export function getSyntaxRanges(
    document: vscode.TextDocument,
    language: string,
    startLine: number,
    endLine: number
): Map<string, vscode.Range[]> {
    const syntaxRanges = new Map<string, vscode.Range[]>();

    const languagePatterns: Record<string, Record<string, RegExp>> = {
        'python': {
            'keyword': /\b(def|class|if|else|elif|for|while|return|import|from|as|try|except|finally|with|lambda|yield|assert|break|continue|pass|raise|global|nonlocal|del|is|in|not|and|or|None|True|False)\b/g,
            'string': /(["'])(?:(?=(\\?))\2.)*?\1/g,
            'comment': /#.*/g,
            'number': /\b\d+(\.\d+)?\b/g,
            'function': /\b[a-zA-Z_][a-zA-Z0-9_]*(?=\s*\()/g,
            'decorator': /@[a-zA-Z_][a-zA-Z0-9_]*/g,
            'class': /\bclass\s+([A-Z][a-zA-Z0-9_]*)/g
        },
        'javascript': {
            'keyword': /\b(function|var|let|const|if|else|for|while|return|import|export|from|class|extends|new|try|catch|finally|throw|async|await|yield|typeof|instanceof|in|of|this|super|static|get|set|constructor|break|continue|switch|case|default|do|void|delete|debugger)\b/g,
            'string': /(["'`])(?:(?=(\\?))\2.)*?\1/g,
            'comment': /(\/\/.*|\/\*[\s\S]*?\*\/)/g,
            'number': /\b\d+(\.\d+)?\b/g,
            'function': /\b[a-zA-Z_$][a-zA-Z0-9_$]*(?=\s*\()/g,
            'class': /\bclass\s+([A-Z][a-zA-Z0-9_]*)/g
        },
        'typescript': {
            'keyword': /\b(function|var|let|const|if|else|for|while|return|import|export|from|class|extends|new|try|catch|finally|throw|async|await|yield|typeof|instanceof|in|of|this|super|static|get|set|constructor|break|continue|switch|case|default|do|void|delete|debugger|interface|type|enum|namespace|module|declare|abstract|implements|private|public|protected|readonly)\b/g,
            'string': /(["'`])(?:(?=(\\?))\2.)*?\1/g,
            'comment': /(\/\/.*|\/\*[\s\S]*?\*\/)/g,
            'number': /\b\d+(\.\d+)?\b/g,
            'function': /\b[a-zA-Z_$][a-zA-Z0-9_$]*(?=\s*\()/g,
            'type': /:\s*([A-Z][a-zA-Z0-9_<>\[\]]*)/g,
            'class': /\b(class|interface|type|enum)\s+([A-Z][a-zA-Z0-9_]*)/g
        },
        'json': {
            'property': /"[^"]+"(?=\s*:)/g,
            'string': /"[^"]*"/g,
            'number': /-?\b\d+(\.\d+)?([eE][+-]?\d+)?\b/g,
            'keyword': /\b(true|false|null)\b/g
        }
    };

    const aliases: Record<string, string> = {
        'js': 'javascript', 'mjs': 'javascript', 'cjs': 'javascript',
        'ts': 'typescript',
        'py': 'python',
        'jsx': 'javascript', 'tsx': 'typescript'
    };

    const resolvedLanguage = aliases[language] || language;
    let patterns = languagePatterns[resolvedLanguage];

    if (!patterns) {
        patterns = {
            'string': /(["'`])(?:(?=(\\?))\2.)*?\1/g,
            'comment': /(\/\/.*|\/\*[\s\S]*?\*\/|#.*)/g,
            'number': /\b\d+(\.\d+)?\b/g
        };
    }

    for (let lineNum = startLine; lineNum <= endLine && lineNum < document.lineCount; lineNum++) {
        const line = document.lineAt(lineNum);
        const lineText = line.text;

        for (const [tokenType, pattern] of Object.entries(patterns)) {
            let match: RegExpExecArray | null;
            pattern.lastIndex = 0;

            while ((match = pattern.exec(lineText)) !== null) {
                const startPos = new vscode.Position(lineNum, match.index);
                const endPos = new vscode.Position(lineNum, match.index + match[0].length);
                const range = new vscode.Range(startPos, endPos);

                if (!syntaxRanges.has(tokenType)) {
                    syntaxRanges.set(tokenType, []);
                }
                syntaxRanges.get(tokenType)?.push(range);
            }
        }
    }

    return syntaxRanges;
}

export function updateHorizontalRuleDecorations(editor: vscode.TextEditor): void {
    if (!editor || !s.horizontalRuleDecoration) return;

    if (!getRawDecorationDeps().isHorizontalRuleDecorationsEnabled()) {
        editor.setDecorations(s.horizontalRuleDecoration, []);
        return;
    }

    const document = editor.document;
    const ranges: vscode.Range[] = [];

    for (let i = 0; i < document.lineCount; i++) {
        const lineText = document.lineAt(i).text.trim();
        if (/^(-{3,}|\*{3,}|_{3,})$/.test(lineText)) {
            const range = new vscode.Range(new vscode.Position(i, 0), new vscode.Position(i, document.lineAt(i).text.length));
            ranges.push(range);
        }
    }

    editor.setDecorations(s.horizontalRuleDecoration, ranges);
}
export { rawDecorationState };
