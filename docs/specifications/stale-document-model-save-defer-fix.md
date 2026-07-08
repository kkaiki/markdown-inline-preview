# 外部書き換え直後、document モデルの陳腐化のせいで以後の入力が永久に保存されなくなるバグ

## 症状

Preview だけを開いている（Raw のテキストエディタが無い）状態で、外部ツール（AI・他エディタ・
`git checkout` 等）が `.md` をディスク上で直接書き換えると、`FileSystemWatcher` がこれを検知して
最新のディスク内容を webview へ push する（`stale-external-push-cursor-jump-fix.md`）。
ここまでは正しく動く。

問題はその**直後**に起きる。ユーザーがそのまま Preview で入力を続けると、その入力
（webview からの `change`）が **保存されずに defer され続け、host が古いディスク内容を
再度 webview へ push することで、ユーザーが今打った文字が画面上からも消える**。
外部編集のたびに「反映されない」「入力したはずの内容が消える」という体感になる。

## 原因

保存してよいかどうかの判定 `resolveWebviewSaveDecision`
（`src/preview/host/externalEcho.ts`）は、ディスクの実内容を
「`document`（VS Code の TextDocument モデル）の内容」または「直近に webview 由来で
書き込んだ内容（`lastAppliedFromWebview`）」のどちらかと比較し、一致しなければ
「外部の変更が割り込んだ」とみなして defer していた。

しかし `document` モデルは、Preview だけを開いている場合に外部ディスク書き込みを
**自動リロードしないことがある**（`test/extension/raw/external-sync.test.ts` の
11.1（skip）/11.1c で確認済みの既知の制約。`createFileSystemWatcher` 自体は確実に
発火するが、TextDocument モデルの自動リロードは保証されない）。

外部書き込みを検知して webview へ push した直後は、まさにこの「`document` モデルが
まだ古い」状態そのものである。この状態で判定を呼ぶと:

- ディスク内容 = 外部編集後の内容
- `document.getText()` = 外部編集**前**の古い内容（陳腐化）
- `lastAppliedFromWebview` = null（まだ webview 由来では何も保存していない）

のどれとも一致せず、**新たな外部割り込みが発生したと誤認して defer** される。
ところがこの「ディスクと document の食い違い」は、単に host 自身が push した内容へ
`document` が追従していないだけであり、実際には何も割り込んでいない。

defer すると host は `resolveExternalPush(onDisk, lastAppliedFromWebview)` を再度
push する。この push 内容は「host が把握している最新のディスク内容」であり、
**ユーザーがその後に入力した内容を含まない**。webview 側はこれを外部更新として
`applyExternalContent` で適用してしまうため、ユーザーが今打った文字が消える。

さらに悪いことに、`document` モデルは `resolveWebviewSaveDecision` が `'apply'` を
返して `vscode.workspace.applyEdit` が実行されない限り更新されない。しかし
「defer」判定が続く限り `apply` に到達できないため、**一度この状態に陥ると
（`document` が VS Code 自身の力で自動リロードされない限り）以後の入力もすべて
同じ理由で defer され続ける**（自己再生産的なデッドロック）。

## 修正

host が「直近に webview へ push した内容」（外部変更の push・初回表示の `init` の
どちらも含む）を `lastPushedToWebview` として追跡する（`previewPanel.ts`）。
`resolveWebviewSaveDecision` にこれを第4引数として渡し、ディスク内容がこれと一致する
場合も `'apply'` としてよいことにする:

```ts
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
```

`diskContent === lastPushedToWebview` は「host が最後に webview へ伝えた内容から
ディスクが変わっていない」ことを意味し、これが成り立つ限り、webview がその内容を
基準に組み立てた保存要求（＝ユーザーのその後の入力を含む）を安全に適用できる。
`document` モデル自身が陳腐化しているかどうかとは無関係に判定できるため、
上記のデッドロックが起きない。

`preview-external-write-race-fix.md` が防いでいた元々のレース
（webview の古い基準による無条件上書きが、ちょうど割り込んだ外部変更を消す）は
引き続き防がれる: `lastPushedToWebview` と食い違うディスク内容（＝ push した後に
**さらに別の**外部書き込みが発生した場合）は、これまで通り defer される。

## テスト

- `test/suite/preview/external-sync/externalEcho.test.ts`: `resolveWebviewSaveDecision`
  の純関数テスト（`lastPushedToWebview` あり/なしそれぞれの apply/defer 判定）。
- `test/browser/external-sync/staleDocumentSaveDeferBug.test.ts`（実 Chromium +
  実ホスト判定ロジック）: 外部 push 直後にユーザーが入力を続けても、修正後の
  `resolveWebviewSaveDecision` が defer せず、入力内容が webview 上から消えないことを確認。
- 既存の `test/extension/preview/external-sync.test.ts`（12.1〜12.6）を回帰させ、
  通常の保存経路が壊れていないことを確認済み。
