/**
 * まとめて書き出し: 並列数を絞った実行と結果の集計（純関数）。
 * 1 件の失敗で全体を止めない。キャンセル後は新しい仕事を始めない（実行中の分は結果を残す）。
 * 仕様: docs/private/specifications/pro-batch-export.md §4.6・§4.7
 */

export type BatchResult<T> =
    | { status: 'done'; value: T }
    | { status: 'failed'; error: string }
    | { status: 'skipped' }
    | { status: 'cancelled' };

export async function runPool<I, T>(
    items: readonly I[],
    concurrency: number,
    worker: (item: I, index: number) => Promise<T>,
    isCancelled: () => boolean
): Promise<BatchResult<T>[]> {
    const results: BatchResult<T>[] = items.map(() => ({ status: 'cancelled' }));
    let next = 0;
    const lane = async () => {
        while (next < items.length && !isCancelled()) {
            const index = next++;
            try {
                results[index] = { status: 'done', value: await worker(items[index], index) };
            } catch (err) {
                results[index] = { status: 'failed', error: err instanceof Error ? err.message : String(err) };
            }
        }
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, lane));
    return results;
}

export interface BatchSummary {
    total: number;
    done: number;
    failed: number;
    skipped: number;
    cancelled: number;
}

export function summarizeBatchResults(results: readonly BatchResult<unknown>[]): BatchSummary {
    const summary: BatchSummary = { total: results.length, done: 0, failed: 0, skipped: 0, cancelled: 0 };
    for (const r of results) summary[r.status]++;
    return summary;
}
