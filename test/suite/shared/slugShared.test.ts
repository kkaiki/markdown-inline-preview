import assert from 'assert';

import { generateSlug } from '../../../src/shared/markdown/slug';

describe('shared/markdown/slug', () => {
    it('matches scroll anchor slug rules for Japanese headings', () => {
        assert.strictEqual(generateSlug('Details'), 'details');
        assert.strictEqual(generateSlug('見出し テスト'), '見出し-テスト');
    });

    it('strips punctuation and collapses hyphens', () => {
        assert.strictEqual(generateSlug('Hello, World!!'), 'hello-world');
        assert.strictEqual(generateSlug('a---b'), 'a-b');
    });
});
