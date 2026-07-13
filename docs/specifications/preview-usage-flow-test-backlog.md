# Preview: 実利用フローに基づくテスト拡充バックログ

最終更新: 2026-07-08（外部書き換え直後の入力消失バグ発見・修正を追記）

これまでの修正（`checkbox-cursor-jump-fix.md` / `stale-external-push-cursor-jump-fix.md` /
`preview-to-raw-pending-edit-loss-fix.md` / `typed-checkbox-conversion-fix.md` /
`dirty-raw-edit-preview-switch-loss-fix.md`）は、いずれも
「コードの構造から推測できる、実際に起きそうな操作の組み合わせ」を実 Chromium・実 VS Code で
愚直に再現することで見つかった。同じ考え方で、まだ検証していない操作の組み合わせを洗い出す。
TDD で 1 件ずつ: 失敗するテストを書く → 失敗を確認 → 直す → 通す。

**テスト化したらこのバックログから消し、テストのタイトル自体が仕様文になる**
（全テストのタイトルは `preview-test-catalog.md` に自動集約される。
`npm run docs:test-catalog` で再生成）。

## 1. 消化済み（2026-07-02、テストへ移行）

以下は `test/browser/usageFlows.test.ts`（実 Chromium・13 件）と
`test/extension/preview.test.ts` スイート 12（実 VS Code・5 件）に移行済み。全て passing。

- 同一 1000ms 時間窓内の連続チェックボックス変換（ガード上書き）→ カーソルは 2 つ目に残る ✅
- 変換直後の Cmd+Z が「カーソル復元だけの Undo」にならず内容の Undo になる ✅
- 保留 → 展開 → 保留（`[x` → 別文字 → Backspace で戻る → `] ` で完成）の往復 ✅
- 箇条書きとチェックボックスの同一リスト内混在（checked=null / boolean）✅
- チェックボックス + Enter の高速反復（買い物リスト）✅
- 見出し → チェックリスト → 見出し → チェックリスト（会議メモ）✅
- 行まるごと選択削除 → Undo で checked 状態ごと復元 ✅
- テーブルセル内のチェックボックス記法はただの文字列（クラッシュしない）✅
- 文書の一番先頭（上に何も無い・境界 pos）でのチェックボックス作成 ✅
- フォーカスを外して戻ってからの継続入力 ✅
- 段落の分割・結合、見出し末尾 Enter、箇条書き項目の分割 ✅
- 【実 VS Code】Raw⇄Preview ラウンドトリップで内容不変・dirty 化しない ✅
- 【実 VS Code】Preview 中の外部書き換えでタブ維持 ✅
- 【実 VS Code】**dirty な Raw 編集が Preview 往復で失われる → 実バグを発見し修正**
  （`dirty-raw-edit-preview-switch-loss-fix.md`）✅

- 【実 VS Code】同一 URI への openWith 二重実行でタブが増殖しない ✅
- 【実 VS Code】markdown 以外での togglePreview は安全に no-op ✅

## 1b. 消化済み（2026-07-02 第2弾: 仕様ギャップ → テスト化で実バグ 3 件発見・修正）

- **数式（KaTeX）の実レンダリング** → `test/browser/mathRendering.test.ts`（5 件）。
  **実バグ発見**: auto-render 方式は ProseMirror に巻き戻され一度も描画されなかった →
  デコレーション方式へ移行（`math-decoration-rendering-fix.md`）✅

- **Preview スラッシュメニューの実 DOM 操作** → `test/browser/slashMenuDom.test.ts`（6 件）。
  **実バグ発見**: `/todo` が literal `[ ]` になる・`/h1`〜`/h6` 等はブロックが消えて入力が
  隣へ混入（`preview-slash-empty-block-fix.md`）✅

- **チェックボックス変換ガードと外部 update の衝突** → `test/browser/externalUpdateRace.test.ts`（4 件）。
  **実バグ発見**: 全置換 + 数値クランプでカーソルが外部の行へ飛び入力が混入
  （`external-update-cursor-jump-fix.md`）✅

- **frontmatter パネルの DOM 表示** → `test/browser/frontmatterPanel.test.ts`（4 件）✅
- **IME（日本語変換）とチェックボックス** → `test/browser/imeCheckbox.test.ts`（4 件。
  CDP `Input.imeSetComposition` + `Input.insertText`）✅

## 1c. 消化済み（2026-07-02 第3弾）

- **チェックボックスのコピー & ペースト** → `test/browser/usageFlows.test.ts`
  「コピー & ペースト」（2 件）。実クリップボード API は file:// 上で権限制約があるため、
  `DataTransfer` + `ClipboardEvent('paste')` を `view.dom` へ直接ディスパッチして
  `@milkdown/plugin-clipboard` の `handlePaste`（text/plain を markdown としてパース）を
  実際に通す（`PreviewHandle.pasteMarkdownText`）。

  - チェックボックス項目をペーストすると同じ内容の未チェック項目として挿入される ✅
  - ペースト直後（チェックボックス選択ガードの 1000ms 時間窓内）に別の行で `[ ] ` を
    追記しても、ペースト項目・追記項目の両方が壊れずカーソルも追記項目に残る ✅
    （既存の「変換ガード上書き」ロジックがペースト由来の guard arm とも正しく共存することを確認。
    実装変更は不要だった＝既存動作の仕様固定）

## 1d. 消化済み（2026-07-02 第4弾）

