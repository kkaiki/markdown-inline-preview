const assert = require('assert');

// 選択操作のエッジケーステスト

// getMarkerEndPosition関数のコピー
function getMarkerEndPosition(text) {
    let contentStart = 0;
    let hasMarker = false;
    let markerType = null;

    // ヘッディング
    const headingMatch = text.match(/^(#{1,6}\s+)/);
    if (headingMatch) {
        contentStart = headingMatch[1].length;
        hasMarker = true;
        markerType = 'heading';
    }
    // チェックボックス
    else if (text.match(/^(\s*-\s\[[\sx]?\]\s*)/i)) {
        const match = text.match(/^(\s*-\s\[[\sx]?\]\s*)/i);
        contentStart = match[1].length;
        hasMarker = true;
        markerType = 'checkbox';
    }
    // 順序付きリスト
    else if (text.match(/^(\s*\d+\.\s+)/)) {
        const match = text.match(/^(\s*\d+\.\s+)/);
        contentStart = match[1].length;
        hasMarker = true;
        markerType = 'numbered';
    }
    // 順序なしリスト
    else if (text.match(/^(\s*[-*+]\s+)/)) {
        const match = text.match(/^(\s*[-*+]\s+)/);
        contentStart = match[1].length;
        hasMarker = true;
        markerType = 'bullet';
    }
    // 引用
    else if (text.match(/^(>\s*)+/)) {
        const match = text.match(/^(>\s*)+/);
        contentStart = match[0].length;
        hasMarker = true;
        markerType = 'quote';
    }

    return { contentStart, hasMarker, markerType };
}

// 選択範囲を計算する関数
function calculateSelection(lineText, cursorPos, anchorPos) {
    return {
        start: Math.min(cursorPos, anchorPos),
        end: Math.max(cursorPos, anchorPos),
        text: lineText.substring(Math.min(cursorPos, anchorPos), Math.max(cursorPos, anchorPos))
    };
}

// Shift+Cmd+Left で選択範囲を計算
function calculateSmartSelectLeft(lineText, cursorPos, anchorPos = cursorPos) {
    const { contentStart, hasMarker } = getMarkerEndPosition(lineText);

    // カーソルがコンテンツ開始より右にある場合
    if (cursorPos > contentStart) {
        // コンテンツ開始まで選択
        return calculateSelection(lineText, contentStart, anchorPos);
    }
    // カーソルがコンテンツ開始位置にある場合
    else if (cursorPos === contentStart && hasMarker) {
        // 行頭まで選択
        return calculateSelection(lineText, 0, anchorPos);
    }
    // それ以外は行頭まで
    return calculateSelection(lineText, 0, anchorPos);
}

describe('Selection Edge Cases', function() {

    describe('Shift+Cmd+Left selection', function() {
        it('should select from cursor to content start for heading', function() {
            const line = '# Heading text here';
            const cursorPos = 15; // 'h' of 'here'
            const selection = calculateSmartSelectLeft(line, cursorPos);

            assert.strictEqual(selection.start, 2); // 'H'の位置
            assert.strictEqual(selection.end, cursorPos);
            // substring(2, 15) = 'Heading text '
            assert.strictEqual(selection.text, 'Heading text ');
        });

        it('should select from cursor to content start for checkbox', function() {
            const line = '- [ ] Task description';
            const cursorPos = 18; // 'p' of 'description'
            const selection = calculateSmartSelectLeft(line, cursorPos);

            assert.strictEqual(selection.start, 6); // 'T'の位置
            assert.strictEqual(selection.end, cursorPos);
        });

        it('should select from cursor to content start for numbered list', function() {
            const line = '1. First item in list';
            const cursorPos = 15; // 'i' of 'in'
            const selection = calculateSmartSelectLeft(line, cursorPos);

            assert.strictEqual(selection.start, 3); // 'F'の位置
            assert.strictEqual(selection.end, cursorPos);
        });

        it('should select from cursor to content start for bullet', function() {
            const line = '- Bullet item';
            const cursorPos = 10;
            const selection = calculateSmartSelectLeft(line, cursorPos);

            assert.strictEqual(selection.start, 2); // 'B'の位置
            assert.strictEqual(selection.end, cursorPos);
        });

        it('should select to line start when already at content start', function() {
            const line = '# Heading';
            const cursorPos = 2; // コンテンツ開始位置
            const anchorPos = 9; // 行末
            const selection = calculateSmartSelectLeft(line, cursorPos, anchorPos);

            assert.strictEqual(selection.start, 0);
            assert.strictEqual(selection.end, anchorPos);
        });
    });

    describe('Selection with indented content', function() {
        it('should handle indented bullet list selection', function() {
            const line = '  - Indented bullet';
            const cursorPos = 15;
            const selection = calculateSmartSelectLeft(line, cursorPos);

            assert.strictEqual(selection.start, 4); // 'I'の位置
        });

        it('should handle indented numbered list selection', function() {
            const line = '    1. Deeply indented';
            const cursorPos = 18;
            const selection = calculateSmartSelectLeft(line, cursorPos);

            assert.strictEqual(selection.start, 7); // 'D'の位置
        });

        it('should handle indented checkbox selection', function() {
            const line = '  - [ ] Indented task';
            const cursorPos = 16;
            const selection = calculateSmartSelectLeft(line, cursorPos);

            assert.strictEqual(selection.start, 8); // 'I'の位置
        });
    });

    describe('Selection with quote markers', function() {
        it('should handle single quote selection', function() {
            const line = '> Quoted text';
            const cursorPos = 10;
            const selection = calculateSmartSelectLeft(line, cursorPos);

            assert.strictEqual(selection.start, 2); // 'Q'の位置
        });

        it('should handle nested quote selection', function() {
            const line = '> > Nested quote';
            const cursorPos = 14;
            const { contentStart } = getMarkerEndPosition(line);

            // ネストされた引用のコンテンツ開始位置
            assert.strictEqual(contentStart >= 4, true);
        });
    });

    describe('Selection edge cases', function() {
        it('should handle selection in plain text (no marker)', function() {
            const line = 'Plain text without marker';
            const cursorPos = 15;
            const selection = calculateSmartSelectLeft(line, cursorPos);

            // マーカーがない場合は行頭まで選択
            assert.strictEqual(selection.start, 0);
            assert.strictEqual(selection.end, cursorPos);
        });

        it('should handle selection at line start', function() {
            const line = '- Item';
            const cursorPos = 0;
            const selection = calculateSmartSelectLeft(line, cursorPos);

            assert.strictEqual(selection.start, 0);
            assert.strictEqual(selection.end, 0);
        });

        it('should handle selection with existing selection', function() {
            const line = '# Heading text';
            const cursorPos = 5;
            const anchorPos = 10;
            const selection = calculateSmartSelectLeft(line, cursorPos, anchorPos);

            assert.strictEqual(selection.start, 2);
            assert.strictEqual(selection.end, anchorPos);
        });

        it('should handle empty line selection', function() {
            const line = '';
            const cursorPos = 0;
            const selection = calculateSmartSelectLeft(line, cursorPos);

            assert.strictEqual(selection.start, 0);
            assert.strictEqual(selection.end, 0);
        });

        it('should handle whitespace only line', function() {
            const line = '    ';
            const cursorPos = 2;
            const selection = calculateSmartSelectLeft(line, cursorPos);

            assert.strictEqual(selection.start, 0);
        });
    });

    describe('Selection text extraction', function() {
        it('should extract correct text from heading', function() {
            const line = '## Section Title';
            const cursorPos = 16;
            const selection = calculateSmartSelectLeft(line, cursorPos);

            assert.strictEqual(selection.text, 'Section Title');
        });

        it('should extract correct text from bullet', function() {
            const line = '- Item content';
            const cursorPos = 14;
            const selection = calculateSmartSelectLeft(line, cursorPos);

            assert.strictEqual(selection.text, 'Item content');
        });

        it('should extract correct text including partial word', function() {
            const line = '1. Numbered item';
            const cursorPos = 10; // 'd' of 'Numbered'
            const selection = calculateSmartSelectLeft(line, cursorPos);

            assert.strictEqual(selection.text, 'Numbere');
        });
    });

    describe('Multi-level heading selection', function() {
        it('should handle H1 selection', function() {
            const line = '# H1';
            const cursorPos = 4;
            const { contentStart } = getMarkerEndPosition(line);
            assert.strictEqual(contentStart, 2);
        });

        it('should handle H6 selection', function() {
            const line = '###### H6';
            const cursorPos = 9;
            const { contentStart } = getMarkerEndPosition(line);
            assert.strictEqual(contentStart, 7);
        });

        it('should handle heading with extra spaces', function() {
            const line = '#  Heading with extra space';
            const cursorPos = 20;
            const { contentStart } = getMarkerEndPosition(line);
            // "#  " = 3文字
            assert.strictEqual(contentStart, 3);
        });
    });

    describe('Checkbox state variations', function() {
        it('should handle unchecked checkbox selection', function() {
            const line = '- [ ] Unchecked';
            const { contentStart, markerType } = getMarkerEndPosition(line);
            assert.strictEqual(markerType, 'checkbox');
            assert.strictEqual(contentStart, 6);
        });

        it('should handle checked checkbox selection (lowercase x)', function() {
            const line = '- [x] Checked';
            const { contentStart, markerType } = getMarkerEndPosition(line);
            assert.strictEqual(markerType, 'checkbox');
            assert.strictEqual(contentStart, 6);
        });

        it('should handle checked checkbox selection (uppercase X)', function() {
            const line = '- [X] Checked';
            const { contentStart, markerType } = getMarkerEndPosition(line);
            assert.strictEqual(markerType, 'checkbox');
            assert.strictEqual(contentStart, 6);
        });
    });

    describe('Cmd+Shift+Left from content start to line start', function() {
        // Issue: When cursor is at content start (right after "- [ ] "),
        // Cmd+Shift+Left should select to line start (left of "-")

        it('should select to line start when cursor at checkbox content start', function() {
            const line = '- [ ] Task';
            const cursorPos = 6; // Content start (right after "- [ ] ")
            const { contentStart, hasMarker } = getMarkerEndPosition(line);

            // Verify cursor is at content start
            assert.strictEqual(cursorPos, contentStart);
            assert.strictEqual(hasMarker, true);

            // Cmd+Shift+Left should select to line start (position 0)
            const selection = calculateSmartSelectLeft(line, cursorPos);
            assert.strictEqual(selection.start, 0);
            assert.strictEqual(selection.end, cursorPos);
            assert.strictEqual(selection.text, '- [ ] ');
        });

        it('should select marker text when going from content start to line start', function() {
            const line = '- [ ] タスク内容';
            const cursorPos = 6; // Content start
            const selection = calculateSmartSelectLeft(line, cursorPos);

            // Should select the marker "- [ ] "
            assert.strictEqual(selection.start, 0);
            assert.strictEqual(selection.text, '- [ ] ');
        });

        it('should select to line start for bullet list at content start', function() {
            const line = '- Item';
            const cursorPos = 2; // Content start (right after "- ")
            const selection = calculateSmartSelectLeft(line, cursorPos);

            assert.strictEqual(selection.start, 0);
            assert.strictEqual(selection.text, '- ');
        });

        it('should select to line start for numbered list at content start', function() {
            const line = '1. Item';
            const cursorPos = 3; // Content start (right after "1. ")
            const selection = calculateSmartSelectLeft(line, cursorPos);

            assert.strictEqual(selection.start, 0);
            assert.strictEqual(selection.text, '1. ');
        });

        it('should select to line start for heading at content start', function() {
            const line = '## Heading';
            const cursorPos = 3; // Content start (right after "## ")
            const selection = calculateSmartSelectLeft(line, cursorPos);

            assert.strictEqual(selection.start, 0);
            assert.strictEqual(selection.text, '## ');
        });

        it('should select to line start for indented checkbox at content start', function() {
            const line = '  - [ ] Indented task';
            const cursorPos = 8; // Content start (right after "  - [ ] ")
            const { contentStart } = getMarkerEndPosition(line);

            assert.strictEqual(cursorPos, contentStart);

            const selection = calculateSmartSelectLeft(line, cursorPos);
            assert.strictEqual(selection.start, 0);
            assert.strictEqual(selection.text, '  - [ ] ');
        });

        it('should handle Japanese content checkbox', function() {
            // Real-world case from user report
            const line = '- [ ] アクティブリスニングを（決めつけなどを勉強していく）';
            const cursorPos = 6; // Content start
            const selection = calculateSmartSelectLeft(line, cursorPos);

            // When at content start, should select to line start
            assert.strictEqual(selection.start, 0);
            assert.strictEqual(selection.end, 6);
            assert.strictEqual(selection.text, '- [ ] ');
        });
    });
});
