# Preview: 古い外部内容の push によるカーソル飛び（表セル編集など）の修正 仕様

最終更新: 2026-07-01

## 1. 症状

Preview（Milkdown WYSIWYG）で編集中（特にテーブルのセル内で連続して入力しているとき）、カーソルが**文書の末尾（体感としては「一番下」）へ飛ぶ**ことがある。

## 2. 根本原因

`previewPanel.ts` は「自分自身の書き込みのエコー」を Webview へ push しないよう、2 つの経路で防御している:

1. `changeSub`（`vscode.workspace.onDidChangeTextDocument`）: メモリ上のドキュメント変更を検知。**内容ベース**の比較（`document.getText() === lastAppliedFromWebview`）で自分のエコーを弾く。
2. `onExternalFileChange`（`FileSystemWatcher`）: ディスク上のファイル変更を検知。Preview だけを開いていて Raw のテキストエディタが無い場合に `onDidChangeTextDocument` が発火しないケースを補うためのフォールバック。

修正前、経路 2 は **同期フラグ `applyingRemoteEdit` の確認だけ**で、経路 1 のような内容ベースの比較を持っていなかった。

`FileSystemWatcher` の発火は OS のファイルシステムイベント経由のため、`onDidChangeTextDocument`（VSCode プロセス内のメモリ更新通知）よりもタイミングが不安定で、**自分の `document.save()` が完了し `applyingRemoteEdit` が既に `false` に戻った後に遅れて届く**ことがある。この「遅れて届いたタイミング」で `onExternalFileChange` が発火すると、同期フラグによる防御をすり抜けて素通りする。

素通りすると、`readDocumentFromDisk()` で読み込んだ**（その時点での）ディスク内容**——実際にはこちらが少し前に書き込んだ内容（＝古い、短い）——が、丸ごと Webview へ `update` メッセージとして push される。Webview 側の `applyExternalContent`（`src/preview/webview/applyExternalContent.ts`）はこれを本物の外部編集とみなし、`replaceAll` で文書を丸ごと置き換える。

Webview のユーザーは、この間も入力を続けている（例: テーブルのセルで文字を打ち続けている）ため、**現在の選択位置（`selection.from`）は、push された古い・短いドキュメントのサイズを超えている**。`applyExternalContent` は選択位置を `Math.min(from, size)` で新しい文書サイズへクランプするため、選択は新しい（古い・短い）文書の**末尾**へ移動する——これが「カーソルが一番下へ飛ぶ」という体感の正体。

なぜテーブルのセル編集で顕著に再現するかは断定できないが、テーブルセル内の入力は 1 文字ごとに文書全体を再シリアライズする処理が絡みやすく、ディスクへの保存・fs イベント発火のタイミングのブレ幅が相対的に広がりやすいためと考えられる（本質的な原因は「経路 2 に内容ベースの防御が無い」ことであり、表に限らず**どのブロックでも**発生しうる）。

## 3. 修正方針

`changeSub` が既に持っていた「内容ベースでの自分のエコー判定」を、共通の純関数 `resolveExternalPush`（`src/preview/host/externalEcho.ts`）として切り出し、`onExternalFileChange` にも同じ防御を追加する。

```ts
export function resolveExternalPush(candidateContent: string, lastAppliedFromWebview: string | null): string | null {
    return candidateContent === lastAppliedFromWebview ? null : candidateContent;
}
```

`schedulePush` の `readMarkdown` は `string | null` を返せるようにし、`null` の場合は push をスキップする。

## 4. テスト方針

この不具合の**トリガー自体**（OS のファイルシステムイベントが `applyingRemoteEdit` の同期ウィンドウの外側で発火するタイミング）は、実 VS Code 上でも決定的に再現させることが難しい（OS 依存の fs イベントタイミングに依存するため）。そのため:

- `resolveExternalPush` を純関数として切り出し、`test/suite/externalEcho.test.ts` でロジックそのものを網羅的に単体テストする（自分のエコーと一致する場合は `null`、一致しない場合はそのまま返す、`lastAppliedFromWebview` が `null`＝まだ何も書いていない場合は常に push する、の 3 パターン）。
- 実際に「タイミングがズレて素通りする」経路が再現できなくても、**素通りした場合に何が起きるか**（内容が一致すれば push しない）はこの純関数が保証する。`changeSub` / `onExternalFileChange` の両方がこの同じ関数を通ることで、2 経路の防御が乖離しない。
