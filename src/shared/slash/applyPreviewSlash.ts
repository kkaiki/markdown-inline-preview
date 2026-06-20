import type { ResolvedPos } from '@milkdown/prose/model';

/** Preview スラッシュ確定時: スラッシュ行ブロック全体を置換するレンジ */
export function getSlashLineBlockRange($from: ResolvedPos): { from: number; to: number } {
    const depth = $from.depth;
    return {
        from: $from.before(depth),
        to: $from.after(depth)
    };
}
