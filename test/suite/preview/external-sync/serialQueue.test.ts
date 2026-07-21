/**
 * createSerialQueue（Webview → ドキュメント書き込みの直列化）のユニットテスト。
 *
 * 回帰の主眼: Preview で高速に文字入力すると、各キー入力ごとの「変更をドキュメントへ
 * 書き込む」処理（WorkspaceEdit 生成 + 保存）が前の書き込み完了を待たずに走り、
 * 古いドキュメント内容を前提にした差分を作ってしまうことがある（結果、ドキュメントが
 * 壊れ、Webview へ書き戻されたときにカーソル位置が意図しない場所へずれる＝
 * 「入力中に急にカーソルが下の行へ飛ぶ」不具合の原因）。
 * `createSerialQueue` はタスクを FIFO で直列実行し、後続タスクの本体が実行される時点では
 * 必ず先行タスクが完了している（＝最新のドキュメント状態を読める）ことを保証する。
 */
import * as assert from 'assert';
import { createSerialQueue, reportRejection } from '../../../../src/preview/host/serialQueue';

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('createSerialQueue', () => {
    it('後から積んだタスクは、先行タスクが完了してから実行される（早く積んでも追い越さない）', async () => {
        const enqueue = createSerialQueue();
        const order: string[] = [];
        let sharedState = 0;

        const first = enqueue(async () => {
            order.push('first-start');
            await sleep(30);
            sharedState = 1;
            order.push('first-end');
        });

        // 先行タスクがまだ完了していないうちに次を積む（＝高速タイピングの連打を模す）
        await sleep(5);
        const second = enqueue(() => {
            // ここで読む sharedState は、first が完了した後の値でなければならない。
            order.push(`second-start:sharedState=${sharedState}`);
            order.push('second-end');
            return Promise.resolve();
        });

        await Promise.all([first, second]);

        assert.deepStrictEqual(order, [
            'first-start',
            'first-end',
            'second-start:sharedState=1',
            'second-end'
        ]);
    });

    it('先行タスクが失敗しても、後続タスクは実行される', async () => {
        const enqueue = createSerialQueue();
        const order: string[] = [];

        const first = enqueue(() => {
            order.push('first');
            return Promise.reject(new Error('boom'));
        });
        const second = enqueue(() => {
            order.push('second');
            return Promise.resolve();
        });

        await assert.rejects(first, /boom/);
        await second;

        assert.deepStrictEqual(order, ['first', 'second']);
    });
});

describe('reportRejection', () => {
    it('タスクが失敗したとき、onError にそのエラーが渡る（webview からの編集保存失敗を気づけるようにする）', async () => {
        // 背景: previewPanel.ts の onDidReceiveMessage は `void enqueueWebviewChange(...)` と
        // fire-and-forget で呼んでおり、保存（applyEdit/document.save）が失敗しても
        // createSerialQueue 自体は後続タスクを止めないよう設計されている（上のテスト参照）ため、
        // 呼び出し元が明示的に catch しない限り失敗が握りつぶされて誰にも気づかれない。
        // reportRejection はその catch を一箇所に集約し、onError へ確実に転送する。
        const enqueue = createSerialQueue();
        const reported: unknown[] = [];

        const task = enqueue(() => Promise.reject(new Error('save failed')));
        reportRejection(task, (error) => reported.push(error));

        // reportRejection 自身は失敗を握りつぶさない（呼び出し元が await している場合は
        // 引き続き reject を検知できる＝二重に安全網になる）。
        await assert.rejects(task, /save failed/);

        assert.strictEqual(reported.length, 1);
        assert.ok(reported[0] instanceof Error);
        assert.strictEqual(reported[0].message, 'save failed');
    });

    it('タスクが成功したときは onError が呼ばれない', async () => {
        const enqueue = createSerialQueue();
        const reported: unknown[] = [];

        const task = enqueue(() => Promise.resolve());
        reportRejection(task, (error) => reported.push(error));

        await task;

        assert.deepStrictEqual(reported, []);
    });

    it('onError 自体が例外を投げても、元の Promise の reject 伝播やテストランナーを壊さない', async () => {
        // debugLog や showErrorMessage の呼び出し失敗（例: webview 破棄後の postMessage 失敗）が
        // さらに別の未処理例外を生まないようにする防御。
        const enqueue = createSerialQueue();

        const task = enqueue(() => Promise.reject(new Error('original')));
        assert.doesNotThrow(() => {
            reportRejection(task, () => {
                throw new Error('onError itself failed');
            });
        });

        await assert.rejects(task, /original/);
    });
});
