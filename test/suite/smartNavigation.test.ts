import assert from "assert";

// テスト用にソースからヘルパー関数をコピー

// マーカー終了位置を検出する関数
function getMarkerEndPosition(text) {
    let contentStart = 0;
    let hasMarker = false;

    // ヘッディング（# から ###### まで）
    const headingMatch = text.match(/^(#{1,6}\s+)/);
    if (headingMatch) {
        contentStart = headingMatch[1].length;
        hasMarker = true;
    }
    // チェックボックス
    else if (text.match(/^(\s*-\s\[[\sx]?\]\s*)/i)) {
        const match = text.match(/^(\s*-\s\[[\sx]?\]\s*)/i);
        contentStart = match[1].length;
        hasMarker = true;
    }
    // 順序付きリスト
    else if (text.match(/^(\s*\d+\.\s+)/)) {
        const match = text.match(/^(\s*\d+\.\s+)/);
        contentStart = match[1].length;
        hasMarker = true;
    }
    // 順序なしリスト（- または * または +）
    else if (text.match(/^(\s*[-*+]\s+)/)) {
        const match = text.match(/^(\s*[-*+]\s+)/);
        contentStart = match[1].length;
        hasMarker = true;
    }
    // 引用（>）
    else if (text.match(/^(>\s*)+/)) {
        const match = text.match(/^(>\s*)+/);
        contentStart = match[0].length;
        hasMarker = true;
    }
    // コードブロック
    else if (text.match(/^(```\w*\s*)/)) {
        const match = text.match(/^(```\w*\s*)/);
        contentStart = match[1].length;
        hasMarker = true;
    }

    return { contentStart, hasMarker };
}

// getTableCellInfo関数
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

    // 各セルにコンテンツ境界を追加
    const allCells = cellBoundaries.map((cell, index) => {
        const cellText = lineText.substring(cell.start, cell.end);
        const leadingSpaces = cellText.match(/^(\s*)/)[1].length;
        const trailingMatch = cellText.match(/(\s*)$/);
        const trailingSpaces = trailingMatch ? trailingMatch[1].length : 0;
        return {
            start: cell.start,
            end: cell.end,
            contentStart: cell.start + leadingSpaces,
            contentEnd: cell.end - trailingSpaces,
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

describe('Smart Navigation', function() {
    describe('getMarkerEndPosition', function() {
        it('should detect heading markers', function() {
            assert.strictEqual(getMarkerEndPosition('# Heading').contentStart, 2);
            assert.strictEqual(getMarkerEndPosition('## Heading').contentStart, 3);
            assert.strictEqual(getMarkerEndPosition('### Heading').contentStart, 4);
            assert.strictEqual(getMarkerEndPosition('###### Heading').contentStart, 7);
        });

        it('should detect checkbox markers', function() {
            const result = getMarkerEndPosition('- [ ] Task');
            assert.strictEqual(result.hasMarker, true);
            assert.strictEqual(result.contentStart, 6);
        });

        it('should detect checked checkbox markers', function() {
            const result = getMarkerEndPosition('- [x] Done');
            assert.strictEqual(result.hasMarker, true);
            assert.strictEqual(result.contentStart, 6);
        });

        it('should detect numbered list markers', function() {
            assert.strictEqual(getMarkerEndPosition('1. Item').contentStart, 3);
            assert.strictEqual(getMarkerEndPosition('10. Item').contentStart, 4);
            assert.strictEqual(getMarkerEndPosition('100. Item').contentStart, 5);
        });

        it('should detect bullet list markers', function() {
            assert.strictEqual(getMarkerEndPosition('- Item').contentStart, 2);
            assert.strictEqual(getMarkerEndPosition('* Item').contentStart, 2);
            assert.strictEqual(getMarkerEndPosition('+ Item').contentStart, 2);
        });

        it('should detect indented markers', function() {
            assert.strictEqual(getMarkerEndPosition('  - Item').contentStart, 4);
            assert.strictEqual(getMarkerEndPosition('    1. Item').contentStart, 7);
        });

        it('should detect quote markers', function() {
            const result = getMarkerEndPosition('> Quote');
            assert.strictEqual(result.hasMarker, true);
            assert.strictEqual(result.contentStart, 2);
        });

        it('should detect nested quote markers', function() {
            const result = getMarkerEndPosition('> > Nested');
            assert.strictEqual(result.hasMarker, true);
            assert.strictEqual(result.contentStart >= 4, true);
        });

        it('should detect code fence markers', function() {
            const result = getMarkerEndPosition('```javascript');
            assert.strictEqual(result.hasMarker, true);
            assert.strictEqual(result.contentStart, 13);
        });

        it('should return no marker for plain text', function() {
            const result = getMarkerEndPosition('Plain text');
            assert.strictEqual(result.hasMarker, false);
            assert.strictEqual(result.contentStart, 0);
        });
    });

    describe('smartMoveLeft logic for non-table', function() {
        function simulateSmartMoveLeft(lineText, cursorPos) {
            const { contentStart, hasMarker } = getMarkerEndPosition(lineText);
            if (!hasMarker) return 0;
            return contentStart;
        }

        it('should move to content start for heading', function() {
            const line = '# Heading text';
            assert.strictEqual(simulateSmartMoveLeft(line, 10), 2);
        });

        it('should move to content start for checkbox', function() {
            const line = '- [ ] Task text';
            assert.strictEqual(simulateSmartMoveLeft(line, 10), 6);
        });

        it('should move to content start for numbered list', function() {
            const line = '1. First item';
            assert.strictEqual(simulateSmartMoveLeft(line, 8), 3);
        });
    });

    describe('smartMoveRight logic for table', function() {
        function simulateSmartMoveRight(lineText, cursorPos) {
            const cellInfo = getTableCellInfo(lineText, cursorPos);
            if (!cellInfo || !cellInfo.isTable) return lineText.length;

            if (cursorPos < cellInfo.cellContentEnd) {
                return cellInfo.cellContentEnd;
            } else if (cursorPos < cellInfo.cellEnd) {
                return cellInfo.cellEnd;
            } else if (cellInfo.cellIndex < cellInfo.allCells.length - 1) {
                const nextCell = cellInfo.allCells[cellInfo.cellIndex + 1];
                return nextCell.contentStart;
            }
            return lineText.length;
        }

        it('should move to content end from middle of cell', function() {
            const line = '| Header 1 | Header 2 |';
            const newPos = simulateSmartMoveRight(line, 3);
            // Should move to end of "Header 1" content
            assert.strictEqual(newPos > 3, true);
        });

        it('should move to next cell from cell end', function() {
            const line = '| A | B | C |';
            // Position at end of first cell
            const cellInfo = getTableCellInfo(line, 2);
            if (cellInfo && cellInfo.cellEnd) {
                const newPos = simulateSmartMoveRight(line, cellInfo.cellEnd);
                // Should move to second cell
                assert.strictEqual(newPos > cellInfo.cellEnd, true);
            }
        });
    });

    describe('getTableCellInfo extended', function() {
        it('should return allCells array', function() {
            const line = '| A | B | C |';
            const result = getTableCellInfo(line, 2);
            assert.strictEqual(result.allCells.length, 3);
        });

        it('should track cell index', function() {
            const line = '| A | B | C |';
            const result1 = getTableCellInfo(line, 2);
            const result2 = getTableCellInfo(line, 6);
            assert.strictEqual(result1.cellIndex, 0);
            assert.strictEqual(result2.cellIndex, 1);
        });

        it('should calculate content boundaries correctly', function() {
            const line = '|  A  |  B  |';
            const result = getTableCellInfo(line, 3);
            assert.strictEqual(result.cellContentStart > result.cellStart, true);
            assert.strictEqual(result.cellContentEnd < result.cellEnd, true);
        });

        it('should handle empty cells', function() {
            const line = '| A |  | C |';
            const result = getTableCellInfo(line, 6);
            assert.strictEqual(result.isTable, true);
            // Empty cell with spaces - contentStart and contentEnd point to same position (middle of spaces)
            assert.strictEqual(result.cellIndex >= 0, true);
        });
    });
});
