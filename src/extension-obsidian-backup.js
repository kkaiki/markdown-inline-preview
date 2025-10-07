const vscode = require('vscode');

let decorationTypes = new Map();
let currentLineDecorations = null;
let lastActiveLine = -1;
let isComposing = false; // IME入力中フラグ
let formatTimer = null; // フォーマットのタイマー
let lastTableLine = -1; // 最後に編集したテーブル行
let pendingTableFormat = null; // 保留中のテーブル整形
let updateTimer = null; // 装飾更新のデバウンスタイマー
let headingDecorations = new Map(); // 見出し装飾を永続的に保持
let lastFullUpdateTime = 0; // 最後の全体更新時刻
let changedLines = new Set(); // 変更された行を記録

// 装飾タイプのキャッシュ
const decorationCache = {
    checkbox: null,
    checkboxStrikethrough: null,
    heading1: null,
    heading2: null,
    heading3: null,
    heading4: null,
    heading5: null,
    heading6: null,
    hr: null,
    focused: null
};

// グローバルなチェックボックス装飾（一度だけ作成）
let globalCheckedDecoration = null;

// 装飾タイプを取得または作成
function getDecorationType(type, options) {
    if (!decorationCache[type]) {
        decorationCache[type] = vscode.window.createTextEditorDecorationType(options);
    }
    return decorationCache[type];
}

// CodeLens Provider クラス（無効化）
class CheckboxCodeLensProvider {
    constructor() {
        this.onDidChangeCodeLenses = new vscode.EventEmitter();
        this.onDidChangeCodeLensesEvent = this.onDidChangeCodeLenses.event;
    }
    
    provideCodeLenses(document, token) {
        // CodeLensを無効化（クリック領域のみ使用）
        return [];
    }
    
    resolveCodeLens(codeLens, token) {
        return codeLens;
    }
}

