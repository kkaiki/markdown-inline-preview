# サイドバー（Explorer）から再オープンすると Preview タブが重複するバグ

## 症状

あるファイルを Preview で開いた状態で、左のサイドバー（Explorer）から**同じファイル**
をもう一度開くと、既存の Preview タブはそのままに、**同じグループ内に新しい Raw タブが
追加され、同一ファイルのタブが 2 枚（Preview + Raw）**になる。

再現手順（実 VS Code / `@vscode/test-electron`）:

1. 実ファイル `dup.md` を開き、`markdownInline.togglePreview` で Preview に切り替える。
2. 同じ `vscode.ViewColumn`（同じエディタグループ）に対して、同じ URI を
   既定のエディタ（`vscode.open` 相当。Explorer の単一クリックと同じ解決経路）で開く。
3. 同じグループ内に Preview タブと Raw タブが並存する（2 枚）。

なお、**別のエディタグループ（例: 右側）に明示的に開いた場合**は統一の対象外とする
（左に Preview、右に Raw という 2 画面構成は意図的な操作であり、崩さない）。

## 原因

`package.json` の `customEditors` は `"priority": "option"` であるため、
Explorer からの通常のファイルオープンは既定で Raw（テキストエディタ）が使われる。

`activatePreviewFeature()`（`src/preview/host/previewPanel.ts`）の
`onDidChangeActiveTextEditor` リスナーは、`seenMarkdownUris` に**既に含まれる URI**
（＝そのセッションで一度でも開いたことがあるファイル）に対しては早期 return し、
何もしない設計になっている（既存ファイルにモードを強制しないため）。

Preview タブを開いた URI は、拡張機能起動時のタブスキャン、または過去の
Raw→Preview 切替時点で既に `seenMarkdownUris` に登録済みのため、サイドバーから
同じファイルを開いて Raw タブが新規に追加されても、このリスナーでは検知・解消
されず、Preview タブと Raw タブが両方残ってしまう。

## 修正

`vscode.window.onDidChangeActiveTextEditor`（Raw エディタがアクティブになった
瞬間）をトリガーに、**そのエディタと同じグループ内**に「同じ URI の Preview
タブ」が既に存在するかを調べ、存在すれば新しく出てきた Raw タブを閉じて
Preview 側にフォーカスを戻す（`collapseDuplicateRawTabForActiveEditor`）。

判定は `vscode.window.onDidChangeActiveTextEditor` の中でも、既存ファイル
（`seenMarkdownUris` に既に登録済み＝このセッションで一度でも開いたことがある
ファイル）に対してのみ行う（新規オープン時のモード記憶適用と分岐を共有する）。

- 判定は **グループ単位**で行う。別グループ（別カラム）にある Raw タブは対象外
  ＝意図的な「左 Preview・右 Raw」の 2 画面構成は崩さない。
- トリガーを `vscode.window.tabGroups.onDidChangeTabs`（あらゆるタブ変更）にすると、
  モード記憶機能が新規ファイルを自動で Preview 化する処理や、テストヘルパーが
  それを打ち消す `openWith('default', ...)` 呼び出しなど、無関係な Raw⇄Preview の
  過渡状態にまで反応してしまい、他の切替処理と競合した（dirty な文書の
  Raw→Preview→Raw 往復テストで `"Illegal argument: TextEditor"` という回帰が
  実際に発生した）。「Raw エディタがアクティブになった」という、より具体的で
  意味のあるイベントに絞ることでこの競合を避けている。
- それでもなお、「モード記憶機能が新規ファイルを自動で Preview 化した直後に、
  それを打ち消す形で Raw が強制的に開かれる」という**ごく短時間**のシーケンス
  （`test/extension/preview.test.ts` の `openRealFile` ヘルパーが、直前のテストの
  モード記憶を打ち消すために行う）まで「重複」とみなして Raw タブを閉じてしまうと、
  意図的な Raw への切替と衝突し、Preview 化と Raw 化を無限に繰り返すループに
  陥ることが分かった（これも同様に `"Illegal argument: TextEditor"` を誘発した）。
  これを避けるため、`resolveCustomTextEditor` が Preview の webview を作成した
  時刻を `previewSettledAt`（`Map<string, number>`）に記録し、そこから
  `DUPLICATE_COLLAPSE_SETTLE_MS`（500ms）以上経って「安定して開いている」
  Preview タブに対してのみ重複解消を行う。作られたばかりの Preview タブは
  対象外になるため、モード記憶の自動切替との競合は起きない。
- Raw タブを閉じる**前**に、対象 URI の Preview タブへ明示的にフォーカスを移す
  （`vscode.openWith` で URI を指定）。アクティブな Raw タブを先に閉じると
  VS Code の自動選択（閉じたタブの隣を選ぶ）が働き、無関係なタブへフォーカスが
  漂流することがあるため、危険な操作（タブを閉じる）の前に望む状態を確定させる
  という既存の `switchToRaw` と同じ方針に揃えた。
- `switchToPreview()` / `switchToRaw()` はどちらも `vscode.openWith` 実行後、
  古いタブを `closeStaleTabs` で閉じるまでの間、一時的に同じグループ内に
  Preview タブと Raw タブが並存する。この期間に上記の重複解消ロジックが横から
  同じタブへ `openWith`/close を行うと、意図した切替先と競合する
  （実際に、dirty な文書で Raw→Preview→Raw を往復するテスト
  `test/extension/preview.test.ts` 12.3 で `"Illegal argument: TextEditor"`
  という回帰が発生した）。これを避けるため、`switchToPreview`/`switchToRaw`
  は処理中の URI を `inFlightSwitch`（`Set<string>`）に登録し、重複解消ロジック
  はこの Set に含まれる URI を対象から除外する。両関数は自分自身で古いタブの
  後始末を完結させるため、対象外にしても重複は残らない。

## テスト

`test/extension/preview.test.ts` 13:

- 13.1: 「同じグループでPreview中のファイルをサイドバーから再度開いても、Rawタブが
  重複せずPreviewだけが残る」
- 13.2: 「別のビューカラム（右側）に同じファイルを開く場合はPreviewと統一されず
  両方開いたままになる」（回帰防止 — 意図的な 2 画面構成を崩さないことの確認）
