const assert = require('assert');

// テスト用にソースからヘルパー関数をコピー
function splitTableLine(line) {
    if (!line.includes('|')) return null;
    let cells = line.split('|');
    if (cells.length && cells[0].trim() === '') cells = cells.slice(1);
    if (cells.length && cells[cells.length - 1].trim() === '') cells = cells.slice(0, -1);
    return cells.map(c => c.trim());
}

function isSeparatorRow(cells) {
    if (!cells || cells.length === 0) return false;
    return cells.every(c => /^:?-+:?$/.test(c.replace(/\s+/g, '')));
}

function isZeroWidthCombining(cp) {
    return (cp >= 0x0300 && cp <= 0x036F) ||
           (cp >= 0x1AB0 && cp <= 0x1AFF) ||
           (cp >= 0x1DC0 && cp <= 0x1DFF) ||
           (cp >= 0x20D0 && cp <= 0x20FF) ||
           (cp >= 0xFE00 && cp <= 0xFE0F) ||
           (cp >= 0xFE20 && cp <= 0xFE2F) ||
           cp === 0x200B || cp === 0x200C || cp === 0x200D || cp === 0xFEFF;
}

function isFullWidthCodePoint(cp) {
    return (cp >= 0x1100 && cp <= 0x115F) ||
           (cp >= 0x2E80 && cp <= 0x9FFF) ||
           (cp >= 0xAC00 && cp <= 0xD7A3) ||
           (cp >= 0xF900 && cp <= 0xFAFF) ||
           (cp >= 0xFE10 && cp <= 0xFE1F) ||
           (cp >= 0xFE30 && cp <= 0xFE6F) ||
           (cp >= 0xFF00 && cp <= 0xFF60) ||
           (cp >= 0xFFE0 && cp <= 0xFFE6) ||
           (cp >= 0x20000 && cp <= 0x2FA1F) ||
           (cp >= 0x30000 && cp <= 0x3FFFF);
}

function getStringWidth(str) {
    let width = 0;
    for (const char of str) {
        const cp = char.codePointAt(0);
        if (isZeroWidthCombining(cp)) continue;
        if (isFullWidthCodePoint(cp)) {
            width += 2;
        } else {
            width += 1;
        }
    }
    return width;
}

function getDisplayWidthWithHeuristics(text) {
    let width = 0;
    for (const char of text) {
        const cp = char.codePointAt(0);
        if (isZeroWidthCombining(cp)) continue;
        if (isFullWidthCodePoint(cp)) {
            width += 2;
        } else {
            width += 1;
        }
    }
    return width;
}

function padCell(content, targetWidth, columnHasFullWidth = false) {
    const trimmed = content.trim();
    const contentWidth = getDisplayWidthWithHeuristics(trimmed);
    const totalPadding = targetWidth - contentWidth;
    const leftPad = 1;
    const rightPad = Math.max(1, totalPadding - leftPad);
    return ' '.repeat(leftPad) + trimmed + ' '.repeat(rightPad);
}

