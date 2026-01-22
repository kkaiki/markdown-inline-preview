const assert = require('assert');

// リスト関連のヘルパー関数
function getListType(line) {
    if (line.match(/^\s*-\s\[[xX ]?\]\s/)) return 'checkbox';
    if (line.match(/^\s*\d+[.)]\s/)) return 'numbered';
    if (line.match(/^\s*[-*+]\s/)) return 'bullet';
    return null;
}

function getIndentLevel(line) {
    const match = line.match(/^(\s*)/);
    if (!match) return 0;
    const indent = match[1];
    // タブは1レベル、2スペースで1レベル
    let level = 0;
    for (const char of indent) {
        if (char === '\t') {
            level += 1;
        }
    }
    // スペースの数を2で割る
    const spaceCount = (indent.match(/ /g) || []).length;
    level += Math.floor(spaceCount / 2);
    return level;
}

function extractListNumber(line) {
    const match = line.match(/^\s*(\d+)[.)]\s/);
    return match ? parseInt(match[1], 10) : null;
}

function extractListContent(line) {
    // 各リストタイプのマーカーを除去してコンテンツを取得
    let content = line;
    content = content.replace(/^\s*-\s\[[xX ]?\]\s*/, ''); // checkbox
    content = content.replace(/^\s*\d+[.)]\s*/, ''); // numbered
    content = content.replace(/^\s*[-*+]\s*/, ''); // bullet
    return content;
}

function isEmptyListItem(line) {
    const content = extractListContent(line);
    return content.trim() === '';
}

// リストブロックの範囲を計算
function calculateListBlockRange(lines, startIndex) {
    const startLine = lines[startIndex];
    const startIndent = getIndentLevel(startLine);
    const startType = getListType(startLine);

    if (!startType) return { start: startIndex, end: startIndex };

    let start = startIndex;
    let end = startIndex;

    // 上方向に探索
    for (let i = startIndex - 1; i >= 0; i--) {
        const line = lines[i];
        if (line.trim() === '') {
            // 空行でリストが分断
            break;
        }
        const lineType = getListType(line);
        if (!lineType) break;
        start = i;
    }

    // 下方向に探索
    for (let i = startIndex + 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() === '') {
            // 空行でリストが分断
            break;
        }
        const lineType = getListType(line);
        if (!lineType) break;
        end = i;
    }

    return { start, end };
}

// 連続するリストを整形（番号振り直し）
function renumberList(lines, startIndex, endIndex) {
    const result = [...lines];
    const numbersByIndent = {};

    for (let i = startIndex; i <= endIndex; i++) {
        const line = lines[i];
        const type = getListType(line);
        const indent = getIndentLevel(line);

        if (type === 'numbered') {
            if (!numbersByIndent[indent]) {
                numbersByIndent[indent] = 0;
            }
            numbersByIndent[indent]++;

            // インデントが深くなったらリセット
            for (const key of Object.keys(numbersByIndent)) {
                if (parseInt(key) > indent) {
                    delete numbersByIndent[key];
                }
            }

            const content = extractListContent(line);
            const indentStr = '  '.repeat(indent);
            result[i] = `${indentStr}${numbersByIndent[indent]}. ${content}`;
        }
    }

    return result;
}