function activate(context) {
    console.log('Obsidian-like Markdown Editor is active');
    
    // グローバルなチェックボックス装飾を初期化
    try {
        globalCheckedDecoration = vscode.window.createTextEditorDecorationType({
            textDecoration: 'line-through',
            opacity: '0.6'
        });
        console.log('[activate] globalCheckedDecoration created successfully');
    } catch (error) {
        console.error('[activate] Failed to create globalCheckedDecoration:', error);
    }
    
    // Markdown編集時のIntelliSenseを完全に無効化
    
    // 1. 言語設定を変更して自動補完を抑制
    vscode.languages.setLanguageConfiguration('markdown', {
        // 自動補完トリガー文字を空にする
        wordPattern: /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g,
    });
    
    // 2. 補完プロバイダーを上書き（優先度を最高にして他のプロバイダーを上書き）
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            'markdown', 
            {
                provideCompletionItems(document, position) {
                    // 完全に空のCompletionListを返して他のプロバイダーを無効化
                    const completionList = new vscode.CompletionList([], false);
                    completionList.isIncomplete = false;
                    return completionList;
                }
            }, 
            // すべての可能なトリガー文字をカバー
            ...'./?\\:-_[](){}〈〉<>*#!@$%^&=+|`~"\'`（）【】「」『』,;abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('')
        )
    );
    
    // 統合されたテキスト変更ハンドラー
    let textChangeTimer = null;
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(event => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document !== event.document || 
                editor.document.languageId !== 'markdown') return;
            
            // 補完ウィンドウを閉じる
            vscode.commands.executeCommand('hideSuggestWidget');
            
            // 変更された行を記録
            event.contentChanges.forEach(change => {
                const startLine = change.range.start.line;
                const endLine = startLine + change.text.split('\n').length - 1;
                
                for (let i = startLine; i <= endLine; i++) {
                    changedLines.add(i);
                }
            });
            
            // 変更行を記録
            event.contentChanges.forEach(change => {
                const startLine = change.range.start.line;
                const endLine = change.range.end.line;
                const linesAdded = change.text.split('\n').length - 1;
                const totalLines = endLine + linesAdded + 1;
                
                for (let i = startLine; i <= totalLines; i++) {
                    changedLines.add(i);
                }
            });
            
            // CSV→テーブル変換処理
            if (event.contentChanges.length > 0) {
                const change = event.contentChanges[0];
                const lineNumber = change.range.start.line;
                if (lineNumber < editor.document.lineCount) {
                    const lineText = editor.document.lineAt(lineNumber).text;
                    if (lineText.includes(',') && !lineText.includes('|') && change.text.includes('\n')) {
                        convertCSVToTable(editor, lineNumber, lineText);
                    }
                }
            }
            
            // デバウンス処理
            if (textChangeTimer) clearTimeout(textChangeTimer);
            textChangeTimer = setTimeout(() => {
                console.log('[onDidChangeTextDocument] Timer fired, calling updateDecorations');
                updateDecorations(editor, false, changedLines);
                changedLines.clear();
            }, 100); // デバウンス時間を短縮
        })
    );
    
    // エディタ変更の監視
    vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor && editor.document.languageId === 'markdown') {
            updateDecorations(editor, true); // エディタ変更時は即座に実行
        }
    }, null, context.subscriptions);
    
    // カーソル位置変更の監視（軽量化）
    let cursorMoveTimer = null;
    vscode.window.onDidChangeTextEditorSelection(event => {
        const editor = event.textEditor;
        if (!editor || editor.document.languageId !== 'markdown') return;
        
        const currentLine = editor.selection.active.line;
        
        // テーブル整形（シンプル化）
        if (lastTableLine !== -1 && lastTableLine !== currentLine) {
            const lastLineText = editor.document.lineAt(lastTableLine).text;
            if (lastLineText.includes('|') && lastLineText.trim().startsWith('|')) {
                formatTableAtLine(editor, lastTableLine);
            }
        }
        
        // 現在の行がテーブル行かチェック（シンプル化）
        const currentLineText = editor.document.lineAt(currentLine).text;
        lastTableLine = currentLineText.includes('|') && currentLineText.trim().startsWith('|') ? currentLine : -1;
        
        // カーソル移動時の更新（デバウンス）
        if (cursorMoveTimer) clearTimeout(cursorMoveTimer);
        cursorMoveTimer = setTimeout(() => {
            console.log('[onDidChangeTextEditorSelection] Cursor timer fired, calling updateDecorations');
            // カーソル行周辺のみ更新
            const linesToUpdate = new Set();
            for (let i = Math.max(0, currentLine - 1); i <= Math.min(editor.document.lineCount - 1, currentLine + 1); i++) {
                linesToUpdate.add(i);
            }
            if (lastActiveLine !== -1 && lastActiveLine !== currentLine) {
                linesToUpdate.add(lastActiveLine);
            }
            updateDecorations(editor, false, linesToUpdate);
            lastActiveLine = currentLine;
            
            // カーソル移動時には変更行をクリア
            changedLines.clear();
        }, 50);
    }, null, context.subscriptions);
    
    // IME入力開始/終了の監視
    vscode.workspace.onDidChangeTextDocument(event => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document !== event.document || 
            editor.document.languageId !== 'markdown') {
            return;
        }
        
        if (event.contentChanges.length === 0) {
            return;
        }
        
        const change = event.contentChanges[0];
        const lineNumber = change.range.start.line;
        const lineText = editor.document.lineAt(lineNumber).text;
        
        // CSVデータをテーブルに変換（Enterキーが押された時）
        if (lineText.includes(',') && !lineText.includes('|') && change.text.includes('\n')) {
            setTimeout(() => {
                convertCSVToTableFormat(editor, lineNumber);
            }, 100);
        }
        
        // テーブル行の整形 - 無効化
        // if (lineText.includes('|')) {
        //     // IME入力中は整形をスキップ
        //     if (isComposing) {
        //         return;
        //     }
        //     
        //     // 既存のタイマーをクリア
        //     if (formatTimer) {
        //         clearTimeout(formatTimer);
        //     }
        //     
        //     // パイプ記号・Enterキー・タブキーが入力された場合は即座に整形
        //     if (change.text === '|' || change.text.includes('\n') || change.text === '\t') {
        //         formatTimer = setTimeout(() => {
        //             formatTableAtLine(editor, lineNumber);
        //         }, 100);
        //     } else {
        //         // その他の文字入力の場合は遅延を長めに設定（IME確定待ち）
        //         formatTimer = setTimeout(() => {
        //             formatTableAtLine(editor, lineNumber);
        //         }, 800);
        //     }
        // }
        
        // 変更行のみを更新
        if (changedLines.size > 0) {
            // 変更行が多い場合は全体更新
            if (changedLines.size > 20) {
                updateDecorations(editor, false);
                changedLines.clear();
            } else {
                updateDecorations(editor, false, new Set(changedLines));
            }
        }
    }, null, context.subscriptions);
    
    // IMEコンポジション開始/終了イベントの処理
    const compositionHandler = vscode.workspace.onDidChangeTextDocument(event => {
        // VSCodeでは直接compositionイベントを取得できないため、
        // 変更パターンから推測
        if (event.contentChanges.length > 0) {
            const change = event.contentChanges[0];
            // 日本語文字が含まれている場合、IME入力中と判定
            if (change.text && /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/.test(change.text)) {
                isComposing = true;
                // 一定時間後にIMEフラグをリセット
                setTimeout(() => {
                    isComposing = false;
                }, 1000);
            }
        }
    });
    context.subscriptions.push(compositionHandler);
    
    // チェックボックスのトグルコマンド
    context.subscriptions.push(
        vscode.commands.registerCommand('obsidianMarkdown.toggleCheckbox', () => {
            toggleCheckboxAtCursor();
        })
    );
    
    // マウスクリックイベントのハンドリング（チェックボックス用）
    context.subscriptions.push(
        vscode.commands.registerTextEditorCommand('obsidianMarkdown.clickCheckbox', (textEditor, edit, args) => {
            if (args && args.lineNumber !== undefined) {
                toggleCheckboxAtLine(textEditor, args.lineNumber);
            }
        })
    );
    
    // CodeLens用のコマンド（行番号を引数として受け取る）
    context.subscriptions.push(
        vscode.commands.registerCommand('obsidianMarkdown.toggleCheckboxAtLine', (lineNumber) => {
            const editor = vscode.window.activeTextEditor;
            if (editor && typeof lineNumber === 'number') {
                toggleCheckboxAtLine(editor, lineNumber);
            }
        })
    );
    
    // ドキュメントクリックイベントのハンドリング（チェックボックスのクリック領域）
    // クリック履歴を記録する変数
    let lastToggleTime = 0;
    let lastToggleLine = -1;
    
    context.subscriptions.push(
        vscode.window.onDidChangeTextEditorSelection(event => {
            const editor = event.textEditor;
            if (!editor || editor.document.languageId !== 'markdown') return;
            
            // マウスクリック検出
            if (event.kind === vscode.TextEditorSelectionChangeKind.Mouse) {
                const position = event.selections[0].active;
                const line = editor.document.lineAt(position.line);
                const text = line.text;
                
                // チェックボックス行かどうか確認
                const checkboxMatch = text.match(/^(\s*)-\s\[[\sx]?\]/i);
                if (checkboxMatch) {
                    // チェックボックス部分がクリックされた場合
                    const checkboxEndPos = checkboxMatch[0].length;
                    if (position.character <= checkboxEndPos) {
                        const currentTime = Date.now();
                        
                        // 同じ行で短時間の連続クリックを防ぐ（200ms以上の間隔が必要）
                        // ただし、異なる行なら即座にトグル可能
                        const canToggle = (lastToggleLine !== position.line) || 
                                         (currentTime - lastToggleTime) > 200;
                        
                        if (canToggle) {
                            // トグル情報を更新
                            lastToggleTime = currentTime;
                            lastToggleLine = position.line;
                            
                            // 少し遅延してトグル（選択状態を防ぐため）
                            setTimeout(() => {
                                console.log('[Mouse Click] Toggling checkbox at line', position.line);
                                toggleCheckboxAtLine(editor, position.line);
                                // カーソルをチェックボックスの後ろに移動（選択を解除）
                                const newPosition = new vscode.Position(position.line, checkboxEndPos);
                                editor.selection = new vscode.Selection(newPosition, newPosition);
                            }, 50);
                        }
                    }
                }
            }
        })
    );
    
    // テーブル整形コマンドの登録
    context.subscriptions.push(
        vscode.commands.registerCommand('obsidianMarkdown.formatTable', () => {
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.languageId === 'markdown') {
                const position = editor.selection.active;
                formatTableAtLine(editor, position.line);
            }
        })
    );
    
    // インデント増加コマンド（Tab キー）
    context.subscriptions.push(
        vscode.commands.registerCommand('obsidianMarkdown.increaseIndent', () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.languageId !== 'markdown') return;
            
            editor.edit(editBuilder => {
                const selections = editor.selections;
                selections.forEach(selection => {
                    const line = editor.document.lineAt(selection.active.line);
                    const lineText = line.text;
                    
                    // チェックボックスまたは箇条書きの場合
                    if (lineText.match(/^\s*-\s\[[\sx]\]/i) || lineText.match(/^\s*-\s/)) {
                        // 行頭にスペース2つを追加
                        editBuilder.insert(new vscode.Position(selection.active.line, 0), '  ');
                    } else {
                        // 通常のタブ挿入
                        vscode.commands.executeCommand('tab');
                    }
                });
            });
        })
    );
    
    // インデント減少コマンド（Shift+Tab キー）
    context.subscriptions.push(
        vscode.commands.registerCommand('obsidianMarkdown.decreaseIndent', () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.languageId !== 'markdown') return;
            
            editor.edit(editBuilder => {
                const selections = editor.selections;
                selections.forEach(selection => {
                    const line = editor.document.lineAt(selection.active.line);
                    const lineText = line.text;
                    
                    // チェックボックスまたは箇条書きの場合
                    if (lineText.match(/^\s*-\s\[[\sx]\]/i) || lineText.match(/^\s*-\s/)) {
                        // 行頭のスペースを2つ削除（存在する場合）
                        if (lineText.startsWith('  ')) {
                            editBuilder.delete(new vscode.Range(
                                new vscode.Position(selection.active.line, 0),
                                new vscode.Position(selection.active.line, 2)
                            ));
                        } else if (lineText.startsWith(' ')) {
                            // スペースが1つしかない場合は1つ削除
                            editBuilder.delete(new vscode.Range(
                                new vscode.Position(selection.active.line, 0),
                                new vscode.Position(selection.active.line, 1)
                            ));
                        }
                    } else {
                        // 通常のShift+Tab
                        vscode.commands.executeCommand('outdent');
                    }
                });
            });
        })
    );
    
    // スマート選択コマンド（Shift+Cmd+左矢印）
    context.subscriptions.push(
        vscode.commands.registerCommand('obsidianMarkdown.smartSelectLeft', () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.languageId !== 'markdown') return;
            
            const selection = editor.selection;
            const line = editor.document.lineAt(selection.active.line);
            const lineText = line.text;
            
            // チェックボックス行の場合
            const checkboxMatch = lineText.match(/^(\s*)(-\s\[[\sx]?\]\s*)(.*)/i);
            const listMatch = lineText.match(/^(\s*)(-\s+)(.*)/);
            const numberedListMatch = lineText.match(/^(\s*)(\d+\.\s+)(.*)/);
            
            if (checkboxMatch) {
                const indent = checkboxMatch[1]; // インデント部分
                const checkboxPart = checkboxMatch[2]; // "- [ ] " の部分
                const textPart = checkboxMatch[3]; // テキストの部分
                const indentEndPos = indent.length;
                const checkboxEndPos = indentEndPos + checkboxPart.length;
                
                // 現在の選択範囲を確認
                const currentSelStart = selection.start.character;
                const currentSelEnd = selection.end.character;
                
                // 段階1: 選択なし → テキスト部分のみを選択（チェックボックスとインデントを除く）
                if (selection.isEmpty) {
                    const newSelection = new vscode.Selection(
                        new vscode.Position(selection.active.line, checkboxEndPos),
                        new vscode.Position(selection.active.line, lineText.length)
                    );
                    editor.selection = newSelection;
                }
                // 段階2: テキスト部分が選択されている → チェックボックスを含めて選択（インデントは除く）
                else if (currentSelStart === checkboxEndPos && currentSelEnd === lineText.length) {
                    const newSelection = new vscode.Selection(
                        new vscode.Position(selection.active.line, indentEndPos),
                        new vscode.Position(selection.active.line, lineText.length)
                    );
                    editor.selection = newSelection;
                }
                // 段階3: チェックボックスとテキストが選択されている → 行全体を選択（インデントも含む）
                else if (currentSelStart === indentEndPos && currentSelEnd === lineText.length) {
                    const newSelection = new vscode.Selection(
                        new vscode.Position(selection.active.line, 0),
                        new vscode.Position(selection.active.line, lineText.length)
                    );
                    editor.selection = newSelection;
                }
                // 段階4: 行全体が選択されている → カーソルを行頭に移動（選択解除）
                else if (currentSelStart === 0 && currentSelEnd === lineText.length) {
                    const newSelection = new vscode.Selection(
                        new vscode.Position(selection.active.line, 0),
                        new vscode.Position(selection.active.line, 0)
                    );
                    editor.selection = newSelection;
                }
                else {
                    // その他の場合は、テキスト部分のみを選択
                    const newSelection = new vscode.Selection(
                        new vscode.Position(selection.active.line, checkboxEndPos),
                        new vscode.Position(selection.active.line, lineText.length)
                    );
                    editor.selection = newSelection;
                }
            } 
            // 通常の箇条書き行の場合
            else if (listMatch) {
                const indent = listMatch[1]; // インデント部分
                const listPart = listMatch[2]; // "- " の部分
                const textPart = listMatch[3]; // テキストの部分
                const indentEndPos = indent.length;
                const listEndPos = indentEndPos + listPart.length;
                
                // 現在の選択範囲を確認
                const currentSelStart = selection.start.character;
                const currentSelEnd = selection.end.character;
                
                // 段階1: 選択なし → テキスト部分のみを選択（箇条書き記号とインデントを除く）
                if (selection.isEmpty) {
                    const newSelection = new vscode.Selection(
                        new vscode.Position(selection.active.line, listEndPos),
                        new vscode.Position(selection.active.line, lineText.length)
                    );
                    editor.selection = newSelection;
                }
                // 段階2: テキスト部分が選択されている → 箇条書き記号を含めて選択（インデントは除く）
                else if (currentSelStart === listEndPos && currentSelEnd === lineText.length) {
                    const newSelection = new vscode.Selection(
                        new vscode.Position(selection.active.line, indentEndPos),
                        new vscode.Position(selection.active.line, lineText.length)
                    );
                    editor.selection = newSelection;
                }
                // 段階3: 箇条書き記号とテキストが選択されている → 行全体を選択（インデントも含む）
                else if (currentSelStart === indentEndPos && currentSelEnd === lineText.length) {
                    const newSelection = new vscode.Selection(
                        new vscode.Position(selection.active.line, 0),
                        new vscode.Position(selection.active.line, lineText.length)
                    );
                    editor.selection = newSelection;
                }
                // 段階4: 行全体が選択されている → カーソルを行頭に移動（選択解除）
                else if (currentSelStart === 0 && currentSelEnd === lineText.length) {
                    const newSelection = new vscode.Selection(
                        new vscode.Position(selection.active.line, 0),
                        new vscode.Position(selection.active.line, 0)
                    );
                    editor.selection = newSelection;
                }
                else {
                    // その他の場合は、テキスト部分のみを選択
                    const newSelection = new vscode.Selection(
                        new vscode.Position(selection.active.line, listEndPos),
                        new vscode.Position(selection.active.line, lineText.length)
                    );
                    editor.selection = newSelection;
                }
            } 
            // 数字の箇条書き行の場合
            else if (numberedListMatch) {
                const indent = numberedListMatch[1]; // インデント部分
                const numberPart = numberedListMatch[2]; // "1. " の部分
                const textPart = numberedListMatch[3]; // テキストの部分
                const indentEndPos = indent.length;
                const numberEndPos = indentEndPos + numberPart.length;
                
                // 現在の選択範囲を確認
                const currentSelStart = selection.start.character;
                const currentSelEnd = selection.end.character;
                
                // 段階1: 選択なし → テキスト部分のみを選択（数字とインデントを除く）
                if (selection.isEmpty) {
                    const newSelection = new vscode.Selection(
                        new vscode.Position(selection.active.line, numberEndPos),
                        new vscode.Position(selection.active.line, lineText.length)
                    );
                    editor.selection = newSelection;
                }
                // 段階2: テキスト部分が選択されている → 数字を含めて選択（インデントは除く）
                else if (currentSelStart === numberEndPos && currentSelEnd === lineText.length) {
                    const newSelection = new vscode.Selection(
                        new vscode.Position(selection.active.line, indentEndPos),
                        new vscode.Position(selection.active.line, lineText.length)
                    );
                    editor.selection = newSelection;
                }
                // 段階3: 数字とテキストが選択されている → 行全体を選択（インデントも含む）
                else if (currentSelStart === indentEndPos && currentSelEnd === lineText.length) {
                    const newSelection = new vscode.Selection(
                        new vscode.Position(selection.active.line, 0),
                        new vscode.Position(selection.active.line, lineText.length)
                    );
                    editor.selection = newSelection;
                }
                // 段階4: 行全体が選択されている → カーソルを行頭に移動（選択解除）
                else if (currentSelStart === 0 && currentSelEnd === lineText.length) {
                    const newSelection = new vscode.Selection(
                        new vscode.Position(selection.active.line, 0),
                        new vscode.Position(selection.active.line, 0)
                    );
                    editor.selection = newSelection;
                }
                else {
                    // その他の場合は、テキスト部分のみを選択
                    const newSelection = new vscode.Selection(
                        new vscode.Position(selection.active.line, numberEndPos),
                        new vscode.Position(selection.active.line, lineText.length)
                    );
                    editor.selection = newSelection;
                }
            }
            else {
                // チェックボックス・箇条書き・数字リスト行でない場合は通常の動作
                vscode.commands.executeCommand('cursorLineStartSelect');
            }
        })
    );
    
    // コードブロック内のスマート選択 (Cmd+A)
    context.subscriptions.push(
        vscode.commands.registerCommand('obsidianMarkdown.smartSelectAll', () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.languageId !== 'markdown') return;
            
            const document = editor.document;
            const position = editor.selection.active;
            
            // コードブロック内かどうか確認
            let inCodeBlock = false;
            let codeBlockStart = -1;
            let codeBlockEnd = -1;
            
            // 現在の行から上方向にコードブロックの開始を探す
            for (let i = position.line; i >= 0; i--) {
                const line = document.lineAt(i).text;
                if (line.startsWith('```')) {
                    // 開始が見つかった
                    codeBlockStart = i;
                    // 終了を探す
                    for (let j = position.line; j < document.lineCount; j++) {
                        const endLine = document.lineAt(j).text;
                        if (j > codeBlockStart && endLine.startsWith('```')) {
                            codeBlockEnd = j;
                            inCodeBlock = true;
                            break;
                        }
                    }
                    break;
                }
            }
            
            if (inCodeBlock && codeBlockStart >= 0 && codeBlockEnd >= 0) {
                const currentSelection = editor.selection;
                const blockStartLine = codeBlockStart;
                const blockEndLine = codeBlockEnd;
                
                // 現在の選択状態を確認
                const isCodeContentSelected = 
                    currentSelection.start.line === blockStartLine + 1 &&
                    currentSelection.end.line === blockEndLine - 1 &&
                    currentSelection.end.character === document.lineAt(blockEndLine - 1).text.length;
                
                if (isCodeContentSelected) {
                    // コード内容が選択されている場合、ファイル全体を選択
                    const fullRange = new vscode.Range(
                        new vscode.Position(0, 0),
                        new vscode.Position(document.lineCount - 1, 
                            document.lineAt(document.lineCount - 1).text.length)
                    );
                    editor.selection = new vscode.Selection(fullRange.start, fullRange.end);
                } else {
                    // コード内容のみを選択（```の行を除く）
                    const contentStartLine = blockStartLine + 1;
                    const contentEndLine = blockEndLine - 1;
                    
                    if (contentStartLine <= contentEndLine) {
                        const contentRange = new vscode.Range(
                            new vscode.Position(contentStartLine, 0),
                            new vscode.Position(contentEndLine, 
                                document.lineAt(contentEndLine).text.length)
                        );
                        editor.selection = new vscode.Selection(contentRange.start, contentRange.end);
                    }
                }
            } else {
                // コードブロック外の場合は通常の全選択
                vscode.commands.executeCommand('editor.action.selectAll');
            }
        })
    );
    
    // CodeLens Provider の登録
    const checkboxCodeLensProvider = new CheckboxCodeLensProvider();
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
            { language: 'markdown', scheme: 'file' },
            checkboxCodeLensProvider
        )
    );
    
    // CodeLensの更新を監視
    vscode.workspace.onDidChangeTextDocument(event => {
        if (event.document.languageId === 'markdown') {
            checkboxCodeLensProvider.onDidChangeCodeLenses.fire();
        }
    }, null, context.subscriptions);
    
    // 初回実行
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.languageId === 'markdown') {
        console.log('[activate] Initial update for active editor');
        updateDecorations(editor, true); // 初回は即座に実行
    } else {
        console.log('[activate] No active markdown editor at startup');
    }
}

