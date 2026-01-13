# 実装ガイド

このドキュメントでは、各機能の実装詳細を説明します。

## 1. チェックボックス機能

### トグル処理

```javascript
function toggleCheckbox(editor, lineNumber) {
    const document = editor.document;
    const line = document.lineAt(lineNumber);
    const text = line.text;

    // チェック状態を検出
    const uncheckedMatch = text.match(/^(\s*-\s)\[ \](.*)$/);
    const checkedMatch = text.match(/^(\s*-\s)\[x\](.*)$/i);

    editor.edit(editBuilder => {
        if (uncheckedMatch) {
            // [ ] → [x]
            const newText = `${uncheckedMatch[1]}[x]${uncheckedMatch[2]}`;
            editBuilder.replace(line.range, newText);
        } else if (checkedMatch) {
            // [x] → [ ]
            const newText = `${checkedMatch[1]}[ ]${checkedMatch[2]}`;
            editBuilder.replace(line.range, newText);
        }
    });
}
```

### 装飾の適用

```javascript
// チェック済み装飾
checkedDecoration = vscode.window.createTextEditorDecorationType({
    textDecoration: 'line-through !important',
    color: 'rgba(136, 136, 136, 0.6)',
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
});

// 装飾を適用
function updateCheckboxDecorations(editor) {
    const checkedRanges = [];

    for (let i = 0; i < editor.document.lineCount; i++) {
        const line = editor.document.lineAt(i);
        if (line.text.match(/^(\s*)-\s\[x\]/i)) {
            checkedRanges.push(line.range);
        }
    }

    editor.setDecorations(checkedDecoration, checkedRanges);
}
```

---

## 2. テーブル整形

### セル検出

```javascript
function getTableCellInfo(lineText, cursorChar) {
    if (!lineText.includes('|')) return null;

    // セル境界を検出
    const cellBoundaries = [];
    let cellStart = 0;
    let inCell = false;

    for (let i = 0; i < lineText.length; i++) {
        if (lineText[i] === '|') {
            if (inCell) {
                cellBoundaries.push({ start: cellStart, end: i });
            }
            cellStart = i + 1;
            inCell = true;
        }
    }

    // カーソル位置のセルを特定
    for (const cell of cellBoundaries) {
        if (cursorChar >= cell.start && cursorChar <= cell.end) {
            // コンテンツの開始/終了位置を計算
            const cellText = lineText.substring(cell.start, cell.end);
            const leadingSpaces = cellText.match(/^(\s*)/)[1].length;
            const trailingSpaces = cellText.match(/(\s*)$/)[1].length;

            return {
                cellStart: cell.start,
                cellEnd: cell.end,
                cellContentStart: cell.start + leadingSpaces,
                cellContentEnd: cell.end - trailingSpaces
            };
        }
    }
    return null;
}
```

### 文字幅計算（日本語対応）

```javascript
function getStringWidth(str, config) {
    let width = 0;
    for (const char of str) {
        const code = char.charCodeAt(0);

        if (code >= 0x3000 && code <= 0x9FFF ||  // CJK
            code >= 0xFF01 && code <= 0xFF60) {   // 全角記号
            width += config.japaneseCharWidth;
        } else if ('il1|'.includes(char)) {
            width += config.narrowCharWidth;
        } else if ('WMm'.includes(char)) {
            width += config.wideCharWidth;
        } else {
            width += 1;
        }
    }
    return width;
}
```

---

## 3. 目次生成

### 見出し収集

