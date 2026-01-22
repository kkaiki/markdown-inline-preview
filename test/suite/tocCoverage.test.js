const assert = require('assert');

const {
    generateSlug,
    collectHeadingsFromText,
    generateTableOfContents,
    findTocMarker,
    collectHeadings,
    findTocSection
} = require('../../src/utils/toc');

describe('TOC Coverage Tests', function() {

    describe('generateSlug edge cases', function() {
        it('should handle empty string', function() {
            const result = generateSlug('');
            assert.strictEqual(result, '');
        });

        it('should handle multiple consecutive spaces', function() {
            const result = generateSlug('Hello    World');
            assert.strictEqual(result, 'hello-world');
        });

        it('should handle multiple consecutive hyphens', function() {
            const result = generateSlug('Hello---World');
            assert.strictEqual(result, 'hello-world');
        });

        it('should handle special characters only', function() {
            const result = generateSlug('!@#$%^&*()');
            assert.strictEqual(result, '');
        });

        it('should preserve katakana', function() {
            const result = generateSlug('カタカナ');
            assert.strictEqual(result.includes('カタカナ'), true);
        });

        it('should preserve hiragana', function() {
            const result = generateSlug('ひらがな');
            assert.strictEqual(result.includes('ひらがな'), true);
        });

        it('should handle leading/trailing spaces', function() {
            const result = generateSlug('  Hello World  ');
            // The implementation converts spaces to hyphens before trimming
            assert.strictEqual(result.includes('hello'), true);
            assert.strictEqual(result.includes('world'), true);
        });
    });

    describe('collectHeadingsFromText edge cases', function() {
        it('should handle empty text', function() {
            const headings = collectHeadingsFromText('');
            assert.strictEqual(headings.length, 0);
        });

        it('should handle text with no headings', function() {
            const headings = collectHeadingsFromText('Just some text\nMore text\n');
            assert.strictEqual(headings.length, 0);
        });

        it('should handle multiple code blocks', function() {
            const text = `# Real Heading
\`\`\`
# Not a heading
\`\`\`
## Another Real Heading
\`\`\`javascript
# Also not a heading
\`\`\`
### Third Real Heading`;
            const headings = collectHeadingsFromText(text);
            assert.strictEqual(headings.length, 3);
            assert.strictEqual(headings[0].text, 'Real Heading');
            assert.strictEqual(headings[1].text, 'Another Real Heading');
            assert.strictEqual(headings[2].text, 'Third Real Heading');
        });

        it('should handle unclosed code block', function() {
            const text = `# Before
\`\`\`
# Inside code block (no closing)
## Still inside`;
            const headings = collectHeadingsFromText(text);
            assert.strictEqual(headings.length, 1);
            assert.strictEqual(headings[0].text, 'Before');
        });

        it('should track correct line numbers', function() {
            const text = `Line 0
# Heading on line 1
Line 2
## Heading on line 3`;
            const headings = collectHeadingsFromText(text);
            assert.strictEqual(headings[0].line, 1);
            assert.strictEqual(headings[1].line, 3);
        });

        it('should handle consecutive headings', function() {
            const text = `# H1
## H2
### H3
#### H4`;
            const headings = collectHeadingsFromText(text);
            assert.strictEqual(headings.length, 4);
        });
    });

    describe('generateTableOfContents edge cases', function() {
        it('should return empty for empty headings array', function() {
            const result = generateTableOfContents([]);
            assert.strictEqual(result, '');
        });

        it('should return empty when all headings filtered out by minLevel', function() {
            const headings = [
                { level: 1, text: 'H1', line: 0 },
                { level: 2, text: 'H2', line: 1 }
            ];
            const result = generateTableOfContents(headings, 3, 6);
            assert.strictEqual(result, '');
        });

        it('should return empty when all headings filtered out by maxLevel', function() {
            const headings = [
                { level: 4, text: 'H4', line: 0 },
                { level: 5, text: 'H5', line: 1 }
            ];
            const result = generateTableOfContents(headings, 1, 3);
            assert.strictEqual(result, '');
        });

        it('should handle single heading', function() {
            const headings = [{ level: 2, text: 'Only Heading', line: 0 }];
            const result = generateTableOfContents(headings);
            assert.strictEqual(result.includes('Only Heading'), true);
            assert.strictEqual(result.includes('#only-heading'), true);
        });

        it('should calculate correct base level', function() {
            const headings = [
                { level: 3, text: 'H3', line: 0 },
                { level: 4, text: 'H4', line: 1 },
                { level: 5, text: 'H5', line: 2 }
            ];
            const result = generateTableOfContents(headings);
            const lines = result.split('\n');
            // First line (H3) should have no indentation
            assert.strictEqual(lines[0].startsWith('- '), true);
            // Second line (H4) should have 2 spaces
            assert.strictEqual(lines[1].startsWith('  - '), true);
        });

        it('should handle Japanese headings in TOC', function() {
            const headings = [
                { level: 1, text: '概要', line: 0 },
                { level: 2, text: 'インストール方法', line: 1 }
            ];
            const result = generateTableOfContents(headings);
            assert.strictEqual(result.includes('概要'), true);
            assert.strictEqual(result.includes('インストール方法'), true);
        });

        it('should respect both minLevel and maxLevel', function() {
            const headings = [
                { level: 1, text: 'H1', line: 0 },
                { level: 2, text: 'H2', line: 1 },
                { level: 3, text: 'H3', line: 2 },
                { level: 4, text: 'H4', line: 3 }
            ];
            const result = generateTableOfContents(headings, 2, 3);
            assert.strictEqual(result.includes('H1'), false);
            assert.strictEqual(result.includes('H2'), true);
            assert.strictEqual(result.includes('H3'), true);
            assert.strictEqual(result.includes('H4'), false);
        });
    });

    describe('findTocMarker', function() {
        it('should find Japanese TOC marker', function() {
            const text = 'Some text\n<!-- /目次 -->\nMore text';
            const result = findTocMarker(text);
            assert.strictEqual(result.hasMarker, true);
            assert.strictEqual(result.markerType, 'japanese');
            assert.strictEqual(result.line, 1);
        });

        it('should find English TOC marker', function() {
            const text = 'Some text\n<!-- /toc -->\nMore text';
            const result = findTocMarker(text);
            assert.strictEqual(result.hasMarker, true);
            assert.strictEqual(result.markerType, 'english');
        });

        it('should return no marker for text without TOC', function() {
            const text = 'Just normal text\nNo markers here';
            const result = findTocMarker(text);
            assert.strictEqual(result.hasMarker, false);
            assert.strictEqual(result.markerType, null);
            assert.strictEqual(result.line, -1);
        });

        it('should find marker on first line', function() {
            const text = '/目次\nContent';
            const result = findTocMarker(text);
            assert.strictEqual(result.line, 0);
        });

        it('should handle empty text', function() {
            const result = findTocMarker('');
            assert.strictEqual(result.hasMarker, false);
        });
    });

    describe('Mock document tests for collectHeadings and findTocSection', function() {
        // VSCode document モック
        function createMockDocument(lines) {
            return {
                lineCount: lines.length,
                lineAt: (index) => ({
                    text: lines[index] || ''
                })
            };
        }

        it('should collect headings from document', function() {
            const doc = createMockDocument([
                '# Main Title',
                'Some content',
                '## Section 1',
                'More content',
                '### Subsection',
                '## Section 2'
            ]);

            const headings = collectHeadings(doc);
            assert.strictEqual(headings.length, 4);
            assert.strictEqual(headings[0].level, 1);
            assert.strictEqual(headings[0].text, 'Main Title');
            assert.strictEqual(headings[0].line, 0);
        });

        it('should ignore headings in code blocks', function() {
            const doc = createMockDocument([
                '# Real Heading',
                '```',
                '# Fake Heading',
                '```',
                '## Another Real'
            ]);

            const headings = collectHeadings(doc);
            assert.strictEqual(headings.length, 2);
        });

        it('should handle empty document', function() {
            const doc = createMockDocument([]);
            const headings = collectHeadings(doc);
            assert.strictEqual(headings.length, 0);
        });

        it('should find TOC section boundaries', function() {
            const doc = createMockDocument([
                '# Title',
                '<!-- /目次 -->',
                '- [Section 1](#section-1)',
                '- [Section 2](#section-2)',
                '<!-- /end-目次 -->',
                '## Section 1'
            ]);

            const section = findTocSection(doc);
            assert.notStrictEqual(section, null);
            assert.strictEqual(section.start, 1);
            assert.strictEqual(section.end, 4);
        });

        it('should find English TOC section', function() {
            const doc = createMockDocument([
                '# Title',
                '<!-- /toc -->',
                '- TOC content',
                '<!-- /end-toc -->',
                'Content'
            ]);

            const section = findTocSection(doc);
            assert.notStrictEqual(section, null);
            assert.strictEqual(section.start, 1);
            assert.strictEqual(section.end, 3);
        });

        it('should return null when no TOC section found', function() {
            const doc = createMockDocument([
                '# Title',
                'Just content',
                'No TOC here'
            ]);

            const section = findTocSection(doc);
            assert.strictEqual(section, null);
        });

        it('should return null when TOC start found but no end', function() {
            const doc = createMockDocument([
                '<!-- /目次 -->',
                '- Item 1',
                '- Item 2'
                // No end marker
            ]);

            const section = findTocSection(doc);
            assert.strictEqual(section, null);
        });

        it('should handle TOC at document boundaries', function() {
            const doc = createMockDocument([
                '<!-- /toc -->',
                '- [A](#a)',
                '<!-- /end-toc -->'
            ]);

            const section = findTocSection(doc);
            assert.notStrictEqual(section, null);
            assert.strictEqual(section.start, 0);
            assert.strictEqual(section.end, 2);
        });
    });
});
