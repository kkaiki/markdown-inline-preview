import * as assert from 'assert';

import {
    getHeadingPrefix,
    getInlineMarkMarker
} from '../../src/shared/markdown/focusSyntaxHelpers';
import { filterSlashMenuItems } from '../../src/shared/slash/slashMenuItems';
import { detectSlashMatch } from '../../src/shared/slash/slashMatch';

describe('focusSyntaxHelpers', () => {
    it('getHeadingPrefix returns correct hashes', () => {
        assert.strictEqual(getHeadingPrefix(1), '# ');
        assert.strictEqual(getHeadingPrefix(3), '### ');
        assert.strictEqual(getHeadingPrefix(9), '###### ');
    });

    it('getInlineMarkMarker maps common marks', () => {
        const strong = { type: { name: 'strong' }, attrs: {} };
        assert.deepStrictEqual(getInlineMarkMarker(strong as never), { open: '**', close: '**' });
        const link = { type: { name: 'link' }, attrs: { href: 'https://example.com' } };
        assert.deepStrictEqual(getInlineMarkMarker(link as never), {
            open: '[',
            close: '](https://example.com)'
        });
    });
});

describe('slashMenuItems', () => {
    it('filterSlashMenuItems matches label prefix', () => {
        const items = filterSlashMenuItems('h2');
        assert.ok(items.some((item) => item.id === 'h2'));
        assert.ok(!items.some((item) => item.id === 'table'));
    });

    it('filterSlashMenuItems returns all when query empty', () => {
        assert.ok(filterSlashMenuItems('').length >= 15);
    });
});

describe('detectSlashMatch', () => {
    it('detects slash at paragraph start', () => {
        const view = {
            editable: true,
            state: {
                selection: {
                    empty: true,
                    $from: {
                        pos: 4,
                        parentOffset: 2,
                        parent: {
                            isTextblock: true,
                            type: { name: 'paragraph' },
                            textBetween: () => '/h'
                        }
                    }
                }
            }
        };

        const match = detectSlashMatch(view as never);
        assert.ok(match);
        assert.strictEqual(match?.query, 'h');
        assert.strictEqual(match?.from, 2);
        assert.strictEqual(match?.to, 4);
    });
});