function updateDecorations(editor, immediate = false, specificLines = null) {
    if (!editor) return;
    
    console.log('[updateDecorations] Called with immediate:', immediate, 'specificLines:', specificLines ? Array.from(specificLines) : null);
    
    // デバウンス処理
    if (updateTimer) {
        clearTimeout(updateTimer);
    }
    
    const performUpdate = () => {
        const currentTime = Date.now();
        
        // 定期的な全体更新（5秒ごと）
        const shouldDoFullUpdate = (currentTime - lastFullUpdateTime) > 5000;
        
        console.log('[updateDecorations] performUpdate - shouldDoFullUpdate:', shouldDoFullUpdate, 'specificLines:', specificLines ? 'yes' : 'no');
        
        if (shouldDoFullUpdate || !specificLines) {
            // 全体更新
            console.log('[updateDecorations] Calling performFullUpdate');
            performFullUpdate(editor);
            lastFullUpdateTime = currentTime;
            changedLines.clear();
        } else {
            // 部分更新（変更された行のみ）
            console.log('[updateDecorations] Calling performIncrementalUpdate');
            performIncrementalUpdate(editor, specificLines);
        }
        
        // チェックボックスの装飾を常に更新（他の装飾の後に必ず実行）
        // 遅延実行して他の装飾が完了した後に適用
        setTimeout(() => {
            updateCheckboxDecorations(editor);
        }, 10);
        
        lastActiveLine = editor.selection.active.line;
    };
    
    if (immediate) {
        console.log('[updateDecorations] Executing immediately');
        performUpdate();
    } else {
        // 100ms後に更新（レスポンス改善）
        console.log('[updateDecorations] Scheduling update in 100ms');
        updateTimer = setTimeout(performUpdate, 100);
    }
}

