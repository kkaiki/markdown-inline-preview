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

    it('よく使う順に並ぶ（見出し・リスト・チェックボックス・引用・コード・表が先頭、h4〜h6 は後ろ）', function() {
        const ids = SLASH_MENU_ITEMS.map(item => item.id);
        assert.deepStrictEqual(ids.slice(0, 9), [
            'h1', 'h2', 'h3', 'bullet', 'todo', 'numbered', 'quote', 'code', 'table'
        ]);
        assert.ok(ids.indexOf('h4') > ids.indexOf('callout-danger'), 'h4 はコールアウトより後');
    });

    it('sortOrder（Raw の補完の並び）が配列の並びと一致する', function() {
        const bySort = [...SLASH_MENU_ITEMS].sort((a, b) => a.sortOrder.localeCompare(b.sortOrder));
        assert.deepStrictEqual(bySort.map(i => i.id), SLASH_MENU_ITEMS.map(i => i.id));
    });
});
