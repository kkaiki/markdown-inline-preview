# バグハンティング調査記録（2026-07）

これまでの一連の TDD 調査（IME/チェックボックス/Mermaid の修正が一段落した後）で、追加で
広く仮説検証した結果のまとめ。個々の修正の詳細設計は各 `*-fix.md` を参照。ここでは
「何を疑って」「どう確かめて」「結果どうだったか」だけを一覧できるようにする。

## 1. 見つけて直したバグ

| バグ | 原因 | 修正 | テスト |
|---|---|---|---|
| IME 確定 Enter ガードの誤爆（回帰） | `imeEnterGuard.ts` が `compositionend` から 500ms 以内の Enter を無条件で無視していたため、スペース/クリックで IME 確定した直後の**正当な** Enter まで飲み込んでいた | `Date.now()` の固定窓ではなく、ブラウザのネイティブ `event.timeStamp` どうしの差（50ms 未満）で「同一の物理 Enter が2イベントに分裂した」場合だけを検出するよう変更 | `test/browser/imeEnterRace.test.ts` |
| stale 化した単体テスト | 見出し/blockquote の展開プレフィックス区切り文字が半角スペース→non-breaking space に変わった変更（別修正）に、jsdom 単体テストの期待値が追従していなかった | アサーションの期待値を non-breaking space に修正 | `test/webview/blockPrefixEdit.integration.test.ts` |
| **未保存（untitled）ファイルを Preview 化すると本文が消える**（データ損失） | `switchToPreview` の `closeStaleTabs` が、untitled 特有の「テキストタブが2枚並存する」状態で古いタブを閉じると、VS Code 側の挙動で `TextDocument` の内容がその場で空になる | 閉じる直前の本文を退避し、閉じた後に空になっていたら `WorkspaceEdit` で復元 | `test/extension/preview.test.ts` 12.6 |
| **Preview 編集中に外部ツールがファイルを書き換えると、その外部編集が消える**（データ損失） | `applyMarkdownFromWebview` が webview 由来の内容（外部変更を知らない）で無条件に `document.save()` していたため、ちょうど割り込んだ外部ツールのディスク書き込みを上書きしてしまう | 保存直前にディスク実内容を読み直し、`document` / 直近の自分の書き込みのどちらとも食い違えば保存を見送りマージを待つ（`resolveWebviewSaveDecision`） | `test/suite/preview/externalEcho.test.ts`（純関数レベル。実レースの e2e 化は webview 駆動テスト基盤が無く未対応、詳細は fix doc 参照） |
| **コードブロック内で Tab を押すと次のブロック（見出し等）へ移動したように見える**（ユーザー報告） | ProseMirror が `code_block` に Tab を割り当てておらず、`event.preventDefault()` されないため、ブラウザ既定の「次のフォーカス可能要素へ移動」が発動し、コードブロック自身の言語選択 `<select>` へ DOM フォーカスが飛んでいた | `classifyPreviewShortcut` に `codeBlockTab` を追加し、`code_block` 内では Tab=タブ挿入・Shift+Tab=インデント解除として処理、`preventDefault` で既定動作を止める | `test/browser/codeBlockTabFocus.test.ts`, `test/suite/preview/previewShortcuts.test.ts` |
| **Mermaid 図内テキストをマウスドラッグで選択・コピーできない**（ユーザー報告） | 図は `Decoration.widget` として描画されるが、spec に `ignoreSelection: true` が無く、ProseMirror の `WidgetViewDesc.ignoreMutation` が selection 変更を「無視すべきでない変更」として処理し直し、ユーザーの手動選択を消していた | `Decoration.widget` の spec に `ignoreSelection: true` を追加 | `test/browser/mermaidTextSelection.test.ts` |

詳細: [untitled-preview-content-loss-fix.md](fixes/untitled-preview-content-loss-fix.md) / [preview-external-write-race-fix.md](fixes/preview-external-write-race-fix.md) / [code-block-tab-focus-leak-fix.md](fixes/code-block-tab-focus-leak-fix.md) / [mermaid-text-selection-fix.md](fixes/mermaid-text-selection-fix.md)

## 2. 検証したが「バグではない」と確認できた仮説

`preview-usage-flow-test-backlog.md` に挙がっていた懸念＋独自仮説を実 Chromium テスト
（`test/browser/`）またはコード読解で検証した。いずれも再現せず、または設計上安全と確認。

