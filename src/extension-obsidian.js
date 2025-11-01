const vscode = require('vscode');

// グローバルな装飾タイプ（再利用）
let checkedDecoration = null;
let headingDecorations = []; // H1..H6
let codeBlockDecoration = null; // Fenced code blocks
let horizontalRuleDecoration = null; // Horizontal rule (---)
let updateTimer = null;
let currentEditingLine = -1; // 現在編集中の行番号
let isDragging = false; // ドラッグ選択中かどうか
let lastSelectionRange = null; // 最後の選択範囲を記憶
let isHandlingEnter = false; // Enter継続処理の再入防止
let languageDecorations = new Map(); // 言語別の装飾タイプをキャッシュ

// デバッグ用出力チャンネル
let debugChannel = null;

function debugLog(message, ...args) {
    if (debugChannel) {
        const timestamp = new Date().toISOString().substring(11, 23);
        const formattedArgs = args.length > 0 ? ' ' + args.map(a => JSON.stringify(a)).join(' ') : '';
        debugChannel.appendLine(`[${timestamp}] ${message}${formattedArgs}`);
    }
}

function activate(context) {
    console.log('Markdown Inline Preview Active');

    // デバッグ用出力チャンネルを作成
    debugChannel = vscode.window.createOutputChannel('Markdown Table Debug');
    debugLog('=== Markdown Inline Preview Extension Activated ===');

    // Markdown特有の自動補完とテーブル整形を無効化
    // コメントアウト: テーブル整形機能と競合するため
    applyMarkdownSettings();
    
    // 装飾タイプを一度だけ作成
    checkedDecoration = vscode.window.createTextEditorDecorationType({
        textDecoration: 'line-through !important',
        color: 'rgba(136, 136, 136, 0.6)',
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
    });

    // 見出し装飾（H1〜H6）。fontSize は VS Code の API 制限で変更不可のため、
    // 太字やカラー、背景・ボーダー等で視覚的に差異を出す。
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

    // コードブロック装飾（``` で囲まれた範囲）
    codeBlockDecoration = vscode.window.createTextEditorDecorationType({
        // 全体を一続きの領域として見せるため、背景色のみを使用
        isWholeLine: true,
        backgroundColor: 'rgba(40, 44, 52, 0.85)',
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
    });
    
    // 水平線装飾（--- で区切り線）
    // ダーク/ライトテーマ双方で見やすいように、行全体の下枠線で描画する
    horizontalRuleDecoration = vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        borderWidth: '0 0 2px 0',
        borderStyle: 'solid',
        // テーマに応じてコントラストのある境界線色を使用
        light: {
            borderColor: 'rgba(0, 0, 0, 0.35)'
        },
        dark: {
            borderColor: 'rgba(255, 255, 255, 0.28)'
        },
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
    });
    
    // コマンド登録
    registerCommands(context);
    
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
            
            // 旧スマートEnter（ドキュメント変更ベース）は無効化
            // Enter 継続処理はコマンド `obsidianMarkdown.smartEnter` に移行
            
            // コードブロックの自動補完
            if (event.contentChanges.length > 0) {
                const change = event.contentChanges[0];
                const changeText = change.text;
                
                // ```が入力された場合
                if (changeText === '```') {
                    const position = editor.selection.active;
                    const line = position.line;
                    const character = position.character;
                    
                    // 現在のドキュメント内の```の数を数える
                    let codeBlockCount = 0;
                    for (let i = 0; i <= line; i++) {
                        const lineText = editor.document.lineAt(i).text;
                        const matches = lineText.match(/```/g);
                        if (matches) {
                            if (i < line) {
                                codeBlockCount += matches.length;
                            } else {
                                // 現在の行では、入力位置より前の```のみカウント
                                const beforeText = lineText.substring(0, character);
                                const beforeMatches = beforeText.match(/```/g);
                                if (beforeMatches) {
                                    codeBlockCount += beforeMatches.length;
                                }
                            }
                        }
                    }
                    
                    // 奇数個目の```の場合、自動的に閉じタグを追加
                    if (codeBlockCount % 2 === 1) {
                        editor.edit(editBuilder => {
                            // 現在の行の最後に改行を追加
                            const currentLine = editor.document.lineAt(line);
                            const endOfLine = new vscode.Position(line, currentLine.text.length);
                            editBuilder.insert(endOfLine, '\n\n```');
                        }).then(() => {
                            // カーソルを次の行に移動
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
    
    // カーソル移動イベント（クリック処理と編集検知）
    debugLog('Registering onDidChangeTextEditorSelection event handler');
    context.subscriptions.push(
        vscode.window.onDidChangeTextEditorSelection(event => {
            const editor = event.textEditor;

            // イベント自体が発火していることを確認
            debugLog(`[EVENT] Selection changed - Editor: ${editor ? editor.document.fileName : 'none'}`);

            if (!editor || editor.document.languageId !== 'markdown') {
                debugLog(`Selection changed: Not a markdown file (language: ${editor ? editor.document.languageId : 'no editor'})`);
                return;
            }

            const position = event.selections[0].active;

            // 編集中の行が変わった場合、装飾を更新
            if (position.line !== currentEditingLine) {
                const previousEditingLine = currentEditingLine;
                currentEditingLine = position.line;

                debugLog(`Line changed: ${previousEditingLine} -> ${currentEditingLine}`);

                // テーブル自動整形: 前の行がテーブル行だった場合
                if (previousEditingLine !== -1 && previousEditingLine !== position.line) {
                    try {
                        const prevLine = editor.document.lineAt(previousEditingLine).text;
                        debugLog(`Previous line text: "${prevLine}"`);

                        if (prevLine.includes('|')) {
                            debugLog(`Table detected on line ${previousEditingLine}, formatting...`);
                            // テーブル自動整形を実行
                            formatTableAtLine(editor, previousEditingLine);
                        } else {
                            debugLog('Previous line is not a table (no | character)');
                        }
                    } catch (e) {
                        // 行が存在しない場合などのエラーは無視
                        debugLog(`Error reading previous line: ${e.message}`);
                    }
                }
                
                // 装飾を更新（編集中の行を除外）
                if (previousEditingLine !== -1 || currentEditingLine !== -1) {
                    updateAllDecorations(editor);
                }
            }
            
            // マウスクリックの場合
            if (event.kind === vscode.TextEditorSelectionChangeKind.Mouse) {
                // 選択範囲を確認（ドラッグ選択中かどうか）
                const selection = event.selections[0];
                const isSelecting = !selection.isEmpty;
                
                // ドラッグ状態の更新
                if (isSelecting) {
                    isDragging = true;
                } else if (isDragging) {
                    // ドラッグ終了
                    isDragging = false;
                    return; // ドラッグ終了時はチェックボックス処理をスキップ
                }
                
                // ドラッグ中はチェックボックスを反応させない
                if (!isDragging && selection.isEmpty) {
                    const line = editor.document.lineAt(position.line);
                    const text = line.text;
                    
                    // チェックボックスクリック判定（より厳密な範囲制限）
                    const checkboxMatch = text.match(/^(\s*)-\s\[[\sx]?\]/i);
                    if (checkboxMatch) {
                        // チェックボックス記号の範囲内のみクリック可能（]の位置まで、]の直後は含まない）
                        const checkboxStart = text.indexOf('[');
                        const checkboxEnd = text.indexOf(']');
                        
                        if (position.character >= checkboxStart && position.character <= checkboxEnd) {
                            // チェックボックスをトグル
                            setTimeout(() => {
                                toggleCheckbox(editor, position.line);
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
// Markdown Table Formatting
// =========================

// 現在の行がフェンスドコードブロック内か判定
function isInFencedCodeBlock(document, lineIndex) {
    let inFence = false;
    for (let i = 0; i <= lineIndex; i++) {
        const t = document.lineAt(i).text;
        if (t.startsWith('```')) {
            inFence = !inFence;
        }
    }
    return inFence;
}

// コマンド版 スマートEnter（リスト継続/解除）
async function smartEnterCommand() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'markdown') {
        // 非Markdownでは通常の改行
        await vscode.commands.executeCommand('type', { text: '\n' });
        return;
    }

    const document = editor.document;
    const selections = editor.selections;
    const isSingleCursor = selections.length === 1;

    // 事前に、空のアイテム（マーカーのみ）の行はマーカーを削除して改行のみ
    const preEdits = [];
    const continuationTexts = new Array(selections.length).fill(null);
    let skipNewlineForSingle = false;

    for (let i = 0; i < selections.length; i++) {
        const sel = selections[i];
        const pos = sel.active;
        const lineIdx = pos.line;
        if (lineIdx < 0 || lineIdx >= document.lineCount) continue;
        const lineText = document.lineAt(lineIdx).text;

        // コードブロック内は通常の改行
        if (isInFencedCodeBlock(document, lineIdx)) {
            continuationTexts[i] = null;
            continue;
        }

        // 行の構造を解析
        let m;
        const indentMatch = lineText.match(/^(\s*)/);
        const baseIndent = indentMatch ? indentMatch[1] : '';

        // チェックボックス付き (- [ ] text)
        if ((m = lineText.match(/^(\s*)([-*+])\s+\[(x|X| )\]\s*(.*)$/))) {
            const indent = m[1] || '';
            const marker = m[2];
            const content = (m[4] || '');
            const isEmptyItem = content.trim().length === 0;
            const atEndOfLine = pos.character >= lineText.length;

            if (isEmptyItem && atEndOfLine) {
                // 空のチェックボックスで、カーソルが末尾にある場合
                // マーカーを削除し、改行しない
                preEdits.push({
                    range: new vscode.Range(lineIdx, 0, lineIdx, lineText.length),
                    text: ''
                });
                continuationTexts[i] = null;
                skipNewlineForSingle = true;
            } else {
                continuationTexts[i] = `${marker} [ ] `; // インデントはVSCodeが自動付与
            }
            continue;
        }

        // 箇条書き (- * +)
        if ((m = lineText.match(/^(\s*)([-*+])\s+(.*)$/))) {
            const indent = m[1] || '';
            const marker = m[2];
            const content = (m[3] || '');
            const isEmptyItem = content.trim().length === 0;
            const atEndOfLine = pos.character >= lineText.length;

            if (isEmptyItem && atEndOfLine) {
                // 空のリストで、カーソルが末尾にある場合
                // マーカーを削除し、改行しない
                preEdits.push({
                    range: new vscode.Range(lineIdx, 0, lineIdx, lineText.length),
                    text: ''
                });
                continuationTexts[i] = null;
                skipNewlineForSingle = true;
            } else {
                continuationTexts[i] = `${marker} `;
            }
            continue;
        }

        // 番号付き (1. ) or (1) )
        if ((m = lineText.match(/^(\s*)(\d+)([\.)])\s+(.*)$/))) {
            const indent = m[1] || '';
            const num = parseInt(m[2], 10) || 0;
            const punct = m[3];
            const content = (m[4] || '');
            const isEmptyItem = content.trim().length === 0;
            const atEndOfLine = pos.character >= lineText.length;

            if (isEmptyItem && atEndOfLine) {
                // 空の番号付きリストで、カーソルが末尾にある場合
                // マーカーを削除し、改行しない
                preEdits.push({
                    range: new vscode.Range(lineIdx, 0, lineIdx, lineText.length),
                    text: ''
                });
                continuationTexts[i] = null;
                skipNewlineForSingle = true;
            } else {
                const next = num + 1;
                continuationTexts[i] = `${next}${punct} `;
            }
            continue;
        }

        // それ以外は通常の改行
        continuationTexts[i] = null;
    }

    // 事前置換（マーカー除去）
    if (preEdits.length > 0) {
        await editor.edit(eb => {
            for (const e of preEdits) eb.replace(e.range, e.text);
        });
    }

    // 改行の実行（単一カーソルで「2回目のEnter」判定時は改行しない）
    if (!(isSingleCursor && skipNewlineForSingle)) {
        await vscode.commands.executeCommand('type', { text: '\n' });
    }

    // 継続挿入（各カーソル位置へマーカーを追加）
    const afterSelections = editor.selections;
    const inserts = [];
    for (let i = 0; i < afterSelections.length; i++) {
        const cont = continuationTexts[i];
        if (!cont) continue;
        const pos = afterSelections[i].active; // 新しい行のインデント位置
        // コードブロック内は改めて無視
        if (isInFencedCodeBlock(editor.document, pos.line)) continue;
        inserts.push({ position: pos, text: cont });
    }

    if (inserts.length > 0) {
        await editor.edit(eb => {
            for (const ins of inserts) eb.insert(ins.position, ins.text);
        });
        // カーソルをマーカーの後ろへ
        const finalSelections = editor.selections.map((sel, idx) => {
            const cont = continuationTexts[idx];
            if (!cont) return sel;
            const p = sel.active.translate(0, cont.length);
            return new vscode.Selection(p, p);
        });
        editor.selections = finalSelections;
    }

    // Enter確定後にテーブル自動整形（元の行がテーブル行だった場合）
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
}

// 全角判定（代表的なCJK/全角記号）
// 0幅の結合文字判定（代表的な範囲）
function isZeroWidthCombining(cp) {
    return (
        (cp >= 0x0300 && cp <= 0x036F) ||
        (cp >= 0x1AB0 && cp <= 0x1AFF) ||
        (cp >= 0x1DC0 && cp <= 0x1DFF) ||
        (cp >= 0x20D0 && cp <= 0x20FF) ||
        (cp >= 0xFE20 && cp <= 0xFE2F) ||
        cp === 0x200B || // ZERO WIDTH SPACE
        cp === 0x200C || // ZWNJ
        cp === 0x200D || // ZWJ
        (cp >= 0xFE00 && cp <= 0xFE0F) // Variation selectors
    );
}

// East Asian Wide/Fullwidth（概ね Node の is-fullwidth-code-point に準拠）
function isFullWidthCodePoint(cp) {
    if (cp < 0x1100) return false;
    return (
        (cp >= 0x1100 && cp <= 0x115F) || // Hangul Jamo
        cp === 0x2329 || cp === 0x232A ||
        (cp >= 0x2E80 && cp <= 0x303E) || // CJK Radicals Supplement..CJK Symbols and Punctuation (except 303F)
        (cp >= 0x3040 && cp <= 0xA4CF) || // Hiragana, Katakana, Bopomofo, Hangul Jamo Extended-A, etc.
        (cp >= 0xAC00 && cp <= 0xD7A3) || // Hangul Syllables
        (cp >= 0xF900 && cp <= 0xFAFF) || // CJK Compatibility Ideographs
        (cp >= 0xFE10 && cp <= 0xFE19) || // Vertical forms
        (cp >= 0xFE30 && cp <= 0xFE6F) || // CJK Compatibility Forms
        (cp >= 0xFF00 && cp <= 0xFF60) || // Fullwidth Forms
        (cp >= 0xFFE0 && cp <= 0xFFE6) || // Fullwidth symbol variants
        (cp >= 0x1F300 && cp <= 0x1F64F) || // Emojis etc.
        (cp >= 0x1F900 && cp <= 0x1F9FF) ||
        (cp >= 0x20000 && cp <= 0x3FFFD)
    );
}

// 表示幅（全角=2, 半角=1、結合文字=0、絵文字=2 近似）
function getStringWidth(str) {
    if (!str) return 0;
    let width = 0;
    for (const ch of str) { // iterate by code point
        const cp = ch.codePointAt(0);
        if (isZeroWidthCombining(cp)) continue;
        width += isFullWidthCodePoint(cp) ? 2 : 1;
    }
    return width;
}

// 数値/日付の簡易判定と幅ヒューリスティクスを含む表示幅
function getDisplayWidthWithHeuristics(text) {
    if (!text) return 0;
    const s = String(text).trim();
    // ISO 日付/日時（固定幅化）
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return 10; // YYYY-MM-DD
    if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(s)) return Math.max(10, getStringWidth(s)); // YYYY/M/D → 最低10
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$/.test(s)) return 16; // YYYY-MM-DD HH:mm
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(s)) return 19; // YYYY-MM-DD HH:mm:ss

    // 桁区切り付き数値（数値らしさの維持のため微小バッファを追加）
    if (/^[+-]?\d{1,3}([,\s]\d{3})+(?:[.,]\d+)?$/.test(s)) {
        // 実際の見た目幅 + 1（群区切りで詰まりにくくする軽微なバッファ）
        return getStringWidth(s) + 1;
    }
    // 小数や通常の数値
    if (/^[+-]?\d+(?:[.,]\d+)?$/.test(s)) {
        return getStringWidth(s);
    }
    // 既定（全角/半角/絵文字考慮）
    return getStringWidth(s);
}

// セル単位のパディング（左揃え: 半角スペース1つ + 文字 + 残りのスペース）
// targetWidthはパイプ間のスペースを含まない幅
function padCell(content, targetWidth, columnHasFullWidth = false) {
    const current = getDisplayWidthWithHeuristics(content);
    // targetWidth = 左スペース(1) + 文字幅 + 右スペース(1) の合計
    // 必要なパディング = targetWidth - 文字幅 - 2（左右のスペース）
    let remain = targetWidth - current;
    if (remain < 2) remain = 2; // 最低でも左右1つずつ

    const wideSpace = '　'; // 全角スペース
    const narrowSpace = ' ';

    // 左揃え: 左に半角スペース1つ、右に残りのスペース
    const leftPadStr = narrowSpace; // 常に半角スペース1つ
    const rightPad = remain - 1; // 残りは全て右側

    let rightPadStr = '';

    // 列に全角文字が含まれる場合は全角スペース優先、それ以外は半角スペース
    if (columnHasFullWidth) {
        // 右側のパディング（全角スペース優先）
        let rightRemain = Math.max(1, rightPad); // 最低1つ
        while (rightRemain >= 2) { rightPadStr += wideSpace; rightRemain -= 2; }
        while (rightRemain > 0) { rightPadStr += narrowSpace; rightRemain -= 1; }
    } else {
        // 半角文字のみの列は半角スペースのみ使用
        rightPadStr = narrowSpace.repeat(Math.max(1, rightPad));
    }

    return leftPadStr + content + rightPadStr;
}

// 行をセルに分割（先頭/末尾の空セルは除外）
function splitTableLine(line) {
    if (!line.includes('|')) return null;
    // シンプル分割（エスケープ/コードは考慮しないが高速）
    let cells = line.split('|');
    // 両端の空要素を除外
    if (cells.length && cells[0].trim() === '') cells = cells.slice(1);
    if (cells.length && cells[cells.length - 1].trim() === '') cells = cells.slice(0, -1);
    return cells.map(c => c.trim());
}

function isSeparatorRow(cells) {
    if (!cells || cells.length === 0) return false;
    return cells.every(c => /^:?-+:?$/.test(c.replace(/\s+/g, '')));
}

function findTableBlock(document, lineIndex) {
    const lineCount = document.lineCount;
    let start = lineIndex;
    let end = lineIndex;

    // 上へ拡張
    for (let i = lineIndex; i >= 0; i--) {
        const t = document.lineAt(i).text;
        if (t.includes('|')) {
            start = i;
        } else if (t.trim() !== '') {
            break;
        } else {
            // 空行は越えない（表が途切れる）
            break;
        }
    }

    // 下へ拡張
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

function formatTableAtLine(editor, lineIndex) {
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

    // フェンスドコードブロック内では整形しない
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

    // 解析
    const rows = [];
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

    // セパレータ行が存在することを確認（なければスキップ）
    if (!rows.some(r => r.isSep)) {
        debugLog('No separator row found, aborting');
        return;
    }

    // 列幅計算（セパレータ行以外）
    // 左揃えのため、幅 = 左スペース(1) + 文字幅 + 右スペース(1)
    const colWidths = Array(maxCols).fill(5); // 最小幅5（左スペース1 + 文字3 + 右スペース1）
    const colHasFullWidth = Array(maxCols).fill(false); // 列ごとに全角文字を含むか

    for (const r of rows) {
        if (r.isSep) continue;
        for (let c = 0; c < maxCols; c++) {
            const cell = (r.cells[c] || '').trim();
            const w = Math.max(5, getDisplayWidthWithHeuristics(cell) + 2); // +2 for left and right padding
            if (w > colWidths[c]) colWidths[c] = w;

            // この列に全角文字が含まれるかチェック
            if (!colHasFullWidth[c] && cell) {
                const hasFullWidth = [...cell].some(ch => isFullWidthCodePoint(ch.codePointAt(0)));
                if (hasFullWidth) {
                    colHasFullWidth[c] = true;
                    debugLog(`Column ${c} has full-width characters: "${cell}"`);
                }
            }
        }
    }

    debugLog(`Column widths: ${colWidths.join(', ')}`);
    debugLog(`Column full-width flags: ${colHasFullWidth.join(', ')}`);

    // 行を再構築
    const replacements = [];
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

    // 置換（まとめて）
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

function updateAllDecorations(editor) {
    if (!editor || !checkedDecoration) return;
    
    console.log(`[updateAllDecorations] Starting update (editing line: ${currentEditingLine})`);
    
    const document = editor.document;
    const ranges = [];
    
    // 全行をスキャンして装飾範囲を収集
    for (let i = 0; i < document.lineCount; i++) {
        // 編集中の行はスキップ（横線を表示しない）
        if (i === currentEditingLine) {
            console.log(`[updateAllDecorations] Skipping editing line ${i}`);
            continue;
        }
        
        const line = document.lineAt(i).text;
        
        // チェック済みパターン: - [x] または - [X]
        // チェックボックス後のテキスト部分のみに装飾を適用
        const match = line.match(/^\s*-\s\[[xX]\]\s*/);
        if (match) {
            // チェックボックスの後からテキスト終端までの範囲
            const startPos = match[0].length;
            if (startPos < line.length) {
                const range = new vscode.Range(
                    new vscode.Position(i, startPos),
                    new vscode.Position(i, line.length)
                );
                ranges.push(range);
                console.log(`[updateAllDecorations] Adding range for line ${i}: "${line.substring(startPos)}"`);
            }
        }
    }
    
    // 全ての範囲を一度に装飾（チェックボックスの取り消し線）
    editor.setDecorations(checkedDecoration, ranges);
    console.log(`[updateAllDecorations] Applied ${ranges.length} checkbox decorations`);

    // 見出し装飾も更新
    updateHeadingDecorations(editor);
    // コードブロック装飾も更新
    updateCodeBlockDecorations(editor);
    // 水平線装飾も更新
    updateHorizontalRuleDecorations(editor);
}

function updateHeadingDecorations(editor) {
    if (!editor || headingDecorations.length !== 6) return;

    const document = editor.document;
    const perLevel = [[], [], [], [], [], []];

    for (let i = 0; i < document.lineCount; i++) {
        const lineText = document.lineAt(i).text;
        const m = lineText.match(/^(#{1,6})\s+.+/);
        if (!m) continue;

        const level = Math.min(m[1].length, 6) - 1; // 0..5
        // 行全体に装飾（編集中も維持）
        const range = new vscode.Range(new vscode.Position(i, 0), new vscode.Position(i, lineText.length));
        perLevel[level].push(range);
    }

    for (let l = 0; l < 6; l++) {
        editor.setDecorations(headingDecorations[l], perLevel[l]);
    }
}

function updateCodeBlockDecorations(editor) {
    if (!editor || !codeBlockDecoration) return;

    const document = editor.document;
    const backgroundRanges = [];
    const codeBlocks = [];

    let inFence = false;
    let fenceStart = -1;
    let fenceLanguage = '';
    
    for (let i = 0; i < document.lineCount; i++) {
        const lineText = document.lineAt(i).text;
        if (lineText.startsWith('```')) {
            if (!inFence) {
                inFence = true;
                fenceStart = i;
                // 言語を抽出（```python, ```javascript など）
                const langMatch = lineText.match(/^```([a-zA-Z0-9_+\-#]+)/);
                fenceLanguage = langMatch ? langMatch[1].toLowerCase() : '';
            } else {
                // 終了フェンス
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
    
    // 閉じられていないフェンスは末尾まで適用
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

    // 背景装飾を適用
    editor.setDecorations(codeBlockDecoration, backgroundRanges);
    
    // 言語ごとの構文ハイライトを適用
    applyLanguageHighlighting(editor, codeBlocks);
}

// 言語ごとの構文ハイライトを適用
function applyLanguageHighlighting(editor, codeBlocks) {
    const document = editor.document;
    
    // 既存の言語装飾をクリア
    for (const [lang, decorations] of languageDecorations) {
        for (const decoration of decorations.values()) {
            editor.setDecorations(decoration, []);
        }
    }
    languageDecorations.clear();
    
    for (const block of codeBlocks) {
        const { language, startLine, endLine } = block;
        const syntaxRanges = getSyntaxRanges(document, language, startLine, endLine);
        
        if (!languageDecorations.has(language)) {
            languageDecorations.set(language, new Map());
        }
        
        const langDecorations = languageDecorations.get(language);
        
        // 各構文要素に装飾を適用
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

// トークンタイプに基づいて装飾を作成
function createDecorationForToken(tokenType) {
    const colors = {
        'keyword': '#c678dd',      // purple
        'string': '#98c379',        // green
        'comment': '#5c6370',       // gray
        'number': '#d19a66',        // orange
        'function': '#61afef',      // blue
        'class': '#e5c07b',         // yellow
        'variable': '#e06c75',      // red
        'operator': '#56b6c2',      // cyan
        'type': '#e5c07b',          // yellow
        'decorator': '#d19a66',     // orange
        'tag': '#e06c75',           // red (HTML/XML)
        'attribute': '#d19a66',     // orange (HTML/XML)
        'property': '#61afef',      // blue (CSS/JSON)
        'preprocessor': '#d19a66',  // orange (C/C++)
        'macro': '#d19a66',         // orange (Rust macro etc.)
        'namespace': '#56b6c2',     // cyan
        'section': '#e5c07b',       // yellow (INI/TOML)
        'key': '#61afef',           // blue (YAML/TOML/INI)
        'boolean': '#c678dd',       // purple
        'constant': '#e06c75',      // red
        'builtin': '#56b6c2',       // cyan
        'symbol': '#56b6c2'         // cyan (Ruby symbols etc.)
    };
    
    const color = colors[tokenType];
    if (!color) return null;
    
    const options = {
        color: color,
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
    };
    
    // 特定のトークンタイプに追加のスタイルを適用
    if (tokenType === 'keyword' || tokenType === 'class' || tokenType === 'type' || tokenType === 'section') {
        options.fontWeight = 'bold';
    }
    if (tokenType === 'comment') {
        options.fontStyle = 'italic';
    }
    
    return vscode.window.createTextEditorDecorationType(options);
}

// 簡易的な構文解析（言語ごとのトークンを検出）
function getSyntaxRanges(document, language, startLine, endLine) {
    const syntaxRanges = new Map();
    
    // 言語ごとのパターン定義
    const languagePatterns = {
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
        'java': {
            'keyword': /\b(public|private|protected|static|final|abstract|synchronized|volatile|transient|native|strictfp|class|interface|enum|extends|implements|new|this|super|return|if|else|for|while|do|switch|case|default|break|continue|try|catch|finally|throw|throws|import|package|void|boolean|byte|char|short|int|long|float|double|null|true|false|instanceof)\b/g,
            'string': /(["'])(?:(?=(\\?))\2.)*?\1/g,
            'comment': /(\/\/.*|\/\*[\s\S]*?\*\/)/g,
            'number': /\b\d+(\.\d+)?[fFlLdD]?\b/g,
            'function': /\b[a-zA-Z_][a-zA-Z0-9_]*(?=\s*\()/g,
            'class': /\b(class|interface|enum)\s+([A-Z][a-zA-Z0-9_]*)/g
        },
        'html': {
            'tag': /<\/?[a-zA-Z][a-zA-Z0-9-]*[^>]*>/g,
            'attribute': /\b[a-zA-Z-]+(?=\s*=)/g,
            'string': /(["'])(?:(?=(\\?))\2.)*?\1/g,
            'comment': /<!--[\s\S]*?-->/g
        },
        'css': {
            'property': /[a-zA-Z-]+(?=\s*:)/g,
            'string': /(["'])(?:(?=(\\?))\2.)*?\1/g,
            'comment': /\/\*[\s\S]*?\*\//g,
            'number': /\b\d+(\.\d+)?(px|em|rem|%|vh|vw|deg|s|ms)?\b/g
        },
        'json': {
            'property': /"[^"]+"(?=\s*:)/g,
            'string': /"[^"]*"/g,
            'number': /-?\b\d+(\.\d+)?([eE][+-]?\d+)?\b/g,
            'keyword': /\b(true|false|null)\b/g
        },
        'c': {
            'keyword': /\b(auto|break|case|char|const|continue|default|do|double|else|enum|extern|float|for|goto|if|inline|int|long|register|restrict|return|short|signed|sizeof|static|struct|switch|typedef|union|unsigned|void|volatile|while|_Alignas|_Alignof|_Atomic|_Bool|_Complex|_Generic|_Imaginary|_Noreturn|_Static_assert|_Thread_local)\b/g,
            'string': /(["'])(?:(?=(\\?))\2.)*?\1/g,
            'comment': /(\/\/.*|\/\*[\s\S]*?\*\/)/g,
            'number': /\b(0x[\da-fA-F]+|\d+(?:\.\d+)?)(?:[uUlLfF]+)?\b/g,
            'preprocessor': /#\s*\w+.*/g,
            'function': /\b[a-zA-Z_][a-zA-Z0-9_]*(?=\s*\()/g,
            'type': /\b(size_t|ssize_t|uint\d*_t|int\d*_t)\b/g
        },
        'cpp': {
            'keyword': /\b(alignas|alignof|and|and_eq|asm|atomic_cancel|atomic_commit|atomic_noexcept|auto|bitand|bitor|break|case|catch|char|char8_t|char16_t|char32_t|class|compl|concept|const|consteval|constexpr|constinit|const_cast|continue|co_await|co_return|co_yield|decltype|default|delete|do|double|dynamic_cast|else|enum|explicit|export|extern|false|final|float|for|friend|goto|if|inline|int|long|mutable|namespace|new|noexcept|nullptr|operator|or|or_eq|override|private|protected|public|register|reinterpret_cast|requires|return|short|signed|sizeof|static|static_assert|static_cast|struct|switch|template|this|thread_local|throw|true|try|typedef|typeid|typename|union|unsigned|using|virtual|void|volatile|wchar_t|while|xor|xor_eq)\b/g,
            'string': /(["'])(?:(?=(\\?))\2.)*?\1/g,
            'comment': /(\/\/.*|\/\*[\s\S]*?\*\/)/g,
            'number': /\b(0x[\da-fA-F]+|\d+(?:\.\d+)?(?:f|F|l|L)?)\b/g,
            'preprocessor': /#\s*\w+.*/g,
            'namespace': /\bnamespace\s+[a-zA-Z_][a-zA-Z0-9_]*\b/g,
            'class': /\b(class|struct)\s+[A-Z][a-zA-Z0-9_]*\b/g,
            'function': /\b[a-zA-Z_][a-zA-Z0-9_:]*(?=\s*\()/g
        },
        'csharp': {
            'keyword': /\b(abstract|as|base|bool|break|byte|case|catch|char|checked|class|const|continue|decimal|default|delegate|do|double|else|enum|event|explicit|extern|false|finally|fixed|float|for|foreach|goto|if|implicit|in|int|interface|internal|is|lock|long|namespace|new|null|object|operator|out|override|params|private|protected|public|readonly|ref|return|sbyte|sealed|short|sizeof|stackalloc|static|string|struct|switch|this|throw|true|try|typeof|uint|ulong|unchecked|unsafe|ushort|using|virtual|void|volatile|while|async|await|var|dynamic|record)\b/g,
            'string': /@?(["'])(?:(?=(\\?))\2.)*?\1/g,
            'comment': /(\/\/.*|\/\*[\s\S]*?\*\/)/g,
            'number': /\b\d+(?:\.\d+)?[fFdDmM]?\b/g,
            'namespace': /\bnamespace\s+[a-zA-Z_][a-zA-Z0-9_.]*\b/g,
            'class': /\b(class|struct|interface|enum)\s+[A-Z][a-zA-Z0-9_]*\b/g,
            'function': /\b[a-zA-Z_][a-zA-Z0-9_]*(?=\s*\()/g
        },
        'go': {
            'keyword': /\b(break|default|func|interface|select|case|defer|go|map|struct|chan|else|goto|package|switch|const|fallthrough|if|range|type|continue|for|import|return|var)\b/g,
            'string': /(["`'])(?:(?=(\\?))\2.)*?\1/g,
            'comment': /(\/\/.*|\/\*[\s\S]*?\*\/)/g,
            'number': /\b\d+(?:\.\d+)?\b/g,
            'function': /\bfunc\s+([a-zA-Z_][a-zA-Z0-9_]*)\b/g,
            'type': /\b(uint\d*|int\d*|byte|rune|string|bool|error)\b/g
        },
        'rust': {
            'keyword': /\b(abstract|as|async|await|become|box|break|const|continue|crate|do|dyn|else|enum|extern|false|final|fn|for|if|impl|in|let|loop|macro|match|mod|move|mut|override|priv|pub|ref|return|self|Self|static|struct|super|trait|true|try|type|typeof|unsafe|unsized|use|virtual|where|while|yield)\b/g,
            'string': /(["'])(?:(?=(\\?))\2.)*?\1/g,
            'comment': /(\/\/.*|\/\*[\s\S]*?\*\/)/g,
            'number': /\b\d+(?:_\d+)*(?:\.\d+)?\b/g,
            'macro': /\b[a-zA-Z_][a-zA-Z0-9_]*!\b/g,
            'function': /\bfn\s+([a-zA-Z_][a-zA-Z0-9_]*)\b/g,
            'type': /\b([A-Z][a-zA-Z0-9_]*|u?int\d*|u?size|bool|char|str)\b/g
        },
        'ruby': {
            'keyword': /\b(BEGIN|END|alias|and|begin|break|case|class|def|defined\?|do|else|elsif|end|ensure|false|for|if|in|module|next|nil|not|or|redo|rescue|retry|return|self|super|then|true|undef|unless|until|when|while|yield)\b/g,
            'string': /(["'])(?:(?=(\\?))\2.)*?\1/g,
            'comment': /#.*/g,
            'number': /\b\d+(?:\.\d+)?\b/g,
            'symbol': /:[a-zA-Z_][a-zA-Z0-9_]*\b/g,
            'class': /\bclass\s+[A-Z][a-zA-Z0-9_]*\b/g,
            'function': /\bdef\s+([a-zA-Z_][a-zA-Z0-9_]*[!?=]?)\b/g
        },
        'php': {
            'keyword': /\b(abstract|and|array|as|break|callable|case|catch|class|clone|const|continue|declare|default|do|echo|else|elseif|empty|enddeclare|endfor|endforeach|endif|endswitch|endwhile|eval|exit|extends|final|finally|for|foreach|function|global|goto|if|implements|include|include_once|instanceof|insteadof|interface|isset|list|match|namespace|new|or|print|private|protected|public|readonly|require|require_once|return|static|switch|throw|trait|try|unset|use|var|while|xor|yield)\b/g,
            'string': /(["'])(?:(?=(\\?))\2.)*?\1/g,
            'comment': /(\/\/.*|\/\*[\s\S]*?\*\/|#.*)/g,
            'number': /\b\d+(?:\.\d+)?\b/g,
            'variable': /\$[a-zA-Z_][a-zA-Z0-9_]*\b/g,
            'function': /\bfunction\s+([a-zA-Z_][a-zA-Z0-9_]*)\b/g,
            'class': /\bclass\s+[A-Z][a-zA-Z0-9_]*\b/g
        },
        'bash': {
            'keyword': /\b(if|then|else|elif|fi|case|esac|for|select|while|until|do|done|in|function|time)\b/g,
            'string': /(["'])(?:(?=(\\?))\2.)*?\1/g,
            'comment': /#.*/g,
            'number': /\b\d+\b/g,
            'variable': /\$[A-Za-z_][A-Za-z0-9_]*|\${[^}]+}/g,
            'operator': /\||\&|;|\(|\)|<|>/g
        },
        'sql': {
            'keyword': /\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN|LEFT|RIGHT|FULL|OUTER|INNER|ON|GROUP|BY|ORDER|HAVING|LIMIT|OFFSET|VALUES|INTO|CREATE|ALTER|DROP|TABLE|VIEW|INDEX|PRIMARY|KEY|FOREIGN|NOT|NULL|AND|OR|AS|DISTINCT|UNION|ALL|CASE|WHEN|THEN|ELSE|END)\b/gi,
            'string': /(["'])(?:(?=(\\?))\2.)*?\1/g,
            'comment': /(\/\*[^]*?\*\/|--.*)/g,
            'number': /\b\d+(?:\.\d+)?\b/g
        },
        'yaml': {
            'key': /^\s*[^#\-][\w.-]+(?=\s*:)/gm,
            'string': /(:\s*)(["'][^"']*["']|[^#\n]+)/g,
            'comment': /#.*/g,
            'boolean': /\b(true|false|on|off|yes|no)\b/gi,
            'number': /\b\d+(?:\.\d+)?\b/g
        },
        'toml': {
            'section': /^\s*\[[^\]]+\]/gm,
            'key': /^\s*[A-Za-z0-9_\-.]+(?=\s*=)/gm,
            'string': /(["']{1,3})([\s\S]*?)\1/g,
            'comment': /#.*/g,
            'number': /\b\d+(?:\.\d+)?\b/g,
            'boolean': /\b(true|false)\b/g
        },
        'ini': {
            'section': /^\s*\[[^\]]+\]/gm,
            'key': /^\s*[A-Za-z0-9_\-.]+(?=\s*=)/gm,
            'string': /(["'])(?:(?=(\\?))\2.)*?\1/g,
            'comment': /[;#].*/g,
            'number': /\b\d+(?:\.\d+)?\b/g
        },
        'swift': {
            'keyword': /\b(associatedtype|class|deinit|enum|extension|fileprivate|func|import|init|inout|internal|let|open|operator|private|protocol|public|static|struct|subscript|typealias|var|break|case|continue|default|defer|do|else|fallthrough|for|guard|if|in|repeat|return|switch|where|while|as|Any|catch|false|is|nil|rethrows|super|self|Self|throw|throws|true|try)\b/g,
            'string': /(["'])(?:(?=(\\?))\2.)*?\1/g,
            'comment': /(\/\/.*|\/\*[\s\S]*?\*\/)/g,
            'number': /\b\d+(?:\.\d+)?\b/g,
            'function': /\bfunc\s+([a-zA-Z_][a-zA-Z0-9_]*)\b/g,
            'class': /\b(class|struct|enum)\s+[A-Z][a-zA-Z0-9_]*\b/g
        },
        'kotlin': {
            'keyword': /\b(abstract|annotation|as|break|by|catch|class|companion|const|constructor|continue|crossinline|data|do|else|enum|expect|actual|external|false|final|finally|for|fun|get|if|import|in|infix|init|inline|inner|interface|internal|is|lateinit|noinline|null|object|open|operator|out|override|package|private|protected|public|reified|return|sealed|set|super|suspend|tailrec|this|throw|true|try|typealias|val|var|vararg|when|where|while|yield)\b/g,
            'string': /(["'])(?:(?=(\\?))\2.)*?\1/g,
            'comment': /(\/\/.*|\/\*[\s\S]*?\*\/)/g,
            'number': /\b\d+(?:\.\d+)?\b/g,
            'function': /\bfun\s+([a-zA-Z_][a-zA-Z0-9_]*)\b/g,
            'class': /\b(class|interface|object|enum)\s+[A-Z][a-zA-Z0-9_]*\b/g
        },
        'scala': {
            'keyword': /\b(abstract|case|catch|class|def|do|else|extends|false|final|finally|for|forSome|if|implicit|import|lazy|match|new|null|object|override|package|private|protected|return|sealed|super|this|throw|trait|try|true|type|val|var|while|with|yield)\b/g,
            'string': /(["']{1,3})([\s\S]*?)\1/g,
            'comment': /(\/\/.*|\/\*[\s\S]*?\*\/)/g,
            'number': /\b\d+(?:\.\d+)?\b/g,
            'function': /\bdef\s+([a-zA-Z_][a-zA-Z0-9_]*)\b/g,
            'class': /\b(class|trait|object)\s+[A-Z][a-zA-Z0-9_]*\b/g
        },
        'dart': {
            'keyword': /\b(abstract|as|assert|async|await|break|case|catch|class|const|continue|covariant|default|deferred|do|dynamic|else|enum|export|extends|extension|external|factory|false|final|finally|for|Function|get|hide|if|implements|import|in|interface|is|late|library|mixin|new|null|of|on|operator|part|rethrow|return|set|show|static|super|switch|sync|this|throw|true|try|typedef|var|void|while|with|yield)\b/g,
            'string': /(["'`])(?:(?=(\\?))\2.)*?\1/g,
            'comment': /(\/\/.*|\/\*[\s\S]*?\*\/)/g,
            'number': /\b\d+(?:\.\d+)?\b/g,
            'function': /\b[a-zA-Z_][a-zA-Z0-9_]*(?=\s*\()/g,
            'class': /\b(class|enum|mixin)\s+[A-Z][a-zA-Z0-9_]*\b/g
        },
        'lua': {
            'keyword': /\b(and|break|do|else|elseif|end|false|for|function|goto|if|in|local|nil|not|or|repeat|return|then|true|until|while)\b/g,
            'string': /(["'])(?:(?=(\\?))\2.)*?\1/g,
            'comment': /--\[\[[\s\S]*?\]\]|--.*$/gm,
            'number': /\b\d+(?:\.\d+)?\b/g,
            'function': /\bfunction\s+([a-zA-Z_][a-zA-Z0-9_]*)\b/g
        },
        'perl': {
            'keyword': /\b(continue|else|elsif|for|foreach|given|goto|if|last|my|next|our|package|redo|sub|unless|until|when|while|use|no)\b/g,
            'string': /(["'])(?:(?=(\\?))\2.)*?\1/g,
            'comment': /#.*/g,
            'number': /\b\d+(?:\.\d+)?\b/g,
            'variable': /\$[a-zA-Z_][a-zA-Z0-9_]*\b/g,
            'function': /\bsub\s+([a-zA-Z_][a-zA-Z0-9_]*)\b/g
        },
        'r': {
            'keyword': /\b(function|if|else|repeat|while|for|in|next|break|TRUE|FALSE|NULL|Inf|NaN|NA|NA_integer_|NA_real_|NA_complex_|NA_character_)\b/g,
            'string': /(["'])(?:(?=(\\?))\2.)*?\1/g,
            'comment': /#.*/g,
            'number': /\b\d+(?:\.\d+)?\b/g,
            'function': /\b([a-zA-Z.][a-zA-Z0-9_.]*)(?=\s*\()/g
        },
        'matlab': {
            'keyword': /\b(break|case|catch|classdef|continue|else|elseif|end|for|function|global|if|otherwise|parfor|persistent|return|spmd|switch|try|while)\b/g,
            'string': /(["'])(?:(?=(\\?))\2.)*?\1/g,
            'comment': /%.*/g,
            'number': /\b\d+(?:\.\d+)?\b/g,
            'function': /\bfunction\s+([a-zA-Z_][a-zA-Z0-9_]*)\b/g
        },
        'powershell': {
            'keyword': /\b(break|continue|do|else|elseif|for|foreach|function|if|in|return|switch|until|where|while|begin|process|end|param|filter|trap|throw|try|catch|finally)\b/gi,
            'string': /(["'])(?:(?=(\\?))\2.)*?\1/g,
            'comment': /#.*/g,
            'number': /\b\d+(?:\.\d+)?\b/g,
            'variable': /\$[A-Za-z_][A-Za-z0-9_:]*\b/g,
            'function': /\bfunction\s+([a-zA-Z_][a-zA-Z0-9_]*)\b/g
        },
        'makefile': {
            'keyword': /\b(ifdef|ifndef|endif|ifneq|ifeq|else|include|define|endef|override|export|unexport|private|vpath)\b/gm,
            'variable': /\$\([^)]+\)/g,
            'operator': /[:=|@\-]/g,
            'comment': /#.*/g
        },
        'dockerfile': {
            'keyword': /\b(FROM|RUN|CMD|LABEL|MAINTAINER|EXPOSE|ENV|ADD|COPY|ENTRYPOINT|VOLUME|USER|WORKDIR|ARG|ONBUILD|STOPSIGNAL|HEALTHCHECK|SHELL)\b/g,
            'string': /(["'])(?:(?=(\\?))\2.)*?\1/g,
            'comment': /#.*/g
        }
    };
    
    // エイリアスの定義
    const aliases = {
        'js': 'javascript', 'mjs': 'javascript', 'cjs': 'javascript',
        'ts': 'typescript',
        'py': 'python',
        'jsx': 'javascript', 'tsx': 'typescript',
        'c++': 'cpp', 'cc': 'cpp', 'hh': 'cpp', 'hpp': 'cpp', 'hxx': 'cpp', 'cxx': 'cpp',
        'cs': 'csharp',
        'sh': 'bash', 'zsh': 'bash', 'bash': 'bash',
        'ps1': 'powershell', 'psm1': 'powershell',
        'yml': 'yaml',
        'rb': 'ruby',
        'php3': 'php', 'php4': 'php', 'php5': 'php', 'phtml': 'php',
        'rs': 'rust',
        'go': 'go',
        'kt': 'kotlin', 'kts': 'kotlin',
        'swift': 'swift', 'scala': 'scala', 'dart': 'dart', 'lua': 'lua', 'pl': 'perl', 'r': 'r', 'm': 'matlab',
        'sql': 'sql', 'pgsql': 'sql', 'postgres': 'sql', 'mysql': 'sql', 'sqlite': 'sql',
        'make': 'makefile',
        'docker': 'dockerfile', 'dockerfile': 'dockerfile',
        'ini': 'ini', 'toml': 'toml'
    };
    
    // エイリアスを解決
    const resolvedLanguage = aliases[language] || language;
    let patterns = languagePatterns[resolvedLanguage];
    
    if (!patterns) {
        // サポートされていない言語の場合、基本的なハイライトのみ
        patterns = {
            'string': /(["'`])(?:(?=(\\?))\2.)*?\1/g,
            'comment': /(\/\/.*|\/\*[\s\S]*?\*\/|#.*)/g,
            'number': /\b\d+(\.\d+)?\b/g
        };
    }
    
    // 各行を解析
    for (let lineNum = startLine; lineNum <= endLine && lineNum < document.lineCount; lineNum++) {
        const line = document.lineAt(lineNum);
        const lineText = line.text;
        
        // 各パターンに対してマッチングを実行
        for (const [tokenType, pattern] of Object.entries(patterns)) {
            let match;
            pattern.lastIndex = 0; // パターンをリセット
            
            while ((match = pattern.exec(lineText)) !== null) {
                const startPos = new vscode.Position(lineNum, match.index);
                const endPos = new vscode.Position(lineNum, match.index + match[0].length);
                const range = new vscode.Range(startPos, endPos);
                
                if (!syntaxRanges.has(tokenType)) {
                    syntaxRanges.set(tokenType, []);
                }
                syntaxRanges.get(tokenType).push(range);
            }
        }
    }
    
    return syntaxRanges;
}

function updateHorizontalRuleDecorations(editor) {
    if (!editor || !horizontalRuleDecoration) return;
    
    const document = editor.document;
    const ranges = [];
    
    for (let i = 0; i < document.lineCount; i++) {
        const lineText = document.lineAt(i).text.trim();
        // ---、***、___ などの水平線パターンを検出
        if (/^(-{3,}|\*{3,}|_{3,})$/.test(lineText)) {
            const range = new vscode.Range(new vscode.Position(i, 0), new vscode.Position(i, document.lineAt(i).text.length));
            ranges.push(range);
        }
    }
    
    editor.setDecorations(horizontalRuleDecoration, ranges);
}

function clearAllDecorations() {
    // 装飾をクリア（破棄はせずに空の配列を設定）
    if (checkedDecoration && vscode.window.activeTextEditor) {
        console.log('[clearAllDecorations] Clearing decorations');
        vscode.window.activeTextEditor.setDecorations(checkedDecoration, []);
    }
}

function toggleCheckbox(editor, lineNumber) {
    const line = editor.document.lineAt(lineNumber).text;
    let newLine;
    let shouldMoveToBottom = false;
    let cursorPosition = null;
    
    console.log(`[toggleCheckbox] Toggling line ${lineNumber}: "${line}"`);
    
    if (line.includes('- [ ]')) {
        newLine = line.replace('- [ ]', '- [x]');
        shouldMoveToBottom = vscode.workspace.getConfiguration('obsidianMarkdown').get('autoMoveCompletedTasks', false);
        // チェックした時も、カーソルをチェックボックス後のスペースに配置
        const checkboxEndMatch = newLine.match(/^(\s*-\s\[[xX]\]\s*)/);
        if (checkboxEndMatch) {
            cursorPosition = checkboxEndMatch[1].length;
        }
        console.log('[toggleCheckbox] Checking checkbox');
    } else if (line.includes('- [x]') || line.includes('- [X]')) {
        newLine = line.replace(/- \[[xX]\]/, '- [ ]');
        // チェックを外した時、カーソルをチェックボックス後のスペースに配置
        const checkboxEndMatch = newLine.match(/^(\s*-\s\[\s\]\s*)/);
        if (checkboxEndMatch) {
            cursorPosition = checkboxEndMatch[1].length;
        }
        console.log('[toggleCheckbox] Unchecking checkbox');
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
        // カーソル位置を設定（チェック/解除両方の場合）
        if (cursorPosition !== null) {
            const newPosition = new vscode.Position(lineNumber, cursorPosition);
            editor.selection = new vscode.Selection(newPosition, newPosition);
        }
        
        // 完了タスクを下部へ移動（設定が有効な場合）
        if (shouldMoveToBottom) {
            moveCompletedTaskToBottom(editor, lineNumber);
        }
        
        // 変更後すぐに装飾を更新
        console.log('[toggleCheckbox] Edit complete, updating decorations');
        updateAllDecorations(editor);
    });
}

function moveCompletedTaskToBottom(editor, lineNumber) {
    const document = editor.document;
    const currentLine = document.lineAt(lineNumber).text;
    const currentIndent = currentLine.match(/^\s*/)[0].length;
    const isCompleted = currentLine.match(/^\s*-\s\[[xX]\]/);
    
    // 同じインデントレベルのタスクの範囲を特定
    let taskStart = lineNumber;
    let taskEnd = lineNumber;
    let lastUncheckedLine = -1;
    let firstCheckedLine = -1;
    let tasks = [];
    
    // 上方向に同じインデントレベルのタスクを探す
    for (let i = lineNumber - 1; i >= 0; i--) {
        const line = document.lineAt(i).text;
        if (line.trim() === '') break; // 空行で停止
        
        const lineIndent = line.match(/^\s*/)[0].length;
        if (lineIndent < currentIndent) break; // インデントが浅い場合は停止
        if (lineIndent === currentIndent && line.match(/^\s*-\s\[[ xX]\]/)) {
            taskStart = i;
        }
        if (lineIndent > currentIndent) break; // インデントが深い場合は停止
    }
    
    // 下方向に同じインデントレベルのタスクを探す
    for (let i = lineNumber + 1; i < document.lineCount; i++) {
        const line = document.lineAt(i).text;
        if (line.trim() === '') break; // 空行で停止
        
        const lineIndent = line.match(/^\s*/)[0].length;
        if (lineIndent < currentIndent) break; // インデントが浅い場合は停止
        if (lineIndent === currentIndent && line.match(/^\s*-\s\[[ xX]\]/)) {
            taskEnd = i;
        }
        if (lineIndent > currentIndent) break; // インデントが深い場合は停止
    }
    
    // タスクリスト内のタスクを収集し、最後の未完了タスクと最初の完了タスクの位置を特定
    for (let i = taskStart; i <= taskEnd; i++) {
        const line = document.lineAt(i).text;
        const lineIndent = line.match(/^\s*/)[0].length;
        
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
    
    // 移動先を決定
    let targetLine = -1;
    
    if (isCompleted) {
        // チェックした場合：未完了タスクの後（最後）に移動
        targetLine = lastUncheckedLine !== -1 ? lastUncheckedLine : taskEnd;
    } else {
        // チェックを外した場合：完了タスクの前（未完了タスクの最後）に移動
        if (firstCheckedLine !== -1) {
            // 完了タスクがある場合はその前に挿入
            targetLine = firstCheckedLine - 1;
        }
    }
    
    // 移動が必要な場合
    if (targetLine !== -1 && targetLine !== lineNumber) {
        editor.edit(editBuilder => {
            const textToMove = currentLine + '\n';
            
            if (targetLine < lineNumber) {
                // 上に移動する場合
                editBuilder.insert(new vscode.Position(targetLine + 1, 0), textToMove);
                editBuilder.delete(new vscode.Range(
                    lineNumber + 1, 0,
                    lineNumber + 2, 0
                ));
            } else {
                // 下に移動する場合
                editBuilder.delete(new vscode.Range(
                    lineNumber, 0,
                    lineNumber + 1, 0
                ));
                editBuilder.insert(new vscode.Position(targetLine, 0), textToMove);
            }
        }).then(() => {
            const action = isCompleted ? 'completed' : 'unchecked';
            console.log(`[moveCompletedTaskToBottom] Moved ${action} task from line ${lineNumber} to ${targetLine}`);
        });
    }
}

function registerCommands(context) {
    debugLog('Registering all commands...');
    const conflicts = [];
    const safeRegister = (commandId, handler) => {
        try {
            const disposable = vscode.commands.registerCommand(commandId, handler);
            context.subscriptions.push(disposable);
        } catch (error) {
            const message = error && typeof error.message === 'string' ? error.message : '';
            if (message.includes(`command '${commandId}' already exists`)) {
                conflicts.push(commandId);
                debugLog(`[WARN] Command "${commandId}" already exists (another extension may still be active). Skipping registration.`);
            } else {
                throw error;
            }
        }
    };
    // スマートEnter（リスト継続/解除）
    safeRegister('obsidianMarkdown.smartEnter', async () => {
        try {
            await smartEnterCommand();
        } catch (e) {
            // 失敗時は通常の改行にフォールバック
            await vscode.commands.executeCommand('type', { text: '\n' });
        }
    });

    // スマートカーソル移動（左）コマンド - Cmd+Left
    safeRegister('obsidianMarkdown.smartMoveLeft', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        
        const position = editor.selection.active;
        const line = editor.document.lineAt(position.line);
        const text = line.text;
        
        // パターンマッチングで行頭の要素を検出
        let contentStart = 0;
        
        // ヘッディング（# から ###### まで）
        const headingMatch = text.match(/^(#{1,6}\s+)/);
        if (headingMatch) {
            contentStart = headingMatch[1].length;
        }
        // チェックボックス
        else if (text.match(/^(\s*-\s\[[\sx]?\]\s*)/i)) {
            const match = text.match(/^(\s*-\s\[[\sx]?\]\s*)/i);
            contentStart = match[1].length;
        }
        // 順序付きリスト
        else if (text.match(/^(\s*\d+\.\s+)/)) {
            const match = text.match(/^(\s*\d+\.\s+)/);
            contentStart = match[1].length;
        }
        // 順序なしリスト（- または * または +）
        else if (text.match(/^(\s*[-*+]\s+)/)) {
            const match = text.match(/^(\s*[-*+]\s+)/);
            contentStart = match[1].length;
        }
        // 引用（>）
        else if (text.match(/^(>\s*)+/)) {
            const match = text.match(/^(>\s*)+/);
            contentStart = match[0].length;
        }
        // コードブロック
        else if (text.match(/^(```\w*\s*)/)) {
            const match = text.match(/^(```\w*\s*)/);
            contentStart = match[1].length;
        }
        
        // Cmd+Left: コンテンツ開始位置にカーソル移動のみ
        const newPosition = new vscode.Position(position.line, contentStart);
        editor.selection = new vscode.Selection(newPosition, newPosition);
    });
    
    // スマート選択（左）コマンド - Shift+Cmd+Left
    safeRegister('obsidianMarkdown.smartSelectLeft', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        
        const selection = editor.selection;
        const position = selection.active;
        const line = editor.document.lineAt(position.line);
        const text = line.text;
        
        // パターンマッチングで行頭の要素を検出
        let contentStart = 0;
        let elementMatch = null;
        const getPrevWordBoundary = (str, from, min) => {
            // 直前の空白をスキップ
            let i = from;
            if (i <= min) return min;
            while (i > min && /\s/.test(str[i - 1])) i--;
            if (i <= min) return min;
            // 単語の種類（英数字/アンダースコア）か、それ以外（記号など）かで連続領域を左へ辿る
            const isWord = /[A-Za-z0-9_]/.test(str[i - 1]);
            while (i > min && /[A-Za-z0-9_]/.test(str[i - 1]) === isWord && !/\s/.test(str[i - 1])) {
                i--;
            }
            return i;
        };
        
        // ヘッディング（# から ###### まで）
        const headingMatch = text.match(/^(#{1,6}\s+)/);
        if (headingMatch) {
            contentStart = headingMatch[1].length;
            elementMatch = headingMatch;
        }
        // チェックボックス
        else if (text.match(/^(\s*-\s\[[\sx]?\]\s*)/i)) {
            const match = text.match(/^(\s*-\s\[[\sx]?\]\s*)/i);
            contentStart = match[1].length;
            elementMatch = match;
            
            // 空のチェックボックスの場合（テキストがない場合）
            const textContent = text.substring(contentStart).trim();
            if (textContent === '') {
                // 行全体を選択（行頭から行末）
                // アンカーを右側、アクティブを左側にすることで、カーソルを左側に配置
                const newSelection = new vscode.Selection(
                    new vscode.Position(position.line, text.length),
                    new vscode.Position(position.line, 0)
                );
                editor.selection = newSelection;
                return;
            }
        }
        // 順序付きリスト
        else if (text.match(/^(\s*\d+\.\s+)/)) {
            const match = text.match(/^(\s*\d+\.\s+)/);
            contentStart = match[1].length;
            elementMatch = match;
        }
        // 順序なしリスト（- または * または +）
        else if (text.match(/^(\s*[-*+]\s+)/)) {
            const match = text.match(/^(\s*[-*+]\s+)/);
            contentStart = match[1].length;
            elementMatch = match;
            
            // 空のリストの場合（テキストがない場合）
            const textContent = text.substring(contentStart).trim();
            if (textContent === '') {
                // 行全体を選択（行頭から行末）
                // アンカーを右側、アクティブを左側にすることで、カーソルを左側に配置
                const newSelection = new vscode.Selection(
                    new vscode.Position(position.line, text.length),
                    new vscode.Position(position.line, 0)
                );
                editor.selection = newSelection;
                return;
            }
        }
        // 引用（>）
        else if (text.match(/^(>\s*)+/)) {
            const match = text.match(/^(>\s*)+/);
            contentStart = match[0].length;
            elementMatch = match;
        }
        // コードブロック
        else if (text.match(/^(```\w*\s*)/)) {
            const match = text.match(/^(```\w*\s*)/);
            contentStart = match[1].length;
            elementMatch = match;
        }
        
        // 現在の選択範囲を確認
        const currentSelectionStart = selection.start.character;
        const currentSelectionEnd = selection.end.character;
        const lineIndent = text.match(/^\s*/)[0].length;

        // まず、コンテンツ内にカーソルがある場合は「左へ1語ずつ」選択を優先
        if (selection.isEmpty && position.character > contentStart) {
            const left = getPrevWordBoundary(text, position.character, contentStart);
            const newSelection = new vscode.Selection(
                new vscode.Position(position.line, position.character),
                new vscode.Position(position.line, left)
            );
            editor.selection = newSelection;
            lastSelectionRange = 'word-left';
            return;
        }

        // 既にコンテンツ内で選択済みなら、さらに左へ1語分拡張
        if (!selection.isEmpty && selection.start.character >= contentStart && selection.end.character > selection.start.character) {
            const left = getPrevWordBoundary(text, selection.start.character, contentStart);
            const newSelection = new vscode.Selection(
                new vscode.Position(position.line, selection.end.character),
                new vscode.Position(position.line, left)
            );
            editor.selection = newSelection;
            lastSelectionRange = 'word-left';
            return;
        }

        // ここからは段階的な拡大（コンテンツ -> 行全体 -> 階層）
        if (!selection.isEmpty && currentSelectionStart === contentStart && currentSelectionEnd === text.length) {
            // 段階2: 行全体を選択（行頭から行末）
            const newSelection = new vscode.Selection(
                new vscode.Position(position.line, text.length),
                new vscode.Position(position.line, 0)
            );
            editor.selection = newSelection;
            lastSelectionRange = 'full-line';
            return;
        }

        if (!selection.isEmpty && currentSelectionStart === 0 && currentSelectionEnd === text.length) {
            // 段階3: 同じインデントの階層全体を選択
            const currentIndent = text.match(/^\s*/)[0].length;
            let startLine = position.line;
            let endLine = position.line;
            
            // 上方向に同じインデントの行を探す
            for (let i = position.line - 1; i >= 0; i--) {
                const lineText = editor.document.lineAt(i).text;
                if (lineText.trim() === '') break; // 空行で停止
                const indent = lineText.match(/^\s*/)[0].length;
                if (indent !== currentIndent) break;
                if (lineText.match(/^\s*[-*+\d]|^\s*-\s\[|^#{1,6}\s/)) {
                    startLine = i;
                } else {
                    break;
                }
            }
            
            // 下方向に同じインデントの行を探す
            for (let i = position.line + 1; i < editor.document.lineCount; i++) {
                const lineText = editor.document.lineAt(i).text;
                if (lineText.trim() === '') break; // 空行で停止
                const indent = lineText.match(/^\s*/)[0].length;
                if (indent !== currentIndent) break;
                if (lineText.match(/^\s*[-*+\d]|^\s*-\s\[|^#{1,6}\s/)) {
                    endLine = i;
                } else {
                    break;
                }
            }
            
            // 階層全体を選択
            const newSelection = new vscode.Selection(
                new vscode.Position(endLine, editor.document.lineAt(endLine).text.length),
                new vscode.Position(startLine, 0)
            );
            editor.selection = newSelection;
            lastSelectionRange = 'hierarchy';
            return;
        }

        // デフォルトの段階1: コンテンツ部分（要素後から行末）
        const newSelection = new vscode.Selection(
            new vscode.Position(position.line, text.length),
            new vscode.Position(position.line, contentStart)
        );
        editor.selection = newSelection;
        lastSelectionRange = 'content';
    });
    
    // 行の上下移動コマンド - Cmd+Shift+Up/Down（階層構造を考慮）
    safeRegister('obsidianMarkdown.moveLineUp', () => {
        moveLineWithHierarchy(vscode.window.activeTextEditor, 'up');
    });
    
    safeRegister('obsidianMarkdown.moveLineDown', () => {
        moveLineWithHierarchy(vscode.window.activeTextEditor, 'down');
    });
    
    // スマート選択（全体）コマンド
    safeRegister('obsidianMarkdown.smartSelectAll', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        
        const position = editor.selection.active;
        const document = editor.document;
        
        // コードブロック内かチェック
        let inFence = false;
        let fenceStart = -1;
        let fenceEnd = -1;

        for (let i = 0; i < document.lineCount; i++) {
            const t = document.lineAt(i).text;
            if (t.startsWith('```')) {
                if (!inFence) {
                    inFence = true;
                    fenceStart = i;
                } else {
                    fenceEnd = i;
                    // 判定: 現在位置がこのフェンス内（コンテンツ領域）か
                    if (position.line > fenceStart && position.line < fenceEnd) {
                        const startPos = new vscode.Position(fenceStart + 1, 0);
                        const endPos = new vscode.Position(fenceEnd, 0); // 終了フェンスの行頭まで
                        const desired = new vscode.Selection(startPos, endPos);

                        const curSel = editor.selection;
                        const sameAsDesired = curSel.start.line === desired.start.line &&
                            curSel.start.character === desired.start.character &&
                            curSel.end.line === desired.end.line &&
                            curSel.end.character === desired.end.character;

                        if (sameAsDesired) {
                            // 2度目の押下: ドキュメント全体
                            vscode.commands.executeCommand('editor.action.selectAll');
                        } else {
                            // 1度目の押下: コードブロック内容のみ
                            editor.selection = desired;
                        }
                        return;
                    } else {
                        // 次のブロックへ
                        inFence = false;
                        fenceStart = -1;
                        fenceEnd = -1;
                    }
                }
            }
        }

        // フェンス外: 通常のCmd+A
        vscode.commands.executeCommand('editor.action.selectAll');
    });
    
    // その他のコマンド
    safeRegister('obsidianMarkdown.toggleCheckbox', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        toggleCheckbox(editor, editor.selection.active.line);
    });

    safeRegister('obsidianMarkdown.formatTable', () => {
        debugLog('[COMMAND] Format Table command invoked');
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            debugLog('[COMMAND] No active editor');
            return;
        }
        const line = editor.selection.active.line;
        debugLog(`[COMMAND] Formatting table at line ${line}`);
        formatTableAtLine(editor, line);
    });

    safeRegister('obsidianMarkdown.increaseIndent', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        adjustIndent(editor, true);
    });
    
    safeRegister('obsidianMarkdown.decreaseIndent', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        adjustIndent(editor, false);
    });

    if (conflicts.length > 0) {
        const conflictMessage = `Markdown Inline Preview: Some commands could not be registered because they already exist (${conflicts.join(', ')}). Another copy of the extension may still be active.`;
        debugLog(`[WARN] ${conflictMessage}`);
        vscode.window.showWarningMessage(conflictMessage);
    }

    debugLog(`All commands registered successfully${conflicts.length ? ' (with conflicts skipped)' : ''}`);
}

function adjustIndent(editor, increase) {
    const selection = editor.selection;
    const document = editor.document;
    // 常に2つのスペースを使用
    const indentStr = '  ';
    
    // 複数行選択の場合
    if (!selection.isEmpty) {
        const startLine = selection.start.line;
        const endLine = selection.end.line;
        
        editor.edit(editBuilder => {
            for (let i = startLine; i <= endLine; i++) {
                const line = document.lineAt(i).text;
                const range = new vscode.Range(i, 0, i, line.length);
                
                if (increase) {
                    // 行頭にスペースでインデント追加
                    editBuilder.replace(range, indentStr + line);
                } else {
                    // インデント削除（2スペースを削除）
                    let newLine = line;
                    if (/^\t/.test(newLine)) {
                        newLine = newLine.replace(/^\t/, '');
                    } else if (newLine.startsWith('  ')) {
                        newLine = newLine.slice(2);
                    } else if (/^ /.test(newLine)) {
                        // 1スペースしかない場合はそれを削除
                        newLine = newLine.slice(1);
                    }
                    if (newLine !== line) editBuilder.replace(range, newLine);
                }
            }
        });
    } else {
        // 単一行の場合
        const line = document.lineAt(selection.active.line).text;
        const cursorPos = selection.active.character;
        
        editor.edit(editBuilder => {
            const range = new vscode.Range(
                selection.active.line, 0,
                selection.active.line, line.length
            );
            
            if (increase) {
                // インデント追加（スペース）
                editBuilder.replace(range, indentStr + line);
            } else {
                // インデント削除（2スペースを削除）
                let newLine = line;
                if (/^\t/.test(newLine)) {
                    newLine = newLine.replace(/^\t/, '');
                } else if (newLine.startsWith('  ')) {
                    newLine = newLine.slice(2);
                } else if (/^ /.test(newLine)) {
                    // 1スペースしかない場合はそれを削除
                    newLine = newLine.slice(1);
                }
                if (newLine !== line) editBuilder.replace(range, newLine);
            }
        }).then(() => {
            // カーソル位置を調整
            if (increase) {
                const newPosition = new vscode.Position(selection.active.line, cursorPos + 2);
                editor.selection = new vscode.Selection(newPosition, newPosition);
            } else {
                const line = document.lineAt(selection.active.line).text;
                const originalLine = document.lineAt(selection.active.line).text;
                const diff = originalLine.length - line.length;
                const newPos = Math.max(0, cursorPos - diff);
                const newPosition = new vscode.Position(selection.active.line, newPos);
                editor.selection = new vscode.Selection(newPosition, newPosition);
            }
        });
    }
}

function moveLineWithHierarchy(editor, direction) {
    if (!editor) return;
    
    const selection = editor.selection;
    const startLine = selection.start.line;
    const endLine = selection.end.line;
    const document = editor.document;
    
    // 境界チェック
    if (direction === 'up' && startLine === 0) return;
    if (direction === 'down' && endLine === document.lineCount - 1) return;
    
    // 選択範囲とその子要素を収集
    const currentIndent = document.lineAt(startLine).text.match(/^\s*/)[0].length;
    let blockEndLine = endLine;
    
    // 子要素を含めて範囲を拡張
    for (let i = endLine + 1; i < document.lineCount; i++) {
        const line = document.lineAt(i).text;
        if (line.trim() === '') break; // 空行で停止
        const indent = line.match(/^\s*/)[0].length;
        if (indent <= currentIndent) break; // 同じか浅いインデントで停止
        blockEndLine = i;
    }
    
    // 移動先のインデントレベルを決定
    let targetIndent = currentIndent;
    let targetLine = direction === 'up' ? startLine - 1 : blockEndLine + 1;
    
    if (direction === 'up') {
        // 上に移動：上の行のインデントを確認
        if (targetLine >= 0) {
            const targetText = document.lineAt(targetLine).text;
            if (targetText.trim() !== '') {
                // リスト項目の場合、そのインデントに合わせる
                if (targetText.match(/^\s*[-*+\d]|^\s*-\s\[/)) {
                    targetIndent = targetText.match(/^\s*/)[0].length;
                }
            }
        }
    } else {
        // 下に移動：下の行のインデントを確認
        if (targetLine < document.lineCount) {
            const targetText = document.lineAt(targetLine).text;
            if (targetText.trim() !== '') {
                // リスト項目の場合、そのインデントに合わせる
                if (targetText.match(/^\s*[-*+\d]|^\s*-\s\[/)) {
                    targetIndent = targetText.match(/^\s*/)[0].length;
                }
            }
        }
    }
    
    // インデントの差分を計算
    const indentDiff = targetIndent - currentIndent;
    const indentString = indentDiff > 0 ? ' '.repeat(indentDiff) : '';
    
    editor.edit(editBuilder => {
        // 移動するブロックを収集
        const lines = [];
        for (let i = startLine; i <= blockEndLine; i++) {
            let lineText = document.lineAt(i).text;
            // インデントを調整
            if (indentDiff > 0) {
                lineText = indentString + lineText;
            } else if (indentDiff < 0) {
                lineText = lineText.substring(-indentDiff);
            }
            lines.push(lineText);
        }
        const blockText = lines.join('\n');
        
        if (direction === 'up') {
            // 上の行を取得
            const lineAbove = document.lineAt(targetLine).text;
            
            // 削除と挿入
            const deleteRange = new vscode.Range(
                targetLine, 0,
                blockEndLine + 1, 0
            );
            const newText = blockText + '\n' + lineAbove + '\n';
            editBuilder.replace(deleteRange, newText);
        } else {
            // 下の行を取得
            const lineBelow = document.lineAt(targetLine).text;
            
            // 削除と挿入
            const deleteRange = new vscode.Range(
                startLine, 0,
                targetLine + 1, 0
            );
            const newText = lineBelow + '\n' + blockText + '\n';
            editBuilder.replace(deleteRange, newText);
        }
    }).then(() => {
        // 選択範囲を更新
        const lineDiff = direction === 'up' ? -1 : 1;
        const newSelection = new vscode.Selection(
            startLine + lineDiff, selection.start.character,
            endLine + lineDiff, selection.end.character
        );
        editor.selection = newSelection;
        // 移動後、テーブル内であれば自動整形
        try {
            formatTableAtLine(editor, editor.selection.active.line);
        } catch (_) {}
    });
}

function applyMarkdownSettings() {
    // VS Code の API は言語特化セクション（[markdown]）の直接更新を推奨していないため
    // ここでは競合しやすい Markdown 拡張の機能のみ明示的に無効化する
    const config = vscode.workspace.getConfiguration();
    config.update('markdown.extension.completion.enabled', false, vscode.ConfigurationTarget.Workspace);
    config.update('markdown.extension.tableFormatter.enabled', false, vscode.ConfigurationTarget.Workspace);
    console.log('Disabled competing Markdown extension features (completion/tableFormatter)');
}

function deactivate() {
    // 装飾タイプを破棄
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
    // 言語装飾を破棄
    for (const [lang, decorations] of languageDecorations) {
        for (const decoration of decorations.values()) {
            decoration.dispose();
        }
    }
    languageDecorations.clear();
    if (updateTimer) {
        clearTimeout(updateTimer);
    }
}

module.exports = {
    activate,
    deactivate
};
