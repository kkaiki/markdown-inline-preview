/**
 * ブロック単位の差分。HEAD 版と現在版のブロック「シグネチャ（種別＋本文）」の配列を
 * 比較し、現在の各ブロックの状態（追加 / 変更 / 変化なし）と、削除がどの位置で
 * 起きたか（その位置の直前に削除ブロックがいくつあったか）を返す。
 *
 * Preview（Milkdown）はブロック単位なので、行ではなくブロックで差分する。
 */

export type BlockDiffStatus = 'added' | 'modified' | 'unchanged';

export interface BlockDiffResult {
    /** 現在の各ブロックの状態（長さ = newSigs.length） */
    statuses: BlockDiffStatus[];
    /** 新ブロック index の直前で削除された旧ブロック数（長さ = newSigs.length + 1、末尾は最後の削除） */
    deletionsBefore: number[];
}

type Op = 'eq' | 'add' | 'del';

function lcsOps(oldSigs: string[], newSigs: string[]): Op[] {
    const n = oldSigs.length;
    const m = newSigs.length;
    const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            dp[i][j] = oldSigs[i] === newSigs[j]
                ? dp[i + 1][j + 1] + 1
                : Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
    }
    const ops: Op[] = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
        if (oldSigs[i] === newSigs[j]) {
            ops.push('eq'); i++; j++;
        } else if (dp[i + 1][j] >= dp[i][j + 1]) {
            ops.push('del'); i++;
        } else {
            ops.push('add'); j++;
        }
    }
    while (i < n) { ops.push('del'); i++; }
    while (j < m) { ops.push('add'); j++; }
    return ops;
}

export function diffBlocks(oldSigs: string[], newSigs: string[]): BlockDiffResult {
    const m = newSigs.length;
    const statuses: BlockDiffStatus[] = new Array<BlockDiffStatus>(m).fill('unchanged');
    const deletionsBefore: number[] = new Array<number>(m + 1).fill(0);

    const ops = lcsOps(oldSigs, newSigs);

    let newIdx = 0;
    let segDel = 0;
    const segAddIdx: number[] = [];

    const flushSegment = (): void => {
        if (segAddIdx.length === 0 && segDel === 0) return;
        // del と add を対にして「変更」とみなす。余った add は「追加」、余った del は「削除」。
        const modified = Math.min(segDel, segAddIdx.length);
        for (let k = 0; k < segAddIdx.length; k++) {
            statuses[segAddIdx[k]] = k < modified ? 'modified' : 'added';
        }
        const leftoverDel = Math.max(0, segDel - segAddIdx.length);
        if (leftoverDel > 0) deletionsBefore[newIdx] += leftoverDel;
        segDel = 0;
        segAddIdx.length = 0;
    };

    for (const op of ops) {
        if (op === 'eq') {
            flushSegment();
            newIdx++;
        } else if (op === 'add') {
            segAddIdx.push(newIdx);
            newIdx++;
        } else {
            segDel++;
        }
    }
    flushSegment();

    return { statuses, deletionsBefore };
}