- `pendingCheckboxSelectionGuard`（単一変数）が 1000ms 以内の2つ目のチェックボックス変換で上書きされる懸念 → 現実的な打鍵間隔では再現せず
- `restore-checkbox-selection` の dispatch が `addToHistory` 未指定で Undo 履歴を汚す懸念 → `tr.setSelection()` のみの transaction は `tr.steps.length === 0` となり、`prosemirror-history` が完全に無視することをソースで確認（実害なし）
- 同じファイルを 2 つの Preview パネルで同時に開く懸念 → `registerCustomEditorProvider` に `supportsMultipleEditorsPerDocument: false` が既に設定されており、VS Code 側で構造的に防止されている
- テーブルセル内に `[ ] task` という生テキストがあってもクラッシュしない、通常のテキストのままパースされる
- 文書の一番先頭（position 0/1 境界）でチェックボックスをタイプしても壊れない
- 通常の箇条書きとチェックボックスが同じ `bullet_list` に混在していても、描画・保存とも正しい
- Mermaid の重複ソース（同じ図が2つ）でも decoration key の衝突は起きず、両方描画される
- Mermaid コードブロックの言語を `mermaid` から変更すると図は正しく消える
- Mermaid コードブロック内で日本語 IME 入力しても描画・テキストとも壊れない
- 最左（インデント0）のリスト項目で Shift+Tab しても内容が変化せずクラッシュしない（新規テスト化: `test/extension/raw.test.ts` 11.3）
- ネストリストの空行を跨ぐ再採番を Undo 1 回で戻すと、番号・空行とも完全に元通りになる（新規テスト化: 11.2）

## 3. 実 VS Code（`@vscode/test-electron`）でのバグハンティング基盤

ブラウザテスト（`test/browser/`）は webview 単体表示のみで、実タブ・実ファイル・
VS Code 本体の挙動（ファイル監視、複数エディタ、設定連携）は検証できない。今回
`test/extension/raw.test.ts`（旧 extension.test.ts）に **suite 11「実 VS Code 環境でのバグハンティング」** を新設し、
実ファイル（`os.tmpdir()` に作成、untitled ではない）を使った検証を追加した。

実行方法:

```bash
npx tsc -p tsconfig.test.json && node ./out-test/test/runTest.js
```

### 11.1（skip・要手動確認）外部ツールによるファイル書き換えが VS Code に反映されるか

**目的**: 「Raw を LLM が編集したら Preview も更新されるか」という元の質問を、実 VS Code で
直接検証する。

**やったこと**: 実ファイルを開き、`vscode.workspace.applyEdit` を経由せず Node の `fs.writeFileSync`
で直接書き換え（LLM やターミナルツールが `.md` を編集する状況を模す）、`TextDocument.getText()`
が更新されるか最大 20 秒待った。

**結果**: このヘッドレステスト環境では**一貫して**（複数回実行して毎回）更新されなかった。
`onDidChangeTextDocument` も発火しない。

**切り分け（11.1c）**: 同じ環境で `vscode.workspace.createFileSystemWatcher` 単体は
外部書き換えを**確実に検知できる**ことを確認した。つまり:

- ネイティブファイル監視そのものは働いている（環境のサンドボックス制限ではない）
- しかし VS Code の `TextDocument` モデル自体は自動リロードしていない

**重要な留意点**: これは `@vscode/test-electron` のヘッドレス環境固有の挙動である可能性があり、
実際にウィンドウが表示された通常のデスクトップ VS Code でも同じ挙動になるかはこのテスト
ハーネスだけでは判断できない（一般に「未保存の変更が無いクリーンな文書は外部変更を静かに
反映する」のが VS Code のよく知られた既定動作のため）。**実 VS Code を操作しての手動確認が
必要**（`test.skip` にしてあるので CI は赤くならない）。

**わかっていることに基づく実務上の含意**:

- **Preview モード**は `readDocumentFromDisk()`（`vscode.workspace.fs.readFile`）で
  ファイルを直接読むため、`TextDocument` の自動リロードに依存しない。したがって
  上記の問題が実環境でも起きていたとしても Preview は影響を受けない設計になっている。
- **Raw モード**（標準 `TextEditor`）はこの独自の仕組みを持たず、VS Code 本体の
  `TextDocument` 自動リロードに完全に依存している。もし実環境でも同じ問題が
  再現するなら、「LLM が Raw 編集中のファイルを外部から書き換えても、開いたままの
  Raw タブの表示は古いまま」という体験になりうる。

### 手動確認の手順（提案）

1. 実際に VS Code / Cursor でこのプロジェクトの `.md` ファイルを **Raw モード**で開く。
2. ターミナルや別プロセスから `echo "changed" >> path/to/file.md` のようにファイルへ直接書き込む。
3. VS Code のタブ内容が自動で変わるか、それとも「ファイルが外部で変更されました」的な通知や
   何も起きない状態になるか確認する。
