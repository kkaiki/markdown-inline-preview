/**
 * 「外部から検知した内容は、自分自身が直近に書き込んだ内容のエコーではないか」を判定する。
 *
 * `FileSystemWatcher`（ディスク監視）は `onDidChangeTextDocument`（メモリ上の変更検知）より
 * 発火タイミングが不安定で、自分の保存が完了した後に遅れて届くことがある。届いた時点では
 * 既に次の webview 由来の編集が進んでいる可能性があるため、同期フラグ（例: 書き込み中かどうか）
 * だけでは自分のエコーを取りこぼす。内容を直接比較することで、タイミングに依存せず確実に
 * 自分のエコーを弾く。
 */
export function resolveExternalPush(candidateContent: string, lastAppliedFromWebview: string | null): string | null {
    return candidateContent === lastAppliedFromWebview ? null : candidateContent;
}

/**
 * webview からの `'change'`（1 キー入力ごとに届く全文）を `document` へ適用・保存して
 * よいかどうかを、保存直前のディスク実内容と突き合わせて判定する。
 *
 * `document`（VS Code の TextDocument モデル）は外部ツールによるディスク直接書き込みを
 * 自動では反映しない。そのため webview 由来の内容（外部変更を知らない古い基準）で
 * 無条件に上書き保存すると、ちょうどそのタイミングで割り込んだ外部ツールの変更を
 * 静かに消してしまう。保存直前のディスク内容が「自分が把握している document の内容」
 * とも「直近に自分が書き込んだ内容」とも食い違っていれば、外部の変更が割り込んだと
 * みなし、上書きせず見送る（'defer'）。呼び出し側はディスクの最新内容を webview へ
 * push してマージを待つ。詳細: docs/specifications/fixes/preview-external-write-race-fix.md
 *
 * `lastPushedToWebview`（直近に host が webview へ push した内容。外部変更の push・
 * 初期表示のどちらも含む）がディスクと一致する場合も適用してよい。`document` モデルは
 * Preview だけを開いている場合に外部書き込みを auto-reload しないことがあり
 * （既知の制約。`test/extension/raw/external-sync.test.ts` 11.1/11.1c 参照）、
 * これだけを根拠に defer し続けると、webview がその push を基準に組み立てた
 * その後の正当な保存要求（＝ユーザーがその後に入力した内容）まで永久に defer され、
 * 入力が保存されずに消えてしまう実バグがあった。`lastPushedToWebview` を追跡することで、
 * 「document モデルの陳腐化」と「新たな外部割り込み」を区別する。
 */
export type WebviewSaveDecision = 'apply' | 'defer';

export function resolveWebviewSaveDecision(
    diskContent: string,
    documentContent: string,
    lastAppliedFromWebview: string | null,
    lastPushedToWebview: string | null = null
): WebviewSaveDecision {
    if (diskContent === documentContent) return 'apply';
    if (diskContent === lastAppliedFromWebview) return 'apply';
    if (diskContent === lastPushedToWebview) return 'apply';
    return 'defer';
}
