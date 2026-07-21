/**
 * タスクを FIFO で直列実行するキュー。
 *
 * Preview の Webview から届く `change` メッセージ（1 キー入力＝1 メッセージ）は、
 * それぞれがドキュメント全体を読み直して `WorkspaceEdit` を組み立て、保存する。
 * これを直列化せずに呼ぶと、前のメッセージの書き込みが完了する前に次のメッセージの
 * 処理が「まだ古い内容のドキュメント」を前提に差分を組み立ててしまい、書き込みが
 * 競合してドキュメントが壊れる（結果、Webview へ書き戻されたときにカーソル位置が
 * ずれる）。`createSerialQueue` はタスクの**本体が実行されるタイミング**を
 * 前のタスクの完了後まで遅らせることで、この競合を防ぐ。
 */
export function createSerialQueue(): (task: () => Promise<void>) => Promise<void> {
    let tail: Promise<void> = Promise.resolve();

    return (task: () => Promise<void>): Promise<void> => {
        const run = tail.then(task);
        // 失敗したタスクがあってもキューを止めない（後続タスクは実行される）。
        tail = run.then(
            () => undefined,
            () => undefined
        );
        return run;
    };
}

/**
 * Promise の reject を onError へ確実に転送する。
 *
 * createSerialQueue が返す Promise は個々の呼び出し元に reject を正しく伝播するが、
 * previewPanel.ts の `void enqueueWebviewChange(...)` のような fire-and-forget 呼び出しでは
 * 誰も catch しないため、webview からの編集保存の失敗が誰にも気づかれないまま消える
 * （docs/specifications/webview-save-failure-visibility.md 参照）。reportRejection は
 * その catch を一箇所に集約する。元の Promise はそのまま返すので、呼び出し元が引き続き
 * await/catch することもできる（二重の安全網）。onError 自体が例外を投げても、それ以上は
 * 伝播させない（webview 破棄後の postMessage 失敗などで新たな未処理例外を生まないため）。
 */
export function reportRejection<T>(promise: Promise<T>, onError: (error: unknown) => void): Promise<T> {
    promise.catch((error: unknown) => {
        try {
            onError(error);
        } catch {
            // onError 自体の失敗はこれ以上伝播させない。
        }
    });
    return promise;
}