// チェックボックス装飾を独立して更新する関数
function updateCheckboxDecorations(editor) {
    try {
        if (!editor || !editor.document) {
            console.log('[updateCheckboxDecorations] ERROR: editor or document is null');
            return;
        }
        
        if (!globalCheckedDecoration) {
            console.log('[updateCheckboxDecorations] ERROR: globalCheckedDecoration is null, recreating...');
            // 装飾が失われた場合は再作成
            globalCheckedDecoration = vscode.window.createTextEditorDecorationType({
                textDecoration: 'line-through',
                opacity: '0.6'
            });
        }
        
        const document = editor.document;
        const checkedLineRanges = [];
        
        // 全ドキュメントをスキャンしてチェック済み行を収集
        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i).text;
            // パターンをシンプル化: - [x] または - [X] のみをマッチ
            if (line.match(/^(\s*)-\s\[[xX]\]/)) {
                console.log(`[updateCheckboxDecorations] Found checked at line ${i}: "${line}"`);
                checkedLineRanges.push(new vscode.Range(
                    new vscode.Position(i, 0),
                    new vscode.Position(i, line.length)
                ));
            }
        }
        
        console.log(`[updateCheckboxDecorations] Applying decorations to ${checkedLineRanges.length} checked items`);
        
        // 装飾を適用
        editor.setDecorations(globalCheckedDecoration, checkedLineRanges);
        console.log('[updateCheckboxDecorations] setDecorations completed successfully');
        
    } catch (error) {
        console.error('[updateCheckboxDecorations] ERROR:', error);
        console.error('[updateCheckboxDecorations] Stack trace:', error.stack);
    }
}

function performFullUpdate(editor) {
    const document = editor.document;
    const text = document.getText();
    const lines = text.split('\n');
    const cursorLine = editor.selection.active.line;
    
    console.log('[performFullUpdate] Start - total lines:', lines.length);
    
    // チェックボックス装飾以外をクリア（チェックボックス装飾は別途管理）
    // clearAllCheckboxDecorations(editor); // これを削除
    
    // 前回のカーソル行の装飾をクリア
    if (lastActiveLine !== cursorLine && lastActiveLine >= 0) {
        clearLineDecorations(lastActiveLine);
    }
    
    // 現在のカーソル行の装飾をクリア
    if (cursorLine >= 0) {
        clearLineDecorations(cursorLine);
    }
    
    // 全行を処理（チェックボックス以外の装飾）
    lines.forEach((line, lineIndex) => {
        const isFocused = lineIndex === cursorLine;
        
        // 見出しの処理
        if (line.startsWith('#')) {
            applyHeadingDecoration(editor, lineIndex, line);
        }
        
        if (isFocused) {
            applyFocusedLineDecoration(editor, lineIndex, line);
        } else {
            applyPreviewDecoration(editor, lineIndex, line);
        }
    });
    
    // チェックボックス装飾は updateCheckboxDecorations で別途処理される
}

function performIncrementalUpdate(editor, linesToUpdate) {
    const document = editor.document;
    const cursorLine = editor.selection.active.line;
    
    console.log('[performIncrementalUpdate] Start - updating lines:', Array.from(linesToUpdate));
    
    // 変更された行と周辺行を更新（チェックボックス装飾以外）
    linesToUpdate.forEach(lineIndex => {
        if (lineIndex >= 0 && lineIndex < document.lineCount) {
            const line = document.lineAt(lineIndex).text;
            const isFocused = lineIndex === cursorLine;
            
            // 行の装飾をクリア（チェック済み装飾以外）
            clearLineDecorations(lineIndex);
            
            // 見出しの処理
            if (line.startsWith('#')) {
                applyHeadingDecoration(editor, lineIndex, line);
            }
            
            if (isFocused) {
                applyFocusedLineDecoration(editor, lineIndex, line);
            } else {
                applyPreviewDecoration(editor, lineIndex, line);
            }
            
            // 前後の行も更新（コンテキストのため）
            if (lineIndex > 0) {
                const prevLine = document.lineAt(lineIndex - 1).text;
                if (!linesToUpdate.has(lineIndex - 1)) {
                    clearLineDecorations(lineIndex - 1);
                    applyPreviewDecoration(editor, lineIndex - 1, prevLine);
                }
            }
            if (lineIndex < document.lineCount - 1) {
                const nextLine = document.lineAt(lineIndex + 1).text;
                if (!linesToUpdate.has(lineIndex + 1)) {
                    clearLineDecorations(lineIndex + 1);
                    applyPreviewDecoration(editor, lineIndex + 1, nextLine);
                }
            }
        }
    });
    
    // チェックボックス装飾は updateCheckboxDecorations で別途処理される
}