- **Raw インライン装飾の適用範囲** → `test/suite/raw/decorationTheme.test.ts`
  「Decoration range computation」（14 件）。`src/raw/decorations/updaters.ts` は
  `vscode.Range`/`vscode.Position` に依存し jsdom から import できないため、同じ正規表現・
  同じ範囲計算ロジックを純関数として複製し、行・列単位で範囲の一致を検証（他の
  test/suite/raw/ ユニットテストと同じ「ソースからロジックを複製する」慣習に倣った）。
  チェック済みチェックボックスのラベル範囲、見出しレベル判定の境界（スペース無し・7 個以上の
  `#`）、水平線判定の境界、コードブロック背景（未終端フェンス含む）、python/javascript の
  シンタックスハイライトのトークン列位置を検証。実装変更は不要（既存ロジックの仕様固定）。
  **注意**: `updaters.ts` の該当ロジックを変更したら複製側もあわせて更新すること。

## 1e. 消化済み（2026-07-02 第5弾）

- **数式まわりの発展ケース** → `test/browser/mathRendering.test.ts`（4 件追加）。
  - インラインコード内・コードブロック内の `$...$` は数式化されない（実装済みガードの
    テスト化。`mathDecorationPlugin.ts` の `inlineCode`/`code_block` 除外ロジック）✅

  - hardbreak（行末2スペース+改行）をまたぐ `$$...$$` は、テキストノード単位でしか
    正規表現を評価できない実装上の制約により数式化されない。破損せずソースが残ることを
    確認（既知の制約として仕様固定。将来複数テキストノードをまたいだマッチが必要になったら
    ここが対応の起点）✅

  - `enableMath` を `settings` メッセージで true→false→true と動的に切り替えると、
    追加の編集操作なしで都度即座に反映される。`applySettingsToDom` の直後に呼ばれる
    `setEditable()` の `view.setProps()` が副作用として全デコレーションの再計算
    （ProseMirror の `view.update`）を強制しているため。実装変更は不要だった ✅

## 1f. 消化済み（2026-07-08: タイプ中・確定後の「文字忠実性」テスト拡充・実バグ発見/修正）

`docs/specifications/typing-fidelity-test-proposal.md`（本セッションの提案書、消化に伴い削除）
§4.1 を TDD で実装。既存テストが最終結果の構造を `includes` で見るだけで**途中経過・厳密一致**
を見ていなかったのに対し、1打鍵ごとに doc 全体のテキストを `assert.strictEqual` で突き合わせる
方式（`test/browser/typingFidelityHelpers.ts` の `typeCharByCharExact`/`commitByCommitExact`）を
新設し、崩れた瞬間のキーストロークを特定できるようにした。

- **実バグ発見・修正**: 段落等の**末尾**でスペースを1回打つと、ブラウザの contenteditable が
  `white-space: normal` の折りたたみ回避のため通常スペース（U+0020）の代わりに**不可視の
  NBSP（U+00A0）**を DOM へ挿入し、それが ProseMirror の doc モデル・直列化 markdown（＝
  保存されるファイル内容）にまで漏れる不具合を発見・修正（`trailing-space-nbsp-corruption-fix.md`）。
  後続の入力で自己修復することもあるが、autosave 相当の change 送信タイミングによっては
  修復前に保存されファイルへ不可視文字が残ってしまう一過性の不具合だった。
  修正は2段構え: (1) `.milkdown .editor` に `white-space: pre-wrap`（ProseMirror 自身が
  コンソール警告で要求していた設定でもあった）を追加し、ブラウザ側の代替措置自体を起こさせない。
  (2) それでも見出し変換直後のプレフィックス再挿入など「自己修復に頼れない経路」が残るため、
  `src/preview/webview/trailingNbspFixPlugin.ts` を新設し、`appendTransaction` で
  **そのトランザクションが実際に変更した範囲**のテキストブロック末尾だけを見て NBSP を正規化する
  （文書全体を毎回走査する初期実装は、無関係なトランザクション（外部更新・IME 変換中の
  イベント等）でも走査コストを払うことになり、`test/browser/ime/imeExternalUpdateRace.test.ts`
  のようなタイミングに敏感な既存レーステストの実行タイミングを狂わせる副作用があったため、
  変更範囲だけを見る設計に絞り込んだ）。
- `test/browser/editing-core/typingFidelity.test.ts`（28件・実 Chromium）: プレーンな文字列
  （ASCII・日本語・絵文字・全角・連続スペース・200字高速連打等）を1文字ずつ・各種カーソル位置
  （段落先頭挿入＝未再現のユーザー報告「連続入力で冒頭が二重化する」の症状位置を含む）・
  各種ブロック種別（見出し・リスト・チェックボックス・blockquote・インラインコード・
  fenced code block・テーブルセル）・編集を挟むタイプ（Backspace・中央挿入・Undo/Redo・
  複数段落間の往復）で検証。全て実バグは見つからず（上記1件を除く）既存動作を仕様として固定。
- 未着手のまま `typing-fidelity-test-proposal.md` に残っていた §4.2〜§4.7（markdown 記号の
  literal タイプ・IME 確定ごとの厳密一致・実 VS Code 逐次 change・チェックボックス削除
  （Cmd+X 等）・jsdom 総当たり）は下記 §2 へ集約した。

## 2. 未消化（次の候補）

- **markdown 記号を「ただの文字」として打った場合の文字忠実性**（`_` `|` `$100` `[ ]` `<b>`
  URL 等を段落・テーブルセル内で1文字ずつ打ち、表示・直列化の両方が壊れない/意図通りに
  エスケープされることを固定する）。`disableTextEscape.ts` のテーブルセル内トレードオフ、
  `mathDecorationPlugin.ts` の金額誤認防止ガードも合わせて消化できる
  （`typing-fidelity-test-proposal.md` §4.2 だった内容）。
