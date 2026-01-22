const assert = require('assert');
const {
    // Width module
    isZeroWidthCombining,
    isFullWidthCodePoint,
    getStringWidth,
    getDisplayWidthWithHeuristics,
    padCell,

    // Table module
    splitTableLine,
    getAllTableCells,
    getTableCellInfo,

    // TOC module
    generateSlug,
    collectHeadingsFromText,
    generateTableOfContents,
    findTocMarker,

    // List module
    getIndentString,
    getIndentLevel,
    createIndent,
    getListType,
    convertLineToType,
    toggleCheckboxState,
    calculateBlockRange,
    getListContinuationMarker
} = require('../../src/utils');

describe('Utils Module Integration', function() {
    describe('Width Utils', function() {
        it('should calculate string width correctly', function() {
            assert.strictEqual(getStringWidth('Hello'), 5);
            assert.strictEqual(getStringWidth('日本語'), 6);
            assert.strictEqual(getStringWidth('Hello日本'), 9);
        });

        it('should pad cells correctly', function() {
            const result = padCell('A', 5);
            assert.strictEqual(result.includes('A'), true);
            assert.strictEqual(result.length >= 5, true);
        });

        it('should detect full width characters', function() {
            assert.strictEqual(isFullWidthCodePoint('日'.codePointAt(0)), true);
            assert.strictEqual(isFullWidthCodePoint('A'.codePointAt(0)), false);
        });
    });

    describe('Table Utils', function() {
        it('should split table line', function() {
            const result = splitTableLine('| A | B | C |');
            assert.deepStrictEqual(result, ['A', 'B', 'C']);
        });

        it('should get all table cells', function() {
            const result = getAllTableCells('| A | B |');
            assert.strictEqual(result.length, 2);
            assert.strictEqual(result[0].index, 0);
            assert.strictEqual(result[1].index, 1);
        });

        it('should get table cell info', function() {
            const result = getTableCellInfo('| A | B |', 2);
            assert.strictEqual(result.isTable, true);
            assert.strictEqual(result.cellIndex, 0);
        });
    });

    describe('TOC Utils', function() {
        it('should generate slug', function() {
            assert.strictEqual(generateSlug('Hello World'), 'hello-world');
            assert.strictEqual(generateSlug('日本語').includes('日本語'), true);
        });

        it('should collect headings from text', function() {
            const text = '# Title\n## Section\nText\n### Sub';
            const headings = collectHeadingsFromText(text);
            assert.strictEqual(headings.length, 3);
        });

        it('should generate table of contents', function() {
            const headings = [
                { level: 1, text: 'Title', line: 0 },
                { level: 2, text: 'Section', line: 1 }
            ];
            const toc = generateTableOfContents(headings);
            assert.strictEqual(toc.includes('[Title]'), true);
            assert.strictEqual(toc.includes('[Section]'), true);
        });

        it('should find TOC marker', function() {
            const text = 'Some text\n/目次\nMore text';
            const result = findTocMarker(text);
            assert.strictEqual(result.hasMarker, true);
            assert.strictEqual(result.markerType, 'japanese');
        });
    });

    describe('List Utils', function() {
        it('should get indent string', function() {
            assert.strictEqual(getIndentString('  - Item'), '  ');
            assert.strictEqual(getIndentString('Item'), '');
        });

        it('should get indent level', function() {
            assert.strictEqual(getIndentLevel(''), 0);
            assert.strictEqual(getIndentLevel('  '), 1);
            assert.strictEqual(getIndentLevel('    '), 2);
            assert.strictEqual(getIndentLevel('\t'), 1);
        });

        it('should create indent', function() {
            assert.strictEqual(createIndent(1), '  ');
            assert.strictEqual(createIndent(2), '    ');
            assert.strictEqual(createIndent(1, true), '\t');
        });

        it('should get list type', function() {
            assert.strictEqual(getListType('- [ ] Task'), 'checkbox');
            assert.strictEqual(getListType('1. Item'), 'numbered');
            assert.strictEqual(getListType('- Item'), 'bullet');
            assert.strictEqual(getListType('Normal'), null);
        });

        it('should convert line to type', function() {
            assert.strictEqual(convertLineToType('- Item', 'numbered'), '1. Item');
            assert.strictEqual(convertLineToType('1. Item', 'bullet'), '- Item');
            assert.strictEqual(convertLineToType('- Item', 'checkbox'), '- [ ] Item');
        });

        it('should toggle checkbox state', function() {
            assert.strictEqual(toggleCheckboxState('- [ ] Task'), '- [x] Task');
            assert.strictEqual(toggleCheckboxState('- [x] Done'), '- [ ] Done');
        });

        it('should calculate block range', function() {
            const lines = ['- Parent', '  - Child', '  - Child2', '- Next'];
            const range = calculateBlockRange(lines, 0);
            assert.strictEqual(range.start, 0);
            assert.strictEqual(range.end, 2);
        });

        it('should get list continuation marker', function() {
            assert.strictEqual(getListContinuationMarker('- Item'), '- ');
            assert.strictEqual(getListContinuationMarker('1. Item'), '2. ');
            assert.strictEqual(getListContinuationMarker('- [ ] Task'), '- [ ] ');
        });
    });
});
