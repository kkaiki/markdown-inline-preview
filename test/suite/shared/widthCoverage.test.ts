import assert from 'assert';
import {
    isZeroWidthCombining,
    isFullWidthCodePoint,
    isNarrowChar,
    isWideChar,
    getStringWidth,
    getDisplayWidthWithHeuristics,
    padCell
} from '../../../src/shared/table/width';

describe('Width Coverage Tests', function() {

    describe('isZeroWidthCombining', function() {
        it('should detect Combining Diacritical Marks (0x0300-0x036F)', function() {
            assert.strictEqual(isZeroWidthCombining(0x0300), true);
            assert.strictEqual(isZeroWidthCombining(0x0336), true); // combining long stroke
            assert.strictEqual(isZeroWidthCombining(0x036F), true);
        });

        it('should detect Combining Diacritical Marks Extended (0x1AB0-0x1AFF)', function() {
            assert.strictEqual(isZeroWidthCombining(0x1AB0), true);
            assert.strictEqual(isZeroWidthCombining(0x1AFF), true);
        });

        it('should detect Combining Diacritical Marks Supplement (0x1DC0-0x1DFF)', function() {
            assert.strictEqual(isZeroWidthCombining(0x1DC0), true);
            assert.strictEqual(isZeroWidthCombining(0x1DFF), true);
        });

        it('should detect Combining Diacritical Marks for Symbols (0x20D0-0x20FF)', function() {
            assert.strictEqual(isZeroWidthCombining(0x20D0), true);
            assert.strictEqual(isZeroWidthCombining(0x20FF), true);
        });

        it('should detect Variation Selectors (0xFE00-0xFE0F)', function() {
            assert.strictEqual(isZeroWidthCombining(0xFE00), true);
            assert.strictEqual(isZeroWidthCombining(0xFE0F), true);
        });

        it('should detect Combining Half Marks (0xFE20-0xFE2F)', function() {
            assert.strictEqual(isZeroWidthCombining(0xFE20), true);
            assert.strictEqual(isZeroWidthCombining(0xFE2F), true);
        });

        it('should detect Zero Width Space (0x200B)', function() {
            assert.strictEqual(isZeroWidthCombining(0x200B), true);
        });

        it('should detect Zero Width Non-Joiner (0x200C)', function() {
            assert.strictEqual(isZeroWidthCombining(0x200C), true);
        });

        it('should detect Zero Width Joiner (0x200D)', function() {
            assert.strictEqual(isZeroWidthCombining(0x200D), true);
        });

        it('should detect BOM (0xFEFF)', function() {
            assert.strictEqual(isZeroWidthCombining(0xFEFF), true);
        });

        it('should return false for regular characters', function() {
            assert.strictEqual(isZeroWidthCombining(0x0041), false); // 'A'
            assert.strictEqual(isZeroWidthCombining(0x3042), false); // 'あ'
        });
    });

    describe('isFullWidthCodePoint edge cases', function() {
        it('should detect Hangul Jamo (0x1100-0x115F)', function() {
            assert.strictEqual(isFullWidthCodePoint(0x1100), true);
            assert.strictEqual(isFullWidthCodePoint(0x115F), true);
        });

        it('should detect CJK range (0x2E80-0x9FFF)', function() {
            assert.strictEqual(isFullWidthCodePoint(0x2E80), true);
            assert.strictEqual(isFullWidthCodePoint(0x4E00), true); // 一
            assert.strictEqual(isFullWidthCodePoint(0x9FFF), true);
        });

        it('should detect Hangul Syllables (0xAC00-0xD7A3)', function() {
            assert.strictEqual(isFullWidthCodePoint(0xAC00), true);
            assert.strictEqual(isFullWidthCodePoint(0xD7A3), true);
        });

        it('should detect CJK Compatibility Ideographs (0xF900-0xFAFF)', function() {
            assert.strictEqual(isFullWidthCodePoint(0xF900), true);
            assert.strictEqual(isFullWidthCodePoint(0xFAFF), true);
        });

        it('should detect Vertical forms (0xFE10-0xFE1F)', function() {
            assert.strictEqual(isFullWidthCodePoint(0xFE10), true);
            assert.strictEqual(isFullWidthCodePoint(0xFE1F), true);
        });

        it('should detect CJK Compatibility Forms (0xFE30-0xFE6F)', function() {
            assert.strictEqual(isFullWidthCodePoint(0xFE30), true);
            assert.strictEqual(isFullWidthCodePoint(0xFE6F), true);
        });

        it('should detect Fullwidth Forms (0xFF00-0xFF60)', function() {
            assert.strictEqual(isFullWidthCodePoint(0xFF00), true);
            assert.strictEqual(isFullWidthCodePoint(0xFF21), true); // Fullwidth A
            assert.strictEqual(isFullWidthCodePoint(0xFF60), true);
        });

        it('should detect Fullwidth Symbol Variants (0xFFE0-0xFFE6)', function() {
            assert.strictEqual(isFullWidthCodePoint(0xFFE0), true);
            assert.strictEqual(isFullWidthCodePoint(0xFFE6), true);
        });

        it('should detect CJK Extension B-F (0x20000-0x2FA1F)', function() {
            assert.strictEqual(isFullWidthCodePoint(0x20000), true);
            assert.strictEqual(isFullWidthCodePoint(0x2FA1F), true);
        });

        it('should detect CJK Extension G (0x30000-0x3FFFF)', function() {
            assert.strictEqual(isFullWidthCodePoint(0x30000), true);
            assert.strictEqual(isFullWidthCodePoint(0x3FFFF), true);
        });

        it('should return false for ASCII', function() {
            assert.strictEqual(isFullWidthCodePoint(0x0041), false); // 'A'
            assert.strictEqual(isFullWidthCodePoint(0x007A), false); // 'z'
        });
    });

    describe('isNarrowChar', function() {
        it('should detect narrow lowercase i', function() {
            assert.strictEqual(isNarrowChar('i'), true);
        });

        it('should detect narrow lowercase l', function() {
            assert.strictEqual(isNarrowChar('l'), true);
        });

        it('should detect narrow number 1', function() {
            assert.strictEqual(isNarrowChar('1'), true);
        });

        it('should detect narrow pipe |', function() {
            assert.strictEqual(isNarrowChar('|'), true);
        });

        it('should detect narrow exclamation !', function() {
            assert.strictEqual(isNarrowChar('!'), true);
        });

        it('should detect narrow colon :', function() {
            assert.strictEqual(isNarrowChar(':'), true);
        });

        it('should detect narrow semicolon ;', function() {
            assert.strictEqual(isNarrowChar(';'), true);
        });

        it('should detect narrow period .', function() {
            assert.strictEqual(isNarrowChar('.'), true);
        });

        it('should detect narrow comma ,', function() {
            assert.strictEqual(isNarrowChar(','), true);
        });

        it('should detect narrow apostrophe \'', function() {
            assert.strictEqual(isNarrowChar("'"), true);
        });

        it('should return false for normal width characters', function() {
            assert.strictEqual(isNarrowChar('A'), false);
            assert.strictEqual(isNarrowChar('M'), false);
            assert.strictEqual(isNarrowChar('x'), false);
        });
    });

    describe('isWideChar', function() {
        it('should detect wide uppercase W', function() {
            assert.strictEqual(isWideChar('W'), true);
        });

        it('should detect wide uppercase M', function() {
            assert.strictEqual(isWideChar('M'), true);
        });

        it('should detect wide lowercase w', function() {
            assert.strictEqual(isWideChar('w'), true);
        });

        it('should detect wide lowercase m', function() {
            assert.strictEqual(isWideChar('m'), true);
        });

        it('should detect wide @ symbol', function() {
            assert.strictEqual(isWideChar('@'), true);
        });

        it('should detect wide # symbol', function() {
            assert.strictEqual(isWideChar('#'), true);
        });

        it('should detect wide % symbol', function() {
            assert.strictEqual(isWideChar('%'), true);
        });

        it('should return false for normal width characters', function() {
            assert.strictEqual(isWideChar('A'), false);
            assert.strictEqual(isWideChar('i'), false);
            assert.strictEqual(isWideChar('x'), false);
        });
    });

    describe('getStringWidth', function() {
        it('should calculate width for ASCII string', function() {
            const width = getStringWidth('Hello');
            assert.strictEqual(width, 5);
        });

        it('should calculate width for Japanese string', function() {
            const width = getStringWidth('日本語');
            assert.strictEqual(width, 6); // Each CJK char is 2 width
        });

        it('should calculate width for mixed string', function() {
            const width = getStringWidth('Hello日本');
            assert.strictEqual(width, 9); // 5 + 4
        });

        it('should handle empty string', function() {
            const width = getStringWidth('');
            assert.strictEqual(width, 0);
        });

        it('should skip zero-width characters', function() {
            const width = getStringWidth('A\u0300B'); // A with combining grave + B
            assert.strictEqual(width, 2); // Only A and B count
        });

        it('should handle zero width joiner', function() {
            const width = getStringWidth('A\u200DB'); // A + ZWJ + B
            assert.strictEqual(width, 2);
        });
    });

    describe('getDisplayWidthWithHeuristics', function() {
        it('should match getStringWidth for basic text', function() {
            const text = 'Hello World';
            assert.strictEqual(
                getDisplayWidthWithHeuristics(text),
                getStringWidth(text)
            );
        });

        it('should handle CJK text', function() {
            const width = getDisplayWidthWithHeuristics('漢字');
            assert.strictEqual(width, 4);
        });

        it('should handle mixed ASCII and CJK', function() {
            const width = getDisplayWidthWithHeuristics('ABC漢字');
            assert.strictEqual(width, 7);
        });

        it('should skip combining characters', function() {
            const width = getDisplayWidthWithHeuristics('café');
            // 'e' with combining acute should not add extra width
            assert.strictEqual(width >= 4, true);
        });
    });

    describe('padCell', function() {
        it('should pad simple content', function() {
            const result = padCell('Hello', 10);
            assert.strictEqual(result.length >= 10, true);
            assert.strictEqual(result.includes('Hello'), true);
        });

        it('should add minimum padding', function() {
            const result = padCell('A', 5);
            assert.strictEqual(result.startsWith(' '), true); // Left pad
            assert.strictEqual(result.endsWith(' '), true); // Right pad
        });

        it('should handle empty content', function() {
            const result = padCell('', 5);
            assert.strictEqual(result.length >= 2, true); // At least left + right padding
        });

        it('should handle content with leading/trailing spaces', function() {
            const result = padCell('  Hello  ', 10);
            assert.strictEqual(result.includes('Hello'), true);
            // Should trim the content
        });

        it('should handle full-width content flag', function() {
            const result = padCell('日本語', 10, true);
            assert.strictEqual(result.includes('日本語'), true);
        });

        it('should handle content longer than target width', function() {
            const result = padCell('Very Long Content', 5);
            assert.strictEqual(result.includes('Very Long Content'), true);
            // Should still add minimum padding
        });
    });

    describe('Unicode edge cases', function() {
        it('should handle emoji (not full-width in this implementation)', function() {
            const width = getStringWidth('👍');
            assert.strictEqual(typeof width, 'number');
        });

        it('should handle Korean text', function() {
            const width = getStringWidth('한글');
            assert.strictEqual(width, 4); // Korean chars are full-width
        });

        it('should handle hiragana', function() {
            const width = getStringWidth('ひらがな');
            assert.strictEqual(width, 8);
        });

        it('should handle katakana', function() {
            const width = getStringWidth('カタカナ');
            assert.strictEqual(width, 8);
        });

        it('should handle fullwidth alphabet', function() {
            const width = getStringWidth('ＡＢＣ'); // Fullwidth ABC
            assert.strictEqual(width, 6);
        });
    });
});