- **IME 確定ごとの厳密一致**（`commitByCommitExact` ヘルパーは実装済み・未使用）:
  1文字ずつ確定・変換候補切り替え・composition キャンセル・IME⇔ASCII 交互切り替え・
  外部 update を確定と確定の間に挟む、など。既存の再現試行テストは最終結果中心だったが、
  確定ごとに見ることで「N回目の確定で崩れる」を検出できる（同 §4.3 だった内容）。
- **実 VS Code での逐次 change 検証**: `injectWebviewChangeForTesting` 経由で1打鍵相当ずつ
  送り、毎ステップ `document.getText()` とファイル内容を厳密一致で確認（12.7 の細粒度版。
  同 §4.5 だった内容）。
- **表内チェックボックス・チェックボックスの削除・箇条書き全般の文字忠実性**:
  特に **Cmd/Ctrl+X によるチェックボックス項目の切り取りが未検証のまま残っている**
  （既存 `checkboxEditDelete.test.ts` には無い）。空リスト削除後の残骸チェック、
  番号付きリストの実削除→リナンバー結合テストも未着手（同 §4.6 だった内容）。
- **jsdom 版の文字セット総当たり**: 上記の文字種 × ブロック種別マトリクスを
  `test/webview/` で高速に網羅する版（同 §4.4/§4.7 だった内容）。

- **同一ファイルを 2 つの Preview パネル（分割エディタ）で同時編集**: タブレベルは
  スイート 12.4 で検証済み（`supportsMultipleEditorsPerDocument: false` のため 1 枚に保たれる）。
  現状は機能自体が無効化されているため、これ以上テスト化できることはない（対応見送り）。
  将来この設定を変える場合は webview レベルの相互反映テストが必要。

- **Raw モードの外部書き換え自動リロード**: `test/extension/raw.test.ts` 11.1（skip 中）。
  11.1c の切り分けにより、原因は「ファイル監視が動かない」ことではなく「VS Code の
  TextDocument モデルが `@vscode/test-electron` 環境で自動リロードしない」ことまでは
  判明済み。実デスクトップ環境でも同じかはこのテストハーネスだけでは確認できず、
  自動テストでこれ以上切り分けることはできない（実環境での手動確認が必要、対応保留）。

  → **2026-07-08: この制約を Preview 側に当てはめて調査した結果、隣接する実バグを発見・
  修正した**（`stale-document-model-save-defer-fix.md`）。「Preview は `readDocumentFromDisk()`
  で直接ディスクを読むためこの問題の影響を受けない」という従来の認識は**push（host→webview）
  方向のみ**正しく、**save（webview→host）方向の判定 `resolveWebviewSaveDecision` は
  `document.getText()` の陳腐化を「外部の新たな割り込み」と誤認**していた。外部書き換え直後に
  ユーザーが Preview で入力を続けると、その保存が defer され続け、host が古いディスク内容を
  再 push することで**入力した内容が画面上から消える**（一度陥ると `document` が VS Code
  自身の力で自動リロードされない限り解消しない自己再生産的な不具合）。host が「直近に
  webview へ push した内容」（`lastPushedToWebview`）を追跡し、ディスクがそれと一致する
  限り `document` モデルの陳腐化を無視して適用してよいことにして修正した。✅

## 4. 2026-07-07 網羅監査（3 エージェントによる src/ ⇄ test/ 突き合わせ）

`test-directory-design.md` のカテゴリ再編完了を受け、`src/preview/webview/`・`src/raw/`
全ファイルと既存 `*-fix.md` の再現条件を、実際のテストファイルと突き合わせて棚卸しした。
以下は実ソースで存在を裏取り済みの具体的ギャップ。優先度高いものから着手する。

### 4.1 実バグの疑いが強いもの（優先着手）

- ~~`untitled-preview-content-loss-fix.md` の副作用で生まれた無防備な穴~~ →
  **調査済み（2026-07-07）、既知の制限と確認**: `tabs-editors.test.ts` に 9.4 として
  「複数 untitled ファイルの高速 Raw⇄Preview 往復」を実装し**1回目の往復から100%再現**
  することを確認した（`vscode.workspace.applyEdit` が "has changed in the meantime" で
  無視される警告を伴う）。当時のチームが実ファイルへの回避策を選んだのと同じ理由
  （根本原因が VS Code 自体の untitled ドキュメントのバージョン管理とタブクローズの
  相互作用にあり、深掘りのリスクが高い）でこれ以上の深追いはせず、`test.skip` として
  再現条件を記録するに留めた（`untitled-preview-content-loss-fix.md` に追記）。

- ~~`sidebar-reopen-preview-duplicate-tab-fix.md` の2つの排他ガード未検証~~ →
  **消化済み（2026-07-07）、実バグ発見・修正**: `tabs-editors.test.ts` に 13.3（500ms 猶予窓
  境界）・13.4（`togglePreview` 実行中の再オープン）を追加。13.4 が**実バグを発見**:
  `togglePreview` とサイドバー再オープンがほぼ同時に起きると、`schedulePush`/`getBaseBody`
  の非同期継続が破棄済み `webviewPanel.webview` にアクセスして未処理rejection
  （`Error: Webview is disposed`）が発生し、Preview/Raw タブが恒久的に重複したまま残る
  （約 25% の確率で再現）。`disposed` フラグで非同期継続をガードして修正
  （`webview-disposed-race-fix.md`）。