// 特定の行の装飾をクリア
function clearLineDecorations(lineIndex) {
    const keysToDelete = [];
    decorationTypes.forEach((decoration, key) => {
        // 行番号を含むキーで、見出しとチェックボックス全体装飾以外の装飾を削除
        if ((key.includes(`_${lineIndex}`) || key.endsWith(`_${lineIndex}`)) && 
            !key.startsWith('heading_') && 
            key !== 'checkbox_checked_all') {
            decoration.dispose();
            keysToDelete.push(key);
        }
    });
    keysToDelete.forEach(key => decorationTypes.delete(key));
}

// すべてのチェックボックス装飾をクリア
function clearAllCheckboxDecorations(editor) {
    console.log('[clearAllCheckboxDecorations] Clearing checkbox decorations');
    // グローバル装飾をクリア（範囲を空にする）
    if (globalCheckedDecoration) {
        editor.setDecorations(globalCheckedDecoration, []);
        console.log('[clearAllCheckboxDecorations] Global decoration cleared');
    }
    
    // 個別の装飾もクリア（レガシーサポート）
    const keysToDelete = [];
    decorationTypes.forEach((decoration, key) => {
        if (key.includes('checkbox_strikethrough') || key === 'checkbox_checked_all') {
            decoration.dispose();
            keysToDelete.push(key);
        }
    });
    keysToDelete.forEach(key => decorationTypes.delete(key));
}

function applyFocusedLineDecoration(editor, lineIndex, line) {
    // CSV形式の行の処理は削除（自動変換するため）
    
    // 見出しの場合、フォーカス時は背景色のみ追加
    if (line.startsWith('#')) {
        // フォーカス時の背景色のみ適用（既存の見出し装飾は保持）
        const focusedBgDecoration = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(100, 100, 100, 0.1)',
            isWholeLine: true
        });
        
        const fullLineRange = new vscode.Range(
            new vscode.Position(lineIndex, 0),
            new vscode.Position(lineIndex, line.length)
        );
        
        editor.setDecorations(focusedBgDecoration, [fullLineRange]);
        decorationTypes.set(`focused_bg_${lineIndex}`, focusedBgDecoration);
    } else {
        // 通常のテキストの場合
        const focusedDecoration = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(100, 100, 100, 0.1)',
            isWholeLine: true
        });
        
        const range = new vscode.Range(
            new vscode.Position(lineIndex, 0),
            new vscode.Position(lineIndex, line.length)
        );
        
        editor.setDecorations(focusedDecoration, [range]);
        decorationTypes.set(`focused_${lineIndex}`, focusedDecoration);
    }
}

function applyPreviewDecoration(editor, lineIndex, line) {
    // チェックボックスの処理は performFullUpdate と performIncrementalUpdate で一括処理されるためここでは何もしない
    const uncheckedMatch = line.match(/^(\s*)-\s\[\s\]\s*(.*)/);
    const checkedMatch = line.match(/^(\s*)-\s\[[xX]\]\s*(.*)/i);
    
    if (uncheckedMatch) {
        // 未チェックのチェックボックス - 装飾なし
    } else if (checkedMatch) {
        // チェック済みのチェックボックス - 装飾は一括処理で行われる
    }
    
    // テーブル行の処理は削除（装飾なし）
    
    // CSV形式のデータの処理は削除（自動変換するため装飾不要）
    
    // 見出しの処理
    if (line.startsWith('#')) {
        applyHeadingDecoration(editor, lineIndex, line);
    }
    
    // 横線（horizontal rule）の処理
    if (line.match(/^-{3,}$/) || line.match(/^\*{3,}$/) || line.match(/^_{3,}$/)) {
        if (!decorationCache.hr) {
            decorationCache.hr = vscode.window.createTextEditorDecorationType({
                borderStyle: 'solid',
                borderWidth: '0 0 1px 0',
                borderColor: 'rgba(128, 128, 128, 0.5)',
                isWholeLine: true
            });
        }
        
        const hrRange = new vscode.Range(
            new vscode.Position(lineIndex, 0),
            new vscode.Position(lineIndex, line.length)
        );
        
        editor.setDecorations(decorationCache.hr, [hrRange]);
    }
    
    // 太字・斜体の処理
    applyInlineDecorations(editor, lineIndex, line);
    
    // 通常テキストの装飾設定（チェックボックス、テーブル、見出し、横線以外）
    if (!line.startsWith('#') && !line.includes('|') && !line.match(/^\s*-\s\[\s?[xX]?\s?\]/) && !line.match(/^(-{3,}|\*{3,}|_{3,})$/)) {
        const textDecoration = vscode.window.createTextEditorDecorationType({
            // デフォルトのテーマカラーを使用
        });
        
        const range = new vscode.Range(
            new vscode.Position(lineIndex, 0),
            new vscode.Position(lineIndex, line.length)
        );
        
        editor.setDecorations(textDecoration, [range]);
        decorationTypes.set(`text_${lineIndex}`, textDecoration);
    }
}

// テーブル装飾関数は削除（使用しない）

function applyHeadingDecoration(editor, lineIndex, line) {
    const headingMatch = line.match(/^(#+)\s*(.*)/);
    if (!headingMatch) return;
    
    const level = headingMatch[1].length;
    const hashMarks = headingMatch[1];
    
    // 既存の見出し装飾があればクリア
    const existingHashDeco = decorationTypes.get(`heading_hash_${lineIndex}`);
    const existingSizeDeco = decorationTypes.get(`heading_size_${lineIndex}`);
    if (existingHashDeco) existingHashDeco.dispose();
    if (existingSizeDeco) existingSizeDeco.dispose();
    
    // #記号とスペースを隠す部分
    const hashEndPos = hashMarks.length + (line[hashMarks.length] === ' ' ? 1 : 0);
    
    // #記号を完全に非表示にする（display: none を使用）
    const hashRange = new vscode.Range(
        new vscode.Position(lineIndex, 0),
        new vscode.Position(lineIndex, hashEndPos)
    );
    
    const hideHashDecoration = vscode.window.createTextEditorDecorationType({
        textDecoration: 'none; display: none;',
        // これにより後続のテキストが正しくレイアウトされる
        after: {
            contentText: '',
        }
    });
    
    // 行全体にサイズを適用（textDecorationを使用）
    const fullLineRange = new vscode.Range(
        new vscode.Position(lineIndex, 0),
        new vscode.Position(lineIndex, line.length)
    );
    
    // サイズと色の設定（150%をマックスとして調整）
    const sizes = ['150%', '140%', '130%', '120%', '110%', '105%'];
    const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57', '#ff9ff3'];
    
    const headingDecoration = vscode.window.createTextEditorDecorationType({
        textDecoration: `none; font-size: ${sizes[level - 1] || sizes[5]};`,
        fontWeight: 'bold',
        color: colors[level - 1] || colors[5],  // レベルに応じた色を指定
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed // 範囲の振る舞いを固定
    });
    
    editor.setDecorations(hideHashDecoration, [hashRange]);
    editor.setDecorations(headingDecoration, [fullLineRange]);
    
    decorationTypes.set(`heading_hash_${lineIndex}`, hideHashDecoration);
    decorationTypes.set(`heading_size_${lineIndex}`, headingDecoration);
}

function applyInlineDecorations(editor, lineIndex, line) {
    // 太字
    const boldRegex = /\*\*(.+?)\*\*/g;
    let match;
    const boldRanges = [];
    
    while ((match = boldRegex.exec(line)) !== null) {
        const startPos = new vscode.Position(lineIndex, match.index);
        const endPos = new vscode.Position(lineIndex, match.index + match[0].length);
        boldRanges.push(new vscode.Range(startPos, endPos));
    }
    
    if (boldRanges.length > 0) {
        const boldDecoration = vscode.window.createTextEditorDecorationType({
            fontWeight: 'bold',
            // ** を隠す
            textDecoration: 'none',
            before: {
                contentText: '',
            },
            after: {
                contentText: '',
            }
        });
        
        editor.setDecorations(boldDecoration, boldRanges);
        decorationTypes.set(`bold_${lineIndex}`, boldDecoration);
    }
    
    // 斜体
    const italicRegex = /\*(.+?)\*/g;
    const italicRanges = [];
    
    while ((match = italicRegex.exec(line)) !== null) {
        // 太字と重複しないように
        if (!line.substring(match.index - 1, match.index + match[0].length + 1).includes('**')) {
            const startPos = new vscode.Position(lineIndex, match.index);
            const endPos = new vscode.Position(lineIndex, match.index + match[0].length);
            italicRanges.push(new vscode.Range(startPos, endPos));
        }
    }
    
    if (italicRanges.length > 0) {
        const italicDecoration = vscode.window.createTextEditorDecorationType({
            fontStyle: 'italic'
        });
        
        editor.setDecorations(italicDecoration, italicRanges);
        decorationTypes.set(`italic_${lineIndex}`, italicDecoration);
    }
}

function toggleCheckboxAtCursor() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    
    const position = editor.selection.active;
    toggleCheckboxAtLine(editor, position.line);
}

function toggleCheckboxAtLine(editor, lineNumber) {
    const line = editor.document.lineAt(lineNumber).text;
    let newLine;
    
    console.log(`[toggleCheckboxAtLine] Line ${lineNumber}: "${line}"`);
    
    if (line.includes('- [ ]')) {
        newLine = line.replace('- [ ]', '- [x]');
        console.log('[toggleCheckboxAtLine] Changing from unchecked to checked');
    } else if (line.includes('- [x]') || line.includes('- [X]')) {
        newLine = line.replace(/- \[[xX]\]/, '- [ ]');
        console.log('[toggleCheckboxAtLine] Changing from checked to unchecked');
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
        console.log('[toggleCheckboxAtLine] Edit complete, calling updateDecorations with immediate=true');
        // 装飾を即座に更新（チェックボックスの状態変更を確実に反映）
        updateDecorations(editor, true);
    });
}

