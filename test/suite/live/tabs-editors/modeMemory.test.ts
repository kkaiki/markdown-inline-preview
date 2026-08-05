/**
 * ファイル単位のモード記憶とタブの重複防止（純関数）。
 *
 * ユーザー指示（2026-08-05）:
 *   「デフォルトで開くときに live にしたときは、そのあとは live で開き、
 *    raw にどこかでしたものがあれば、それは以降は raw で開き続ける」
 *   「上部のタブに、raw live どちらかのタブだけが開かれるように制御して欲しい」
 *
 * 記憶は**ファイルごと**。あるファイルを Raw にしても、他のファイルは Live のまま。
 */
import * as assert from 'assert';
import {
    fileMode,
    forgetFileMode,
    rememberFileMode,
    tabsToClose,
    MODE_MEMORY_LIMIT
} from '../../../../src/live/host/modeMemory';

describe('Live モード: ファイル単位のモード記憶', () => {
    it('記憶が無ければ undefined（呼び出し側が既定へ倒す）', () => {
        assert.strictEqual(fileMode({}, 'file:///a.md'), undefined);
    });

    it('ファイルごとに覚える', () => {
        let m = rememberFileMode({}, 'file:///a.md', 'raw');
        m = rememberFileMode(m, 'file:///b.md', 'live');
        assert.strictEqual(fileMode(m, 'file:///a.md'), 'raw');
        assert.strictEqual(fileMode(m, 'file:///b.md'), 'live');
    });

    it('あるファイルを Raw にしても他のファイルには影響しない', () => {
        const m = rememberFileMode({ 'file:///b.md': 'live' }, 'file:///a.md', 'raw');
        assert.strictEqual(fileMode(m, 'file:///b.md'), 'live');
    });

    it('同じファイルを開き直すと上書きされる', () => {
        let m = rememberFileMode({}, 'file:///a.md', 'raw');
        m = rememberFileMode(m, 'file:///a.md', 'live');
        assert.strictEqual(fileMode(m, 'file:///a.md'), 'live');
    });

    it('元の記憶を破壊しない（新しいオブジェクトを返す）', () => {
        const before = { 'file:///a.md': 'live' as const };
        rememberFileMode(before, 'file:///a.md', 'raw');
        assert.strictEqual(before['file:///a.md'], 'live');
    });

    it('記憶を消せる', () => {
        const m = forgetFileMode({ 'file:///a.md': 'raw' }, 'file:///a.md');
        assert.strictEqual(fileMode(m, 'file:///a.md'), undefined);
    });

    it('際限なく溜まらないよう、古いものから捨てる', () => {
        let m: Record<string, 'raw' | 'live'> = {};
        for (let i = 0; i < MODE_MEMORY_LIMIT + 10; i++) {
            m = rememberFileMode(m, `file:///f${i}.md`, 'raw');
        }
        assert.strictEqual(Object.keys(m).length, MODE_MEMORY_LIMIT);
        assert.strictEqual(fileMode(m, 'file:///f0.md'), undefined, '最初に入れたものが消えている');
        assert.strictEqual(
            fileMode(m, `file:///f${MODE_MEMORY_LIMIT + 9}.md`),
            'raw',
            '最後に入れたものは残っている'
        );
    });
});

describe('Live モード: タブの重複防止', () => {
    const tabs = [
        { uri: 'file:///a.md', viewType: 'ipreview.live' },
        { uri: 'file:///a.md', viewType: undefined },
        { uri: 'file:///b.md', viewType: 'ipreview.live' }
    ];

    it('Live で開くとき、同じファイルの Raw タブを閉じる', () => {
        const close = tabsToClose(tabs, 'file:///a.md', 'live');
        assert.deepStrictEqual(close, [1]);
    });

    it('Raw で開くとき、同じファイルの Live タブを閉じる', () => {
        const close = tabsToClose(tabs, 'file:///a.md', 'raw');
        assert.deepStrictEqual(close, [0]);
    });

    it('他のファイルのタブは閉じない', () => {
        const close = tabsToClose(tabs, 'file:///a.md', 'live');
        assert.ok(!close.includes(2));
    });

    it('閉じる対象が無ければ空', () => {
        assert.deepStrictEqual(tabsToClose(tabs, 'file:///c.md', 'live'), []);
    });

    it('同じモードのタブは閉じない（開き直しで自分を消さない）', () => {
        const only = [{ uri: 'file:///a.md', viewType: 'ipreview.live' }];
        assert.deepStrictEqual(tabsToClose(only, 'file:///a.md', 'live'), []);
    });

    it('Markdown 以外のタブ（viewType が別の拡張）は触らない', () => {
        const other = [{ uri: 'file:///a.md', viewType: 'cweijan.markdownViewer' }];
        assert.deepStrictEqual(tabsToClose(other, 'file:///a.md', 'live'), []);
    });
});
