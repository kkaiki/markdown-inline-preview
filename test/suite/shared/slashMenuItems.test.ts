import assert from 'assert';
import { SLASH_MENU_ITEMS } from '../../../src/shared/slash/slashMenuItems';

describe('slash menu items', function() {
    it('defines a stable set of slash commands for Raw and Preview', function() {
        assert.ok(SLASH_MENU_ITEMS.length >= 18);
        const ids = SLASH_MENU_ITEMS.map(item => item.id);
        assert.ok(ids.includes('table'));
        assert.ok(ids.includes('heading'));
    });

    it('provides both raw snippet and preview markdown for each item', function() {
        for (const item of SLASH_MENU_ITEMS) {
            assert.ok(item.rawSnippet.length > 0, `missing rawSnippet for ${item.id}`);
            assert.ok(item.previewMarkdown.length > 0, `missing previewMarkdown for ${item.id}`);
            assert.ok(item.sortOrder.length > 0, `missing sortOrder for ${item.id}`);
        }
    });
});