// Canvas APIを使用した文字幅の実測
let canvasContext = null;
let currentFontFamily = null;

// フォント情報を取得
function detectEditorFont() {
    try {
        // VSCodeのエディタフォント設定を取得
        const config = vscode.workspace.getConfiguration('editor');
        const fontFamily = config.get('fontFamily') || 'monospace';
        const fontSize = config.get('fontSize') || 14;
        return `${fontSize}px ${fontFamily}`;
    } catch (e) {
        // デフォルトのモノスペースフォント
        return '14px monospace';
    }
}

// Canvas contextを初期化
function getCanvasContext() {
    if (!canvasContext) {
        // Node.js環境でcanvasを作成（VSCode拡張機能環境）
        // 注：実際のブラウザ環境ではないため、簡易的な計算にフォールバック
        canvasContext = {
            measureText: function(text) {
                // フォールバック：文字種別による推定
                let width = 0;
                for (let i = 0; i < text.length; i++) {
                    const code = text.charCodeAt(i);
                    // 日本語・全角文字
                    if (code >= 0x3000 && code <= 0x9FFF || 
                        code >= 0xFF01 && code <= 0xFF60) {
                        width += 2;
                    } 
                    // 半角文字
                    else {
                        width += 1;
                    }
                }
                return { width: width * 8 }; // 8pxを1文字幅として計算
            }
        };
    }
    return canvasContext;
}

// 文字列幅計算（全角・半角を考慮）
function getStringWidth(str) {
    if (!str) return 0;
    let width = 0;
    for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);
        // 全角文字の判定
        if ((code >= 0x3000 && code <= 0x9FFF) || // CJK文字
            (code >= 0xFF01 && code <= 0xFF60) || // 全角記号
            (code >= 0xFFE0 && code <= 0xFFE6)) { // 全角記号
            width += 2;
        } else {
            width += 1;
        }
    }
    return width;
}

// パディング関数（全角スペースを使用）
function padString(str, targetWidth) {
    const currentWidth = getStringWidth(str);
    const paddingNeeded = targetWidth - currentWidth;
    if (paddingNeeded <= 0) return str;
    
    // 全角スペースでパディング（2幅単位）
    let padding = '';
    let remainingWidth = paddingNeeded;
    
    while (remainingWidth >= 2) {
        padding += '　'; // 全角スペース
        remainingWidth -= 2;
    }
    
    // 奇数の場合は半角スペース1つ追加
    if (remainingWidth === 1) {
        padding += ' ';
    }
    
    return str + padding;
}

// テーブル全体を整形する関数（改良版）
function formatTableAtLine(editor, lineIndex) {
    const document = editor.document;
    const line = document.lineAt(lineIndex).text;
    
    if (!line.includes('|')) return;
    
    // IME入力中は処理をスキップ
    if (isComposing) return;
    
    // テーブルの範囲を特定
    let tableStartLine = lineIndex;
    let tableEndLine = lineIndex;
    
    // 上方向にテーブル行を探索
    for (let i = lineIndex - 1; i >= 0; i--) {
        const lineText = document.lineAt(i).text.trim();
        if (lineText.includes('|')) {
            tableStartLine = i;
        } else if (lineText.length > 0) {
            // 空行でない行に遭遇したら終了
            break;
        }
    }
    
    // 下方向にテーブル行を探索
    for (let i = lineIndex + 1; i < document.lineCount; i++) {
        const lineText = document.lineAt(i).text.trim();
        if (lineText.includes('|')) {
            tableEndLine = i;
        } else if (lineText.length > 0) {
            // 空行でない行に遭遇したら終了
            break;
        }
    }
    
    // 各列の最大幅を計算
    const columnWidths = [];
    const tableLines = [];
    let maxColumns = 0;
    
    for (let i = tableStartLine; i <= tableEndLine; i++) {
        const lineText = document.lineAt(i).text;
        if (!lineText.trim()) continue; // 空行はスキップ
        
        const cells = lineText.split('|').map(cell => cell.trim());
        
        // 最初と最後の空セルを除外
        let contentCells = cells;
        if (cells[0] === '') contentCells = contentCells.slice(1);
        if (cells[cells.length - 1] === '') contentCells = contentCells.slice(0, -1);
        
        // 少なくとも1つのセルがある場合のみ処理
        if (contentCells.length > 0) {
            maxColumns = Math.max(maxColumns, contentCells.length);
            
            tableLines.push({
                lineIndex: i,
                cells: contentCells,
                isSeparator: contentCells.every(cell => cell.match(/^:?-+:?$/))
            });
            
            // セパレーター行以外で列幅を計算
            if (!tableLines[tableLines.length - 1].isSeparator) {
                contentCells.forEach((cell, colIndex) => {
                    const cellWidth = getStringWidth(cell);
                    if (!columnWidths[colIndex] || cellWidth > columnWidths[colIndex]) {
                        columnWidths[colIndex] = Math.max(cellWidth, 3);
                    }
                });
            }
        }
    }
    
    // すべての列の幅を確保（最小幅3）
    for (let i = 0; i < maxColumns; i++) {
        if (!columnWidths[i]) {
            columnWidths[i] = 3;
        }
    }
    
    // 各行を整形
    editor.edit(editBuilder => {
        tableLines.forEach(({lineIndex, cells, isSeparator}) => {
            let formattedLine;
            
            if (isSeparator) {
                // セパレーター行の整形
                formattedLine = '|';
                for (let index = 0; index < maxColumns; index++) {
                    const cell = cells[index] || '---';
                    const width = columnWidths[index];
                    let separator;
                    
                    // アラインメント記号を処理
                    if (cell.startsWith(':') && cell.endsWith(':')) {
                        separator = ':' + '-'.repeat(Math.max(width, 1)) + ':';
                    } else if (cell.startsWith(':')) {
                        separator = ':' + '-'.repeat(Math.max(width + 1, 2));
                    } else if (cell.endsWith(':')) {
                        separator = '-'.repeat(Math.max(width + 1, 2)) + ':';
                    } else {
                        separator = '-'.repeat(Math.max(width + 2, 3));
                    }
                    
                    formattedLine += ` ${separator} |`;
                }
            } else {
                // 通常の行の整形（空セルも含めて統一）
                formattedLine = '|';
                for (let index = 0; index < maxColumns; index++) {
                    const cell = cells[index] || '';
                    const targetWidth = columnWidths[index];
                    const paddedCell = padString(cell, targetWidth);
                    formattedLine += ` ${paddedCell} |`;
                }
            }
            
            const currentLine = document.lineAt(lineIndex).text;
            if (currentLine !== formattedLine) {
                const range = new vscode.Range(
                    lineIndex, 0,
                    lineIndex, currentLine.length
                );
                editBuilder.replace(range, formattedLine);
            }
        });
    }, { undoStopBefore: false, undoStopAfter: false }).then(() => {
        // カーソル位置を可能な限り維持
        const currentPosition = editor.selection.active;
        if (currentPosition.line >= tableStartLine && currentPosition.line <= tableEndLine) {
            const currentChar = currentPosition.character;
            const currentLineText = document.lineAt(currentPosition.line).text;
            const beforeCursor = currentLineText.substring(0, Math.min(currentChar, currentLineText.length));
            const cellIndex = beforeCursor.split('|').length - 1; // 現在のセルインデックス
            
            const newLineText = document.lineAt(currentPosition.line).text;
            const cells = newLineText.split('|');
            
            if (cellIndex < cells.length) {
                let newPosition = 0;
                for (let i = 0; i <= cellIndex && i < cells.length; i++) {
                    if (i === cellIndex) {
                        // セル内での相対位置を維持
                        const cellStart = newPosition;
                        const cellContent = cells[i].trim();
                        const oldCellContent = beforeCursor.split('|')[cellIndex] || '';
                        const relativePos = oldCellContent.trim().length;
                        newPosition = cellStart + 1 + Math.min(relativePos, cellContent.length);
                    } else {
                        newPosition += cells[i].length + 1; // +1 for pipe
                    }
                }
                
                const newCursorPosition = new vscode.Position(currentPosition.line, Math.min(newPosition, newLineText.length));
                editor.selection = new vscode.Selection(newCursorPosition, newCursorPosition);
            }
        }
    });
}

