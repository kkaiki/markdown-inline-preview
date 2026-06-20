import * as vscode from 'vscode';

// コマンドモジュールのインポート
import * as commandsModule from './commands';
import {
    buildCallout,
    buildCodeBlock,
    buildHeadingLine,
    createDefaultTableTemplate,
    expandShorthandHeading,
    getAdvancedBooleanSetting,
    getAdvancedOrLegacyBooleanSetting,
    parseHeadingSlashCommand,
    parseSlashCommandLine,
    parseTableNormalizeSlashCommand,
    resolveCalloutType,
    resolveCodeLanguage
} from './utils';

// 型定義
interface TableCell {
    start: number;
    end: number;
    contentStart: number;
    contentEnd: number;
    index: number;
}

interface TableCellInfo {
    isTable: boolean;
    cellIndex: number;
    cellStart: number;
    cellEnd: number;
    cellContentStart: number;
    cellContentEnd: number;
    allCells: TableCell[];
}

interface TableRow {
    line: number;
    cells: string[];
    isSep: boolean;
}

interface HeadingInfo {
    level: number;
    text: string;
    line: number;
}

interface CodeBlock {
    language: string;
    startLine: number;
    endLine: number;
}

interface PreEdit {
    range: vscode.Range;
    text: string;
}

interface Replacement {
    line: number;
    text: string;
}

interface TaskInfo {
    line: number;
    text: string;
    isChecked: boolean;
}

type ConvertType = 'bullet' | 'numbered' | 'checkbox' | 'normal';
type Direction = 'up' | 'down';

// グローバルな装飾タイプ（再利用）
let checkedDecoration: vscode.TextEditorDecorationType | null = null;
let headingDecorations: vscode.TextEditorDecorationType[] = [];
let codeBlockDecoration: vscode.TextEditorDecorationType | null = null;
let horizontalRuleDecoration: vscode.TextEditorDecorationType | null = null;
let updateTimer: NodeJS.Timeout | null = null;
let tocUpdateTimer: NodeJS.Timeout | null = null;
let currentEditingLine = -1;
let slashTableNormalizeOverride: boolean | null = null;
let isDragging = false;
const languageDecorations = new Map<string, Map<string, vscode.TextEditorDecorationType>>();

// デバッグ用出力チャンネル
let debugChannel: vscode.OutputChannel | null = null;

function debugLog(message: string, ...args: unknown[]): void {
    if (debugChannel) {
        const timestamp = new Date().toISOString().substring(11, 23);
        const formattedArgs = args.length > 0 ? ' ' + args.map(a => JSON.stringify(a)).join(' ') : '';
        debugChannel.appendLine(`[${timestamp}] ${message}${formattedArgs}`);
    }
}

function getMarkdownInlineConfig(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('markdownInline');
}

function isPreviewEnabled(): boolean {
    return getMarkdownInlineConfig().get<boolean>('enablePreview', true);
}

function isAutoTableFormattingEnabled(): boolean {
    if (slashTableNormalizeOverride !== null) {
        return slashTableNormalizeOverride;
    }
    return getAdvancedBooleanSetting(getMarkdownInlineConfig(), 'autoFormatTables', false);
}

function setSlashTableNormalizeOverride(enabled: boolean | null): void {
    slashTableNormalizeOverride = enabled;
    debugLog(`[table] slash normalize override set to ${enabled ?? 'null'}`);
}

function isCheckboxMouseToggleEnabled(): boolean {
    return getAdvancedBooleanSetting(getMarkdownInlineConfig(), 'enableCheckboxMouseToggle', true);
}

function isCodeBlockAutoCompleteEnabled(): boolean {
    return getAdvancedBooleanSetting(getMarkdownInlineConfig(), 'enableCodeBlockAutoComplete', true);
}

function isHeadingDecorationsEnabled(): boolean {
    return getAdvancedOrLegacyBooleanSetting(
        getMarkdownInlineConfig(),
        'enableHeadingDecorations',
        'enableHeadingDecorations',
        true
    );
}

function isCodeBlockDecorationsEnabled(): boolean {
    return getAdvancedBooleanSetting(getMarkdownInlineConfig(), 'enableCodeBlockDecorations', true);
}

function isHorizontalRuleDecorationsEnabled(): boolean {
    return getAdvancedBooleanSetting(getMarkdownInlineConfig(), 'enableHorizontalRuleDecorations', true);
}

function isAutoUpdateTocEnabled(): boolean {
    return getAdvancedOrLegacyBooleanSetting(
        getMarkdownInlineConfig(),
        'autoUpdateTableOfContents',
        'toc.autoUpdate',
        true
    );
}

function shouldDisableCompetingMarkdownFeatures(): boolean {
    return getAdvancedBooleanSetting(
        getMarkdownInlineConfig(),
        'disableCompetingMarkdownFeatures',
        true
    );
}

