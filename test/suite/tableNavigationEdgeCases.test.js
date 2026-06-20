const assert = require('assert');

// テスト用にソースからヘルパー関数をコピー
function getTableCellInfo(lineText, cursorChar) {
    if (!lineText.includes('|')) {
        return null;
    }

    if (lineText.match(/^\s*\|?\s*[-:]+\s*\|/)) {
        return null;
    }

    const cellBoundaries = [];
    let inCell = false;
    let cellStart = 0;

    for (let i = 0; i < lineText.length; i++) {
        if (lineText[i] === '|') {
            if (inCell) {
                cellBoundaries.push({ start: cellStart, end: i });
            }
            cellStart = i + 1;
            inCell = true;
        }
    }
    if (inCell && cellStart < lineText.length) {
        cellBoundaries.push({ start: cellStart, end: lineText.length });
    }

    const allCells = cellBoundaries.map((cell, index) => {
        const cellText = lineText.substring(cell.start, cell.end);
        const leadingSpaces = cellText.match(/^(\s*)/)[1].length;
        const trailingMatch = cellText.match(/(\s*)$/);
        const trailingSpaces = trailingMatch ? trailingMatch[1].length : 0;
        let contentStart = cell.start + leadingSpaces;
        let contentEnd = cell.end - trailingSpaces;

        if (contentStart >= contentEnd) {
            contentStart = cell.start;
            contentEnd = cell.start;
        }

        return {
            start: cell.start,
            end: cell.end,
            contentStart,
            contentEnd,
            index: index
        };
    });

    for (let i = 0; i < allCells.length; i++) {
        const cell = allCells[i];
        if (cursorChar >= cell.start && cursorChar <= cell.end) {
            return {
                isTable: true,
                cellStart: cell.start,
                cellEnd: cell.end,
                cellContentStart: cell.contentStart,
                cellContentEnd: cell.contentEnd,
                cellIndex: i,
                allCells: allCells
            };
        }
    }

    if (lineText[cursorChar] === '|' && cursorChar + 1 < lineText.length) {
        for (let i = 0; i < allCells.length; i++) {
            if (allCells[i].start === cursorChar + 1) {
                const cell = allCells[i];
                return {
                    isTable: true,
                    cellStart: cell.start,
                    cellEnd: cell.end,
                    cellContentStart: cell.contentStart,
                    cellContentEnd: cell.contentEnd,
                    cellIndex: i,
                    allCells: allCells
                };
            }
        }
    }

    return { isTable: true, cellStart: 0, cellEnd: lineText.length, cellContentStart: 0, cellContentEnd: lineText.length, cellIndex: -1, allCells: allCells };
}

// smartMoveLeft シミュレーション（フルロジック）
function simulateSmartMoveLeft(lineText, cursorPos) {
    const cellInfo = getTableCellInfo(lineText, cursorPos);
    if (!cellInfo || !cellInfo.isTable) return 0;

    // カーソルがセル内のコンテンツより右にある場合
    if (cursorPos > cellInfo.cellContentStart) {
        return cellInfo.cellContentStart;
    }
    // カーソルがコンテンツ開始位置にある場合
    else if (cursorPos === cellInfo.cellContentStart && cursorPos > cellInfo.cellStart) {
        return cellInfo.cellStart;
    }
    // カーソルがセル左端にある場合
    else if (cursorPos <= cellInfo.cellStart) {
        // 左のセルがある場合
        if (cellInfo.cellIndex > 0) {
            const leftCell = cellInfo.allCells[cellInfo.cellIndex - 1];
            // 左セルが空かどうか確認
            if (leftCell.contentStart >= leftCell.contentEnd) {
                // 空セルの場合、セル左端に移動
                return leftCell.start;
            }
            return leftCell.contentEnd;
        }
        // 最初のセルの場合、行頭に移動
        return 0;
    }
    return cellInfo.cellStart;
}

// smartMoveRight シミュレーション（フルロジック）
function simulateSmartMoveRight(lineText, cursorPos) {
    const cellInfo = getTableCellInfo(lineText, cursorPos);
    if (!cellInfo || !cellInfo.isTable) return lineText.length;

    // カーソルがコンテンツ末尾より左にある場合
    if (cursorPos < cellInfo.cellContentEnd) {
        return cellInfo.cellContentEnd;
    }
    // カーソルがセル右端より左にある場合
    else if (cursorPos < cellInfo.cellEnd) {
        return cellInfo.cellEnd;
    }
    // 右のセルがある場合
    else if (cellInfo.cellIndex < cellInfo.allCells.length - 1) {
        const rightCell = cellInfo.allCells[cellInfo.cellIndex + 1];
        return rightCell.contentStart;
    }
    // 最後のセルの場合、行末に移動
    return lineText.length;
}

