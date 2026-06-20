const assert = require('assert');
const { findInlineEmphasis } = require('../../src/utils/inlineEmphasis');

function matchSummary(line, match) {
    return {
        type: match.type,
        marker: line.slice(match.markerStart.start, match.markerStart.end),
        content: line.slice(match.contentStart, match.contentEnd)
    };
}

describe('findInlineEmphasis', function() {
    it('detects bold with **', function() {
        const line = '**bold** text';
        const matches = findInlineEmphasis(line).map(m => matchSummary(line, m));
        assert.deepStrictEqual(matches, [{ type: 'bold', marker: '**', content: 'bold' }]);
    });

    it('detects bold with __', function() {
        const line = '__bold underscore__';
        const matches = findInlineEmphasis(line).map(m => matchSummary(line, m));
        assert.deepStrictEqual(matches, [{ type: 'bold', marker: '__', content: 'bold underscore' }]);
    });

    it('detects italic with *', function() {
        const line = 'a *italic* b';
        const matches = findInlineEmphasis(line).map(m => matchSummary(line, m));
        assert.deepStrictEqual(matches, [{ type: 'italic', marker: '*', content: 'italic' }]);
    });

    it('detects italic with _', function() {
        const line = '_italic underscore_';
        const matches = findInlineEmphasis(line).map(m => matchSummary(line, m));
        assert.deepStrictEqual(matches, [{ type: 'italic', marker: '_', content: 'italic underscore' }]);
    });

    it('detects strikethrough', function() {
        const line = '~~strike~~ here';
        const matches = findInlineEmphasis(line).map(m => matchSummary(line, m));
        assert.deepStrictEqual(matches, [{ type: 'strikethrough', marker: '~~', content: 'strike' }]);
    });

    it('detects inline code', function() {
        const line = 'use `code` here';
        const matches = findInlineEmphasis(line).map(m => matchSummary(line, m));
        assert.deepStrictEqual(matches, [{ type: 'code', marker: '`', content: 'code' }]);
    });

    it('treats code span content as opaque to other emphasis', function() {
        const line = 'inline `code **not bold**` end';
        const matches = findInlineEmphasis(line).map(m => matchSummary(line, m));
        assert.deepStrictEqual(matches, [{ type: 'code', marker: '`', content: 'code **not bold**' }]);
    });

    it('detects multiple distinct spans on one line in order', function() {
        const line = 'mix **bold** and *italic* and ~~strike~~ and `code`';
        const matches = findInlineEmphasis(line).map(m => matchSummary(line, m));
        assert.deepStrictEqual(matches, [
            { type: 'bold', marker: '**', content: 'bold' },
            { type: 'italic', marker: '*', content: 'italic' },
            { type: 'strikethrough', marker: '~~', content: 'strike' },
            { type: 'code', marker: '`', content: 'code' }
        ]);
    });

    it('does not italicize underscores inside snake_case identifiers', function() {
        const line = 'snake_case_var should not italicize';
        assert.deepStrictEqual(findInlineEmphasis(line), []);
    });

    it('ignores escaped markers', function() {
        const line = 'escaped \\*not italic\\*';
        assert.deepStrictEqual(findInlineEmphasis(line), []);
    });

    it('ignores markers with whitespace immediately inside', function() {
        const line = '* not italic * (space inside)';
        assert.deepStrictEqual(findInlineEmphasis(line), []);
    });

    it('ignores a single unpaired asterisk used as multiplication', function() {
        const line = '2 * 3 = 6';
        assert.deepStrictEqual(findInlineEmphasis(line), []);
    });

    it('does not double-count the outer ** as italic when bold already matched', function() {
        const line = '**bold** only';
        const matches = findInlineEmphasis(line);
        assert.strictEqual(matches.length, 1);
        assert.strictEqual(matches[0].type, 'bold');
    });

    it('returns matches sorted by position', function() {
        const line = '~~b~~ **a**';
        const matches = findInlineEmphasis(line);
        assert.ok(matches[0].markerStart.start < matches[1].markerStart.start);
    });
});
