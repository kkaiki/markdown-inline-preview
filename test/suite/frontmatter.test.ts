import * as assert from 'assert';
import { splitFrontmatter, mergeFrontmatter, parseFrontmatterEntries } from '../../src/shared/markdown/frontmatter';

describe('frontmatter', () => {
    it('splits and merges frontmatter', () => {
        const source = '---\ntitle: Hello\n---\n\n# Body';
        const { frontmatter, body } = splitFrontmatter(source);
        assert.strictEqual(frontmatter, 'title: Hello');
        assert.strictEqual(body, '\n# Body');
        assert.strictEqual(mergeFrontmatter(frontmatter, body), source);
    });

    it('parses frontmatter entries', () => {
        const entries = parseFrontmatterEntries('title: Hello\ntags: a, b');
        assert.deepStrictEqual(entries, [
            { key: 'title', value: 'Hello' },
            { key: 'tags', value: 'a, b' }
        ]);
    });
});
