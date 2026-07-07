import * as assert from 'assert';

import {
    getBlockPrefix,
    getHeadingPrefix,
    getInlineMarkMarker
} from '../../../../src/shared/markdown/focusSyntaxHelpers';
import { filterSlashMenuItems } from '../../../../src/shared/slash/slashMenuItems';
import { detectSlashMatch } from '../../../../src/shared/slash/slashMatch';
import {
    headingDowngradeLevel,
    isAtHeadingContentStart
} from '../../../../src/shared/markdown/headingBackspace';
import { getSlashLineBlockRange } from '../../../../src/shared/slash/applyPreviewSlash';

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

    it('getBlockPrefix resolves the list-item prefix from the inner paragraph depth', () => {
        // findFocusedBlockDepth() always resolves to the innermost paragraph,
        // one level below the list_item itself - getBlockPrefix must look there too.
        const nodesByDepth: Record<number, unknown> = {
            0: { type: { name: 'bullet_list' } },
            1: { type: { name: 'list_item' }, attrs: {} },
            2: { type: { name: 'paragraph' } }
        };
        const $pos = {
            node: (d: number) => nodesByDepth[d],
            index: () => 0
        };
        assert.strictEqual(getBlockPrefix($pos as never, 2), '- ');
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

describe('headingBackspace', () => {
    it('headingDowngradeLevel は 1 段階ずつ下げ、H1 は段落(null)', () => {
        assert.strictEqual(headingDowngradeLevel(3), 2);
        assert.strictEqual(headingDowngradeLevel(2), 1);
        assert.strictEqual(headingDowngradeLevel(1), null);
        // 範囲外はクランプ
        assert.strictEqual(headingDowngradeLevel(9), 5);
        assert.strictEqual(headingDowngradeLevel(0), null);
    });

    it('isAtHeadingContentStart detects cursor at heading inline start', () => {
        assert.strictEqual(isAtHeadingContentStart('heading', 10, 10), true);
        assert.strictEqual(isAtHeadingContentStart('heading', 11, 10), false);
        assert.strictEqual(isAtHeadingContentStart('paragraph', 10, 10), false);
    });
});

describe('applyPreviewSlash', () => {
    it('getSlashLineBlockRange wraps the current textblock', () => {
        const range = getSlashLineBlockRange({
            depth: 1,
            before: (d: number) => (d === 1 ? 0 : -1),
            after: (d: number) => (d === 1 ? 8 : -1)
        } as never);
        assert.deepStrictEqual(range, { from: 0, to: 8 });
    });
});