4. 同じことを **Preview モード**でも試し、両者の挙動差を確認する。

もし Raw モードで反映されないことが実環境でも確認できた場合、Preview 同様に
`FileSystemWatcher` + 直接ファイル読み込みによる更新の仕組みを Raw 側にも追加する対応が
必要になる（現状は未実装）。

## 4. 調査したが再現に至らなかったユーザー報告（2026-07-08）

**報告**: Preview で日本語 IME 変換を使い、句読点を挟みながら1文をまとめて入力すると
（例:「このアプリで、Aという文章を編集しているとして、」）、冒頭の一部が二重に挿入される
（「このアプリでこのアプリで、...」）。ユーザーいわく「ほぼ毎回」再現する。

**疑った仮説と検証結果**（すべて `test/browser/ime/` に実 Chromium テストとして追加、
全て pass = 再現せず）:

- 句読点を挟んで複数回 IME 変換確定を連続させる（`このアプリで` → `、` → `Aという文章...` → `、`）
  → 再現せず
- 句読点だけ非IMEの直接タイプ、本文はIME変換という組み合わせ → 再現せず
- 1文全体を確定を挟まず1回の continuous composition（少しずつ伸びる composition text）で
  入力 → 再現せず
- 待ち時間ゼロで複数の IME 変換確定を連続発行（極端な高速入力） → 再現せず
- 既存の段落（見出し・本文がある文書）の末尾から Enter で新規作成した段落に続けて入力
  → 再現せず
- **本命視した仮説**: `previewPanel.ts` の自分エコー誤検知（`resolveExternalPush`/
  `resolveWebviewSaveDecision` の内容比較が、保存直後の disk read タイミングによっては
  すり抜けうる、詳細は `preview-external-write-race-fix.md`）により、編集中の段落そのものへ
  「確定前の古い内容」に相当する `update` postMessage が変換中に届き、`applyExternalContent`
  のブロック単位 diff 置換（`external-update-cursor-jump-fix.md` で導入）と衝突して
  「巻き戻し＋直後の確定テキストの上書き」が二重化として現れるのではないか、と考え
  `imeExternalUpdateRace.test.ts` に同一段落を対象にした再現テストを追加 → **これも再現せず**
  （ProseMirror 側が composition 中の DOM 差分適用を安全に処理している模様）。

**追加検証（実 VS Code + 実ファイル）**: 「`test/browser` は素の Chromium ページで webview
バンドル単体を表示しているだけなので、実 VS Code の webview サンドボックス + 実 OS の IME
タイミングでしか起きないのでは」という仮説を潰すため、`previewPanel.ts` にテスト専用シーム
（`injectWebviewChangeForTesting` / `markdownInline.__test.injectWebviewChange` コマンド。
`context.extensionMode === vscode.ExtensionMode.Test` の時だけ登録され本番には一切影響しない）
を追加し、webview からの `change` メッセージ受信経路（`enqueueWebviewChange →
applyMarkdownFromWebview`。実ディスク read・`WorkspaceEdit`・save・fileWatcher エコー判定を
含む本物のタイミング）を実ファイル・実 VS Code 拡張ホスト上で直接叩くテストを追加した
（`test/extension/preview/external-sync.test.ts` 12.7）。IME確定4段階を模した `change` を
実際の間隔（150ms）で連続送信したが、**これも再現しなかった**（document モデル・ディスク上
のファイルとも最終テキストと完全一致）。

**結論**: 実バグは見つからず、webview 層（実 Chromium シミュレーション、6パターン）・host 層
（実 VS Code + 実ディスク I/O、1パターン）の両方で再現を試みたが見つからなかった。
既存動作の仕様として固定した（`imeSequentialConversionDuplication.test.ts` 4件 +
`imeExternalUpdateRace.test.ts` 追加1件 + `external-sync.test.ts` 12.7）。
ユーザーの環境設定を確認したところ `files.autoSave: "afterDelay"` が有効だったため、
保存頻度が上がることで何らかの未知のタイミング依存レースを踏む確率が上がる可能性は
否定できないが、これも自動テストでは実際のユーザーの打鍵速度・OS 側 IME 実装の細かい
挙動までは再現しきれておらず、確証はない。

再発時に次の調査を進めやすくするため、以下を記録してもらうと良い:
- 実際に発生した直後の VS Code のバージョン・OS・IME（例: macOS ことえり/日本語入力）
- 直前の保存からどれくらい経ってから入力を始めたか
- ファイルが十分大きい（サイズが大きいと保存・disk read が遅くなり得る）か
