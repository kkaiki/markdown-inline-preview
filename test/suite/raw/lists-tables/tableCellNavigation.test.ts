import assert from "assert";

// getTableCellInfo関数をテスト用にコピー
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

    for (const cell of cellBoundaries) {
        if (cursorChar >= cell.start && cursorChar <= cell.end) {
            const cellText = lineText.substring(cell.start, cell.end);
            const leadingSpaces = cellText.match(/^(\s*)/)[1].length;
            const trailingSpaces = cellText.match(/(\s*)$/)[1].length;

            return {
                isTable: true,
                cellStart: cell.start,
                cellEnd: cell.end,
                cellContentStart: cell.start + leadingSpaces,
                cellContentEnd: cell.end - trailingSpaces
            };
        }
    }

    if (lineText[cursorChar] === '|' && cursorChar + 1 < lineText.length) {
        for (const cell of cellBoundaries) {
            if (cell.start === cursorChar + 1) {
                const cellText = lineText.substring(cell.start, cell.end);
                const leadingSpaces = cellText.match(/^(\s*)/)[1].length;
                const trailingSpaces = cellText.match(/(\s*)$/)[1].length;

                return {
                    isTable: true,
                    cellStart: cell.start,
                    cellEnd: cell.end,
                    cellContentStart: cell.start + leadingSpaces,
                    cellContentEnd: cell.end - trailingSpaces
                };
            }
        }
    }

    return { isTable: true, cellStart: 0, cellEnd: lineText.length, cellContentStart: 0, cellContentEnd: lineText.length };
}

describe('Table Cell Navigation', function() {
    describe('getTableCellInfo', function() {
        it('should return null for non-table lines', function() {
            assert.strictEqual(getTableCellInfo('This is normal text', 5), null);
            assert.strictEqual(getTableCellInfo('- [ ] checkbox item', 10), null);
        });

        it('should return null for separator rows', function() {
            assert.strictEqual(getTableCellInfo('|---|---|', 3), null);
            assert.strictEqual(getTableCellInfo('| --- | --- |', 5), null);
            assert.strictEqual(getTableCellInfo('|:---:|:---:|', 5), null);
        });

        it('should detect first cell correctly', function() {
            const line = '| Header 1 | Header 2 |';
            // Cursor at 'H' of Header 1 (position 2)
            const result = getTableCellInfo(line, 2);
            assert.strictEqual(result.isTable, true);
            assert.strictEqual(result.cellStart, 1);
            assert.strictEqual(result.cellEnd, 11);
            assert.strictEqual(result.cellContentStart, 2); // ' Header 1 ' -> content starts at 2
            assert.strictEqual(result.cellContentEnd, 10);  // content ends at 10 (before trailing space)
        });

        it('should detect second cell correctly', function() {
            const line = '| Header 1 | Header 2 |';
            // Cursor at 'H' of Header 2 (position 13)
            const result = getTableCellInfo(line, 13);
            assert.strictEqual(result.isTable, true);
            assert.strictEqual(result.cellStart, 12);
            assert.strictEqual(result.cellEnd, 22);
            assert.strictEqual(result.cellContentStart, 13);
            assert.strictEqual(result.cellContentEnd, 21);
        });

        it('should handle cursor at pipe character', function() {
            const line = '| Header 1 | Header 2 |';
            // Cursor at first pipe (position 0)
            const result = getTableCellInfo(line, 0);
            assert.strictEqual(result.isTable, true);
            // Should return info for the next cell
            assert.strictEqual(result.cellStart, 1);
        });

        it('should handle cells with extra spaces', function() {
            const line = '|   Cell A   |   Cell B   |';
            const result = getTableCellInfo(line, 5);
            assert.strictEqual(result.isTable, true);
            assert.strictEqual(result.cellStart, 1);
            assert.strictEqual(result.cellEnd, 13);
            assert.strictEqual(result.cellContentStart, 4);  // After 3 leading spaces
            assert.strictEqual(result.cellContentEnd, 10);   // Before 3 trailing spaces
        });

        it('should handle Japanese content', function() {
            const line = '| 日本語 | English |';
            const result = getTableCellInfo(line, 3);
            assert.strictEqual(result.isTable, true);
            assert.strictEqual(result.cellStart, 1);
        });
    });

    describe('smartMoveLeft behavior', function() {
        // Simulating the smartMoveLeft logic
        function simulateSmartMoveLeft(lineText, cursorPos) {
            const cellInfo = getTableCellInfo(lineText, cursorPos);
            if (cellInfo && cellInfo.isTable) {
                let targetPos = cellInfo.cellContentStart;
                if (cursorPos <= cellInfo.cellContentStart) {
                    targetPos = cellInfo.cellStart;
                }
                return targetPos;
            }
            return 0; // Default to line start for non-table
        }

        it('should move to content start from middle of cell', function() {
            const line = '| Header 1 | Header 2 |';
            // Cursor at position 5 (middle of "Header 1")
            const newPos = simulateSmartMoveLeft(line, 5);
            assert.strictEqual(newPos, 2); // Should move to 'H' position
        });

        it('should move to cell start when already at content start', function() {
            const line = '| Header 1 | Header 2 |';
            // Cursor at position 2 ('H' of Header 1)
            const newPos = simulateSmartMoveLeft(line, 2);
            assert.strictEqual(newPos, 1); // Should move to cell start (after pipe)
        });

        it('should handle second cell correctly', function() {
            const line = '| Header 1 | Header 2 |';
            // Cursor at position 15 (middle of "Header 2")
            const newPos = simulateSmartMoveLeft(line, 15);
            assert.strictEqual(newPos, 13); // Should move to 'H' of Header 2
        });
    });
});