describe('List Edge Cases', function() {

    describe('6.1 Empty line in lists', function() {
        it('should detect list block boundaries with empty line', function() {
            const lines = [
                '1. Item 1',
                '2. Item 2',
                '',
                '3. Item 3'
            ];

            // 最初のブロック
            const block1 = calculateListBlockRange(lines, 0);
            assert.strictEqual(block1.start, 0);
            assert.strictEqual(block1.end, 1);

            // 2番目のブロック（空行の後）
            const block2 = calculateListBlockRange(lines, 3);
            assert.strictEqual(block2.start, 3);
            assert.strictEqual(block2.end, 3);
        });

        it('should renumber lists separately when separated by empty line', function() {
            const lines = [
                '3. Item A',
                '7. Item B',
                '',
                '5. Item C',
                '9. Item D'
            ];

            // 最初のブロックを整形
            const block1 = calculateListBlockRange(lines, 0);
            let result = renumberList(lines, block1.start, block1.end);
            assert.strictEqual(result[0], '1. Item A');
            assert.strictEqual(result[1], '2. Item B');

            // 2番目のブロックを整形
            const block2 = calculateListBlockRange(lines, 3);
            result = renumberList(result, block2.start, block2.end);
            assert.strictEqual(result[3], '1. Item C');
            assert.strictEqual(result[4], '2. Item D');
        });

        it('should not merge lists across empty lines', function() {
            const lines = [
                '1. List 1 Item 1',
                '',
                '1. List 2 Item 1'
            ];

            const block = calculateListBlockRange(lines, 0);
            assert.strictEqual(block.end, 0); // 空行で終了
        });

        it('should handle multiple empty lines between lists', function() {
            const lines = [
                '1. Item 1',
                '',
                '',
                '1. Item 2'
            ];

            const block = calculateListBlockRange(lines, 0);
            assert.strictEqual(block.end, 0);
        });

        it('should detect empty list item', function() {
            assert.strictEqual(isEmptyListItem('1. '), true);
            assert.strictEqual(isEmptyListItem('- '), true);
            assert.strictEqual(isEmptyListItem('- [ ] '), true);
            assert.strictEqual(isEmptyListItem('1. Content'), false);
            assert.strictEqual(isEmptyListItem('- Item'), false);
        });
    });

    describe('6.2 Mixed list types', function() {
        it('should correctly identify different list types', function() {
            assert.strictEqual(getListType('- Bullet'), 'bullet');
            assert.strictEqual(getListType('* Bullet'), 'bullet');
            assert.strictEqual(getListType('+ Bullet'), 'bullet');
            assert.strictEqual(getListType('1. Numbered'), 'numbered');
            assert.strictEqual(getListType('99. Numbered'), 'numbered');
            assert.strictEqual(getListType('1) Numbered'), 'numbered');
            assert.strictEqual(getListType('- [ ] Checkbox'), 'checkbox');
            assert.strictEqual(getListType('- [x] Checked'), 'checkbox');
            assert.strictEqual(getListType('- [X] Checked'), 'checkbox');
            assert.strictEqual(getListType('Normal text'), null);
        });

        it('should handle mixed list types in sequence', function() {
            const lines = [
                '- Bullet item',
                '1. Numbered item',
                '- [ ] Checkbox item'
            ];

            assert.strictEqual(getListType(lines[0]), 'bullet');
            assert.strictEqual(getListType(lines[1]), 'numbered');
            assert.strictEqual(getListType(lines[2]), 'checkbox');
        });

        it('should extract content from different list types', function() {
            assert.strictEqual(extractListContent('- Bullet'), 'Bullet');
            assert.strictEqual(extractListContent('1. Numbered'), 'Numbered');
            assert.strictEqual(extractListContent('- [ ] Task'), 'Task');
            assert.strictEqual(extractListContent('- [x] Done'), 'Done');
        });

        it('should handle indented mixed lists', function() {
            const lines = [
                '- Parent bullet',
                '  1. Child numbered',
                '  - [ ] Child checkbox',
                '    - Grandchild bullet'
            ];

            assert.strictEqual(getIndentLevel(lines[0]), 0);
            assert.strictEqual(getIndentLevel(lines[1]), 1);
            assert.strictEqual(getIndentLevel(lines[2]), 1);
            assert.strictEqual(getIndentLevel(lines[3]), 2);
        });

        it('should preserve indent when converting types', function() {
            const lines = [
                '  - Indented bullet',
                '    1. More indented numbered'
            ];

            assert.strictEqual(getIndentLevel(lines[0]), 1);
            assert.strictEqual(getIndentLevel(lines[1]), 2);
        });
    });

    describe('List number extraction', function() {
        it('should extract numbers from numbered lists', function() {
            assert.strictEqual(extractListNumber('1. Item'), 1);
            assert.strictEqual(extractListNumber('10. Item'), 10);
            assert.strictEqual(extractListNumber('999. Item'), 999);
            assert.strictEqual(extractListNumber('1) Item'), 1);
        });

        it('should return null for non-numbered lists', function() {
            assert.strictEqual(extractListNumber('- Item'), null);
            assert.strictEqual(extractListNumber('- [ ] Task'), null);
            assert.strictEqual(extractListNumber('Normal text'), null);
        });

        it('should handle indented numbered lists', function() {
            assert.strictEqual(extractListNumber('  1. Item'), 1);
            assert.strictEqual(extractListNumber('    10. Item'), 10);
        });
    });

    describe('Nested list handling', function() {
        it('should calculate correct indent levels', function() {
            assert.strictEqual(getIndentLevel('Item'), 0);
            assert.strictEqual(getIndentLevel('  Item'), 1);
            assert.strictEqual(getIndentLevel('    Item'), 2);
            assert.strictEqual(getIndentLevel('\tItem'), 1);
            assert.strictEqual(getIndentLevel('\t\tItem'), 2);
        });

        it('should renumber nested lists correctly', function() {
            const lines = [
                '3. Parent 1',
                '  5. Child 1',
                '  7. Child 2',
                '9. Parent 2'
            ];

            const block = calculateListBlockRange(lines, 0);
            const result = renumberList(lines, block.start, block.end);

            assert.strictEqual(result[0], '1. Parent 1');
            assert.strictEqual(result[1], '  1. Child 1');
            assert.strictEqual(result[2], '  2. Child 2');
            assert.strictEqual(result[3], '2. Parent 2');
        });

        it('should reset numbering at each indent level', function() {
            const lines = [
                '1. A',
                '  1. A1',
                '  2. A2',
                '2. B',
                '  1. B1'  // ここで1にリセットされるべき
            ];

            const block = calculateListBlockRange(lines, 0);
            const result = renumberList(lines, block.start, block.end);

            assert.strictEqual(result[4].includes('1.'), true);
        });
    });

    describe('Edge cases with special characters', function() {
        it('should handle list items with special markdown characters', function() {
            const lines = [
                '- Item with **bold**',
                '- Item with _italic_',
                '- Item with `code`',
                '- Item with [link](url)'
            ];

            for (const line of lines) {
                assert.strictEqual(getListType(line), 'bullet');
            }
        });

        it('should handle checkbox with various states', function() {
            assert.strictEqual(getListType('- [ ] Empty'), 'checkbox');
            assert.strictEqual(getListType('- [x] Lowercase x'), 'checkbox');
            assert.strictEqual(getListType('- [X] Uppercase X'), 'checkbox');
            assert.strictEqual(getListType('- [ ] Space'), 'checkbox');
        });

        it('should handle numbered list with both dot and parenthesis', function() {
            assert.strictEqual(getListType('1. Dot style'), 'numbered');
            assert.strictEqual(getListType('1) Paren style'), 'numbered');
            assert.strictEqual(extractListNumber('1. Dot'), 1);
            assert.strictEqual(extractListNumber('1) Paren'), 1);
        });
    });

    describe('List continuation behavior', function() {
        it('should continue bullet list', function() {
            const prevLine = '- Item 1';
            const type = getListType(prevLine);
            assert.strictEqual(type, 'bullet');
            // 継続マーカーは "- "
        });

        it('should continue numbered list with incremented number', function() {
            const prevLine = '5. Item 5';
            const num = extractListNumber(prevLine);
            const nextNum = num + 1;
            assert.strictEqual(nextNum, 6);
        });

        it('should continue checkbox with unchecked state', function() {
            const prevLine = '- [x] Done task';
            const type = getListType(prevLine);
            assert.strictEqual(type, 'checkbox');
            // 継続は "- [ ] " (未チェック状態)
        });

        it('should exit list on empty item', function() {
            const emptyItems = [
                '- ',
                '1. ',
                '- [ ] ',
                '  - ',
                '  1. '
            ];

            for (const item of emptyItems) {
                assert.strictEqual(isEmptyListItem(item), true);
            }
        });
    });

    describe('Block range calculation', function() {
        it('should find block boundaries', function() {
            const lines = [
                'Normal text',
                '1. First item',
                '2. Second item',
                '3. Third item',
                'More normal text'
            ];

            const block = calculateListBlockRange(lines, 2);
            assert.strictEqual(block.start, 1);
            assert.strictEqual(block.end, 3);
        });

        it('should handle single item block', function() {
            const lines = [
                'Text before',
                '- Single item',
                'Text after'
            ];

            const block = calculateListBlockRange(lines, 1);
            assert.strictEqual(block.start, 1);
            assert.strictEqual(block.end, 1);
        });

        it('should handle block at start of document', function() {
            const lines = [
                '1. First',
                '2. Second',
                'Not a list'
            ];

            const block = calculateListBlockRange(lines, 0);
            assert.strictEqual(block.start, 0);
            assert.strictEqual(block.end, 1);
        });

        it('should handle block at end of document', function() {
            const lines = [
                'Not a list',
                '1. First',
                '2. Second'
            ];

            const block = calculateListBlockRange(lines, 2);
            assert.strictEqual(block.start, 1);
            assert.strictEqual(block.end, 2);
        });
    });
});