export function activate(context: vscode.ExtensionContext): void {
    // デバッグ用出力チャンネルを作成
    debugChannel = vscode.window.createOutputChannel('Markdown Table Debug');
    debugLog('=== Markdown Inline Preview Extension Activated ===');

    // Markdown特有の自動補完とテーブル整形を無効化
    if (shouldDisableCompetingMarkdownFeatures()) {
        applyMarkdownSettings();
    }

    // 装飾タイプを一度だけ作成
    checkedDecoration = vscode.window.createTextEditorDecorationType({
        textDecoration: 'line-through !important',
        color: 'rgba(136, 136, 136, 0.6)',
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
    });

    // 見出し装飾（H1〜H6）
    headingDecorations = [
        vscode.window.createTextEditorDecorationType({ // H1
            fontWeight: '900',
            color: '#e06c75',
            backgroundColor: 'rgba(224,108,117,0.06)',
            border: '1px solid rgba(224,108,117,0.30)',
            borderRadius: '3px',
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
        }),
        vscode.window.createTextEditorDecorationType({ // H2
            fontWeight: '800',
            color: '#d19a66',
            backgroundColor: 'rgba(209,154,102,0.06)',
            border: '1px solid rgba(209,154,102,0.30)',
            borderRadius: '3px',
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
        }),
        vscode.window.createTextEditorDecorationType({ // H3
            fontWeight: '800',
            color: '#e5c07b',
            backgroundColor: 'rgba(229,192,123,0.06)',
            border: '1px solid rgba(229,192,123,0.30)',
            borderRadius: '3px',
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
        }),
        vscode.window.createTextEditorDecorationType({ // H4
            fontWeight: '700',
            color: '#98c379',
            backgroundColor: 'rgba(152,195,121,0.06)',
            border: '1px solid rgba(152,195,121,0.30)',
            borderRadius: '3px',
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
        }),
        vscode.window.createTextEditorDecorationType({ // H5
            fontWeight: '700',
            color: '#56b6c2',
            backgroundColor: 'rgba(86,182,194,0.06)',
            border: '1px solid rgba(86,182,194,0.30)',
            borderRadius: '3px',
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
        }),
        vscode.window.createTextEditorDecorationType({ // H6
            fontWeight: '700',
            color: '#61afef',
            backgroundColor: 'rgba(97,175,239,0.06)',
            border: '1px solid rgba(97,175,239,0.30)',
            borderRadius: '3px',
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
        })
    ];

    // コードブロック装飾
    codeBlockDecoration = vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        light: {
            backgroundColor: 'rgba(0, 0, 0, 0.05)'
        },
        dark: {
            backgroundColor: 'rgba(40, 44, 52, 0.85)'
        },
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
    });

    // 水平線装飾
    horizontalRuleDecoration = vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        borderWidth: '0 0 2px 0',
        borderStyle: 'solid',
        light: {
            borderColor: 'rgba(0, 0, 0, 0.35)'
        },
        dark: {
            borderColor: 'rgba(255, 255, 255, 0.28)'
        },
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
    });

    // コマンド登録
    commandsModule.setDebugLog(debugLog);
    commandsModule.registerCommands(context, {
        smartEnterCommand,
        renumberLists,
        convertLineToType,
        toggleCheckbox,
        adjustIndent,
        formatTableAtLine,
        getTableCellInfo,
        getAllTableCells,
        moveLineWithHierarchy,
        updateTableOfContents
    });

    // Notion 式スラッシュコマンド補完メニュー
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            { language: 'markdown' },
            {
                provideCompletionItems(document, position) {
                    if (isInFencedCodeBlock(document, position.line)) return null;

                    const lineText = document.lineAt(position.line).text;
                    const beforeCursor = lineText.substring(0, position.character);
                    if (!beforeCursor.startsWith('/')) return null;

                    // 行全体を置換するレンジ
                    const lineRange = new vscode.Range(
                        position.line, 0,
                        position.line, lineText.length
                    );

                    function makeItem(
                        label: string,
                        detail: string,
                        snippet: string,
                        filterText: string,
                        sortText: string
                    ): vscode.CompletionItem {
                        const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.Snippet);
                        item.detail = detail;
                        item.insertText = new vscode.SnippetString(snippet);
                        item.range = lineRange;
                        item.filterText = filterText;
                        item.sortText = sortText;
                        return item;
                    }

                    return [
                        makeItem('h1',              'H1 大見出し',              '# $0',                    'h1',              '01'),
                        makeItem('h2',              'H2 中見出し',              '## $0',                   'h2',              '02'),
                        makeItem('h3',              'H3 小見出し',              '### $0',                  'h3',              '03'),
                        makeItem('h4',              'H4 見出し',                '#### $0',                 'h4',              '04'),
                        makeItem('h5',              'H5 見出し',                '##### $0',                'h5',              '05'),
                        makeItem('h6',              'H6 見出し',                '###### $0',               'h6',              '06'),
                        makeItem('table',           'テーブルを挿入 (2列)',      '| ${1:Header 1} | ${2:Header 2} |\n| --- | --- |\n| $3 | $0 |', 'table', '07'),
                        makeItem('code',            'コードブロック',            '```${1:bash}\n$0\n```',   'code',            '08'),
                        makeItem('quote',           '引用ブロック',              '> $0',                    'quote',           '09'),
                        makeItem('divider',         '水平線 (---)',              '---',                     'divider',         '10'),
                        makeItem('callout',         'コールアウト 💡',           '> 💡 $0',                 'callout',         '11'),
                        makeItem('callout warning', '警告コールアウト ⚠️',       '> ⚠️ $0',                'callout warning', '12'),
                        makeItem('callout danger',  '危険コールアウト 🚨',       '> 🚨 $0',                 'callout danger',  '13'),
                        makeItem('callout info',    '情報コールアウト ℹ️',       '> ℹ️ $0',                'callout info',    '14'),
                        makeItem('bullet',          '箇条書きリスト',            '- $0',                    'bullet',          '15'),
                        makeItem('numbered',        '番号付きリスト',            '1. $0',                   'numbered',        '16'),
                        makeItem('todo',            'チェックボックス',          '- [ ] $0',                'todo',            '17'),
                        makeItem('toc',             '目次を生成',               '/toc',                    'toc',             '18'),
                        makeItem('heading',         '見出し (レベル指定)',        '/heading ${1:2} $0',      'heading',         '19'),
                    ];
                }
            },
            '/'
        )
    );

    // 初期化時に更新
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        debugLog(`Active editor found: ${editor.document.fileName}, language: ${editor.document.languageId}`);
        if (editor.document.languageId === 'markdown') {
            debugLog('Applying initial decorations to markdown file');
            updateAllDecorations(editor);
        }
    } else {
        debugLog('No active editor found on activation');
    }

    // ドキュメント変更イベント
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(event => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document !== event.document) return;
            if (editor.document.languageId !== 'markdown') return;

            // コードブロックの自動補完
            if (event.contentChanges.length > 0) {
                const change = event.contentChanges[0];
                const changeText = change.text;

                if (isCodeBlockAutoCompleteEnabled() && changeText === '```') {
                    const position = editor.selection.active;
                    const line = position.line;
                    const character = position.character;

                    let codeBlockCount = 0;
                    for (let i = 0; i <= line; i++) {
                        const lineText = editor.document.lineAt(i).text;
                        const matches = lineText.match(/```/g);
                        if (matches) {
                            if (i < line) {
                                codeBlockCount += matches.length;
                            } else {
                                const beforeText = lineText.substring(0, character);
                                const beforeMatches = beforeText.match(/```/g);
                                if (beforeMatches) {
                                    codeBlockCount += beforeMatches.length;
                                }
                            }
                        }
                    }

                    if (codeBlockCount % 2 === 1) {
                        editor.edit(editBuilder => {
                            const currentLine = editor.document.lineAt(line);
                            const endOfLine = new vscode.Position(line, currentLine.text.length);
                            editBuilder.insert(endOfLine, '\n\n```');
                        }).then(() => {
                            const newPosition = new vscode.Position(line + 1, 0);
                            editor.selection = new vscode.Selection(newPosition, newPosition);
                        });
                    }
                }
            }

            // デバウンス処理
            if (updateTimer) clearTimeout(updateTimer);
            updateTimer = setTimeout(() => {
                updateAllDecorations(editor);
            }, 50);

            // 目次自動更新
            const hasHeadingChange = event.contentChanges.some(change => {
                const startLine = change.range.start.line;
                const endLine = change.range.end.line;
                for (let i = startLine; i <= endLine; i++) {
                    if (i < editor.document.lineCount) {
                        const lineText = editor.document.lineAt(i).text;
                        if (lineText.match(/^#{1,6}\s/) || change.text.match(/^#{1,6}\s/)) {
                            return true;
                        }
                    }
                }
                return false;
            });

            if (hasHeadingChange) {
                if (isAutoUpdateTocEnabled()) {
                    if (tocUpdateTimer) clearTimeout(tocUpdateTimer);
                    tocUpdateTimer = setTimeout(() => {
                        const text = editor.document.getText();
                        if (text.includes('/目次') || text.includes('/toc')) {
                            void updateTableOfContents(editor, true);
                        }
                    }, 500);
                }
            }
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(event => {
            if (!event.affectsConfiguration('markdownInline')) {
                return;
            }

            if (event.affectsConfiguration('markdownInline.advanced.disableCompetingMarkdownFeatures')
                && shouldDisableCompetingMarkdownFeatures()) {
                applyMarkdownSettings();
            }

            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor && activeEditor.document.languageId === 'markdown') {
                updateAllDecorations(activeEditor);
            }
        })
    );

    // エディタ変更イベント
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor && editor.document.languageId === 'markdown') {
                updateAllDecorations(editor);
            }
        })
    );

    // カーソル移動イベント
    debugLog('Registering onDidChangeTextEditorSelection event handler');
    context.subscriptions.push(
        vscode.window.onDidChangeTextEditorSelection(event => {
            const editor = event.textEditor;

            debugLog(`[EVENT] Selection changed - Editor: ${editor ? editor.document.fileName : 'none'}`);

            if (!editor || editor.document.languageId !== 'markdown') {
                debugLog(`Selection changed: Not a markdown file (language: ${editor ? editor.document.languageId : 'no editor'})`);
                return;
            }

            const position = event.selections[0].active;

            if (position.line !== currentEditingLine) {
                const previousEditingLine = currentEditingLine;
                currentEditingLine = position.line;

                debugLog(`Line changed: ${previousEditingLine} -> ${currentEditingLine}`);

                if (previousEditingLine !== -1 && previousEditingLine !== position.line) {
                    try {
                        const prevLine = editor.document.lineAt(previousEditingLine).text;
                        debugLog(`Previous line text: "${prevLine}"`);

                        if (isAutoTableFormattingEnabled() && prevLine.includes('|')) {
                            debugLog(`Table detected on line ${previousEditingLine}, formatting...`);
                            formatTableAtLine(editor, previousEditingLine);
                        } else {
                            debugLog('Previous line is not a table (no | character)');
                        }
                    } catch (e) {
                        const error = e as Error;
                        debugLog(`Error reading previous line: ${error.message}`);
                    }
                }

                if (previousEditingLine !== -1 || currentEditingLine !== -1) {
                    updateAllDecorations(editor);
                }
            }

            if (event.kind === vscode.TextEditorSelectionChangeKind.Mouse) {
                const selection = event.selections[0];
                const isSelecting = !selection.isEmpty;

                if (isSelecting) {
                    isDragging = true;
                } else if (isDragging) {
                    isDragging = false;
                    return;
                }

                if (!isDragging && selection.isEmpty) {
                    const line = editor.document.lineAt(position.line);
                    const text = line.text;

                    const checkboxMatch = text.match(/^(\s*)-\s\[[\sx]?\]/i);
                    if (isCheckboxMouseToggleEnabled() && checkboxMatch) {
                        const checkboxStart = text.indexOf('[');
                        const checkboxEnd = text.indexOf(']');

                        if (position.character >= checkboxStart && position.character <= checkboxEnd) {
                            setTimeout(() => {
                                void vscode.commands.executeCommand('markdownInline.clickCheckbox');
                            }, 10);
                        }
                    }
                }
            }
        })
    );

    debugLog('=== Extension activation completed successfully ===');
}

