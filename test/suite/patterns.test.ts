import assert from 'assert';
import {
    patterns,
    getLineType,
    getMarkerInfo,
    extractNumberedList,
    extractCheckbox,
    extractHeading,
    isListItem,
    isSeparatorRow
} from '../../src/shared/markdown/patterns';

describe('Patterns Module', function() {
    describe('patterns.HEADING', function() {
        it('should match H1-H6', function() {
            assert.ok(patterns.HEADING.test('# Heading 1'));
            assert.ok(patterns.HEADING.test('## Heading 2'));
            assert.ok(patterns.HEADING.test('###### Heading 6'));
        });

        it('should not match invalid headings', function() {
            assert.ok(!patterns.HEADING.test('#NoSpace'));
            assert.ok(!patterns.HEADING.test('####### Too many'));
        });
    });

    describe('patterns.CHECKBOX', function() {
        it('should match unchecked checkbox', function() {
            assert.ok(patterns.CHECKBOX.test('- [ ] Task'));
        });

        it('should match checked checkbox', function() {
            assert.ok(patterns.CHECKBOX.test('- [x] Done'));
            assert.ok(patterns.CHECKBOX.test('- [X] Done'));
        });

        it('should match indented checkbox', function() {
            assert.ok(patterns.CHECKBOX.test('  - [ ] Indented'));
        });
    });

    describe('patterns.NUMBERED_LIST', function() {
        it('should match numbered lists', function() {
            assert.ok(patterns.NUMBERED_LIST.test('1. Item'));
            assert.ok(patterns.NUMBERED_LIST.test('10. Item'));
            assert.ok(patterns.NUMBERED_LIST.test('1) Item'));
        });

        it('should match indented numbered lists', function() {
            assert.ok(patterns.NUMBERED_LIST.test('  1. Item'));
        });
    });

    describe('patterns.BULLET_LIST', function() {
        it('should match bullet lists', function() {
            assert.ok(patterns.BULLET_LIST.test('- Item'));
            assert.ok(patterns.BULLET_LIST.test('* Item'));
            assert.ok(patterns.BULLET_LIST.test('+ Item'));
        });
    });

    describe('getLineType', function() {
        it('should detect checkbox', function() {
            assert.strictEqual(getLineType('- [ ] Task'), 'checkbox');
            assert.strictEqual(getLineType('- [x] Done'), 'checkbox');
        });

        it('should detect numbered list', function() {
            assert.strictEqual(getLineType('1. Item'), 'numbered');
            assert.strictEqual(getLineType('10. Item'), 'numbered');
        });

        it('should detect bullet list', function() {
            assert.strictEqual(getLineType('- Item'), 'bullet');
            assert.strictEqual(getLineType('* Item'), 'bullet');
        });

        it('should detect heading', function() {
            assert.strictEqual(getLineType('# Title'), 'heading');
            assert.strictEqual(getLineType('## Section'), 'heading');
        });

        it('should detect quote', function() {
            assert.strictEqual(getLineType('> Quote'), 'quote');
        });

        it('should detect codeblock', function() {
            assert.strictEqual(getLineType('```'), 'codeblock');
            assert.strictEqual(getLineType('```javascript'), 'codeblock');
        });

        it('should detect empty', function() {
            assert.strictEqual(getLineType(''), 'empty');
            assert.strictEqual(getLineType('   '), 'empty');
        });

        it('should detect text', function() {
            assert.strictEqual(getLineType('Normal text'), 'text');
        });
    });

    describe('getMarkerInfo', function() {
        it('should get heading marker info', function() {
            const result = getMarkerInfo('# Title');
            assert.strictEqual(result.hasMarker, true);
            assert.strictEqual(result.markerType, 'heading');
            assert.strictEqual(result.contentStart, 2);
        });

        it('should get checkbox marker info', function() {
            const result = getMarkerInfo('- [ ] Task');
            assert.strictEqual(result.hasMarker, true);
            assert.strictEqual(result.markerType, 'checkbox');
        });

        it('should get numbered list marker info', function() {
            const result = getMarkerInfo('1. Item');
            assert.strictEqual(result.hasMarker, true);
            assert.strictEqual(result.markerType, 'numbered');
            assert.strictEqual(result.contentStart, 3);
        });

        it('should get bullet list marker info', function() {
            const result = getMarkerInfo('- Item');
            assert.strictEqual(result.hasMarker, true);
            assert.strictEqual(result.markerType, 'bullet');
        });

        it('should get quote marker info', function() {
            const result = getMarkerInfo('> Quote');
            assert.strictEqual(result.hasMarker, true);
            assert.strictEqual(result.markerType, 'quote');
        });

        it('should return no marker for plain text', function() {
            const result = getMarkerInfo('Plain text');
            assert.strictEqual(result.hasMarker, false);
            assert.strictEqual(result.markerType, null);
        });
    });

    describe('extractNumberedList', function() {
        it('should extract numbered list info', function() {
            const result = extractNumberedList('1. First item');
            assert.strictEqual(result.number, 1);
            assert.strictEqual(result.delimiter, '.');
            assert.strictEqual(result.content, 'First item');
        });

        it('should handle large numbers', function() {
            const result = extractNumberedList('123. Large');
            assert.strictEqual(result.number, 123);
        });

        it('should preserve indent', function() {
            const result = extractNumberedList('  2. Indented');
            assert.strictEqual(result.indent, '  ');
        });

        it('should return null for non-numbered', function() {
            assert.strictEqual(extractNumberedList('- Bullet'), null);
        });
    });

    describe('extractCheckbox', function() {
        it('should extract unchecked checkbox', function() {
            const result = extractCheckbox('- [ ] Task');
            assert.strictEqual(result.checked, false);
            assert.strictEqual(result.content, 'Task');
        });

        it('should extract checked checkbox', function() {
            const result = extractCheckbox('- [x] Done');
            assert.strictEqual(result.checked, true);
            assert.strictEqual(result.content, 'Done');
        });

        it('should handle uppercase X', function() {
            const result = extractCheckbox('- [X] Done');
            assert.strictEqual(result.checked, true);
        });

        it('should preserve indent', function() {
            const result = extractCheckbox('  - [ ] Indented');
            assert.strictEqual(result.indent, '  ');
        });

        it('should return null for non-checkbox', function() {
            assert.strictEqual(extractCheckbox('- Bullet'), null);
        });
    });

    describe('extractHeading', function() {
        it('should extract heading level and text', function() {
            const result = extractHeading('# Title');
            assert.strictEqual(result.level, 1);
            assert.strictEqual(result.text, 'Title');
        });

        it('should handle all levels', function() {
            assert.strictEqual(extractHeading('## H2').level, 2);
            assert.strictEqual(extractHeading('### H3').level, 3);
            assert.strictEqual(extractHeading('###### H6').level, 6);
        });

        it('should return null for non-heading', function() {
            assert.strictEqual(extractHeading('Normal text'), null);
        });
    });

    describe('isListItem', function() {
        it('should detect all list types', function() {
            assert.strictEqual(isListItem('- Bullet'), true);
            assert.strictEqual(isListItem('1. Numbered'), true);
            assert.strictEqual(isListItem('- [ ] Checkbox'), true);
        });

        it('should detect indented lists', function() {
            assert.strictEqual(isListItem('  - Item'), true);
        });

        it('should return false for non-lists', function() {
            assert.strictEqual(isListItem('Normal text'), false);
            assert.strictEqual(isListItem('# Heading'), false);
        });
    });

    describe('isSeparatorRow', function() {
        it('should detect separator rows', function() {
            assert.strictEqual(isSeparatorRow(['---', '---']), true);
            assert.strictEqual(isSeparatorRow([':---:', '---:']), true);
        });

        it('should return false for content rows', function() {
            assert.strictEqual(isSeparatorRow(['Header', 'Header']), false);
        });

        it('should return false for empty/null', function() {
            assert.strictEqual(isSeparatorRow(null), false);
            assert.strictEqual(isSeparatorRow([]), false);
        });
    });
});