describe('Table Formatting', function() {
    describe('splitTableLine', function() {
        it('should return null for non-table lines', function() {
            assert.strictEqual(splitTableLine('This is normal text'), null);
            assert.strictEqual(splitTableLine('- [ ] checkbox item'), null);
        });

        it('should split basic table line', function() {
            const result = splitTableLine('| A | B | C |');
            assert.deepStrictEqual(result, ['A', 'B', 'C']);
        });

        it('should handle table line without outer pipes', function() {
            const result = splitTableLine('A | B | C');
            assert.deepStrictEqual(result, ['A', 'B', 'C']);
        });

        it('should trim whitespace from cells', function() {
            const result = splitTableLine('|  A  |   B   |  C  |');
            assert.deepStrictEqual(result, ['A', 'B', 'C']);
        });

        it('should handle empty cells', function() {
            const result = splitTableLine('| A |  | C |');
            assert.deepStrictEqual(result, ['A', '', 'C']);
        });

        it('should handle Japanese content', function() {
            const result = splitTableLine('| 日本語 | English | 混合Mixed |');
            assert.deepStrictEqual(result, ['日本語', 'English', '混合Mixed']);
        });
    });

    describe('isSeparatorRow', function() {
        it('should return false for null or empty', function() {
            assert.strictEqual(isSeparatorRow(null), false);
            assert.strictEqual(isSeparatorRow([]), false);
        });

        it('should detect basic separator row', function() {
            assert.strictEqual(isSeparatorRow(['---', '---', '---']), true);
            assert.strictEqual(isSeparatorRow(['----', '-----', '------']), true);
        });

        it('should detect separator with alignment', function() {
            assert.strictEqual(isSeparatorRow([':---', '---:', ':---:']), true);
            assert.strictEqual(isSeparatorRow([':---:', ':---:', ':---:']), true);
        });

        it('should return false for content rows', function() {
            assert.strictEqual(isSeparatorRow(['Header 1', 'Header 2']), false);
            assert.strictEqual(isSeparatorRow(['A', 'B', 'C']), false);
        });

        it('should return false for mixed rows', function() {
            assert.strictEqual(isSeparatorRow(['---', 'Header', '---']), false);
        });
    });

    describe('getDisplayWidthWithHeuristics', function() {
        it('should calculate width for ASCII text', function() {
            assert.strictEqual(getDisplayWidthWithHeuristics('Hello'), 5);
            assert.strictEqual(getDisplayWidthWithHeuristics('AB CD'), 5);
        });

        it('should calculate width for Japanese text (double width)', function() {
            assert.strictEqual(getDisplayWidthWithHeuristics('日本語'), 6);
            assert.strictEqual(getDisplayWidthWithHeuristics('あいう'), 6);
        });

        it('should calculate width for mixed text', function() {
            assert.strictEqual(getDisplayWidthWithHeuristics('日本語ABC'), 9);
            assert.strictEqual(getDisplayWidthWithHeuristics('A日B本C語'), 9);
        });

        it('should handle empty string', function() {
            assert.strictEqual(getDisplayWidthWithHeuristics(''), 0);
        });
    });

    describe('padCell', function() {
        it('should pad basic cell content', function() {
            const result = padCell('A', 5);
            assert.strictEqual(result.length >= 5, true);
            assert.strictEqual(result.trim(), 'A');
        });

        it('should add minimum padding', function() {
            const result = padCell('Hello', 10);
            assert.strictEqual(result.startsWith(' '), true);
            assert.strictEqual(result.includes('Hello'), true);
        });

        it('should handle empty content', function() {
            const result = padCell('', 5);
            assert.strictEqual(result.trim(), '');
            assert.strictEqual(result.length >= 5, true);
        });
    });

    describe('isFullWidthCodePoint', function() {
        it('should detect CJK characters', function() {
            assert.strictEqual(isFullWidthCodePoint('日'.codePointAt(0)), true);
            assert.strictEqual(isFullWidthCodePoint('本'.codePointAt(0)), true);
            assert.strictEqual(isFullWidthCodePoint('語'.codePointAt(0)), true);
        });

        it('should detect Hiragana', function() {
            assert.strictEqual(isFullWidthCodePoint('あ'.codePointAt(0)), true);
            assert.strictEqual(isFullWidthCodePoint('い'.codePointAt(0)), true);
        });

        it('should detect Katakana', function() {
            assert.strictEqual(isFullWidthCodePoint('ア'.codePointAt(0)), true);
            assert.strictEqual(isFullWidthCodePoint('イ'.codePointAt(0)), true);
        });

        it('should return false for ASCII', function() {
            assert.strictEqual(isFullWidthCodePoint('A'.codePointAt(0)), false);
            assert.strictEqual(isFullWidthCodePoint('1'.codePointAt(0)), false);
            assert.strictEqual(isFullWidthCodePoint(' '.codePointAt(0)), false);
        });

        it('should detect Korean Hangul', function() {
            assert.strictEqual(isFullWidthCodePoint('한'.codePointAt(0)), true);
            assert.strictEqual(isFullWidthCodePoint('글'.codePointAt(0)), true);
        });
    });
});