// =========================
// Table of Contents (目次)
// =========================

function collectHeadings(document: vscode.TextDocument): HeadingInfo[] {
    const headings: HeadingInfo[] = [];
    let inCodeBlock = false;

    for (let i = 0; i < document.lineCount; i++) {
        const lineText = document.lineAt(i).text;

        if (lineText.trim().startsWith('```')) {
            inCodeBlock = !inCodeBlock;
            continue;
        }
        if (inCodeBlock) continue;

        const headingMatch = lineText.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
            const level = headingMatch[1].length;
            const text = headingMatch[2].trim();
            headings.push({ level, text, line: i });
        }
    }

    return headings;
}

function generateSlug(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
}

function generateTableOfContents(headings: HeadingInfo[], minLevel = 1, maxLevel = 6): string {
    if (headings.length === 0) {
        return '';
    }

    const lines: string[] = [];
    const baseLevel = Math.min(...headings.map(h => h.level));

    for (const heading of headings) {
        if (heading.level < minLevel || heading.level > maxLevel) continue;

        const indent = '  '.repeat(heading.level - baseLevel);
        const slug = generateSlug(heading.text);
        lines.push(`${indent}- [${heading.text}](#${slug})`);
    }

    return lines.join('\n');
}

async function updateTableOfContents(editor: vscode.TextEditor, autoMode = false): Promise<void> {
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

// =========================
// Markdown Table Formatting
// =========================

function getAllTableCells(lineText: string): TableCell[] | null {
    if (!lineText.includes('|')) {
        return null;
    }

    if (lineText.match(/^\s*\|?\s*[-:]+\s*\|/)) {
        return null;
    }

    const cells: TableCell[] = [];
    let inCell = false;
    let cellStart = 0;

    for (let i = 0; i < lineText.length; i++) {
        if (lineText[i] === '|') {
            if (inCell) {
                const cellText = lineText.substring(cellStart, i);
                const leadingMatch = cellText.match(/^(\s*)/);
                const leadingSpaces = leadingMatch ? leadingMatch[1].length : 0;
                const trailingMatch = cellText.match(/(\s*)$/);
                const trailingSpaces = trailingMatch ? trailingMatch[1].length : 0;

                let contentStart = cellStart + leadingSpaces;
                let contentEnd = i - trailingSpaces;

                if (contentStart >= contentEnd) {
                    contentStart = cellStart;
                    contentEnd = contentStart;
                }

                cells.push({
                    start: cellStart,
                    end: i,
                    contentStart: contentStart,
                    contentEnd: contentEnd,
                    index: cells.length
                });
            }
            cellStart = i + 1;
            inCell = true;
        }
    }

    if (inCell && cellStart < lineText.length) {
        const cellText = lineText.substring(cellStart, lineText.length);
        const leadingMatch = cellText.match(/^(\s*)/);
        const leadingSpaces = leadingMatch ? leadingMatch[1].length : 0;
        const trailingMatch = cellText.match(/(\s*)$/);
        const trailingSpaces = trailingMatch ? trailingMatch[1].length : 0;

        let contentStart = cellStart + leadingSpaces;
        let contentEnd = lineText.length - trailingSpaces;

        if (contentStart >= contentEnd) {
            contentStart = cellStart;
            contentEnd = contentStart;
        }

        cells.push({
            start: cellStart,
            end: lineText.length,
            contentStart: contentStart,
            contentEnd: contentEnd,
            index: cells.length
        });
    }

    return cells.length > 0 ? cells : null;
}

function getTableCellInfo(lineText: string, cursorChar: number): TableCellInfo | null {
    const cells = getAllTableCells(lineText);
    if (!cells) {
        return null;
    }

    for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        if (cursorChar >= cell.start && cursorChar <= cell.end) {
            return {
                isTable: true,
                cellIndex: i,
                cellStart: cell.start,
                cellEnd: cell.end,
                cellContentStart: cell.contentStart,
                cellContentEnd: cell.contentEnd,
                allCells: cells
            };
        }
    }

    if (lineText[cursorChar] === '|') {
        for (let i = 0; i < cells.length; i++) {
            if (cells[i].end === cursorChar) {
                return {
                    isTable: true,
                    cellIndex: i,
                    cellStart: cells[i].start,
                    cellEnd: cells[i].end,
                    cellContentStart: cells[i].contentStart,
                    cellContentEnd: cells[i].contentEnd,
                    allCells: cells
                };
            }
        }
        for (let i = 0; i < cells.length; i++) {
            if (cells[i].start === cursorChar + 1) {
                return {
                    isTable: true,
                    cellIndex: i,
                    cellStart: cells[i].start,
                    cellEnd: cells[i].end,
                    cellContentStart: cells[i].contentStart,
                    cellContentEnd: cells[i].contentEnd,
                    allCells: cells
                };
            }
        }
    }

    if (cursorChar === 0 && cells.length > 0) {
        return {
            isTable: true,
            cellIndex: -1,
            cellStart: 0,
            cellEnd: 0,
            cellContentStart: 0,
            cellContentEnd: 0,
            allCells: cells
        };
    }

    return null;
}

