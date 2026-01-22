const assert = require('assert');

// テスト用にソースからヘルパー関数をコピー
function generateSlug(text) {
    return text
        .toLowerCase()
        .replace(/[^\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
}

function generateTableOfContents(headings, minLevel = 1, maxLevel = 6) {
    if (headings.length === 0) {
        return '';
    }

    const lines = [];
    const baseLevel = Math.min(...headings.map(h => h.level));

    for (const heading of headings) {
        if (heading.level < minLevel || heading.level > maxLevel) continue;

        const indent = '  '.repeat(heading.level - baseLevel);
        const slug = generateSlug(heading.text);
        lines.push(`${indent}- [${heading.text}](#${slug})`);
    }

    return lines.join('\n');
}

// シミュレートされたドキュメントから見出しを収集
function collectHeadingsFromText(text) {
    const lines = text.split('\n');
    const headings = [];
    let inCodeBlock = false;

    for (let i = 0; i < lines.length; i++) {
        const lineText = lines[i];

        if (lineText.trim().startsWith('```')) {
            inCodeBlock = !inCodeBlock;
            continue;
        }
        if (inCodeBlock) continue;

        const headingMatch = lineText.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
            const level = headingMatch[1].length;
            const text = headingMatch[2].trim();
            headings.push({ level, text, line: i });
        }
    }

    return headings;
}

describe('Table of Contents', function() {
    describe('generateSlug', function() {
        it('should convert to lowercase', function() {
            assert.strictEqual(generateSlug('Hello World'), 'hello-world');
            assert.strictEqual(generateSlug('UPPERCASE'), 'uppercase');
        });

        it('should replace spaces with hyphens', function() {
            assert.strictEqual(generateSlug('Hello World'), 'hello-world');
            assert.strictEqual(generateSlug('Multiple   Spaces'), 'multiple-spaces');
        });

        it('should remove special characters', function() {
            assert.strictEqual(generateSlug('Hello, World!'), 'hello-world');
            assert.strictEqual(generateSlug('Test (with) [brackets]'), 'test-with-brackets');
        });

        it('should preserve Japanese characters', function() {
            const result = generateSlug('日本語の見出し');
            assert.strictEqual(result.includes('日本語'), true);
        });

        it('should handle mixed content', function() {
            const result = generateSlug('日本語 and English');
            assert.strictEqual(result.includes('日本語'), true);
            assert.strictEqual(result.includes('english'), true);
        });

        it('should handle numbers', function() {
            assert.strictEqual(generateSlug('Chapter 1'), 'chapter-1');
            assert.strictEqual(generateSlug('Section 2.1'), 'section-21');
        });
    });

    describe('collectHeadingsFromText', function() {
        it('should collect single heading', function() {
            const text = '# Title';
            const headings = collectHeadingsFromText(text);
            assert.strictEqual(headings.length, 1);
            assert.strictEqual(headings[0].level, 1);
            assert.strictEqual(headings[0].text, 'Title');
        });

        it('should collect multiple headings', function() {
            const text = '# Title\n## Section 1\n## Section 2\n### Subsection';
            const headings = collectHeadingsFromText(text);
            assert.strictEqual(headings.length, 4);
            assert.strictEqual(headings[0].level, 1);
            assert.strictEqual(headings[1].level, 2);
            assert.strictEqual(headings[2].level, 2);
            assert.strictEqual(headings[3].level, 3);
        });

        it('should ignore headings in code blocks', function() {
            const text = '# Title\n```\n# Not a heading\n```\n## Real Section';
            const headings = collectHeadingsFromText(text);
            assert.strictEqual(headings.length, 2);
            assert.strictEqual(headings[0].text, 'Title');
            assert.strictEqual(headings[1].text, 'Real Section');
        });

        it('should handle all heading levels', function() {
            const text = '# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6';
            const headings = collectHeadingsFromText(text);
            assert.strictEqual(headings.length, 6);
            for (let i = 0; i < 6; i++) {
                assert.strictEqual(headings[i].level, i + 1);
            }
        });

        it('should handle Japanese headings', function() {
            const text = '# はじめに\n## セクション1\n### 詳細';
            const headings = collectHeadingsFromText(text);
            assert.strictEqual(headings.length, 3);
            assert.strictEqual(headings[0].text, 'はじめに');
            assert.strictEqual(headings[1].text, 'セクション1');
        });

        it('should ignore non-heading lines', function() {
            const text = 'Normal text\n# Heading\nMore text\n- List item';
            const headings = collectHeadingsFromText(text);
            assert.strictEqual(headings.length, 1);
        });

        it('should track line numbers', function() {
            const text = 'Line 0\n# Heading on line 1\nLine 2\n## Heading on line 3';
            const headings = collectHeadingsFromText(text);
            assert.strictEqual(headings[0].line, 1);
            assert.strictEqual(headings[1].line, 3);
        });
    });

    describe('generateTableOfContents', function() {
        it('should return empty string for no headings', function() {
            assert.strictEqual(generateTableOfContents([]), '');
        });

        it('should generate simple TOC', function() {
            const headings = [
                { level: 1, text: 'Title', line: 0 },
                { level: 2, text: 'Section', line: 1 }
            ];
            const toc = generateTableOfContents(headings);
            assert.strictEqual(toc.includes('- [Title](#title)'), true);
            assert.strictEqual(toc.includes('- [Section](#section)'), true);
        });

        it('should indent nested headings', function() {
            const headings = [
                { level: 1, text: 'Title', line: 0 },
                { level: 2, text: 'Section', line: 1 },
                { level: 3, text: 'Subsection', line: 2 }
            ];
            const toc = generateTableOfContents(headings);
            const lines = toc.split('\n');
            // Check indentation
            assert.strictEqual(lines[0].startsWith('-'), true); // H1 no indent
            assert.strictEqual(lines[1].startsWith('  -'), true); // H2 one indent
            assert.strictEqual(lines[2].startsWith('    -'), true); // H3 two indents
        });

        it('should respect minLevel filter', function() {
            const headings = [
                { level: 1, text: 'Title', line: 0 },
                { level: 2, text: 'Section', line: 1 },
                { level: 3, text: 'Subsection', line: 2 }
            ];
            const toc = generateTableOfContents(headings, 2, 6);
            assert.strictEqual(toc.includes('Title'), false);
            assert.strictEqual(toc.includes('Section'), true);
        });

        it('should respect maxLevel filter', function() {
            const headings = [
                { level: 1, text: 'Title', line: 0 },
                { level: 2, text: 'Section', line: 1 },
                { level: 3, text: 'Subsection', line: 2 }
            ];
            const toc = generateTableOfContents(headings, 1, 2);
            assert.strictEqual(toc.includes('Title'), true);
            assert.strictEqual(toc.includes('Section'), true);
            assert.strictEqual(toc.includes('Subsection'), false);
        });

        it('should handle Japanese headings', function() {
            const headings = [
                { level: 1, text: 'はじめに', line: 0 },
                { level: 2, text: 'セクション1', line: 1 }
            ];
            const toc = generateTableOfContents(headings);
            assert.strictEqual(toc.includes('[はじめに]'), true);
            assert.strictEqual(toc.includes('[セクション1]'), true);
        });
    });
});