// テーブル行の自動整形関数
function autoFormatTableLine(editor, lineIndex) {
    const line = editor.document.lineAt(lineIndex);
    const text = line.text;
    
    // すでに正しいフォーマットの場合はスキップ
    if (!text.includes('|')) return;
    
    // パイプで分割してセルを取得
    const cells = text.split('|').map(cell => cell.trim());
    
    // 最初と最後の空セルを確認
    let hasLeadingPipe = text.trimLeft().startsWith('|');
    let hasTrailingPipe = text.trimRight().endsWith('|');
    
    // セルの内容を取得（最初と最後の空要素を除外）
    let contentCells = cells;
    if (cells[0] === '' && hasLeadingPipe) {
        contentCells = contentCells.slice(1);
    }
    if (cells[cells.length - 1] === '' && hasTrailingPipe) {
        contentCells = contentCells.slice(0, -1);
    }
    
    // テーブル全体の列幅を計算
    const document = editor.document;
    let tableStartLine = lineIndex;
    let tableEndLine = lineIndex;
    const columnWidths = [];
    
    // テーブルの範囲を特定
    for (let i = lineIndex - 1; i >= 0; i--) {
        const lineText = document.lineAt(i).text;
        if (lineText.includes('|')) {
            tableStartLine = i;
        } else {
            break;
        }
    }
    
    for (let i = lineIndex + 1; i < document.lineCount; i++) {
        const lineText = document.lineAt(i).text;
        if (lineText.includes('|')) {
            tableEndLine = i;
        } else {
            break;
        }
    }
    
    // 各列の最大幅を計算
    for (let i = tableStartLine; i <= tableEndLine; i++) {
        const lineText = document.lineAt(i).text;
        const lineCells = lineText.split('|').map(c => c.trim());
        
        // 最初と最後の空要素を除外
        let cellContent = lineCells;
        if (lineCells[0] === '') cellContent = cellContent.slice(1);
        if (lineCells[lineCells.length - 1] === '') cellContent = cellContent.slice(0, -1);
        
        // セパレーター行の場合はスキップ
        if (cellContent.every(cell => cell.match(/^:?-+:?$/))) continue;
        
        cellContent.forEach((cell, colIndex) => {
            const cellLength = cell.length;
            if (!columnWidths[colIndex] || cellLength > columnWidths[colIndex]) {
                columnWidths[colIndex] = Math.max(cellLength, 3); // 最小幅3
            }
        });
    }
    
    // フォーマット済みの行を作成
    let formattedCells = contentCells.map((cell, index) => {
        const targetWidth = columnWidths[index] || 3;
        return ' ' + cell.padEnd(targetWidth) + ' ';
    });
    
    const formattedLine = '|' + formattedCells.join('|') + '|';
    
    // 行を置き換え（変更がある場合のみ）
    if (text !== formattedLine) {
        editor.edit(editBuilder => {
            const range = new vscode.Range(
                lineIndex, 0,
                lineIndex, text.length
            );
            editBuilder.replace(range, formattedLine);
        }, { undoStopBefore: false, undoStopAfter: false });
    }
}

// CSVデータをテーブル形式に変換
function convertCSVToTableFormat(editor, lineNumber) {
    const document = editor.document;
    const line = document.lineAt(lineNumber).text;
    
    // CSVでない場合はスキップ
    if (!line.includes(',') || line.includes('|')) return;
    
    // CSV範囲を特定
    let csvStartLine = lineNumber;
    let csvEndLine = lineNumber;
    
    // 上方向にCSV行を探索
    for (let i = lineNumber - 1; i >= 0; i--) {
        const lineText = document.lineAt(i).text;
        if (lineText.includes(',') && !lineText.includes('|')) {
            csvStartLine = i;
        } else {
            break;
        }
    }
    
    // 下方向にCSV行を探索
    for (let i = lineNumber + 1; i < document.lineCount; i++) {
        const lineText = document.lineAt(i).text;
        if (lineText.includes(',') && !lineText.includes('|')) {
            csvEndLine = i;
        } else {
            break;
        }
    }
    
    // 各列の最大幅を計算
    const columnWidths = [];
    const csvLines = [];
    let maxColumns = 0;
    
    for (let i = csvStartLine; i <= csvEndLine; i++) {
        const lineText = document.lineAt(i).text;
        const cells = lineText.split(',').map(cell => cell.trim());
        csvLines.push({ line: i, cells });
        maxColumns = Math.max(maxColumns, cells.length);
        
        cells.forEach((cell, colIndex) => {
            const cellWidth = getStringWidth(cell);
            if (!columnWidths[colIndex] || cellWidth > columnWidths[colIndex]) {
                columnWidths[colIndex] = Math.max(cellWidth, 3);
            }
        });
    }
    
    // 列幅を統一
    for (let i = 0; i < maxColumns; i++) {
        if (!columnWidths[i]) {
            columnWidths[i] = 3;
        }
    }
    
    // テーブル形式に変換
    editor.edit(editBuilder => {
        csvLines.forEach(({ line, cells }, index) => {
            // セパレーター行を追加（最初の行の後）
            if (index === 1 && csvStartLine === line - 1) {
                const separator = '|' + columnWidths.map(width => ' ' + '-'.repeat(width) + ' ').join('|') + '|';
                const separatorPosition = new vscode.Position(line, 0);
                editBuilder.insert(separatorPosition, separator + '\n');
            }
            
            // 各行をテーブル形式に変換
            let tableRow = '|';
            for (let colIndex = 0; colIndex < maxColumns; colIndex++) {
                const cell = cells[colIndex] || '';
                const cellWidth = getStringWidth(cell);
                const padding = columnWidths[colIndex] - cellWidth;
                const paddedCell = cell + ' '.repeat(Math.max(0, padding));
                tableRow += ' ' + paddedCell + ' |';
            }
            
            const currentLine = document.lineAt(line).text;
            const range = new vscode.Range(
                line, 0,
                line, currentLine.length
            );
            editBuilder.replace(range, tableRow);
        });
    }).then(() => {
        // 変換後にテーブル全体を整形
        setTimeout(() => {
            for (let i = csvStartLine; i <= csvEndLine + 1; i++) {
                if (i < document.lineCount) {
                    formatTableAtLine(editor, i);
                }
            }
        }, 100);
    });
}