function isInFencedCodeBlock(document: vscode.TextDocument, lineIndex: number): boolean {
    let inFence = false;
    for (let i = 0; i <= lineIndex; i++) {
        const t = document.lineAt(i).text;
        if (t.startsWith('```')) {
            inFence = !inFence;
        }
    }
    return inFence;
}

async function applySlashCommandLine(editor: vscode.TextEditor): Promise<boolean> {
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

    // /h1〜/h6 を /heading N に前処理展開
    const rawLineText = document.lineAt(lineIdx).text;
    const lineText = expandShorthandHeading(rawLineText);

    const parsed = parseSlashCommandLine(lineText);
    if (!parsed) {
        return false;
    }

    const command = parsed.command.toLowerCase();
    debugLog(`[slash] Parsed command "${command}" with args "${parsed.argsText}"`);

    // --- toc / 目次 ---
    if (command === 'toc' || command === '目次') {
        await updateTableOfContents(editor, false);
        return true;
    }

    // --- heading ---
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

    // --- table ---
    if (command === 'table') {
        const normalizeMode = parseTableNormalizeSlashCommand(parsed.argsText);
        if (normalizeMode === null && /^(?:normalize|normilize)\b/i.test(parsed.argsText)) {
            vscode.window.showWarningMessage('無効な table normalize スラッシュコマンドです');
            return true;
        }
        if (normalizeMode !== null) {
            // ワークスペース設定に永続反映
            await vscode.workspace.getConfiguration('markdownInline.advanced')
                .update('autoFormatTables', normalizeMode, vscode.ConfigurationTarget.Workspace);
            setSlashTableNormalizeOverride(normalizeMode);
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

    // --- code [language] ---
    if (command === 'code') {
        const lang = resolveCodeLanguage(parsed.argsText);
        const lines = buildCodeBlock(lang);
        await editor.edit(eb => {
            eb.replace(new vscode.Range(lineIdx, 0, lineIdx, rawLineText.length), lines.join('\n'));
        });
        // カーソルをコードブロック内（2行目）に移動
        const innerLine = lineIdx + 1;
        editor.selection = new vscode.Selection(
            new vscode.Position(innerLine, 0),
            new vscode.Position(innerLine, 0)
        );
        return true;
    }

    // --- quote ---
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

    // --- divider ---
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

    // --- callout [type] ---
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

    // --- bullet ---
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

    // --- numbered ---
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

    // --- todo ---
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

// コマンド版 スマートEnter
async function smartEnterCommand(): Promise<void> {
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
        const indentMatch = lineText.match(/^(\s*)/);
        const _baseIndent = indentMatch ? indentMatch[1] : '';

        // チェックボックス付き
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

        // 箇条書き
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

        // 番号付き
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

        // ラベル付きリスト
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

    debugLog('[smartEnter] Edit complete, cursor should be at end of inserted text');

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
    } catch (_) {}

    if (hasOrderedList && orderedListLine >= 0) {
        const currentLine = editor.selection.active.line;
        debugLog('[smartEnter] Renumbering ordered lists from line', currentLine, '(original line was', orderedListLine, ')');
        renumberLists(editor, currentLine);
    }
}

// 全角判定
function isZeroWidthCombining(cp: number): boolean {
    return (
        (cp >= 0x0300 && cp <= 0x036F) ||
        (cp >= 0x1AB0 && cp <= 0x1AFF) ||
        (cp >= 0x1DC0 && cp <= 0x1DFF) ||
        (cp >= 0x20D0 && cp <= 0x20FF) ||
        (cp >= 0xFE20 && cp <= 0xFE2F) ||
        cp === 0x200B ||
        cp === 0x200C ||
        cp === 0x200D ||
        (cp >= 0xFE00 && cp <= 0xFE0F)
    );
}

function isFullWidthCodePoint(cp: number): boolean {
    if (cp < 0x1100) return false;
    return (
        (cp >= 0x1100 && cp <= 0x115F) ||
        cp === 0x2329 || cp === 0x232A ||
        (cp >= 0x2E80 && cp <= 0x303E) ||
        (cp >= 0x3040 && cp <= 0xA4CF) ||
        (cp >= 0xAC00 && cp <= 0xD7A3) ||
        (cp >= 0xF900 && cp <= 0xFAFF) ||
        (cp >= 0xFE10 && cp <= 0xFE19) ||
        (cp >= 0xFE30 && cp <= 0xFE6F) ||
        (cp >= 0xFF00 && cp <= 0xFF60) ||
        (cp >= 0xFFE0 && cp <= 0xFFE6) ||
        (cp >= 0x1F300 && cp <= 0x1F64F) ||
        (cp >= 0x1F900 && cp <= 0x1F9FF) ||
        (cp >= 0x20000 && cp <= 0x3FFFD)
    );
}

function getStringWidth(str: string): number {
    if (!str) return 0;
    let width = 0;
    for (const ch of str) {
        const cp = ch.codePointAt(0);
        if (cp === undefined) continue;
        if (isZeroWidthCombining(cp)) continue;
        width += isFullWidthCodePoint(cp) ? 2 : 1;
    }
    return width;
}

function getDisplayWidthWithHeuristics(text: string): number {
    if (!text) return 0;
    const s = String(text).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return 10;
    if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(s)) return Math.max(10, getStringWidth(s));
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$/.test(s)) return 16;
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(s)) return 19;

    if (/^[+-]?\d{1,3}([,\s]\d{3})+(?:[.,]\d+)?$/.test(s)) {
        return getStringWidth(s) + 1;
    }
    if (/^[+-]?\d+(?:[.,]\d+)?$/.test(s)) {
        return getStringWidth(s);
    }
    return getStringWidth(s);
}