- ~~サイドバーから再度開くとPreviewが開くがRawタブが残ったまま（ユーザー報告、2026-07-09）~~ →
  **一部消化（2026-07-09）**: 上記の修正はクラッシュを直しただけで、タブの重複自体は
  低頻度（フルスイートで概ね数回に1回）で再発していた。原因は `switchToPreview` の
  即時 `closeStaleTabs` が「その時点のスナップショット」への1回限りの掃除で、
  サイドバー等からの同時実行の再オープンがそれより後に新しい Raw タブを作ると
  取りこぼすこと。`vscode.window.tabGroups.onDidChangeTabs` の `event.opened`
  （新規タブの出現だけ）に限定した2つ目のトリガーを追加して解消した
  （`collapseDuplicateRawTabsInGroup`、詳細は `webview-disposed-race-fix.md` §5）。
  フルスイート3回連続で 9.1/12.3/12.3b の回帰無しを確認。ただし 13.4
  （`togglePreview` 実行中の重なりという最も極端なケース）は6回中2回、なお収束
  しないことがある（`previewSettledAt` の 500ms 猶予ガードが `opened` トリガー
  にも掛かるため、既知の残存ギャップとして記録するに留める）。ユーザーが実際に
  報告した「安定して開いている Preview を後からサイドバーで再度開く」という
  通常の再現手順は確実に解消される。

- **`preview-external-write-race-fix.md` の e2e カバレッジの偽装**:
  同ドキュメント自身が「webview の中身は実 VS Code テストから駆動できないため、実際の
  レース（外部書き込みと Preview 側の keystroke-save の競合）の e2e 検証は現状不可能」と
  明記している。`test/extension/preview/external-sync.test.ts` 12.2 は「外部書き換え後も
  Preview タブが残る」ことしか見ておらず、**外部編集の内容が Preview 側の保存で上書きされ
  ないこと自体は検証していない**。純関数レベルの `externalEcho.test.ts` のみが実質的な
  防壁であることを認識した上で、書けるなら webview 統合テストでの補強を検討する。

- ~~`dirty-raw-edit-preview-switch-loss-fix.md` の3経路のうち1経路のみ検証~~ → **消化済み（2026-07-07）**:
  `external-sync.test.ts` に `12.3b`（`openPreview` コマンド経路）を追加し、togglePreview 経路（12.3）
  と同じ dirty 編集シナリオで検証。モード記憶の自動切替経路は「新規オープン時のみ」発火するため
  同一テスト内での往復検証とは相性が悪く、対応見送り（現状の実装は3経路とも同じ `switchToPreview`
  共通関数を通るため、2経路の検証で共通ガードのリグレッションは十分に捕捉できる）。

- ~~チェックボックス変換のカーソル飛び: 2つの入口の非対称カバレッジ~~ → **消化済み（2026-07-07）**:
  `test/browser/cursor-focus/checkboxCursorJump.test.ts` を更新し、ショートカット系・ツールバー系
  両方で同じ組み合わせ（周辺状態4種 × リスト種別2種 + 見出し起点）を検証するよう揃えた。
  実バグは見つからず、対称カバレッジを仕様として固定（`checkbox-cursor-jump-fix.md` に追記）。

- ~~同一段落内で日本語IME変換を複数回連続確定すると冒頭が二重化する（ユーザー報告）~~ →
  **調査済み（2026-07-08）、再現に至らず**: ユーザー報告「『このアプリで、Aという文章を
  編集しているとして、』と一気に打つと『このアプリでこのアプリで、...』のように冒頭が
  二重化する」を受け、`test/browser/ime/imeSequentialConversionDuplication.test.ts`
  （句読点を挟んだ連続確定・非IME直接タイプとの混在・既存段落末尾からの継続・待ち時間ゼロの
  高速連続確定の4パターン）と `imeExternalUpdateRace.test.ts`
  「編集中の段落そのものに...古いupdateが変換中に届いても...」（自分エコー誤検知が
  編集中と同じ段落を巻き戻すケースを想定）を新規に追加したが、いずれも再現しなかった。
  CDP（`Input.imeSetComposition`/`insertText`）によるcomposition シミュレーションでは
  この種の複製を起こせないことを確認した（実バグなし、既存動作を仕様として固定）。
  「実 VS Code の webview サンドボックス + 実 OS の IME タイミングでしか起きないのでは」
  という仮説を潰すため、実 VS Code（`test/extension`）側でも検証した: `previewPanel.ts` に
  テスト専用シーム（`injectWebviewChangeForTesting` / `markdownInline.__test.injectWebviewChange`
  コマンド。`context.extensionMode === vscode.ExtensionMode.Test` の時だけ登録＝本番には
  無関係）を追加し、webview からの `change` メッセージ受信経路（`enqueueWebviewChange →
  applyMarkdownFromWebview`。実ディスク read・`WorkspaceEdit`・save・fileWatcher エコー判定を
  含む本物のタイミング）を実ファイル上で直接叩く `external-sync.test.ts` 12.7 を追加したが、
  これも再現しなかった。webview 層（実 Chromium シミュレーション）・host 層（実 VS Code +
  実ディスク I/O）の両方で再現を試みて見つからなかったことになる（詳細:
  `bug-hunt-2026-07-findings.md` §4）。再発時は VS Code 上で実際に発生した直後の状況
  （直前の保存タイミング、autoSave設定の有無、どのくらいの速さで打ったか）を記録できると
  次の手がかりになる。

