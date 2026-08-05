/**
 * Git HEAD との行差分。
 *
 * Live モードのドキュメントは生 Markdown そのものなので、差分は**行単位**で取れる
 * （既存 Preview はブロック単位で、記法の展開が差分を汚す問題を抱えていた）。
 * 比較アルゴリズムは既存の `diffBlocks`（LCS）をそのまま使い回す。
 */
import { diffBlocks, type BlockDiffResult } from '../../shared/markdown/blockDiff';

export type LineDiffResult = BlockDiffResult;

/** 改行コードを揃えて行に割る。 */
function toLines(text: string): string[] {
    return text.replace(/\r\n/g, '\n').split('\n');
}

/**
 * HEAD 版と現在の内容を行単位で比較する。
 *
 * @param head HEAD 版の内容。git 管理外/新規なら null（全行 added になる）
 * @param current 現在の内容
 */
export function computeLineDiff(head: string | null, current: string): LineDiffResult {
    const newLines = toLines(current);
    if (head === null) {
        return {
            statuses: newLines.map(() => 'added' as const),
            deletionsBefore: new Array<number>(newLines.length + 1).fill(0)
        };
    }
    return diffBlocks(toLines(head), newLines);
}