function padCell(content: string, targetWidth: number, columnHasFullWidth = false): string {
    const current = getDisplayWidthWithHeuristics(content);
    let remain = targetWidth - current;
    if (remain < 2) remain = 2;

    const wideSpace = '　';
    const narrowSpace = ' ';

    const leftPadStr = narrowSpace;
    const rightPad = remain - 1;

    let rightPadStr = '';

    if (columnHasFullWidth) {
        let rightRemain = Math.max(1, rightPad);
        while (rightRemain >= 2) { rightPadStr += wideSpace; rightRemain -= 2; }
        while (rightRemain > 0) { rightPadStr += narrowSpace; rightRemain -= 1; }
    } else {
        rightPadStr = narrowSpace.repeat(Math.max(1, rightPad));
    }

    return leftPadStr + content + rightPadStr;
}

function splitTableLine(line: string): string[] | null {
    if (!line.includes('|')) return null;
    let cells = line.split('|');
    if (cells.length && cells[0].trim() === '') cells = cells.slice(1);
    if (cells.length && cells[cells.length - 1].trim() === '') cells = cells.slice(0, -1);
    return cells.map(c => c.trim());
}

function isSeparatorRow(cells: string[]): boolean {
    if (!cells || cells.length === 0) return false;
    return cells.every(c => /^:?-+:?$/.test(c.replace(/\s+/g, '')));
}

function findTableBlock(document: vscode.TextDocument, lineIndex: number): { start: number; end: number } {
    const lineCount = document.lineCount;
    let start = lineIndex;
    let end = lineIndex;

    for (let i = lineIndex; i >= 0; i--) {
        const t = document.lineAt(i).text;
        if (t.includes('|')) {
            start = i;
        } else if (t.trim() !== '') {
            break;
        } else {
            break;
        }
    }

    for (let i = lineIndex + 1; i < lineCount; i++) {
        const t = document.lineAt(i).text;
        if (t.includes('|')) {
            end = i;
        } else if (t.trim() !== '') {
            break;
        } else {
            break;
        }
    }
    return { start, end };
}

function formatTableAtLine(editor: vscode.TextEditor, lineIndex: number): void {
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
    if (start === undefined || end === undefined) {
        debugLog('Could not find table block');
        return;
    }
    debugLog(`Table block found: lines ${start} to ${end}`);

    const rows: TableRow[] = [];
    let maxCols = 0;
    for (let i = start; i <= end; i++) {
        const text = document.lineAt(i).text;
        if (!text.includes('|')) continue;
        const cells = splitTableLine(text);
        if (!cells || cells.length === 0) continue;
        rows.push({ line: i, cells, isSep: isSeparatorRow(cells) });
        maxCols = Math.max(maxCols, cells.length);
    }
    debugLog(`Parsed ${rows.length} rows, max columns: ${maxCols}`);

    if (rows.length < 2) {
        debugLog('Not enough rows (< 2), aborting');
        return;
    }

    if (!rows.some(r => r.isSep)) {
        debugLog('No separator row found, aborting');
        return;
    }

    const colWidths: number[] = Array(maxCols).fill(5);
    const colHasFullWidth: boolean[] = Array(maxCols).fill(false);

    for (const r of rows) {
        if (r.isSep) continue;
        for (let c = 0; c < maxCols; c++) {
            const cell = (r.cells[c] || '').trim();
            const w = Math.max(5, getDisplayWidthWithHeuristics(cell) + 2);
            if (w > colWidths[c]) colWidths[c] = w;

            if (!colHasFullWidth[c] && cell) {
                const hasFullWidth = [...cell].some(ch => {
                    const cp = ch.codePointAt(0);
                    return cp !== undefined && isFullWidthCodePoint(cp);
                });
                if (hasFullWidth) {
                    colHasFullWidth[c] = true;
                    debugLog(`Column ${c} has full-width characters: "${cell}"`);
                }
            }
        }
    }

    debugLog(`Column widths: ${colWidths.join(', ')}`);
    debugLog(`Column full-width flags: ${colHasFullWidth.join(', ')}`);

    const replacements: Replacement[] = [];
    for (const r of rows) {
        let out = '|';
        if (r.isSep) {
            for (let c = 0; c < maxCols; c++) {
                const raw = (r.cells[c] || '').replace(/\s+/g, '');
                const left = raw.startsWith(':');
                const right = raw.endsWith(':');
                const dashes = '-'.repeat(Math.max(5, colWidths[c]));
                let seg = dashes;
                if (left && right) seg = ':' + dashes.slice(1, -1) + ':';
                else if (left) seg = ':' + dashes.slice(1);
                else if (right) seg = dashes.slice(0, -1) + ':';
                out += ' ' + seg + '|';
            }
        } else {
            for (let c = 0; c < maxCols; c++) {
                const cell = (r.cells[c] || '').trim();
                const padded = padCell(cell, colWidths[c], colHasFullWidth[c]);
                out += padded + '|';
            }
        }
        replacements.push({ line: r.line, text: out });
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
            debugLog(`✗ Table formatting failed`);
        }
    });
}

function updateAllDecorations(editor: vscode.TextEditor): void {
    if (!editor || !checkedDecoration) return;

    if (!isPreviewEnabled()) {
        clearAllDecorations(editor);
        return;
    }

    debugLog(`[updateAllDecorations] Starting update (editing line: ${currentEditingLine})`);

    const document = editor.document;
    const ranges: vscode.Range[] = [];

    for (let i = 0; i < document.lineCount; i++) {
        if (i === currentEditingLine) {
            debugLog(`[updateAllDecorations] Skipping editing line ${i}`);
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
                debugLog(`[updateAllDecorations] Adding range for line ${i}: "${line.substring(startPos)}"`);
            }
        }
    }

    editor.setDecorations(checkedDecoration, ranges);
    debugLog(`[updateAllDecorations] Applied ${ranges.length} checkbox decorations`);

    updateHeadingDecorations(editor);
    updateCodeBlockDecorations(editor);
    updateHorizontalRuleDecorations(editor);
}

function clearLanguageDecorations(editor: vscode.TextEditor): void {
    for (const decorations of languageDecorations.values()) {
        for (const decoration of decorations.values()) {
            editor.setDecorations(decoration, []);
        }
    }
}

function clearAllDecorations(editor: vscode.TextEditor): void {
    if (checkedDecoration) editor.setDecorations(checkedDecoration, []);

    for (const decoration of headingDecorations) {
        editor.setDecorations(decoration, []);
    }

    if (codeBlockDecoration) {
        editor.setDecorations(codeBlockDecoration, []);
    }

    if (horizontalRuleDecoration) {
        editor.setDecorations(horizontalRuleDecoration, []);
    }

    clearLanguageDecorations(editor);
}

