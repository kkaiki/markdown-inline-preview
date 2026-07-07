import * as assert from 'assert';
import {
    createScrollAnchor,
    findLineBySlug,
    findScrollAnchor,
    headingMatchesScrollAnchor
} from '../../../../src/shared/structure/scrollAnchor';

const doc = {
    lineCount: 6,
    lineAt(line: number): { text: string } {
        const lines = [
            '# Intro',
            'text',
            '## Details',
            'more',
            '### Deep',
            'end'
        ];
        return { text: lines[line] ?? '' };
    }
};

describe('scrollAnchor', () => {
    it('finds nearest heading above cursor line', () => {
        const anchor = findScrollAnchor(doc, 3);
        assert.ok(anchor);
        assert.strictEqual(anchor.title, 'Details');
        assert.strictEqual(anchor.line, 2);
    });

    it('maps slug back to line', () => {
        const anchor = findScrollAnchor(doc, 5);
        assert.ok(anchor);
        const line = findLineBySlug(doc, anchor.slug);
        assert.strictEqual(line, anchor.line);
    });

    it('creates scroll anchor from heading title', () => {
        const anchor = createScrollAnchor('Hello World', 3);
        assert.strictEqual(anchor.line, 3);
        assert.strictEqual(anchor.title, 'Hello World');
        assert.strictEqual(anchor.slug, 'hello-world');
    });

    it('matches heading text by slug or title', () => {
        const anchor = createScrollAnchor('Details');
        assert.strictEqual(headingMatchesScrollAnchor('Details', anchor), true);
        assert.strictEqual(headingMatchesScrollAnchor('details', anchor), true);
        assert.strictEqual(headingMatchesScrollAnchor('Intro', anchor), false);
    });
});
