import assert from 'assert';
import { diffBlocks } from '../../../src/shared/markdown/blockDiff';

describe('diffBlocks', () => {
    it('marks everything unchanged when identical', () => {
        const r = diffBlocks(['a', 'b', 'c'], ['a', 'b', 'c']);
        assert.deepStrictEqual(r.statuses, ['unchanged', 'unchanged', 'unchanged']);
        assert.deepStrictEqual(r.deletionsBefore, [0, 0, 0, 0]);
    });

    it('marks an appended block as added', () => {
        const r = diffBlocks(['a', 'b'], ['a', 'b', 'c']);
        assert.deepStrictEqual(r.statuses, ['unchanged', 'unchanged', 'added']);
    });

    it('marks an inserted block as added', () => {
        const r = diffBlocks(['a', 'c'], ['a', 'b', 'c']);
        assert.deepStrictEqual(r.statuses, ['unchanged', 'added', 'unchanged']);
    });

    it('treats a replaced block as modified', () => {
        const r = diffBlocks(['a', 'b', 'c'], ['a', 'B', 'c']);
        assert.deepStrictEqual(r.statuses, ['unchanged', 'modified', 'unchanged']);
    });

    it('records a deletion position', () => {
        const r = diffBlocks(['a', 'b', 'c'], ['a', 'c']);
        assert.deepStrictEqual(r.statuses, ['unchanged', 'unchanged']);
        // 'b' deleted before new index 1 (the 'c')
        assert.strictEqual(r.deletionsBefore[1], 1);
    });

    it('records trailing deletions', () => {
        const r = diffBlocks(['a', 'b', 'c'], ['a']);
        assert.strictEqual(r.deletionsBefore[1], 2);
    });

    it('handles all-new (no base)', () => {
        const r = diffBlocks([], ['a', 'b']);
        assert.deepStrictEqual(r.statuses, ['added', 'added']);
    });

    it('mixes modified and added in one change region', () => {
        // old: a x ; new: a Y Z  -> x replaced by Y (modified), Z added
        const r = diffBlocks(['a', 'x'], ['a', 'Y', 'Z']);
        assert.deepStrictEqual(r.statuses, ['unchanged', 'modified', 'added']);
    });
});