function updateHeadingDecorations(editor: vscode.TextEditor): void {
    if (!editor || headingDecorations.length !== 6) return;

    if (!isHeadingDecorationsEnabled()) {
        for (const decoration of headingDecorations) {
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
        editor.setDecorations(headingDecorations[l], perLevel[l]);
    }
}

function updateCodeBlockDecorations(editor: vscode.TextEditor): void {
    if (!editor || !codeBlockDecoration) return;

    if (!isCodeBlockDecorationsEnabled()) {
        editor.setDecorations(codeBlockDecoration, []);
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

    editor.setDecorations(codeBlockDecoration, backgroundRanges);

    applyLanguageHighlighting(editor, codeBlocks);
}

function applyLanguageHighlighting(editor: vscode.TextEditor, codeBlocks: CodeBlock[]): void {
    const document = editor.document;

    clearLanguageDecorations(editor);
    languageDecorations.clear();

    for (const block of codeBlocks) {
        const { language, startLine, endLine } = block;
        const syntaxRanges = getSyntaxRanges(document, language, startLine, endLine);

        if (!languageDecorations.has(language)) {
            languageDecorations.set(language, new Map());
        }

        const langDecorations = languageDecorations.get(language) ?? new Map<string, vscode.TextEditorDecorationType>();

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

function createDecorationForToken(tokenType: string): vscode.TextEditorDecorationType | null {
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

function getSyntaxRanges(
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

function updateHorizontalRuleDecorations(editor: vscode.TextEditor): void {
    if (!editor || !horizontalRuleDecoration) return;

    if (!isHorizontalRuleDecorationsEnabled()) {
        editor.setDecorations(horizontalRuleDecoration, []);
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

    editor.setDecorations(horizontalRuleDecoration, ranges);
}

function toggleCheckbox(editor: vscode.TextEditor, lineNumber: number): void {
    const line = editor.document.lineAt(lineNumber).text;
    let newLine: string;
    let shouldMoveToBottom = false;
    let cursorPosition: number | null = null;

    debugLog(`[toggleCheckbox] Toggling line ${lineNumber}: "${line}"`);

    if (line.includes('- [ ]')) {
        newLine = line.replace('- [ ]', '- [x]');
        shouldMoveToBottom = vscode.workspace.getConfiguration('markdownInline').get<boolean>('autoMoveCompletedTasks', false) ?? false;
        const checkboxEndMatch = newLine.match(/^(\s*-\s\[[xX]\]\s*)/);
        if (checkboxEndMatch) {
            cursorPosition = checkboxEndMatch[1].length;
        }
        debugLog('[toggleCheckbox] Checking checkbox');
    } else if (line.includes('- [x]') || line.includes('- [X]')) {
        newLine = line.replace(/- \[[xX]\]/, '- [ ]');
        const checkboxEndMatch = newLine.match(/^(\s*-\s\[\s\]\s*)/);
        if (checkboxEndMatch) {
            cursorPosition = checkboxEndMatch[1].length;
        }
        debugLog('[toggleCheckbox] Unchecking checkbox');
    } else {
        return;
    }

    editor.edit(editBuilder => {
        const range = new vscode.Range(
            lineNumber, 0,
            lineNumber, line.length
        );
        editBuilder.replace(range, newLine);
    }).then(() => {
        if (cursorPosition !== null) {
            const newPosition = new vscode.Position(lineNumber, cursorPosition);
            editor.selection = new vscode.Selection(newPosition, newPosition);
        }

        if (shouldMoveToBottom) {
            moveCompletedTaskToBottom(editor, lineNumber);
        }

        debugLog('[toggleCheckbox] Edit complete, updating decorations');
        updateAllDecorations(editor);
    });
}

function moveCompletedTaskToBottom(editor: vscode.TextEditor, lineNumber: number): void {
    const document = editor.document;
    const currentLine = document.lineAt(lineNumber).text;
    const indentMatch = currentLine.match(/^\s*/);
    const currentIndent = indentMatch ? indentMatch[0].length : 0;
    const isCompleted = currentLine.match(/^\s*-\s\[[xX]\]/);

    let taskStart = lineNumber;
    let taskEnd = lineNumber;
    let lastUncheckedLine = -1;
    let firstCheckedLine = -1;
    const tasks: TaskInfo[] = [];

    for (let i = lineNumber - 1; i >= 0; i--) {
        const line = document.lineAt(i).text;
        if (line.trim() === '') break;

        const lineIndentMatch = line.match(/^\s*/);
        const lineIndent = lineIndentMatch ? lineIndentMatch[0].length : 0;
        if (lineIndent < currentIndent) break;
        if (lineIndent === currentIndent && line.match(/^\s*-\s\[[ xX]\]/)) {
            taskStart = i;
        }
        if (lineIndent > currentIndent) break;
    }

    for (let i = lineNumber + 1; i < document.lineCount; i++) {
        const line = document.lineAt(i).text;
        if (line.trim() === '') break;

        const lineIndentMatch = line.match(/^\s*/);
        const lineIndent = lineIndentMatch ? lineIndentMatch[0].length : 0;
        if (lineIndent < currentIndent) break;
        if (lineIndent === currentIndent && line.match(/^\s*-\s\[[ xX]\]/)) {
            taskEnd = i;
        }
        if (lineIndent > currentIndent) break;
    }

    for (let i = taskStart; i <= taskEnd; i++) {
        const line = document.lineAt(i).text;
        const lineIndentMatch = line.match(/^\s*/);
        const lineIndent = lineIndentMatch ? lineIndentMatch[0].length : 0;

        if (lineIndent === currentIndent && line.match(/^\s*-\s\[[ xX]\]/)) {
            const isChecked = line.match(/^\s*-\s\[[xX]\]/);
            tasks.push({ line: i, text: line, isChecked: !!isChecked });

            if (!isChecked && i !== lineNumber) {
                lastUncheckedLine = i;
            }
            if (isChecked && firstCheckedLine === -1 && i !== lineNumber) {
                firstCheckedLine = i;
            }
        }
    }

    let targetLine = -1;

    if (isCompleted) {
        targetLine = lastUncheckedLine !== -1 ? lastUncheckedLine : taskEnd;
    } else {
        if (firstCheckedLine !== -1) {
            targetLine = firstCheckedLine - 1;
        }
    }

    if (targetLine !== -1 && targetLine !== lineNumber) {
        editor.edit(editBuilder => {
            const textToMove = currentLine + '\n';

            if (targetLine < lineNumber) {
                editBuilder.insert(new vscode.Position(targetLine + 1, 0), textToMove);
                editBuilder.delete(new vscode.Range(
                    lineNumber + 1, 0,
                    lineNumber + 2, 0
                ));
            } else {
                editBuilder.delete(new vscode.Range(
                    lineNumber, 0,
                    lineNumber + 1, 0
                ));
                editBuilder.insert(new vscode.Position(targetLine, 0), textToMove);
            }
        }).then(() => {
            const action = isCompleted ? 'completed' : 'unchecked';
            debugLog(`[moveCompletedTaskToBottom] Moved ${action} task from line ${lineNumber} to ${targetLine}`);
        });
    }
}

function adjustIndent(editor: vscode.TextEditor, increase: boolean): void {
    const selection = editor.selection;
    const document = editor.document;
    const indentStr = '  ';

    if (selection.isEmpty) {
        const position = selection.active;
        const lineText = document.lineAt(position.line).text;
        const cellInfo = getTableCellInfo(lineText, position.character);

        if (cellInfo && cellInfo.isTable && cellInfo.cellIndex >= 0) {
            if (increase) {
                if (cellInfo.cellIndex < cellInfo.allCells.length - 1) {
                    const nextCell = cellInfo.allCells[cellInfo.cellIndex + 1];
                    const newPosition = new vscode.Position(position.line, nextCell.contentStart);
                    editor.selection = new vscode.Selection(newPosition, newPosition);
                } else {
                    const nextLineIndex = position.line + 1;
                    if (nextLineIndex < document.lineCount) {
                        const nextLineText = document.lineAt(nextLineIndex).text;
                        const nextLineCells = getAllTableCells(nextLineText);
                        if (nextLineCells && nextLineCells.length > 0) {
                            const newPosition = new vscode.Position(nextLineIndex, nextLineCells[0].contentStart);
                            editor.selection = new vscode.Selection(newPosition, newPosition);
                        }
                    }
                }
            } else {
                if (cellInfo.cellIndex > 0) {
                    const prevCell = cellInfo.allCells[cellInfo.cellIndex - 1];
                    const newPosition = new vscode.Position(position.line, prevCell.contentStart);
                    editor.selection = new vscode.Selection(newPosition, newPosition);
                } else {
                    const prevLineIndex = position.line - 1;
                    if (prevLineIndex >= 0) {
                        const prevLineText = document.lineAt(prevLineIndex).text;
                        const prevLineCells = getAllTableCells(prevLineText);
                        if (prevLineCells && prevLineCells.length > 0) {
                            const lastCell = prevLineCells[prevLineCells.length - 1];
                            const newPosition = new vscode.Position(prevLineIndex, lastCell.contentStart);
                            editor.selection = new vscode.Selection(newPosition, newPosition);
                        }
                    }
                }
            }
            return;
        }
    }

    if (!selection.isEmpty) {
        const startLine = selection.start.line;
        const endLine = selection.end.line;

        editor.edit(editBuilder => {
            for (let i = startLine; i <= endLine; i++) {
                const line = document.lineAt(i).text;
                const range = new vscode.Range(i, 0, i, line.length);

                if (increase) {
                    editBuilder.replace(range, indentStr + line);
                } else {
                    let newLine = line;
                    if (/^\t/.test(newLine)) {
                        newLine = newLine.replace(/^\t/, '');
                    } else if (newLine.startsWith('  ')) {
                        newLine = newLine.slice(2);
                    } else if (/^ /.test(newLine)) {
                        newLine = newLine.slice(1);
                    }
                    if (newLine !== line) editBuilder.replace(range, newLine);
                }
            }
        }).then(() => {
            try {
                renumberLists(editor);
            } catch (_) {}
        });
    } else {
        const line = document.lineAt(selection.active.line).text;
        const cursorPos = selection.active.character;

        editor.edit(editBuilder => {
            const range = new vscode.Range(
                selection.active.line, 0,
                selection.active.line, line.length
            );

            if (increase) {
                editBuilder.replace(range, indentStr + line);
            } else {
                let newLine = line;
                if (/^\t/.test(newLine)) {
                    newLine = newLine.replace(/^\t/, '');
                } else if (newLine.startsWith('  ')) {
                    newLine = newLine.slice(2);
                } else if (/^ /.test(newLine)) {
                    newLine = newLine.slice(1);
                }
                if (newLine !== line) editBuilder.replace(range, newLine);
            }
        }).then(() => {
            if (increase) {
                const newPosition = new vscode.Position(selection.active.line, cursorPos + 2);
                editor.selection = new vscode.Selection(newPosition, newPosition);
            } else {
                const currentLine = document.lineAt(selection.active.line).text;
                const diff = line.length - currentLine.length;
                const newPos = Math.max(0, cursorPos - diff);
                const newPosition = new vscode.Position(selection.active.line, newPos);
                editor.selection = new vscode.Selection(newPosition, newPosition);
            }
            try {
                renumberLists(editor);
            } catch (_) {}
        });
    }
}

function convertLineToType(editor: vscode.TextEditor, targetType: ConvertType): void {
    const document = editor.document;
    const selection = editor.selection;
    const startLine = selection.start.line;
    const endLine = selection.end.line;

    editor.edit(editBuilder => {
        for (let i = startLine; i <= endLine; i++) {
            const line = document.lineAt(i).text;

            let quotePrefix = '';
            let restOfLine = line;
            const quoteMatch = line.match(/^((?:>\s*)+)/);
            if (quoteMatch) {
                quotePrefix = quoteMatch[1];
                restOfLine = line.substring(quotePrefix.length);
            }

            let indent = '';
            let content = '';
            let match: RegExpMatchArray | null;

            if ((match = restOfLine.match(/^(\s*)-\s\[[xX ]?\]\s+(.*)$/))) {
                indent = match[1];
                content = match[2];
            } else if ((match = restOfLine.match(/^(\s*)[-*+]\s+(.*)$/))) {
                indent = match[1];
                content = match[2];
            } else if ((match = restOfLine.match(/^(\s*)\d+[\.)]\s+(.*)$/))) {
                indent = match[1];
                content = match[2];
            } else if ((match = restOfLine.match(/^(\s*)(.*)$/))) {
                indent = match[1];
                content = match[2];
            } else {
                continue;
            }

            let newLine = '';
            switch (targetType) {
                case 'bullet':
                    newLine = `${quotePrefix}${indent}- ${content}`;
                    break;
                case 'numbered':
                    newLine = `${quotePrefix}${indent}1. ${content}`;
                    break;
                case 'checkbox':
                    newLine = `${quotePrefix}${indent}- [ ] ${content}`;
                    break;
                case 'normal':
                    newLine = `${quotePrefix}${indent}${content}`;
                    break;
            }

            const range = new vscode.Range(i, 0, i, line.length);
            editBuilder.replace(range, newLine);
        }
    }).then(() => {
        if (targetType === 'numbered') {
            try {
                renumberLists(editor);
            } catch (_) {}
        }
    });
}

function getIndentLevel(indentStr: string): number {
    if (!indentStr) return 0;

    const tabs = (indentStr.match(/\t/g) ?? []).length;
    const spaces = (indentStr.match(/ /g) ?? []).length;

    return tabs + Math.ceil(spaces / 2);
}

function renumberLists(editor: vscode.TextEditor, lineNumber: number | null = null): void {
    const document = editor.document;
    const selection = editor.selection;
    const currentLine = lineNumber ?? selection.active.line;

    const lineText = document.lineAt(currentLine).text;
    const match = lineText.match(/^(\s*)(\d+)([\.)])\s*/);

    if (!match) {
        return;
    }

    let startLine = currentLine;
    let endLine = currentLine;

    for (let i = currentLine - 1; i >= 0; i--) {
        const text = document.lineAt(i).text;

        if (text.trim() === '') {
            break;
        }

        if (text.match(/^(\s*)(\d+)([\.)])\s*/)) {
            startLine = i;
        } else {
            break;
        }
    }

    for (let i = currentLine + 1; i < document.lineCount; i++) {
        const text = document.lineAt(i).text;

        if (text.trim() === '') {
            break;
        }

        if (text.match(/^(\s*)(\d+)([\.)])\s*/)) {
            endLine = i;
        } else {
            break;
        }
    }

    const indentCounters = new Map<number, number>();
    let previousLevel = -1;

    editor.edit(editBuilder => {
        for (let i = startLine; i <= endLine; i++) {
            const line = document.lineAt(i).text;

            if (line.trim() === '') {
                continue;
            }

            const m = line.match(/^(\s*)(\d+)([\.)])\s*(.*)/);

            if (m) {
                const indent = m[1];
                const punct = m[3];
                const content = m[4];

                const level = getIndentLevel(indent);

                if (level < previousLevel) {
                    for (const [key] of indentCounters.entries()) {
                        if (key > level) {
                            indentCounters.delete(key);
                        }
                    }
                }

                if (!indentCounters.has(level)) {
                    indentCounters.set(level, 1);
                } else {
                    indentCounters.set(level, (indentCounters.get(level) ?? 0) + 1);
                }

                for (const [key] of indentCounters.entries()) {
                    if (key > level) {
                        indentCounters.delete(key);
                    }
                }

                previousLevel = level;
                const newNumber = indentCounters.get(level) ?? 1;
                const newLine = content.length > 0
                    ? `${indent}${newNumber}${punct} ${content}`
                    : `${indent}${newNumber}${punct} `;

                const range = new vscode.Range(i, 0, i, line.length);
                editBuilder.replace(range, newLine);
            }
        }
    });
}

function moveLineWithHierarchy(editor: vscode.TextEditor | undefined, direction: Direction): void {
    if (!editor) return;

    const selection = editor.selection;
    const startLine = selection.start.line;
    const endLine = selection.end.line;
    const document = editor.document;

    if (direction === 'up' && startLine === 0) return;
    if (direction === 'down' && endLine === document.lineCount - 1) return;

    const indentMatch = document.lineAt(startLine).text.match(/^\s*/);
    const currentIndent = indentMatch ? indentMatch[0].length : 0;
    let blockEndLine = endLine;

    for (let i = endLine + 1; i < document.lineCount; i++) {
        const line = document.lineAt(i).text;
        if (line.trim() === '') break;
        const lineIndentMatch = line.match(/^\s*/);
        const indent = lineIndentMatch ? lineIndentMatch[0].length : 0;
        if (indent <= currentIndent) break;
        blockEndLine = i;
    }

    let targetIndent = currentIndent;
    const targetLine = direction === 'up' ? startLine - 1 : blockEndLine + 1;

    if (direction === 'up') {
        if (targetLine >= 0) {
            const targetText = document.lineAt(targetLine).text;
            if (targetText.trim() !== '') {
                if (targetText.match(/^\s*[-*+\d]|^\s*-\s\[/)) {
                    const targetIndentMatch = targetText.match(/^\s*/);
                    targetIndent = targetIndentMatch ? targetIndentMatch[0].length : 0;
                }
            }
        }
    } else {
        if (targetLine < document.lineCount) {
            const targetText = document.lineAt(targetLine).text;
            if (targetText.trim() !== '') {
                if (targetText.match(/^\s*[-*+\d]|^\s*-\s\[/)) {
                    const targetIndentMatch = targetText.match(/^\s*/);
                    targetIndent = targetIndentMatch ? targetIndentMatch[0].length : 0;
                }
            }
        }
    }

    const indentDiff = targetIndent - currentIndent;
    const indentString = indentDiff > 0 ? ' '.repeat(indentDiff) : '';

    editor.edit(editBuilder => {
        const lines: string[] = [];
        for (let i = startLine; i <= blockEndLine; i++) {
            let lineText = document.lineAt(i).text;
            if (indentDiff > 0) {
                lineText = indentString + lineText;
            } else if (indentDiff < 0) {
                lineText = lineText.substring(-indentDiff);
            }
            lines.push(lineText);
        }
        const blockText = lines.join('\n');

        if (direction === 'up') {
            const lineAbove = document.lineAt(targetLine).text;

            const deleteRange = new vscode.Range(
                targetLine, 0,
                blockEndLine + 1, 0
            );
            const newText = blockText + '\n' + lineAbove + '\n';
            editBuilder.replace(deleteRange, newText);
        } else {
            const lineBelow = document.lineAt(targetLine).text;

            const deleteRange = new vscode.Range(
                startLine, 0,
                targetLine + 1, 0
            );
            const newText = lineBelow + '\n' + blockText + '\n';
            editBuilder.replace(deleteRange, newText);
        }
    }).then(() => {
        const lineDiff = direction === 'up' ? -1 : 1;
        const newSelection = new vscode.Selection(
            startLine + lineDiff, selection.start.character,
            endLine + lineDiff, selection.end.character
        );
        editor.selection = newSelection;
        try {
            formatTableAtLine(editor, editor.selection.active.line);
        } catch (_) {}
    });
}

function applyMarkdownSettings(): void {
    const config = vscode.workspace.getConfiguration();
    config.update('markdown.extension.completion.enabled', false, vscode.ConfigurationTarget.Workspace);
    config.update('markdown.extension.tableFormatter.enabled', false, vscode.ConfigurationTarget.Workspace);
    debugLog('Disabled competing Markdown extension features (completion/tableFormatter)');
}

export function deactivate(): void {
    if (checkedDecoration) {
        checkedDecoration.dispose();
        checkedDecoration = null;
    }
    if (headingDecorations && headingDecorations.length) {
        headingDecorations.forEach(d => d.dispose());
        headingDecorations = [];
    }
    if (codeBlockDecoration) {
        codeBlockDecoration.dispose();
        codeBlockDecoration = null;
    }
    if (horizontalRuleDecoration) {
        horizontalRuleDecoration.dispose();
        horizontalRuleDecoration = null;
    }
    for (const decorations of languageDecorations.values()) {
        for (const decoration of decorations.values()) {
            decoration.dispose();
        }
    }
    languageDecorations.clear();
    if (updateTimer) {
        clearTimeout(updateTimer);
    }
    if (tocUpdateTimer) {
        clearTimeout(tocUpdateTimer);
    }
}