- ~~コードブロック1行目の単語をダブルクリック選択 → ArrowUp で文書先頭へ飛ぶ（ユーザー報告、2026-07-08）~~ →
  **消化済み（2026-07-08）、実バグ発見・修正**: フェンスコードブロック（```` ```python ```` 等）の
  1行目にある単語を実クリックで選択した状態で ↑（ArrowUp）を押すと、コードブロックの
  直前ブロックではなく**文書の一番先頭**（`selFrom=1`）まで選択/カーソルが飛ぶことを
  実 Chromium で確認（対称のバグとして、最終行での ArrowDown はブロックの外へ抜けられず
  固まる）。原因はフォーカス中コードブロックが表示する開始/終了フェンスの
  `contenteditable="false"` widget（改行文字入り）の境界を、ネイティブのキャレット上下
  移動が正しく越えられないこと。`src/preview/webview/codeBlockArrowKeymap.ts` を新設し、
  コードブロック内の ↑/↓ をネイティブ移動に頼らず `lineRangeAt` による手動の行計算へ
  置き換えて修正（詳細: `code-block-arrow-vertical-nav-fix.md`）。再現には実 DOM クリックが
  必須で（`view.dispatch` によるプログラム的な `TextSelection` では再現しない）、
  `page.getByText(...).click()` は hljs の `<span>` 分割で意図しない位置をクリックする
  ことがあったため、`previewBrowserHarness.ts` に DOM Range ベースの実座標クリック
  `clickTextAt`/`doubleClickTextAt` を追加した。テストは
  `test/browser/cursor-focus/codeBlockArrowUpJumpToTop.test.ts`（5ケース、境界越え・
  ブロック内移動の両方を検証）。

- ~~展開中のインラインマーク（`**bold**` 等）内でテキストを選択すると view モードへ収縮する（ユーザー報告、2026-07-08）~~ →
  **消化済み（2026-07-08）、実バグ発見・修正**: フォーカス中のインラインマーク（太字・斜体・
  インラインコード・取り消し線・リンク）が実テキスト展開（`**bold**` のように `**` が見える
  focus-expand 表示）されている状態で、その範囲内のテキストを選択（ドラッグ選択）すると、
  カーソルを動かしていないのに widget 表示（`**` が隠れた太字レンダリングの view モード）へ
  収縮してしまい、選択中だけ見た目が変わって見づらいという報告。原因は
  `inlineMarkEditPlugin.ts` の `getFocusedInlineMarkBlock` が `!state.selection.empty` の
  場合に無条件で「フォーカス対象ブロックなし」を返していたこと。選択の両端が同一ブロック内に
  収まっている場合は展開を維持し、複数ブロックにまたがる選択のみ収縮させるよう修正
  （詳細: `inline-mark-focus-edit-fix.md` §3.1）。テストは
  `test/browser/focus-expand/inlineMarkFocusEdit.test.ts` に1件追加。
  なお `blockPrefixEditPlugin.ts`（見出し・箇条書き・blockquote のプレフィックス展開）の
  `getFocusedBlockInfo` にも同型の `!state.selection.empty` 早期リターンがあり、同じ症状が
  起きる可能性が高いが未確認・未修正（次回セッションで確認推奨）。

- ~~コードフェンスの \`\`\` 自体が編集できない（ユーザー要望、2026-07-09）~~ →
  **消化済み（2026-07-09）、新機能実装**: 「見出しの `#` や太字の `**` と同じように、
  コードフェンスの \`\`\` の文字自体も1文字ずつ打ち替え・削除したい」という要望
  （AskUserQuestion で「文字自体を1文字ずつ打ち替え・削除したい」を明示的に選択）を
  受け、`code-fence-focus-markers.md` の widget 方式（`contenteditable="false"`、
  編集不可）を `blockPrefixEditPlugin` 相当の実テキスト展開方式へ置き換えた
  （`codeFenceEditPlugin.ts`、詳細: `code-fence-real-text-edit-fix.md`）。
  フォーカスを外すと開き・閉じフェンスを解析し、正しい形なら `language` 属性へ反映して
  マーカーを削除、崩れていればコードブロックをやめて段落へ変換する（崩れていない側の
  マーカーは独立して除去し、区切り文字の残骸を残さない）。副作用として
  `codeBlockArrowUpJumpToTop.test.ts`（コードブロック内 ↑/↓）の期待値が変わった
  （フェンス行も「ブロック内の1行」になったため、コード最初/最後の行から抜けるまでに
  もう1回矢印キーが必要になった）ため、7件に再構成して更新。`codeHighlightPlugin.ts`
  は展開中、マーカー部分を除いた実コードだけを hljs へ渡すよう調整。既存のフロート
  言語入力欄（`codeLanguagePlugin.ts`）は変更せずそのまま並行動作させている
  （同時編集時は最後の変更が勝つ、単純な後勝ち）。

- **`typedCheckboxConversion.test.ts` の日本語ケースが実 IME を通していない**:
  同ファイルの「日本語本文」ケースは `h.type()` の文字送りであり、`imeEnterRace.test.ts` が
  使う CDP `Input.imeSetComposition`/`insertText` の実 composition シーケンスを経ていない。
  `blockPrefixEditPlugin` の NBSP/空白判定は実ブラウザの contenteditable composition 経路に
  依存するため、**タイプ実装は実際の日本語 IME 入力と同じコードパスを通っていない可能性**。

### 4.2 未テストの分岐・関数（存在を裏取り済み）

**cursor-focus**
- ~~`blockPrefixEditPlugin.ts` の `pendingCheckboxSelectionGuard`（1000ms ガード窓の
  armedAt 経過判定・誤爆からの復帰）は内部ロジック単体では未検証（症状レベルのみ）~~ →
  **消化済み（2026-07-07）**: `test/webview/cursor-focus/checkboxSelectionGuard.test.ts` を
  新規作成し、(1) checked null→boolean 変換直後にドキュメントを変えない
  selectionchange でズレても元の位置へ復元される、(2) 実タイプが続く間は追跡位置が
  mapping で更新され誤って巻き戻さない、(3) ガード窓（1000ms）経過後は復元されなく
  なる、の3点を jsdom 上で直接 transaction を発行して検証（実ブラウザより高速・決定的）。
  実バグは見つからず、既存ロジックを仕様として固定。
- `applyExternalContent.ts` のパーサー例外時フォールバック（`replaceAllWithClamp`）と、
  ノード属性が異なっても markdown 直列化が同じなら「変更なし」とみなすフォールバックは
  未検証。~~同ファイルの `hadFocus`（外部更新後にフォーカスを復元するか）の分岐も未検証~~ →
  **hadFocus は消化済み（2026-07-07）**: `applyExternalContent.integration.test.ts` に
  「差分置換パス」「全置換フォールバックパス（空文書）」双方で、フォーカスがある場合は
  維持・無い場合は奪わないことを検証する4件を追加。実バグなし、既存動作を仕様固定。
  パーサー例外時フォールバック自体（`replaceAllWithClamp` への到達条件のうち例外系）は
  未検証のまま残っている（空文書＝childCount 0 の経路のみ確認済み）。

**focus-expand**
- ~~`blockPrefixEditPlugin.ts`: 番号付きリスト項目（`1. item`）のフォーカス展開/収縮は
  `blockPrefixEdit.integration.test.ts` で未カバー（見出し・タスク・箇条書き・blockquote
  のみ検証）~~ → **消化済み（2026-07-07）**: 「番号付きリスト」describe を追加し、
  展開時に項目自身の番号（"1. " / "2. "）が現れること・抜けると番号のみ残ってプレフィックス
  は消えること・2番目以降の項目でも常に "1. " にならず自身の番号になること・リンクで
  始まる項目でプレフィックスがマークを継承しないことを検証（5件）。実バグなし、仕様固定。
  タスクリスト項目のプレフィックスを編集して `checked` が boolean → null に
  戻る分岐（`collapseListItem` 内、`getFocusedBlockInfo` がチェックボックス項目を
  そもそも展開しないため実質到達不能に近いエッジケース）は未検証のまま残る。

**shortcuts**
- ~~`src/raw/completion/applySlashCommand.ts`: `/code` `/quote` `/divider` `/callout`
  `/bullet` `/numbered` `/todo` が一件もテストされていない~~ → **消化済み（2026-07-07）**:
  `test/extension/raw/shortcuts.test.ts` に 8.8〜8.22 を追加。各コマンドの展開結果・
  `/code js` の言語エイリアス展開・`/callout warn` のエイリアス解決・`/h2` 省略形展開・
  複数カーソル時のスキップ・フェンスコードブロック内での抑止・`/table normalize`
  の引数なし（警告のみ）と typo エイリアス（`normilize`）を検証。全15件 passing。
- `src/preview/webview/codeLanguagePlugin.ts`（コードブロック言語選択ドロップダウン）は
  ファイル全体がテスト0件。
- `previewToolbarPlugin.ts`: ツールバーボタンをクリックして実際にドキュメントが変わることを
  確認するテストが無い（DOM レイアウトのみ検証）。`toolbarShowShortcuts: false` でショート
  カットキー表示が消えることも未検証。
- `previewSlashMenu.ts`: `/table` を実際に適用してカーソルが最初のセルに入ることが未検証
  （フィルタ一覧に出ることのみ確認済み）。

**lists-tables**
- ~~`src/raw/list/moveLine.ts` の `moveLineWithHierarchy`、`src/raw/commands/navigation.ts`
  の関連ハンドラは実コマンド経由では一切テストされていない~~ →
  **`navigation.ts` 側は消化済み（2026-07-08）**: `test/extension/raw/navigation.test.ts` に
  実コマンド（`markdownInline.smartSelectLeft`/`smartMoveUp`/`smartMoveDown`/
  `smartSelectAll`）経由の統合テストを9件追加。(1) `smartSelectLeft` のテーブルセル境界
  を跨ぐ選択拡大（2番目以降のセルから前セルの内容末尾へ、先頭セルから行頭へ）、
  (2) `smartMoveUp`/`smartMoveDown` の文書端（1行目/最終行、テーブル最終行）での
  既定コマンドへのフォールバック、(3) コードフェンス内での `smartSelectAll` の段階的
  選択（内容のみ→文書全体）。実バグなし、既存ロジックを仕様として固定。
  `moveLineWithHierarchy`（`src/raw/list/moveLine.ts`）はまだ実コマンド未検証のまま
  残っている（`test/suite/raw/` の一部はソースをコピーした純関数を独自に再実装して
  テストしており、**実ソースを通していない**ことに注意。詳細は下記「構造上の注意」）。
- `src/raw/list/toggleCheckbox.ts` の `moveCompletedTaskToBottom`
  （`autoMoveCompletedTasks` 設定）は実装を確認済みだが対応テストが無い。
- `adjustIndent` のテーブルセル内 Tab/Shift+Tab 分岐と、複数行選択時の一括インデントは
  未検証（既存テストは折りたたみカーソルのみ）。
- `renumberLists`: 同一行内でタブとスペースが混在するインデント、番号付きリストの間に
  bullet/checkbox が割り込むケース、4段以上のネストは未検証。
- テーブル系 webview テスト（`tableArrowKeymap`/`tableMove`/`tableSelection`/
  `tableSelectionFix`/`tableCellBreak`）は全て同じ 2列×2-3行の定型テーブルのみを使い、
  単一列・単一行（ヘッダのみ）・列数不揃いテーブルが未検証。
- ~~（2026-07-08 追記）`test/extension/preview/` に `lists-tables` カテゴリが存在しない
  （チェックボックスの実 VS Code end-to-end 書き戻しが未検証）~~ →
  **消化済み（2026-07-08）**: `test/extension/preview/lists-tables.test.ts` を新設し、
  `injectWebviewChangeForTesting` テストフック（`external-sync.test.ts` 12.7 と同じ仕組み）
  経由で (1) トグル（未チェック⇄チェック済み）、(2) Enter による項目追加、(3) 下記バグの
  host 側回帰、の3件を実ドキュメント・実ディスクまで確認。実バグなし（host 側の
  書き戻しパス自体は健全）。
- ~~（2026-07-08 追記）チェックボックス項目のテキスト中央で Enter して分割した場合、
  新しい項目の `checked` が仕様どおり `false` にリセットされるか未検証~~ →
  **消化済み（2026-07-08）**: `test/webview/editing-core/checkboxEditDelete.test.ts` と
  `test/browser/lists-tables/checkboxEditDelete.test.ts` に追加。実バグなし
  （`splitListItem` の `nextType` 解決により行末 Enter と同じく正しく `false` にリセットされる）。
- ~~（2026-07-08 追記）2つの隣接するチェックボックス項目の境界で単発 Backspace した際の
  マージ結果が未検証~~ →
  **消化済み（2026-07-08）・実バグ発見・修正**: `markerBackspace.ts` のチェックボックス→
  箇条書き降格（`checked: boolean → null`）が `blockPrefixEditPlugin` の展開抑制
  （`setBlockPrefixExpansionSuppressed`）で囲まれていなかったため、降格直後
  （および list-item-block コンポーネントの非同期再描画中）に「フォーカス中の普通の
  箇条書きになった」と誤検知され、`- ` が実テキストとして混入していた
  （例: `second` → `- second`、`checked` も壊れた状態のまま）。
  `previewKeymapPlugin.ts` の `makeTodo()` が対処済みの Bug1 と同種だが、この降格経路
  だけ対策が漏れていた。**jsdom（`milkdownHarness.ts` のみ）ではこのバグは再現しない**
  （`markerBackspace`/`blockPrefixEditPlugin` の両方をロードするハーネスが必要）ため
  `test/webview/focus-expand/blockPrefixEdit.integration.test.ts` に専用の回帰テストを
  追加し、実ブラウザ（`test/browser/lists-tables/checkboxEditDelete.test.ts`）でも確認。
  修正は `pendingCheckboxSelectionGuard` と同じ「位置追跡 + 時間窓」方式
  （`markRecentCheckboxDemotion`）— グローバルな抑制フラグを非同期ウィンドウ全体で
  持ち続けると無関係な他ブロックの正当な展開まで巻き込むため、対象ノードの位置だけを
  時間窓つきで除外する設計にした。
- ~~（2026-07-08 追記）チェックボックス項目末尾での Delete（前方削除）が後続ブロックを
  巻き込んだときの構造が未検証~~ →
  **消化済み（2026-07-08）**: `checkboxEditDelete.test.ts`（webview）に追加。実バグなし
  （後続の普通の段落は同じ `bullet_list` 内の新規項目 `checked=null` として取り込まれる）。
- ~~（2026-07-08 追記）チェック済み/未チェック項目のテキストを編集しても `checked` が
  意図せず反転しないことが未検証~~ →
  **消化済み（2026-07-08）**: `checkboxEditDelete.test.ts`（webview）に追加。実バグなし。
- ~~（2026-07-08 追記）チェックボックス項目の Tab/Shift+Tab で `checked` が独立して
  保持されるかが未検証~~ →
  **消化済み（2026-07-08）**: `checkboxEditDelete.test.ts`（webview）に追加。実バグなし。
- （2026-07-08 追記）チェックボックス項目の切り取り（Cmd/Ctrl+X）が未検証のまま残っている
  （コピー&ペーストは `usageFlows.test.ts` に既存）。

**editing-core**
- `codeBlockTripleClickPlugin.ts` の実プラグイン（trip-click → TextSelection dispatch）は
  純関数 `lineRangeAt` のみテスト済みで webview/browser 統合テストが無い。
- `disableTextEscape.ts`: 設定オン時に `|` を含む本文やテーブルセルでテーブルが壊れる
  （コード側コメントで明記のトレードオフ）ケースが未検証。

**settings**
- `autoFormatTables` 以外の設定（`isCodeBlockAutoCompleteEnabled` 等 10 種以上、実装は
  `src/raw/settings.ts` に存在確認済み）はいずれも実行時の反映確認テストが無い。
- `onDidChangeConfiguration.ts` の `headingColorScheme` 変更時のデコレーション再生成、
  複数の `markdownInline.*` 設定が1回の更新でまとめて変わるケースは未検証。

**rendering**
- `mathDecorationPlugin.ts`: `$` の直後が空白の金額表記（`$ 100`）を数式と誤認しないことを
  保証するコードコメントがあるが、対応するテストが無い（grep で確認済み、0件）。
- `mermaidDiagramPlugin.ts`: 不正な Mermaid 構文で `errorCache`/`mermaid-diagram-error`
  クラスが付くエラーパス、同一ソースを持つ複数コードブロックの `liveElements` 再描画は未検証。
- `milkdownApp.ts`: ズーム機能全体（`setZoom`/`applyZoom`/`readSavedZoom`、
  `ZOOM_MIN`/`ZOOM_MAX` のクランプ、`vscodeApi.setState` を介したリロード後の永続化）が
  ファイル存在・実装を確認済みだがテスト0件。同ファイルの `updateScrollBeyondPadding`
  （スクロール末尾パディングの動的計算）と `enableTransitions` のフェードインも未検証。
  `insertImageSrc`（ホストからの `imageInserted` メッセージ経由の画像貼り付け）も未検証
  （逆方向のコピーは `imageCopy.test.ts` でテスト済み）。
- `src/raw/decorations/imageInline.ts`/`tableWrapInline.ts`: 編集中の行でインライン
  プレビューを隠す分岐、ファイル存在チェックのフォールバックが未検証。

**ime**
- チェックボックスのキーボードトグル（Cmd/Ctrl+Enter）を IME 確定直後に行うケースが未検証
  （`imeCheckbox.test.ts` はタイプによる変換のみ）。
- テーブルセル内での実 IME composition（`overrideHardbreakSerializer` との組み合わせ）が
  未検証。

**usage-flows**
- テーブルの貼り付け → Undo → Redo の往復でラッパーが壊れないかが未検証
  （`preview-slash-empty-block-fix.md` が扱う Slice openStart/openEnd の破損パターンと
  同系統のリスクがある操作）。
- テーブルセル内での実 IME 入力（table × ime の組み合わせ）。
- リスト項目のテキスト内から始めてテーブルセルへドラッグする、構造境界をまたぐ選択。

### 4.1b 新規発見（2026-07-08）: `8.5`/`8.22` がフルスイート実行時のみ失敗するテスト順序依存の flake

`test/extension/raw/shortcuts.test.ts` の「8.5 /table normalize on で自動整形を有効化する」
「8.22 /table normilize on（typo エイリアス）でも normalize on と同じく設定が反映される」は、
単体（`MOCHA_GREP` で当該2件のみ）実行では3回連続成功するが、`extension/` 配下の
全ファイルを通しで実行する本来の実行方法（VS Code を1回だけ起動し同一インスタンス内で
連続実行）では毎回失敗する。前の suite（8.4 の `/table normalize off`、または
7.x の `autoFormatTables` 設定変更テスト）が変更した設定またはエディタ状態が
持ち越されている疑いが強い（testing-rules.md ルール 3 のアンチフレーク規則に該当）。
原因未特定・未修正。次に着手する場合は、8.4→8.5 間で `autoFormatTables` 設定値を
明示的に確認してから本題に進む（ルール 3-1: 前提条件アサート）ことから始めるとよい。
（追記 2026-07-08 別セッション: フルスイートでも「毎回両方」ではなく、実行ごとに
落ちる側が入れ替わる — 1回目は 8.22 を含む2件、2回目は 8.5 のみ。単独実行では両方成功。
順序依存に加えタイミング依存（`config.update` Global 書き込みと 500–700ms 固定待ちの
レース）の性格も持つ。）

### 4.3 構造上の注意（テスト基盤そのものの弱点）

`test/suite/raw/` の複数ファイル（`smartNavigation.test.ts`、`selectionEdgeCases.test.ts`、
`lineMoveAndIndent.test.ts`、`listEdgeCases.test.ts`、`tableCellNavigation.test.ts` 等）は
`src/raw/commands/navigation.ts` 等の**実ソースを import せず、同じロジックを手動で
再実装した関数**をテストしている（`test/suite/raw/rendering/decorationTheme.test.ts` が
同じ手法を取っていることをファイル冒頭のコメントで明言しているのと同じパターン）。
これ自体は jsdom で `vscode` 型に依存する実装を検証できない制約への対処として妥当だが、
**実コマンド（`markdownInline.smartSelectLeft` 等）を `test/extension/raw/navigation.test.ts`
で一切実行していない**組み合わせが複数ある（`createSmartSelectLeftHandler` のテーブル境界
分岐、`createSmartMoveUpHandler`/`createSmartMoveDownHandler` の文書端フォールバック、
コードフェンス内での Smart Select All progression）。今後 `test/suite/raw/` にテストを
追加する際は「実装をコピーした関数だけをテストして満足しない」よう注意し、可能な限り
`test/extension/raw/navigation.test.ts` 側で実コマンドの統合テストも併設すること。

## 5. 実施方針

原則（レイヤーの信頼度序列・偽装カバレッジ禁止・アンチフレーク規則）は
[../testing-rules.md](../testing-rules.md) に従う。
各項目を実 Chromium テスト（`test/browser/`）または実 VS Code テスト（`test/extension/`、
`MOCHA_GREP` で絞り込み実行可）で再現を試み、失敗したものは TDD で修正する。
jsdom で十分なもの（DOM レイアウト非依存のもの）は `test/webview/` に振り分ける。
§4 は 2026-07-07 の網羅監査結果であり、着手したら該当項目をここから消してテスト
（`preview-test-catalog.md`）へ移すこと。
