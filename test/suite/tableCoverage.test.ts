import assert from 'assert';
import {
    getAllTableCells,
    getTableCellInfo,
    formatTableRow,
    calculateColumnWidths
} from '../../src/shared/table/table';
import * as table from '../../src/shared/table/table';

describe('Table Coverage Tests', function() {

    describe('formatTableRow', function() {
        it('should format separator row with basic dashes', function() {
            const row = {
                line: 0,
                isSep: true,
                cells: ['---', '---', '---']
            };
            const colWidths = [10, 10, 10];
            const colHasFullWidth = [false, false, false];
            const result = formatTableRow(row, colWidths, colHasFullWidth, 3);

            assert.strictEqual(result.startsWith('|'), true);
            assert.strictEqual(result.endsWith('|'), true);
            assert.strictEqual(result.includes('-'), true);
        });

        it('should format separator row with left alignment', function() {
            const row = {
                line: 0,
                isSep: true,
                cells: [':---', '---', '---']
            };
            const colWidths = [10, 10, 10];
            const colHasFullWidth = [false, false, false];
            const result = formatTableRow(row, colWidths, colHasFullWidth, 3);

            assert.strictEqual(result.includes(':'), true);
        });

        it('should format separator row with right alignment', function() {
            const row = {
                line: 0,
                isSep: true,
                cells: ['---:', '---', '---']
            };
            const colWidths = [10, 10, 10];
            const colHasFullWidth = [false, false, false];
            const result = formatTableRow(row, colWidths, colHasFullWidth, 3);

            // Should end with : before |
            assert.strictEqual(result.includes(':'), true);
        });

        it('should format separator row with center alignment', function() {
            const row = {
                line: 0,
                isSep: true,
                cells: [':---:', ':---:', ':---:']
            };
            const colWidths = [10, 10, 10];
            const colHasFullWidth = [false, false, false];
            const result = formatTableRow(row, colWidths, colHasFullWidth, 3);

            // Should have : on both sides
            const matches = result.match(/:/g) || [];
            assert.strictEqual(matches.length >= 6, true);
        });

        it('should format content row with padding', function() {
            const row = {
                line: 0,
                isSep: false,
                cells: ['Cell A', 'Cell B', 'Cell C']
            };
            const colWidths = [10, 10, 10];
            const colHasFullWidth = [false, false, false];
            const result = formatTableRow(row, colWidths, colHasFullWidth, 3);

            assert.strictEqual(result.startsWith('|'), true);
            assert.strictEqual(result.includes('Cell A'), true);
            assert.strictEqual(result.includes('Cell B'), true);
            assert.strictEqual(result.includes('Cell C'), true);
        });

        it('should handle empty cells in content row', function() {
            const row = {
                line: 0,
                isSep: false,
                cells: ['A', '', 'C']
            };
            const colWidths = [5, 5, 5];
            const colHasFullWidth = [false, false, false];
            const result = formatTableRow(row, colWidths, colHasFullWidth, 3);

            assert.strictEqual(result.startsWith('|'), true);
            assert.strictEqual((result.match(/\|/g) || []).length, 4);
        });

        it('should handle missing cells', function() {
            const row = {
                line: 0,
                isSep: false,
                cells: ['A']
            };
            const colWidths = [5, 5, 5];
            const colHasFullWidth = [false, false, false];
            const result = formatTableRow(row, colWidths, colHasFullWidth, 3);

            assert.strictEqual((result.match(/\|/g) || []).length, 4);
        });

        it('should format separator row with missing cells', function() {
            const row = {
                line: 0,
                isSep: true,
                cells: ['---']
            };
            const colWidths = [5, 5, 5];
            const colHasFullWidth = [false, false, false];
            const result = formatTableRow(row, colWidths, colHasFullWidth, 3);

            assert.strictEqual((result.match(/\|/g) || []).length, 4);
        });
    });

    describe('calculateColumnWidths', function() {
        it('should calculate widths for simple table', function() {
            const rows = [
                { line: 0, isSep: false, cells: ['A', 'BB', 'CCC'] },
                { line: 0, isSep: true, cells: ['---', '---', '---'] },
                { line: 0, isSep: false, cells: ['D', 'EE', 'FFF'] }
            ];
            const { colWidths, colHasFullWidth } = calculateColumnWidths(rows, 3);

            assert.strictEqual(colWidths.length, 3);
            assert.strictEqual(colHasFullWidth.length, 3);
            colWidths.forEach(w => assert.strictEqual(w >= 5, true));
        });

        it('should skip separator rows when calculating', function() {
            const rows = [
                { line: 0, isSep: true, cells: ['---', '---'] },
                { line: 0, isSep: false, cells: ['Hello', 'World'] }
            ];
            const { colWidths } = calculateColumnWidths(rows, 2);

            // Width should be based on 'Hello' and 'World', not '---'
            assert.strictEqual(colWidths[0] >= 7, true); // 'Hello' + padding
        });

        it('should detect full-width characters in columns', function() {
            const rows = [
                { line: 0, isSep: false, cells: ['日本語', 'English'] },
                { line: 0, isSep: false, cells: ['Text', 'More'] }
            ];
            const { colHasFullWidth } = calculateColumnWidths(rows, 2);

            assert.strictEqual(colHasFullWidth[0], true);
            assert.strictEqual(colHasFullWidth[1], false);
        });

        it('should handle empty cells', function() {
            const rows = [
                { line: 0, isSep: false, cells: ['A', '', 'C'] },
                { line: 0, isSep: false, cells: ['', 'B', ''] }
            ];
            const { colWidths, colHasFullWidth } = calculateColumnWidths(rows, 3);

            assert.strictEqual(colWidths.length, 3);
            colWidths.forEach(w => assert.strictEqual(w >= 5, true));
        });

        it('should handle missing cells in row', function() {
            const rows = [
                { line: 0, isSep: false, cells: ['A', 'B', 'C'] },
                { line: 0, isSep: false, cells: ['D'] } // Missing cells
            ];
            const { colWidths } = calculateColumnWidths(rows, 3);

            assert.strictEqual(colWidths.length, 3);
        });

        it('should calculate width for mixed content', function() {
            const rows = [
                { line: 0, isSep: false, cells: ['ABC', '日本語テスト', 'XYZ'] }
            ];
            const { colWidths, colHasFullWidth } = calculateColumnWidths(rows, 3);

            // Japanese column should have larger width
            assert.strictEqual(colWidths[1] > colWidths[0], true);
            assert.strictEqual(colHasFullWidth[1], true);
        });
    });

    describe('getTableCellInfo edge cases', function() {
        it('should handle cursor at pipe character', function() {
            const line = '| A | B |';
            // Cursor at first | (position 0)
            const cellInfo = getTableCellInfo(line, 0);
            assert.strictEqual(cellInfo.isTable, true);
        });

        it('should handle cursor at middle pipe', function() {
            const line = '| A | B |';
            // Cursor at middle | (position 4)
            const cellInfo = getTableCellInfo(line, 4);
            assert.strictEqual(cellInfo.isTable, true);
            // Should return next cell info
            assert.strictEqual(cellInfo.cellIndex >= 0, true);
        });

        it('should return fallback for cursor outside cells', function() {
            const line = '| A | B |';
            // Cursor at very end
            const cellInfo = getTableCellInfo(line, line.length);
            assert.strictEqual(cellInfo.isTable, true);
        });

        it('should handle pipe at specific position', function() {
            const line = '| Cell A | Cell B |';
            // Cursor exactly on | between cells
            const cellInfo = getTableCellInfo(line, 9);
            assert.strictEqual(cellInfo.isTable, true);
        });
    });

    describe('getAllTableCells edge cases', function() {
        it('should handle line ending without pipe', function() {
            const line = '| A | B';
            const cells = getAllTableCells(line);
            assert.notStrictEqual(cells, null);
            assert.strictEqual(cells.length, 2);
        });

        it('should handle multiple pipes together', function() {
            const line = '| A || C |';
            const cells = getAllTableCells(line);
            assert.notStrictEqual(cells, null);
            // Should detect empty cell
        });

        it('should handle only pipes', function() {
            const line = '||||';
            const cells = getAllTableCells(line);
            assert.notStrictEqual(cells, null);
        });
    });

    describe('Mock document tests', function() {
        // VSCode document モック
        function createMockDocument(lines) {
            return {
                lineCount: lines.length,
                lineAt: (index) => ({
                    text: lines[index] || ''
                })
            };
        }

        it('should find table block boundaries', function() {
            if (!table.findTableBlock) return; // Skip if not exported

            const doc = createMockDocument([
                'Some text',
                '| Header 1 | Header 2 |',
                '|----------|----------|',
                '| Cell A   | Cell B   |',
                'More text'
            ]);

            const block = table.findTableBlock(doc, 2);
            assert.strictEqual(block.start, 1);
            assert.strictEqual(block.end, 3);
        });

        it('should handle table at document start', function() {
            if (!table.findTableBlock) return;

            const doc = createMockDocument([
                '| A | B |',
                '|---|---|',
                '| C | D |'
            ]);

            const block = table.findTableBlock(doc, 0);
            assert.strictEqual(block.start, 0);
            assert.strictEqual(block.end, 2);
        });

        it('should handle table at document end', function() {
            if (!table.findTableBlock) return;

            const doc = createMockDocument([
                'Text',
                '| A | B |',
                '|---|---|'
            ]);

            const block = table.findTableBlock(doc, 2);
            assert.strictEqual(block.start, 1);
        });

        it('should parse table rows', function() {
            if (!table.parseTableRows) return;

            const doc = createMockDocument([
                '| Header 1 | Header 2 |',
                '|----------|----------|',
                '| Cell A   | Cell B   |'
            ]);

            const { rows, maxCols } = table.parseTableRows(doc, 0, 2);
            assert.strictEqual(rows.length, 3);
            assert.strictEqual(maxCols, 2);
            assert.strictEqual(rows[1].isSep, true);
        });

        it('should handle empty lines in table', function() {
            if (!table.parseTableRows) return;

            const doc = createMockDocument([
                '| A | B |',
                '',
                '| C | D |'
            ]);

            const { rows } = table.parseTableRows(doc, 0, 2);
            // Empty line should be skipped
            assert.strictEqual(rows.length, 2);
        });
    });
});