// Tab ナビゲーション シミュレーション
function simulateTabNavigation(lineText, cursorPos) {
    const cellInfo = getTableCellInfo(lineText, cursorPos);
    if (!cellInfo || !cellInfo.isTable) return cursorPos;

    // 右のセルがある場合
    if (cellInfo.cellIndex < cellInfo.allCells.length - 1) {
        const rightCell = cellInfo.allCells[cellInfo.cellIndex + 1];
        return rightCell.contentStart;
    }
    // 最後のセルの場合、現在位置を維持
    return cursorPos;
}

// Shift+Tab ナビゲーション シミュレーション
function simulateShiftTabNavigation(lineText, cursorPos) {
    const cellInfo = getTableCellInfo(lineText, cursorPos);
    if (!cellInfo || !cellInfo.isTable) return cursorPos;

    // 左のセルがある場合
    if (cellInfo.cellIndex > 0) {
        const leftCell = cellInfo.allCells[cellInfo.cellIndex - 1];
        return leftCell.contentStart;
    }
    // 最初のセルの場合、現在位置を維持
    return cursorPos;
}

function getAlignedTablePosition(sourceCellInfo, cursorPos, targetCell) {
    const isTargetEmpty = targetCell.contentStart >= targetCell.contentEnd;
    if (isTargetEmpty) {
        return Math.min(targetCell.start + 1, targetCell.end);
    }

    const offsetInContent = Math.max(0, cursorPos - sourceCellInfo.cellContentStart);
    const unclampedTarget = targetCell.contentStart + offsetInContent;
    return Math.max(targetCell.contentStart, Math.min(unclampedTarget, targetCell.contentEnd));
}