// CSV装飾関数は削除（使用しない）
function applyCSVDecorationOld(editor, lineIndex, line) {
    const cells = line.split(',').map(cell => cell.trim());
    const document = editor.document;
    
    // CSVデータの範囲を特定
    let csvStartLine = lineIndex;
    let csvEndLine = lineIndex;
    const columnWidths = [];
    
    // CSV範囲を特定（連続するカンマ区切り行）
    for (let i = lineIndex - 1; i >= 0; i--) {
        const lineText = document.lineAt(i).text;
        if (lineText.includes(',') && !lineText.includes('|')) {
            csvStartLine = i;
        } else {
            break;
        }
    }
    
    for (let i = lineIndex + 1; i < document.lineCount; i++) {
        const lineText = document.lineAt(i).text;
        if (lineText.includes(',') && !lineText.includes('|')) {
            csvEndLine = i;
        } else {
            break;
        }
    }
    
    // 各列の最大幅を計算（日本語文字の幅も考慮）
    let maxColumns = 0;
    for (let i = csvStartLine; i <= csvEndLine; i++) {
        const lineText = document.lineAt(i).text;
        const lineCells = lineText.split(',').map(c => c.trim());
        maxColumns = Math.max(maxColumns, lineCells.length);
        
        lineCells.forEach((cell, colIndex) => {
            const cellWidth = getStringWidth(cell); // 日本語文字の幅を考慮
            if (!columnWidths[colIndex] || cellWidth > columnWidths[colIndex]) {
                columnWidths[colIndex] = Math.max(cellWidth, 3);
            }
        });
    }
    
    // すべての行で列数を統一
    for (let i = 0; i < maxColumns; i++) {
        if (!columnWidths[i]) {
            columnWidths[i] = 3;
        }
    }
    
    // 最初の行かどうかをチェック（ヘッダー行の可能性）
    const isFirstRow = lineIndex === csvStartLine;
    
    // カンマの位置を記録
    const commaPositions = [];
    let currentPos = 0;
    for (let i = 0; i < line.length; i++) {
        if (line[i] === ',') {
            commaPositions.push(i);
        }
    }
    
    // 仮想的な行を作成して位置を計算
    let virtualRow = '';
    const cellDecorations = [];
    
    // 各セルを処理して仮想行を構築
    for (let colIndex = 0; colIndex < maxColumns; colIndex++) {
        const cell = cells[colIndex] || '';
        const targetWidth = columnWidths[colIndex];
        const cellWidth = getStringWidth(cell);
        const paddingNeeded = Math.max(0, targetWidth - cellWidth);
        
        // 仮想行に追加
        if (colIndex > 0) {
            virtualRow += '  │  '; // セパレーター
        }
        const virtualCellStart = virtualRow.length;
        virtualRow += cell + ' '.repeat(paddingNeeded);
        const virtualCellEnd = virtualRow.length;
        
        if (colIndex < cells.length) {
            // 実際のセル位置を取得
            let realStartPos = 0;
            let realEndPos = line.length;
            
            if (colIndex === 0) {
                realStartPos = 0;
                realEndPos = commaPositions[0] || line.length;
            } else if (colIndex < commaPositions.length) {
                realStartPos = commaPositions[colIndex - 1] + 1;
                realEndPos = commaPositions[colIndex];
            } else {
                realStartPos = commaPositions[commaPositions.length - 1] + 1;
                realEndPos = line.length;
            }
            
            // スペースをスキップ
            while (realStartPos < realEndPos && line[realStartPos] === ' ') realStartPos++;
            while (realEndPos > realStartPos && line[realEndPos - 1] === ' ') realEndPos--;
            
            // 必要なパディングを計算
            const neededSpacesBefore = virtualCellStart - realStartPos;
            const beforeContent = neededSpacesBefore > 0 ? ' '.repeat(neededSpacesBefore) : '';
            const afterContent = ' '.repeat(paddingNeeded) + (colIndex < maxColumns - 1 ? '  │  ' : '');
            
            // セルの装飾
            const cellDecoration = vscode.window.createTextEditorDecorationType({
                backgroundColor: isFirstRow ? 'rgba(70, 130, 180, 0.1)' : 'rgba(50, 50, 50, 0.05)',
                fontWeight: isFirstRow ? 'bold' : 'normal',
                color: isFirstRow ? '#87ceeb' : undefined,
                fontFamily: 'monospace',
                before: {
                    contentText: beforeContent,
                    color: 'transparent'
                },
                after: {
                    contentText: afterContent,
                    color: 'rgba(120, 120, 120, 0.5)'
                }
            });
            
            const cellRange = new vscode.Range(
                new vscode.Position(lineIndex, realStartPos),
                new vscode.Position(lineIndex, realEndPos)
            );
            
            editor.setDecorations(cellDecoration, [cellRange]);
            decorationTypes.set(`csv_cell_${lineIndex}_${colIndex}`, cellDecoration);
        } else if (cells.length > 0) {
            // 列が不足している場合、最後のセルの後に空列を追加
            const lastCellIndex = cells.length - 1;
            if (lastCellIndex >= 0 && lastCellIndex < commaPositions.length + 1) {
                const lastPos = commaPositions[commaPositions.length - 1] || 0;
                const emptyDecoration = vscode.window.createTextEditorDecorationType({
                    after: {
                        contentText: '  │  ' + ' '.repeat(targetWidth) + (colIndex < maxColumns - 1 ? '  │  ' : ''),
                        color: 'rgba(120, 120, 120, 0.5)',
                        fontFamily: 'monospace'
                    }
                });
                
                const emptyRange = new vscode.Range(
                    new vscode.Position(lineIndex, line.length - 1),
                    new vscode.Position(lineIndex, line.length)
                );
                
                editor.setDecorations(emptyDecoration, [emptyRange]);
                decorationTypes.set(`csv_empty_${lineIndex}_${colIndex}`, emptyDecoration);
            }
        }
    }
    
    // カンマを隠す
    commaPositions.forEach((pos, index) => {
        const commaRange = new vscode.Range(
            new vscode.Position(lineIndex, pos),
            new vscode.Position(lineIndex, pos + 1)
        );
        
        const commaDecoration = vscode.window.createTextEditorDecorationType({
            color: 'transparent',
            letterSpacing: '-1000px',
            fontSize: '0.1em'
        });
        
        editor.setDecorations(commaDecoration, [commaRange]);
        decorationTypes.set(`csv_comma_${lineIndex}_${index}`, commaDecoration);
    });
    
    // 行全体に薄い背景を適用
    const rowDecoration = vscode.window.createTextEditorDecorationType({
        backgroundColor: isFirstRow ? 'rgba(70, 130, 180, 0.03)' : 'rgba(40, 40, 40, 0.02)',
        isWholeLine: true
    });
    
    const rowRange = new vscode.Range(
        new vscode.Position(lineIndex, 0),
        new vscode.Position(lineIndex, line.length)
    );
    
    editor.setDecorations(rowDecoration, [rowRange]);
    decorationTypes.set(`csv_row_bg_${lineIndex}`, rowDecoration);
}

function clearDecorations() {
    // 見出し装飾以外をクリア
    const keysToDelete = [];
    decorationTypes.forEach((decoration, key) => {
        if (!key.startsWith('heading_')) {
            decoration.dispose();
            keysToDelete.push(key);
        }
    });
    keysToDelete.forEach(key => decorationTypes.delete(key));
}

function deactivate() {
    // すべての装飾をクリア
    decorationTypes.forEach(decoration => {
        decoration.dispose();
    });
    decorationTypes.clear();
    
    // グローバル装飾もクリア
    if (globalCheckedDecoration) {
        globalCheckedDecoration.dispose();
        globalCheckedDecoration = null;
    }
    
    // タイマーもクリア
    if (updateTimer) clearTimeout(updateTimer);
    if (formatTimer) clearTimeout(formatTimer);
}

module.exports = {
    activate,
    deactivate
};