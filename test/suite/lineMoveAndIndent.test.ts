import assert from "assert";

// インデントレベル計算関数（ソースからコピー）
function getIndentLevel(indentStr) {
    if (!indentStr) return 0;

    const tabs = (indentStr.match(/\t/g) || []).length;
    const spaces = (indentStr.match(/ /g) || []).length;
    return tabs + Math.ceil(spaces / 2);
}

// 行のインデント文字列を取得
function getIndentString(line) {
    const match = line.match(/^(\s*)/);
    return match ? match[1] : '';
}

// リスト項目かどうかを判定
function isListItem(line) {
    return line.match(/^\s*[-*+\d]|^\s*-\s\[/) !== null;
}

// 番号付きリストの番号を抽出
function extractListNumber(line) {
    const match = line.match(/^(\s*)(\d+)([\.)])\s*(.*)/);
    if (match) {
        return {
            indent: match[1],
            number: parseInt(match[2]),
            delimiter: match[3],
            content: match[4]
        };
    }
    return null;
}

// 行タイプを判定
function getLineType(line) {
    if (line.match(/^(\s*)-\s\[[xX ]\]\s/)) return 'checkbox';
    if (line.match(/^(\s*)\d+[\.)]\s/)) return 'numbered';
    if (line.match(/^(\s*)[-*+]\s/)) return 'bullet';
    if (line.match(/^(#{1,6})\s/)) return 'heading';
    if (line.match(/^>\s/)) return 'quote';
    if (line.match(/^```/)) return 'codeblock';
    if (line.trim() === '') return 'empty';
    return 'text';
}

describe('Line Move and Indent', function() {
    describe('getIndentLevel', function() {
        it('should return 0 for no indent', function() {
            assert.strictEqual(getIndentLevel(''), 0);
            assert.strictEqual(getIndentLevel(null), 0);
            assert.strictEqual(getIndentLevel(undefined), 0);
        });

        it('should count spaces as indent levels', function() {
            assert.strictEqual(getIndentLevel('  '), 1);
            assert.strictEqual(getIndentLevel('    '), 2);
            assert.strictEqual(getIndentLevel('      '), 3);
        });

        it('should count tabs as indent levels', function() {
            assert.strictEqual(getIndentLevel('\t'), 1);
            assert.strictEqual(getIndentLevel('\t\t'), 2);
            assert.strictEqual(getIndentLevel('\t\t\t'), 3);
        });

        it('should handle mixed spaces and tabs', function() {
            assert.strictEqual(getIndentLevel('\t  '), 2); // 1 tab + 2 spaces = 2 levels
            assert.strictEqual(getIndentLevel('  \t'), 2); // 2 spaces + 1 tab = 2 levels
        });

        it('should round up odd number of spaces', function() {
            assert.strictEqual(getIndentLevel(' '), 1);
            assert.strictEqual(getIndentLevel('   '), 2);
            assert.strictEqual(getIndentLevel('     '), 3);
        });
    });

    describe('getIndentString', function() {
        it('should extract leading whitespace', function() {
            assert.strictEqual(getIndentString('  - item'), '  ');
            assert.strictEqual(getIndentString('\t- item'), '\t');
            assert.strictEqual(getIndentString('no indent'), '');
        });

        it('should handle empty lines', function() {
            assert.strictEqual(getIndentString(''), '');
            assert.strictEqual(getIndentString('   '), '   ');
        });
    });

    describe('isListItem', function() {
        it('should detect bullet lists', function() {
            assert.strictEqual(isListItem('- item'), true);
            assert.strictEqual(isListItem('* item'), true);
            assert.strictEqual(isListItem('+ item'), true);
        });

        it('should detect numbered lists', function() {
            assert.strictEqual(isListItem('1. item'), true);
            assert.strictEqual(isListItem('10. item'), true);
            assert.strictEqual(isListItem('1) item'), true);
        });

        it('should detect checkboxes', function() {
            assert.strictEqual(isListItem('- [ ] task'), true);
            assert.strictEqual(isListItem('- [x] done'), true);
        });

        it('should detect indented lists', function() {
            assert.strictEqual(isListItem('  - item'), true);
            assert.strictEqual(isListItem('    1. item'), true);
        });

        it('should return false for non-list lines', function() {
            assert.strictEqual(isListItem('Normal text'), false);
            assert.strictEqual(isListItem('# Heading'), false);
            assert.strictEqual(isListItem(''), false);
        });
    });

    describe('extractListNumber', function() {
        it('should extract number from numbered list', function() {
            const result = extractListNumber('1. First item');
            assert.strictEqual(result.number, 1);
            assert.strictEqual(result.delimiter, '.');
            assert.strictEqual(result.content, 'First item');
        });

        it('should handle large numbers', function() {
            const result = extractListNumber('123. Large number');
            assert.strictEqual(result.number, 123);
        });

        it('should handle parenthesis delimiter', function() {
            const result = extractListNumber('1) Item');
            assert.strictEqual(result.delimiter, ')');
        });

        it('should preserve indent', function() {
            const result = extractListNumber('  2. Indented');
            assert.strictEqual(result.indent, '  ');
            assert.strictEqual(result.number, 2);
        });

        it('should return null for non-numbered lines', function() {
            assert.strictEqual(extractListNumber('- Bullet'), null);
            assert.strictEqual(extractListNumber('Normal'), null);
        });
    });

    describe('getLineType', function() {
        it('should detect checkbox', function() {
            assert.strictEqual(getLineType('- [ ] Task'), 'checkbox');
            assert.strictEqual(getLineType('- [x] Done'), 'checkbox');
            assert.strictEqual(getLineType('- [X] Also done'), 'checkbox');
        });

        it('should detect numbered list', function() {
            assert.strictEqual(getLineType('1. Item'), 'numbered');
            assert.strictEqual(getLineType('10. Item'), 'numbered');
            assert.strictEqual(getLineType('1) Item'), 'numbered');
        });

        it('should detect bullet list', function() {
            assert.strictEqual(getLineType('- Item'), 'bullet');
            assert.strictEqual(getLineType('* Item'), 'bullet');
            assert.strictEqual(getLineType('+ Item'), 'bullet');
        });

        it('should detect heading', function() {
            assert.strictEqual(getLineType('# H1'), 'heading');
            assert.strictEqual(getLineType('## H2'), 'heading');
            assert.strictEqual(getLineType('###### H6'), 'heading');
        });

        it('should detect quote', function() {
            assert.strictEqual(getLineType('> Quote'), 'quote');
        });

        it('should detect code block', function() {
            assert.strictEqual(getLineType('```'), 'codeblock');
            assert.strictEqual(getLineType('```javascript'), 'codeblock');
        });

        it('should detect empty line', function() {
            assert.strictEqual(getLineType(''), 'empty');
            assert.strictEqual(getLineType('   '), 'empty');
        });

        it('should detect text', function() {
            assert.strictEqual(getLineType('Normal text'), 'text');
        });
    });

    describe('Block movement logic', function() {
        // 子要素を含むブロックの範囲を計算
        function calculateBlockRange(lines, startLine) {
            const currentIndent = getIndentString(lines[startLine]).length;
            let blockEndLine = startLine;

            for (let i = startLine + 1; i < lines.length; i++) {
                const line = lines[i];
                if (line.trim() === '') break;
                const indent = getIndentString(line).length;
                if (indent <= currentIndent) break;
                blockEndLine = i;
            }

            return { start: startLine, end: blockEndLine };
        }

        it('should calculate block range for single line', function() {
            const lines = ['- Item 1', '- Item 2', '- Item 3'];
            const range = calculateBlockRange(lines, 0);
            assert.strictEqual(range.start, 0);
            assert.strictEqual(range.end, 0);
        });

        it('should include child items in block range', function() {
            const lines = [
                '- Parent',
                '  - Child 1',
                '  - Child 2',
                '- Next Parent'
            ];
            const range = calculateBlockRange(lines, 0);
            assert.strictEqual(range.start, 0);
            assert.strictEqual(range.end, 2);
        });

        it('should include nested children', function() {
            const lines = [
                '- Parent',
                '  - Child',
                '    - Grandchild',
                '- Next'
            ];
            const range = calculateBlockRange(lines, 0);
            assert.strictEqual(range.start, 0);
            assert.strictEqual(range.end, 2);
        });

        it('should stop at empty line', function() {
            const lines = [
                '- Parent',
                '  - Child',
                '',
                '  - Not included'
            ];
            const range = calculateBlockRange(lines, 0);
            assert.strictEqual(range.end, 1);
        });
    });
});
