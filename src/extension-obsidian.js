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

function activate(context) {
    console.log('Markdown Inline Preview Active');
    
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
        color: '#abb2bf',
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
    if (editor && editor.document.languageId === 'markdown') {
        updateAllDecorations(editor);
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
    context.subscriptions.push(
        vscode.window.onDidChangeTextEditorSelection(event => {
            const editor = event.textEditor;
            if (!editor || editor.document.languageId !== 'markdown') return;
            
            const position = event.selections[0].active;
            
            // 編集中の行が変わった場合、装飾を更新
            if (position.line !== currentEditingLine) {
                const previousEditingLine = currentEditingLine;
                currentEditingLine = position.line;
                
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
                        // チェックボックス記号の範囲内のみクリック可能
                        const checkboxStart = text.indexOf('[');
                        const checkboxEnd = text.indexOf(']') + 1;
                        
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

    // 事前に、空のアイテム（マーカーのみ）の行はマーカーを削除して改行のみ
    const preEdits = [];
    const continuationTexts = new Array(selections.length).fill(null);

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
                // マーカーだけの行で Enter: マーカー削除（インデントは残す）
                if (indent.length > 0) {
                    // インデントがある場合はインデントレベルを1段階下げる
                    let newIndent = '';
                    if (indent.startsWith('\t')) {
                        // タブインデントの場合
                        newIndent = indent.substring(1);
                    } else if (indent.startsWith('  ')) {
                        // 2スペースインデントの場合
                        newIndent = indent.substring(2);
                    } else if (indent.startsWith(' ')) {
                        // 1スペースの場合は削除
                        newIndent = '';
                    }
                    preEdits.push({
                        range: new vscode.Range(lineIdx, 0, lineIdx, lineText.length),
                        text: newIndent
                    });
                } else {
                    // インデントがない場合は行全体を削除
                    preEdits.push({
                        range: new vscode.Range(lineIdx, 0, lineIdx, lineText.length),
                        text: ''
                    });
                }
                continuationTexts[i] = null;
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
                // マーカーだけの行で Enter: マーカー削除（インデントは残す）
                if (indent.length > 0) {
                    // インデントがある場合はインデントレベルを1段階下げる
                    let newIndent = '';
                    if (indent.startsWith('\t')) {
                        // タブインデントの場合
                        newIndent = indent.substring(1);
                    } else if (indent.startsWith('  ')) {
                        // 2スペースインデントの場合
                        newIndent = indent.substring(2);
                    } else if (indent.startsWith(' ')) {
                        // 1スペースの場合は削除
                        newIndent = '';
                    }
                    preEdits.push({
                        range: new vscode.Range(lineIdx, 0, lineIdx, lineText.length),
                        text: newIndent
                    });
                } else {
                    // インデントがない場合は行全体を削除
                    preEdits.push({
                        range: new vscode.Range(lineIdx, 0, lineIdx, lineText.length),
                        text: ''
                    });
                }
                continuationTexts[i] = null;
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
                // マーカーだけの行で Enter: マーカー削除（インデントは残す）
                if (indent.length > 0) {
                    // インデントがある場合はインデントレベルを1段階下げる
                    let newIndent = '';
                    if (indent.startsWith('\t')) {
                        // タブインデントの場合
                        newIndent = indent.substring(1);
                    } else if (indent.startsWith('  ')) {
                        // 2スペースインデントの場合
                        newIndent = indent.substring(2);
                    } else if (indent.startsWith(' ')) {
                        // 1スペースの場合は削除
                        newIndent = '';
                    }
                    preEdits.push({
                        range: new vscode.Range(lineIdx, 0, lineIdx, lineText.length),
                        text: newIndent
                    });
                } else {
                    // インデントがない場合は行全体を削除
                    preEdits.push({
                        range: new vscode.Range(lineIdx, 0, lineIdx, lineText.length),
                        text: ''
                    });
                }
                continuationTexts[i] = null;
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

    // 通常の改行を実行（インデントはVSCodeに任せる）
    await vscode.commands.executeCommand('type', { text: '\n' });

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
}

// 全角判定（代表的なCJK/全角記号）
function isFullWidthChar(ch) {
    if (!ch) return false;
    const code = ch.codePointAt(0);
    return (
        // CJK, Hiragana, Katakana
        (code >= 0x3000 && code <= 0x30FF) ||
        // CJK Unified Ideographs
        (code >= 0x4E00 && code <= 0x9FFF) ||
        // CJK Compatibility Ideographs
        (code >= 0xF900 && code <= 0xFAFF) ||
        // Fullwidth forms (common fullwidth punctuation)
        (code >= 0xFF01 && code <= 0xFF60) ||
        (code >= 0xFFE0 && code <= 0xFFE6)
    );
}

// 表示幅（全角=2, 半角=1）
function getStringWidth(str) {
    if (!str) return 0;
    let width = 0;
    for (let i = 0; i < str.length; i++) {
        const ch = str[i];
        width += isFullWidthChar(ch) ? 2 : 1;
    }
    return width;
}

// セル単位のパディング（全角は全角スペース優先、半角は半角スペース優先）
function padCell(content, targetWidth) {
    const current = getStringWidth(content);
    let remain = targetWidth - current;
    if (remain <= 0) return content;

    const prefersFull = [...content].some(isFullWidthChar);
    const wideSpace = '　'; // 全角スペース
    const narrowSpace = ' ';

    let pad = '';
    if (prefersFull) {
        while (remain >= 2) { pad += wideSpace; remain -= 2; }
        while (remain > 0) { pad += narrowSpace; remain -= 1; }
    } else {
        while (remain > 0) { pad += narrowSpace; remain -= 1; }
    }
    return content + pad;
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
    if (!editor) return;
    const document = editor.document;
    if (lineIndex < 0 || lineIndex >= document.lineCount) return;

    const { start, end } = findTableBlock(document, lineIndex);
    if (start === undefined || end === undefined) return;

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
    if (rows.length < 2) return; // 表らしさ無し

    // セパレータ行が存在することを確認（なければスキップ）
    if (!rows.some(r => r.isSep)) return;

    // 列幅計算（セパレータ行以外）
    const colWidths = Array(maxCols).fill(3);
    for (const r of rows) {
        if (r.isSep) continue;
        for (let c = 0; c < maxCols; c++) {
            const cell = (r.cells[c] || '').trim();
            const w = Math.max(3, getStringWidth(cell));
            if (w > colWidths[c]) colWidths[c] = w;
        }
    }

    // 行を再構築
    const replacements = [];
    for (const r of rows) {
        let out = '|';
        if (r.isSep) {
            for (let c = 0; c < maxCols; c++) {
                const raw = (r.cells[c] || '').replace(/\s+/g, '');
                const left = raw.startsWith(':');
                const right = raw.endsWith(':');
                const dashes = '-'.repeat(Math.max(3, colWidths[c]));
                let seg = dashes;
                if (left && right) seg = ':' + dashes.slice(1, -1) + ':';
                else if (left) seg = ':' + dashes.slice(1);
                else if (right) seg = dashes.slice(0, -1) + ':';
                out += ' ' + seg + ' |';
            }
        } else {
            for (let c = 0; c < maxCols; c++) {
                const cell = (r.cells[c] || '').trim();
                const padded = padCell(cell, colWidths[c]);
                out += ' ' + padded + ' |';
            }
        }
        replacements.push({ line: r.line, text: out });
    }

    // 置換（まとめて）
    editor.edit(editBuilder => {
        for (const rep of replacements) {
            const orig = document.lineAt(rep.line).text;
            if (orig === rep.text) continue;
            const range = new vscode.Range(rep.line, 0, rep.line, orig.length);
            editBuilder.replace(range, rep.text);
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
    const ranges = [];

    let inFence = false;
    let fenceStart = -1;
    for (let i = 0; i < document.lineCount; i++) {
        const lineText = document.lineAt(i).text;
        if (lineText.startsWith('```')) {
            if (!inFence) {
                inFence = true;
                fenceStart = i;
            } else {
                // 終了フェンス
                const range = new vscode.Range(new vscode.Position(fenceStart, 0), new vscode.Position(i, lineText.length));
                ranges.push(range);
                inFence = false;
                fenceStart = -1;
            }
        }
    }
    // 閉じられていないフェンスは末尾まで適用
    if (inFence && fenceStart >= 0) {
        const lastLine = document.lineCount - 1;
        const range = new vscode.Range(new vscode.Position(fenceStart, 0), new vscode.Position(lastLine, document.lineAt(lastLine).text.length));
        ranges.push(range);
    }

    editor.setDecorations(codeBlockDecoration, ranges);
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
    // スマートEnter（リスト継続/解除）
    context.subscriptions.push(
        vscode.commands.registerCommand('obsidianMarkdown.smartEnter', async () => {
            try {
                await smartEnterCommand();
            } catch (e) {
                // 失敗時は通常の改行にフォールバック
                await vscode.commands.executeCommand('type', { text: '\n' });
            }
        })
    );

    // スマートカーソル移動（左）コマンド - Cmd+Left
    context.subscriptions.push(
        vscode.commands.registerCommand('obsidianMarkdown.smartMoveLeft', () => {
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
        })
    );
    
    // スマート選択（左）コマンド - Shift+Cmd+Left
    context.subscriptions.push(
        vscode.commands.registerCommand('obsidianMarkdown.smartSelectLeft', () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;
            
            const selection = editor.selection;
            const position = selection.active;
            const line = editor.document.lineAt(position.line);
            const text = line.text;
            
            // パターンマッチングで行頭の要素を検出
            let contentStart = 0;
            let elementMatch = null;
            
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
                    // カーソルを行頭（インデント後）に移動
                    // アンカーを右側、アクティブを左側にすることで、カーソルを左側に配置
                    const indentLength = text.match(/^\s*/)[0].length;
                    const newSelection = new vscode.Selection(
                        new vscode.Position(position.line, text.length),
                        new vscode.Position(position.line, indentLength)
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
                    // カーソルを行頭（インデント後）に移動
                    // アンカーを右側、アクティブを左側にすることで、カーソルを左側に配置
                    const indentLength = text.match(/^\s*/)[0].length;
                    const newSelection = new vscode.Selection(
                        new vscode.Position(position.line, text.length),
                        new vscode.Position(position.line, indentLength)
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
            
            // 現在の選択範囲を確認し、段階的に拡大
            const currentSelectionStart = selection.start.character;
            const currentSelectionEnd = selection.end.character;
            const lineIndent = text.match(/^\s*/)[0].length;
            
            // 段階1: コンテンツ部分のみ選択（要素後から行末）
            if (!selection.isEmpty && currentSelectionStart === contentStart && currentSelectionEnd === text.length) {
                // 段階2: 行全体を選択（インデントを除いた部分）
                // アンカーを右側、アクティブを左側にすることで、カーソルを左側に配置
                const newSelection = new vscode.Selection(
                    new vscode.Position(position.line, text.length),
                    new vscode.Position(position.line, lineIndent)
                );
                editor.selection = newSelection;
                lastSelectionRange = 'full-line';
            } else if (!selection.isEmpty && currentSelectionStart === lineIndent && currentSelectionEnd === text.length) {
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
                // アンカーを下側、アクティブを上側にすることで、カーソルを上側に配置
                const newSelection = new vscode.Selection(
                    new vscode.Position(endLine, editor.document.lineAt(endLine).text.length),
                    new vscode.Position(startLine, 0)
                );
                editor.selection = newSelection;
                lastSelectionRange = 'hierarchy';
            } else {
                // 段階1: コンテンツ部分のみ選択
                // アンカーを右側、アクティブを左側にすることで、カーソルを左側に配置
                const newSelection = new vscode.Selection(
                    new vscode.Position(position.line, text.length),
                    new vscode.Position(position.line, contentStart)
                );
                editor.selection = newSelection;
                lastSelectionRange = 'content';
            }
        })
    );
    
    // 行の上下移動コマンド - Cmd+Shift+Up/Down（階層構造を考慮）
    context.subscriptions.push(
        vscode.commands.registerCommand('obsidianMarkdown.moveLineUp', () => {
            moveLineWithHierarchy(vscode.window.activeTextEditor, 'up');
        })
    );
    
    context.subscriptions.push(
        vscode.commands.registerCommand('obsidianMarkdown.moveLineDown', () => {
            moveLineWithHierarchy(vscode.window.activeTextEditor, 'down');
        })
    );
    
    // スマート選択（全体）コマンド
    context.subscriptions.push(
        vscode.commands.registerCommand('obsidianMarkdown.smartSelectAll', () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;
            
            const position = editor.selection.active;
            const document = editor.document;
            const line = document.lineAt(position.line).text;
            
            // コードブロック内かチェック
            let inCodeBlock = false;
            let codeBlockStart = -1;
            let codeBlockEnd = -1;
            
            for (let i = 0; i < document.lineCount; i++) {
                const currentLine = document.lineAt(i).text;
                if (currentLine.startsWith('```')) {
                    if (!inCodeBlock && i <= position.line) {
                        inCodeBlock = true;
                        codeBlockStart = i;
                    } else if (inCodeBlock && i >= position.line) {
                        codeBlockEnd = i;
                        break;
                    }
                }
            }
            
            // コードブロック内の場合、コードブロック全体を選択
            if (codeBlockStart !== -1 && codeBlockEnd !== -1) {
                const newSelection = new vscode.Selection(
                    new vscode.Position(codeBlockStart + 1, 0),
                    new vscode.Position(codeBlockEnd, 0)
                );
                editor.selection = newSelection;
            } else {
                // 通常のCmd+A動作
                vscode.commands.executeCommand('editor.action.selectAll');
            }
        })
    );
    
    // その他のコマンド
    context.subscriptions.push(
        vscode.commands.registerCommand('obsidianMarkdown.toggleCheckbox', () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;
            toggleCheckbox(editor, editor.selection.active.line);
        })
    );
    
    context.subscriptions.push(
        vscode.commands.registerCommand('obsidianMarkdown.formatTable', () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;
            const line = editor.selection.active.line;
            formatTableAtLine(editor, line);
        })
    );
    
    context.subscriptions.push(
        vscode.commands.registerCommand('obsidianMarkdown.increaseIndent', () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;
            adjustIndent(editor, true);
        })
    );
    
    context.subscriptions.push(
        vscode.commands.registerCommand('obsidianMarkdown.decreaseIndent', () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;
            adjustIndent(editor, false);
        })
    );
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
    // Markdownファイル専用の設定を適用
    const config = vscode.workspace.getConfiguration();
    
    // Markdown言語固有の設定
    const markdownConfig = {
        'editor.quickSuggestions': {
            'other': false,
            'comments': false,
            'strings': false
        },
        'editor.suggestOnTriggerCharacters': false,
        'editor.snippetSuggestions': 'none',
        'editor.wordBasedSuggestions': false,
        'editor.parameterHints.enabled': false,
        'editor.acceptSuggestionOnEnter': 'off',
        'editor.acceptSuggestionOnCommitCharacters': false,
        'editor.tabMovesFocus': false,
        'editor.formatOnType': false,
        'editor.formatOnPaste': false,
        'editor.formatOnSave': false,
        'editor.autoIndent': 'none',
        'markdown.suggest.paths.enabled': false
    };
    
    // 設定を適用（ワークスペース設定として）
    for (const [key, value] of Object.entries(markdownConfig)) {
        config.update(`[markdown].${key}`, value, vscode.ConfigurationTarget.Workspace);
    }
    
    // Markdown拡張機能の設定
    config.update('markdown.extension.completion.enabled', false, vscode.ConfigurationTarget.Workspace);
    config.update('markdown.extension.tableFormatter.enabled', false, vscode.ConfigurationTarget.Workspace);
    
    // 可能であれば Copilot 系の自動補完を無効化（存在しない場合は無視されます）
    try {
        config.update('[markdown].github.copilot.inlineSuggest.enable', false, vscode.ConfigurationTarget.Workspace);
        config.update('[markdown].github.copilot.editor.enableAutoCompletions', false, vscode.ConfigurationTarget.Workspace);
    } catch (_) {}
    
    console.log('Applied Markdown-specific settings to disable autocomplete and table formatting');
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
    if (updateTimer) {
        clearTimeout(updateTimer);
    }
}

module.exports = {
    activate,
    deactivate
};
