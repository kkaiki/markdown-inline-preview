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