```javascript
function collectHeadings(document) {
    const headings = [];
    let inCodeBlock = false;

    for (let i = 0; i < document.lineCount; i++) {
        const lineText = document.lineAt(i).text;

        // コードブロック内は無視
        if (lineText.trim().startsWith('```')) {
            inCodeBlock = !inCodeBlock;
            continue;
        }
        if (inCodeBlock) continue;

        // 見出しを検出
        const match = lineText.match(/^(#{1,6})\s+(.+)$/);
        if (match) {
            headings.push({
                level: match[1].length,
                text: match[2].trim(),
                line: i
            });
        }
    }
    return headings;
}
```

### スラッグ生成

```javascript
function generateSlug(text) {
    return text
        .toLowerCase()
        .replace(/[^\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
}
```

### 目次テキスト生成

```javascript
function generateTableOfContents(headings, minLevel, maxLevel) {
    const lines = [];
    const baseLevel = Math.min(...headings.map(h => h.level));

    for (const heading of headings) {
        if (heading.level < minLevel || heading.level > maxLevel) continue;

        const indent = '  '.repeat(heading.level - baseLevel);
        const slug = generateSlug(heading.text);
        lines.push(`${indent}- [${heading.text}](#${slug})`);
    }

    return lines.join('\n');
}
```

---

## 4. スマートEnter

### 処理フロー

```javascript
async function smartEnterCommand() {
    const editor = vscode.window.activeTextEditor;
    const document = editor.document;
    const position = editor.selection.active;
    const lineText = document.lineAt(position.line).text;

    // コードブロック内は通常改行
    if (isInFencedCodeBlock(document, position.line)) {
        await vscode.commands.executeCommand('type', { text: '\n' });
        return;
    }

    // チェックボックス
    const checkboxMatch = lineText.match(/^(\s*)([-*+])\s+\[(x|X| )\]\s*(.*)$/);
    if (checkboxMatch) {
        const [, indent, marker, , content] = checkboxMatch;
        if (content.trim() === '') {
            // 空のチェックボックス → マーカー削除
            await editor.edit(eb => {
                eb.replace(line.range, '');
            });
        } else {
            // 新しいチェックボックスを追加
            await editor.edit(eb => {
                eb.insert(position, `\n${indent}${marker} [ ] `);
            });
        }
        return;
    }

    // 番号付きリスト
    const numberedMatch = lineText.match(/^(\s*)(\d+)([\.)])\s+(.*)$/);
    if (numberedMatch) {
        const [, indent, num, punct, content] = numberedMatch;
        if (content.trim() === '') {
            // 空のリスト → マーカー削除
        } else {
            // 次の番号で継続
            const nextNum = parseInt(num) + 1;
            await editor.edit(eb => {
                eb.insert(position, `\n${indent}${nextNum}${punct} `);
            });
        }
        return;
    }

    // その他は通常改行
    await vscode.commands.executeCommand('type', { text: '\n' });
}
```

---

## 5. 装飾システム

### 見出し装飾

```javascript
headingDecorations = [
    vscode.window.createTextEditorDecorationType({ // H1
        fontWeight: '900',
        color: '#e06c75',
        backgroundColor: 'rgba(224,108,117,0.06)',
        border: '1px solid rgba(224,108,117,0.30)',
        borderRadius: '3px'
    }),
    // H2〜H6...
];

function updateHeadingDecorations(editor) {
    const ranges = [[], [], [], [], [], []]; // H1〜H6

    for (let i = 0; i < editor.document.lineCount; i++) {
        const line = editor.document.lineAt(i);
        const match = line.text.match(/^(#{1,6})\s/);
        if (match) {
            const level = match[1].length - 1; // 0-indexed
            ranges[level].push(line.range);
        }
    }

    for (let i = 0; i < 6; i++) {
        editor.setDecorations(headingDecorations[i], ranges[i]);
    }
}
```

---

## 6. デバッグ

### デバッグログ

```javascript
let debugChannel = vscode.window.createOutputChannel('Markdown Table Debug');

function debugLog(message, ...args) {
    const timestamp = new Date().toISOString().substring(11, 23);
    const formattedArgs = args.map(a => JSON.stringify(a)).join(' ');
    debugChannel.appendLine(`[${timestamp}] ${message} ${formattedArgs}`);
}
```

### 使用例

```javascript
debugLog('[smartMoveLeft] Called at position:', position.character);
debugLog('[smartMoveLeft] cellInfo:', cellInfo);
```

ログは Output パネルの「Markdown Table Debug」で確認可能。