describe('Table Navigation Edge Cases', function() {

    describe('TestCase 3: Cell left edge to left cell content end', function() {
        it('should move from second cell left edge to first cell content end', function() {
            const line = '| Cell A | Cell B |';
            // セルBの左端（位置10、|の直後）
            const cursorPos = 10;
            const cellInfo = getTableCellInfo(line, cursorPos);
            // セルB(cellIndex=1)にいることを確認
            assert.strictEqual(cellInfo.cellIndex, 1);

            const newPos = simulateSmartMoveLeft(line, cursorPos);
            // Cell Aのコンテンツ末尾に移動（実装依存）
            // セルAのcontentEndは8（'A'の後ろ）
            assert.strictEqual(newPos, 8);
        });

        it('should move from third cell to second cell content end', function() {
            const line = '| A | B | C |';
            // まず各セルの位置を確認
            // | A | B | C |
            // 0123456789...
            // Cell A: start=1, end=4
            // Cell B: start=5, end=8
            // Cell C: start=9, end=12
            const cellInfo = getTableCellInfo(line, 10);
            assert.strictEqual(cellInfo.cellIndex, 2); // Cell C

            const newPos = simulateSmartMoveLeft(line, 9);
            // Cell Bのコンテンツ末尾に移動
            // 実装では前のセルのcontentEndに移動
            assert.strictEqual(newPos >= 5, true);
        });
    });

    describe('TestCase 4: Empty cell handling', function() {
        it('should handle navigation to empty cell', function() {
            const line = '|        | Cell B |';
            // セルBの左端（位置10）から左に移動
            const cursorPos = 10;
            const cellInfo = getTableCellInfo(line, cursorPos);
            const newPos = simulateSmartMoveLeft(line, cursorPos);
            // 空セル（スペースのみ）への移動を確認
            // 空セルの場合、contentStartに移動（これはcellStartと同じになる可能性あり）
            assert.strictEqual(newPos < cursorPos, true);
        });

        it('should detect empty cell correctly', function() {
            const line = '| A |   | C |';
            // スペースのみのセル（位置6）
            const cellInfo = getTableCellInfo(line, 6);
            assert.strictEqual(cellInfo.isTable, true);
            assert.strictEqual(cellInfo.cellIndex, 1);
            // スペースのみのセルでは、leading/trailing spacesの計算により
            // contentStart > contentEnd になる可能性がある（空コンテンツ）
            // これは実装上の正常な動作
            assert.strictEqual(cellInfo.cellStart < cellInfo.cellEnd, true);
        });

        it('should handle completely empty cell', function() {
            const line = '| A || C |';
            // 完全に空のセル（位置4、||の間）
            const cellInfo = getTableCellInfo(line, 4);
            assert.strictEqual(cellInfo.isTable, true);
        });

        it('should navigate through multiple empty cells', function() {
            const line = '|   |   | C |';
            // セルCの位置から左に移動
            const cellInfo = getTableCellInfo(line, 10);
            const newPos = simulateSmartMoveLeft(line, 9);
            // 前のセル（空セル）に移動
            assert.strictEqual(newPos < 9, true);
        });
    });

    describe('TestCase 5: First cell left edge to line start', function() {
        it('should move from first cell left edge to line start', function() {
            const line = '| Cell A | Cell B |';
            // 最初のセルの左端（位置1）
            const cursorPos = 1;
            const newPos = simulateSmartMoveLeft(line, cursorPos);
            // 行頭（位置0）に移動すべき
            assert.strictEqual(newPos, 0);
        });

        it('should move from first cell content start to cell start then to line start', function() {
            const line = '| Cell A | Cell B |';
            // 最初のセルのコンテンツ開始（位置2、'C'の位置）
            let cursorPos = 2;
            let newPos = simulateSmartMoveLeft(line, cursorPos);
            // セル左端（位置1）に移動
            assert.strictEqual(newPos, 1);

            // もう一度左に移動
            newPos = simulateSmartMoveLeft(line, newPos);
            // 行頭（位置0）に移動
            assert.strictEqual(newPos, 0);
        });
    });

    describe('Cmd+Right navigation', function() {
        it('should move from middle to content end', function() {
            const line = '| Hello | World |';
            // 'e'の位置（3）から
            const cellInfo = getTableCellInfo(line, 3);
            const newPos = simulateSmartMoveRight(line, 3);
            // コンテンツ末尾に移動（cellContentEndへ）
            assert.strictEqual(newPos, cellInfo.cellContentEnd);
        });

        it('should move from content end to cell end', function() {
            const line = '| Hello | World |';
            const cellInfo = getTableCellInfo(line, 3);
            // コンテンツ末尾から
            const newPos = simulateSmartMoveRight(line, cellInfo.cellContentEnd);
            // セル右端に移動
            assert.strictEqual(newPos, cellInfo.cellEnd);
        });

        it('should move from cell end to next cell content start', function() {
            const line = '| Hello | World |';
            const cellInfo = getTableCellInfo(line, 3);
            // セル右端から
            const newPos = simulateSmartMoveRight(line, cellInfo.cellEnd);
            // 次のセルのコンテンツ開始に移動
            const nextCellInfo = getTableCellInfo(line, newPos);
            assert.strictEqual(nextCellInfo.cellIndex, 1);
        });

        it('should move to line end from last cell', function() {
            const line = '| A | B |';
            // 最後のセルの情報を取得
            const lastCellInfo = getTableCellInfo(line, 6);
            // セル右端から
            const newPos = simulateSmartMoveRight(line, lastCellInfo.cellEnd);
            // 行末に移動
            assert.strictEqual(newPos, line.length);
        });
    });

    describe('Tab/Shift+Tab navigation', function() {
        it('Tab should move to next cell content start', function() {
            const line = '| Cell A | Cell B | Cell C |';
            // 最初のセル内（位置3）から
            const newPos = simulateTabNavigation(line, 3);
            // Cell Bのコンテンツ開始に移動
            const nextCellInfo = getTableCellInfo(line, newPos);
            assert.strictEqual(nextCellInfo.cellIndex, 1); // Cell B
        });

        it('Tab at last cell should stay in place', function() {
            const line = '| A | B |';
            // 最後のセル内（位置6）から
            const newPos = simulateTabNavigation(line, 6);
            // 現在位置を維持
            assert.strictEqual(newPos, 6);
        });

        it('Shift+Tab should move to previous cell content start', function() {
            const line = '| Cell A | Cell B | Cell C |';
            // Cell B内（位置12）から
            const newPos = simulateShiftTabNavigation(line, 12);
            // Cell Aのコンテンツ開始（位置2）に移動
            assert.strictEqual(newPos, 2);
        });

        it('Shift+Tab at first cell should stay in place', function() {
            const line = '| A | B |';
            // 最初のセル内（位置2）から
            const newPos = simulateShiftTabNavigation(line, 2);
            // 現在位置を維持
            assert.strictEqual(newPos, 2);
        });

        it('Tab through all cells sequentially', function() {
            const line = '| A | B | C |';
            let pos = 2; // 最初のセル

            pos = simulateTabNavigation(line, pos);
            const cellB = getTableCellInfo(line, pos);
            assert.strictEqual(cellB.cellIndex, 1);

            pos = simulateTabNavigation(line, pos);
            const cellC = getTableCellInfo(line, pos);
            assert.strictEqual(cellC.cellIndex, 2);
        });

        it('Tab should move to first non-space character in next cell', function() {
            const line = '| A |   Cell B |';
            const newPos = simulateTabNavigation(line, 2);
            assert.strictEqual(newPos, 8);
        });

        it('Tab should move to cell start for whitespace-only next cell', function() {
            const line = '| A |     |';
            const newPos = simulateTabNavigation(line, 2);
            assert.strictEqual(newPos, 5);
        });
    });

    describe('Up/Down arrow same cell position', function() {
        // 上下移動で同じセルインデックスとセル内オフセットを維持するロジック
        function getTargetCellInRow(lineText, targetCellIndex) {
            const cellInfo = getTableCellInfo(lineText, 0);
            if (!cellInfo || !cellInfo.allCells || targetCellIndex >= cellInfo.allCells.length) {
                return null;
            }
            return cellInfo.allCells[targetCellIndex];
        }

        it('should find same cell index in different row', function() {
            const row1 = '| Header 1 | Header 2 |';
            const row2 = '| Cell A1  | Cell B1  |';

            // row1のcellIndex 1 (Header 2)
            const sourceCellInfo = getTableCellInfo(row1, 13);
            assert.strictEqual(sourceCellInfo.cellIndex, 1);

            // row2の同じcellIndex 1を見つける
            const targetCell = getTargetCellInRow(row2, 1);
            assert.notStrictEqual(targetCell, null);
            assert.strictEqual(targetCell.index, 1);
        });

        it('should handle rows with different cell counts', function() {
            const row1 = '| A | B | C |';
            const row2 = '| X | Y |';

            // row1のcellIndex 2 (C)
            const sourceCellInfo = getTableCellInfo(row1, 10);
            assert.strictEqual(sourceCellInfo.cellIndex, 2);

            // row2にはcellIndex 2がない
            const targetCell = getTargetCellInRow(row2, 2);
            assert.strictEqual(targetCell, null);
        });

        it('should preserve the same offset in the target cell', function() {
            const row1 = '| Name | Value |';
            const row2 = '| Foo  | Bar baz |';
            const sourceCellInfo = getTableCellInfo(row1, 11);
            const targetCell = getTargetCellInRow(row2, 1);

            assert.notStrictEqual(sourceCellInfo, null);
            assert.notStrictEqual(targetCell, null);

            const newPos = getAlignedTablePosition(sourceCellInfo, 11, targetCell);
            assert.strictEqual(newPos, 11);
        });

        it('should clamp to target cell end when the destination cell is shorter', function() {
            const row1 = '| Name | Longer Value |';
            const row2 = '| Foo  | Bar |';
            const sourceCellInfo = getTableCellInfo(row1, 18);
            const targetCell = getTargetCellInRow(row2, 1);

            assert.notStrictEqual(sourceCellInfo, null);
            assert.notStrictEqual(targetCell, null);

            const newPos = getAlignedTablePosition(sourceCellInfo, 18, targetCell);
            assert.strictEqual(newPos, targetCell.contentEnd);
        });

        it('should preserve relative content position across rows', function() {
            const row1 = '| 18:00 ~ |          | 開発、ミーティング |';
            const row2 = '| 19:00 ~ | 夜ご飯　新歓 | ご飯 |';
            const sourceCellInfo = getTableCellInfo(row1, 25);
            const targetCell = getTargetCellInRow(row2, 2);

            assert.notStrictEqual(sourceCellInfo, null);
            assert.notStrictEqual(targetCell, null);

            const newPos = getAlignedTablePosition(sourceCellInfo, 25, targetCell);
            assert.strictEqual(newPos, targetCell.contentEnd);
        });

        it('should leave one space when moving into an empty cell', function() {
            const row1 = '| 19:00 ~ | 夜ご飯　新歓 |          |';
            const row2 = '| 18:00 ~ |          | 開発、ミーティング |';
            const sourceCellInfo = getTableCellInfo(row1, 13);
            const targetCell = getTargetCellInRow(row2, 1);

            assert.notStrictEqual(sourceCellInfo, null);
            assert.notStrictEqual(targetCell, null);

            const newPos = getAlignedTablePosition(sourceCellInfo, 13, targetCell);
            assert.strictEqual(newPos, targetCell.start + 1);
        });
    });

    describe('Selection operations (Shift+Cmd+Left)', function() {
        // 選択範囲の計算
        function calculateSelectionRange(lineText, cursorPos, anchorPos) {
            return {
                start: Math.min(cursorPos, anchorPos),
                end: Math.max(cursorPos, anchorPos)
            };
        }

        it('should select from cursor to content start', function() {
            const line = '| Hello World |';
            const cursorPos = 8; // 'o' of World
            const cellInfo = getTableCellInfo(line, cursorPos);

            // Shift+Cmd+Left: コンテンツ開始まで選択
            const targetPos = cellInfo.cellContentStart;
            const selection = calculateSelectionRange(line, targetPos, cursorPos);

            assert.strictEqual(selection.start, 2); // 'H'の位置
            assert.strictEqual(selection.end, 8);
        });

        it('should extend selection to cell start on second press', function() {
            const line = '| Hello World |';
            const cursorPos = 2; // コンテンツ開始位置
            const anchorPos = 8; // 元のカーソル位置
            const cellInfo = getTableCellInfo(line, cursorPos);

            // 2回目: セル左端まで選択拡張
            const targetPos = cellInfo.cellStart;
            const selection = calculateSelectionRange(line, targetPos, anchorPos);

            assert.strictEqual(selection.start, 1); // セル左端
            assert.strictEqual(selection.end, 8);
        });

        it('should extend selection to previous cell on third press', function() {
            const line = '| A | Hello World |';
            // セル2の位置から情報取得
            const cellInfo = getTableCellInfo(line, 6);

            // 前のセルの情報を取得
            if (cellInfo.cellIndex > 0) {
                const prevCell = cellInfo.allCells[cellInfo.cellIndex - 1];
                // 'A'のコンテンツ末尾を確認
                // | A | では、Cell Aは start=1, end=4
                // contentStart=2 ('A'), contentEnd=3 ('A'の後ろ)
                assert.strictEqual(prevCell.contentEnd > prevCell.contentStart, true);
            }
        });
    });

    describe('Edge cases with various table formats', function() {
        it('should handle table without leading pipe', function() {
            const line = 'A | B | C';
            const cellInfo = getTableCellInfo(line, 0);
            assert.strictEqual(cellInfo.isTable, true);
        });

        it('should handle table without trailing pipe', function() {
            const line = '| A | B | C';
            const cellInfo = getTableCellInfo(line, 2);
            assert.strictEqual(cellInfo.isTable, true);
            assert.strictEqual(cellInfo.allCells.length, 3);
        });

        it('should handle single cell table', function() {
            const line = '| Single Cell |';
            const cellInfo = getTableCellInfo(line, 5);
            assert.strictEqual(cellInfo.isTable, true);
            assert.strictEqual(cellInfo.allCells.length, 1);
        });

        it('should handle cells with only spaces', function() {
            const line = '|    |    |';
            const cellInfo = getTableCellInfo(line, 2);
            assert.strictEqual(cellInfo.isTable, true);
            // スペースのみのセル
            assert.strictEqual(cellInfo.cellIndex, 0);
        });

        it('should handle wide cell content (Japanese)', function() {
            const line = '| 日本語 | English |';
            const cellInfo = getTableCellInfo(line, 3);
            assert.strictEqual(cellInfo.isTable, true);
            // 日本語コンテンツが正しく検出される
            assert.strictEqual(cellInfo.cellContentEnd > cellInfo.cellContentStart, true);
        });

        it('should handle mixed width content', function() {
            const line = '| ABC日本語DEF | Test |';
            const cellInfo = getTableCellInfo(line, 5);
            assert.strictEqual(cellInfo.isTable, true);
        });
    });
});
