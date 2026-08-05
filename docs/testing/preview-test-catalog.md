# Preview テストカタログ（ユースケース一覧）

<!-- このファイルは自動生成。手で編集しない。`npm run docs:test-catalog` で再生成する。 -->

最終生成: 2026-08-05

テストのタイトルは「この操作をしたら、こう動く」という仕様文として書かれている。
このカタログは全テストファイルからタイトルを抽出したもので、拡張機能が保証する
ユースケースの一覧（生きた仕様書）として読める。

**総テスト数: 1684 件**

## 1. 実 VS Code 拡張ホスト（`@vscode/test-electron`） — 140 件

実行: `npx tsc -p tsconfig.test.json && node ./out-test/test/runTest.js`

実際の VS Code を **1 回だけ起動し、その同じインスタンス内で** raw/preview 両方・全カテゴリのテストを連続実行する。コマンド・タブ・フォーカス・設定連携を検証する、最も実践に近い層。`raw/`＝Raw、`preview/`＝Preview、それぞれ配下を `lists-tables`/`navigation`/`tabs-editors` 等の症状カテゴリで分類。`MOCHA_GREP` で絞り込み可。

### `test/extension/preview/editing-core.test.ts`（8 件）

> Preview モード（実 VS Code）での「内容の忠実性」を end-to-end で固定する。
>
> 対象: Raw→Preview→Raw の往復、および webview からの書き戻し（`change` メッセージ）で、
> 空行・改行コード・末尾改行・frontmatter・相対パス画像・非 ASCII ファイル名といった
> 「壊れると気づきにくいがファイルに残ってしまう」要素が保たれること。
> webview の直列化そのものは `test/browser`/`test/webview` が見ているため、ここでは
> ホスト側（ディスク read・WorkspaceEdit・save・frontmatter 再結合・画像 URI 復元）を通す。
>
> 発端: 2026-07-26 の探索的監査（`docs/testing/preview-audit-2026-07-26.md`）。
> この観点の実 VS Code テストが 1 件も無く、実際に frontmatter 直後の空行が消える
> 不具合が見つかった（先頭空行のケースは修正まで backlog 4.5.1 に記録）。
>
> 実行: `node ./out-test/test/runTest.js`（VS Code を1回起動し、extension/ 配下の
> 全テストファイルと同じインスタンス内で実行する）。`MOCHA_GREP` で絞り込み可能。

- **Preview: editing-core（内容の忠実性・実 VS Code end-to-end）**
  - 19.1 連続する空行を含む本文は Raw→Preview→Raw の往復で 1 行も増減せず、dirty にもならない
  - 19.2 webview がブロック間に増やした空行は、その本数のままディスクへ保存される
  - 19.2b frontmatter 付きファイルを Preview 経由で編集しても、--- 直後の空行が消えない
  - 19.3 空（0 バイト）の .md も Preview 化でき、往復しても空のまま
  - 19.4 CRLF 改行のファイルを Preview 経由で編集しても、CRLF と LF が混在しない
  - 19.5 末尾に改行が無いファイルを Raw→Preview→Raw しても末尾が変わらない
  - 19.6 日本語・スペースを含むファイル名でも Preview 化と保存ができる
  - 19.7 相対パスの画像リンクは、Preview 経由で編集しても相対パスのまま保存される

### `test/extension/preview/external-sync.test.ts`（7 件）

> Preview モード（実 VS Code）の外部（ファイル）との内容同期を検証する。
>
> 対象: Raw⇄Preview ラウンドトリップでの内容不変・dirty 化なし、Preview 表示中の外部書き換えで
> タブが維持されること、未保存の Raw 編集が往復で失われないこと、untitled 文書の Preview 化で
> 本文が失われないこと。タブの増殖防止・no-op は tabs-editors.test.ts が担当する。
>
> 実行: `node ./out-test/test/runTest.js`（VS Code を1回起動し、extension/ 配下の
> 全テストファイルと同じインスタンス内で実行する）。`MOCHA_GREP` でテスト名の絞り込みが可能。

- **Preview: external-sync**
  - **12. Preview 実利用フロー（実 VS Code でのタブ・保存・外部編集）**
    - 12.1 Raw→Preview→Raw のラウンドトリップで内容が変わらず、dirty にもならない
    - 12.2 Preview 表示中に外部ツールがファイルを書き換えても、Preview タブは開いたまま維持される
    - 12.3 未保存（dirty）の Raw 編集がある状態で Preview→Raw と往復しても編集内容が失われない
    - 12.3b 未保存（dirty）の Raw 編集がある状態で openPreview コマンド（togglePreview 以外の経路）から Preview 化しても編集内容が失われない
    - 12.6 未保存の新規（untitled）ファイルを Preview 化しても本文が失われない
    - 12.7 rapid な change（webview からの逐次本文送信を模す）連続後もファイル内容が壊れない（IME連続確定の疑いを検証）
    - 12.8 Preview 表示中に外部からファイルを書き換え、その後 Raw に戻すと最新内容が表示され、古い内容で上書きもされない

### `test/extension/preview/lists-tables.test.ts`（3 件）

> Preview モード（実 VS Code）でのチェックボックス操作が、実ドキュメント・実ディスクまで
> 正しく書き戻されることを検証する。
>
> `test/browser`/`test/webview` はチェックボックスのトグル・改行・降格ロジック自体を
> 大量にカバーしているが、それらは webview バンドル単体（実ファイル無し）のレイヤーで、
> `enqueueWebviewChange → applyMarkdownFromWebview` 以降の実ホスト処理（ディスク read・
> WorkspaceEdit・save・fileWatcher）を経由しない。ここでは webview からの `change`
> メッセージ受信経路を直接叩けるテスト専用フック（`markdownInline.__test.injectWebviewChange`、
> `external-sync.test.ts` 12.7 と同じ仕組み）を使い、チェックボックス操作の結果として
> webview が送るであろう markdown 全文を模して、実ドキュメント・実ディスクへの反映を確認する。
>
> 発端: 2026-07-08、`docs/testing/preview-usage-flow-test-backlog.md` 4.2 の監査で
> `test/extension/preview/` に lists-tables カテゴリ（チェックボックス関連）が
> 1件も存在しないことが判明した。
>
> 実行: `node ./out-test/test/runTest.js`（VS Code を1回起動し、extension/ 配下の
> 全テストファイルと同じインスタンス内で実行する）。`MOCHA_GREP` でテスト名の絞り込みが可能。

- **Preview: lists-tables（実 VS Code end-to-end）**
  - 13.1 チェックボックスのトグル（未チェック→チェック済み→未チェック）が実ドキュメント・実ディスクへ反映される
  - 13.2 Enter でチェックボックス項目を継続して増やした結果が実ドキュメント・実ディスクへ反映される
  - 13.3 行頭 Backspace によるチェックボックス→箇条書きの降格が実ドキュメント・実ディスクへ反映される

### `test/extension/preview/settings.test.ts`（14 件）

> Preview モード（実 VS Code）の VS Code 本体設定との連携を検証する。
>
> 対象: `alwaysOpenNewTab` → `workbench.editor.enablePreview`、
> `wordWrap` → markdown 言語スコープの `editor.wordWrap`、
> `wrapTabs` → `workbench.editor.wrapTabs` への反映、
> `controlDefaultEditor` → `workbench.editorAssociations` へのモード追従。
>
> 実行: `node ./out-test/test/runTest.js`（VS Code を1回起動し、extension/ 配下の
> 全テストファイルと同じインスタンス内で実行する）。`MOCHA_GREP` でテスト名の絞り込みが可能。

- **Preview: settings**
  - **10. VS Code 本体設定との連携**
    - 10.1 alwaysOpenNewTab を true にすると workbench.editor.enablePreview が false になる
    - 10.2 alwaysOpenNewTab を false にすると workbench.editor.enablePreview が true に戻る
    - 10.3 wordWrap を true にすると markdown 言語の editor.wordWrap が on になる
    - 10.4 wordWrap を false にすると markdown 言語の editor.wordWrap が off になる
    - 10.5 wrapTabs を true にすると workbench.editor.wrapTabs が true になる
    - 10.6 wrapTabs を false にすると workbench.editor.wrapTabs が false に戻る
  - **11. 行番号表示のコマンドパレット・トグル**
    - 11.1 markdownInline.toggleLineNumbers はコマンドパレットに登録されている
    - 11.2 既定値(true)から実行すると showLineNumbers が false になる
    - 11.3 false から実行すると showLineNumbers が true に戻る
  - **16. .md の既定エディタをモードに追従させる（editorAssociations）**
    - 16.1 Raw へ切り替えると *.md の既定エディタが VS Code 標準テキストエディタになる
    - 16.2 Preview へ切り替えると *.md の既定エディタが Preview に戻る
    - 16.3 controlDefaultEditor=false のときはモードを切り替えても既定エディタを書き換えない
    - 16.5 controlDefaultEditor を on→off に変えると、拡張が書いた関連付けが撤去される
    - 16.4 他拡張のための関連付け（*.pdf など）はモード切替で消えない

### `test/extension/preview/tabs-editors.test.ts`（24 件）

> Preview モード（実 VS Code）のタブ・フォーカス管理を検証する。
>
> 対象: 複数ファイル間の Preview/Raw トグルでフォーカスが漂流しないこと、
> CodeLens 経由の openPreview、openWith 二重実行によるタブ増殖防止、
> markdown 以外のファイルでの no-op、サイドバー再オープンでのタブ重複防止。
>
> 実行: `node ./out-test/test/runTest.js`（VS Code を1回起動し、extension/ 配下の
> 全テストファイルと同じインスタンス内で実行する）。`MOCHA_GREP` でテスト名の絞り込みが可能。

- **Preview: tabs-editors**
  - **9. 複数ファイル Preview/Raw トグル**
    - 9.1 左のファイルをPreview→Rawに戻しても右のファイルへフォーカスが移動しない
    - 9.2 他ファイルが既にPreview中でも、CodeLens(openPreview)で今のRawファイルをPreviewにできる
    - 9.3 3ファイルすべてPreview中に真ん中のファイルだけRawへ戻しても、両隣のPreviewタブは維持される
    - ~~9.4 複数の未保存（untitled）ファイルを開いて高速にRaw⇄Previewを往復すると、フォーカスが他ファイルへ漂流する（既知の制限・要:根本対応の検討）~~（skip）
  - **12. Preview 実利用フロー（実 VS Code でのタブ・保存・外部編集）**
    - 12.4 同じファイルへ openWith を2回実行しても Preview タブは1枚のまま増殖しない
    - 12.5 markdown 以外のファイルで togglePreview を実行してもエラーにならず、タブはテキストのまま
  - **13. サイドバー（Explorer）からの再オープンで Preview タブが重複しない**
    - 13.1 同じグループでPreview中のファイルをサイドバーから再度開いても、Rawタブが重複せずPreviewだけが残る
    - 13.2 別のビューカラム（右側）に同じファイルを開く場合はそれぞれ独立した Preview インスタンスになる
    - 13.3 Previewタブ作成直後（500ms未満）にサイドバーから再オープンしても、Rawタブは一度も作られずPreviewのまま
    - 13.4 togglePreviewの実行中にサイドバー再オープンが重なっても例外にならず、最終的にPreviewタブ1枚に収束する
    - 13.5 実際のExplorer単発クリック（preview:true）で再オープンしても、Rawタブが重複せずPreviewだけが残る
  - **14. Previewから標準操作で開いた先が同じ列に留まる**
    - 14.1 Previewでリンクを開くと、新しいエディタグループを作らず同じ列に新しいタブとして開く
    - 14.2 Preview中に列指定なしで別ファイルを続けて開いても同じ列の新規タブになる
    - 14.3 右側に既存グループがあってもPreviewから列指定なしで非Markdownを開くとPreview列の新規タブになる
  - **15. VS Code標準のファイルオープン先を妨げない**
    - 15.1 左Previewと右ロック済みCLIグループがあるとき列指定なしで開いたファイルは左の新規タブになる
  - **17. Raw モードのときは Preview タブがそもそも作られない**
    - 17.1 Rawへ切り替えた後に別のMarkdownを新規に開くと、Previewタブが一度も生成されずRaw1枚だけになる
    - 17.2 Rawモードで Preview の Custom Editor が解決されても「OverlayWebview has been disposed」で開けなくならない
  - **18. Preview 表示中の外部イベント・標準エディタ操作への耐性**
    - 18.1 Preview 表示中に元ファイルが外部から削除されても、その後 別ファイルを Preview 化できる
    - 18.2 Preview 表示中にファイルが外部からリネームされても、その後 別ファイルを Preview 化できる
    - 18.3 Preview タブを閉じて「閉じたエディタを再度開く」で復元しても、Raw と Preview が重複しない
    - 18.4 Preview 中に同じファイルを右のグループへ Raw で開くと、左 Preview・右 Raw の2画面構成が保てる
    - 18.5 Preview 表示中に revert を実行してもタブが壊れず、ディスク内容も変わらない
    - 18.6 togglePreview を 80ms 間隔で10回連打しても、タブが1枚に収束し内容も dirty 状態も壊れない
    - 18.7 モード記憶が preview のとき、5ファイルを続けて開いても Raw タブが1枚も残らない

### `test/extension/raw/editing-core.test.ts`（5 件）

> Raw モード（実 VS Code）のインデント調整（Tab/Shift+Tab）を検証する。
>
> 対象: Tab/Shift+Tab によるインデント増減と番号再整形、最左項目での境界ケース。
>
> 実行: `node ./out-test/test/runTest.js`（VS Code を1回起動し、extension/ 配下の
> 全テストファイルと同じインスタンス内で実行する）。`MOCHA_GREP` でテスト名の絞り込みが可能。

- **Raw: editing-core**
  - **14. インデント調整機能**
    - 14.1 Tab押下でインデント追加と番号整形
    - 14.2 Shift+Tab押下でインデント削除と番号整形
  - **11. 実 VS Code 環境でのバグハンティング**
    - 11.3 最左（インデント0）の番号付きリスト項目で Shift+Tab してもクラッシュせず内容が変化しない
  - **20. 二重フェンスのコードブロック修復コマンド**
    - 20.1 二重フェンスのブロックを1重に戻す
    - 20.2 正常なファイルではコマンドを実行しても内容が変わらない

### `test/extension/raw/external-sync.test.ts`（2 件）

> Raw モード（実 VS Code）の外部書き換え検知を検証する。
>
> 対象: `createFileSystemWatcher` 自体の発火確認、および TextDocument の
> 自動リロードに関する既知の制約（実環境での手動確認が必要な既知課題を skip で記録）。
>
> 実行: `node ./out-test/test/runTest.js`（VS Code を1回起動し、extension/ 配下の
> 全テストファイルと同じインスタンス内で実行する）。`MOCHA_GREP` でテスト名の絞り込みが可能。

- **Raw: external-sync**
  - **11. 実 VS Code 環境でのバグハンティング**
    - ~~11.1 外部ツール（LLM等）がディスク上の実ファイルを直接書き換えると、VS Code の文書内容が更新される（要:実環境での手動確認）~~（skip）
    - 11.1c vscode.workspace.createFileSystemWatcher 自体は外部書き換えを確実に検知する（11.1 の切り分け）

### `test/extension/raw/lists-tables.test.ts`（22 件）

> Raw モード（実 VS Code）のリスト・チェックボックス固有の変換/整形機能を検証する。
>
> 対象: 番号付きリスト自動整形（renumberLists）、リスト種別変換（bullet⇄ordered⇄checkbox）、
> チェックボックストグル、リスト整形のエッジケース、再採番の Undo。
>
> 実行: `node ./out-test/test/runTest.js`（VS Code を1回起動し、extension/ 配下の
> 全テストファイルと同じインスタンス内で実行する）。`MOCHA_GREP` でテスト名の絞り込みが可能。

- **Raw: lists-tables**
  - **1. 番号付きリスト自動整形機能**
    - 1.1 基本的な番号整形
    - 1.2 インデントレベルごとの番号リセット
    - 1.3 括弧形式の番号リスト
    - 1.4 空行の後は番号を1から再開する
  - **2. リストタイプ変換機能**
    - 2.1 チェックボックスから番号付きリストへの変換
    - 2.2 番号付きリストから箇条書きへの変換
    - 2.3 インデント保持の確認
    - 2.4 ノーマルテキストへの変換
    - 2.5 箇条書きからチェックボックスへの変換
  - **5. チェックボックス機能**
    - 5.1 チェックボックストグル（未チェック→チェック済み）
    - 5.2 チェックボックストグル（チェック済み→未チェック）
    - 5.3 clickCheckbox で現在行のチェックボックスを切り替える
    - 5.4 toggleCheckboxAtLine で指定行のチェックボックスを切り替える
  - **6. エッジケース**
    - 6.1 空行を含むリストの整形
    - 6.2 単一行のリスト
    - 6.3 深いネストのリスト
    - 6.4 空行を含む複雑なリストの整形
    - 6.5 複数の空行で区切られたリスト
    - 6.6 インデントレベルが複雑に変化するリスト
    - 6.7 タブとスペースが混在するインデント
    - 6.8 単一空行を含むネストリスト
  - **11. 実 VS Code 環境でのバグハンティング**
    - 11.2 ネストリストの空行を跨ぐ再採番を Undo で 1 段階戻すと、番号と空行の両方が元通りになる

### `test/extension/raw/navigation.test.ts`（32 件）

> Raw モード（実 VS Code）のカーソル移動・スマート選択を検証する。
>
> 対象: スマート Enter（リスト継続・空項目脱出）、Smart Select All（段階的選択拡大。
> テーブル・コードフェンス双方）、テーブルセル内の上下移動（列位置維持）、文書端での
> smartMoveUp/Down フォールバック、Smart Select Left のテーブルセル境界を跨ぐ選択拡大。
>
> これらは従来 `test/suite/raw/navigation/` で `src/raw/commands/navigation.ts` の
> ロジックを複製した純関数としてのみ検証されており、実コマンド
> （`markdownInline.smartSelectLeft` 等）を実 VS Code で実行する経路が無かった
> （testing-rules.md ルール 2-1 の返済）。
>
> 実行: `node ./out-test/test/runTest.js`（VS Code を1回起動し、extension/ 配下の
> 全テストファイルと同じインスタンス内で実行する）。`MOCHA_GREP` でテスト名の絞り込みが可能。

- **Raw: navigation**
  - **3. スマートEnter機能**
    - 3.1 番号リスト継続
    - 3.2 箇条書きリスト継続（カーソルが末尾）
    - 3.2.1 箇条書き（*マーカー）の継続
    - 3.2.2 箇条書き（+マーカー）の継続
    - 3.2.3 空の箇条書きでEnter（マーカー削除）
    - 3.2.4 インデントされた箇条書きの継続
    - 3.2.5 箇条書き - カーソルがマーカー内にある場合
    - 3.2.6 箇条書き - カーソルがテキストの途中にある場合
    - 3.3 チェックボックス継続
  - **4. Smart Select All**
    - 4.1 テーブルセル内の最初の選択でセル内容のみを選択する
    - 4.2 テーブルセル選択後の2回目で行全体を選択する
    - 4.3 テーブル行選択後の3回目でテーブル全体を選択する
    - 4.4 テーブル全体選択後の4回目で文書全体を選択する
  - **4.5 括弧内 Smart Select All の段階的選択**
    - 4.5.1 丸括弧の中にカーソルがあれば1回目で括弧の中身だけを選択する
    - 4.5.2 角括弧の中にカーソルがあれば1回目で括弧の中身だけを選択する
    - 4.5.3 括弧の中身選択後の2回目で行全体を選択する
    - 4.5.4 行全体選択後の3回目で文書全体を選択する
    - 4.5.5 括弧の外にカーソルがある場合は従来通り1回目で文書全体を選択する
    - 4.5.6 ネストした括弧では最も内側の中身を1回目に選択する
  - **4.3 Table Vertical Navigation**
    - 上下移動で同じセル内オフセットを維持する
    - 移動先セルが短い場合はセル末尾でクランプする
    - 上下移動でセル内容の相対位置を維持する
    - 空セルへ移動した時は入力用の空白を1つ残す
  - **4.6 Smart Move Up/Down 文書端フォールバック**
    - 文書の1行目で smartMoveUp を実行しても既定の cursorUp に委譲され落ちない
    - 文書の最終行で smartMoveDown を実行しても既定の cursorDown に委譲され落ちない
    - テーブル最終行で smartMoveDown を実行しても文書末で落ちない
  - **5. Smart Select Left（テーブルセル境界を跨ぐ選択拡大）**
    - 5.1 セル内容の途中から1回目: コンテンツ開始位置まで選択
    - 5.2 続けて2回目: セル左端まで選択が拡大する
    - 5.3 さらに3回目: セル境界を跨いで前のセルの内容末尾まで選択が拡大する
    - 5.4 先頭セルで左端に達したら、行頭までセル境界を越えて選択が拡大する
  - **6. コードフェンス内 Smart Select All の段階的選択**
    - 1回目: コードブロックの内容のみ選択される（フェンス行は含まない）
    - 2回目: 文書全体を選択する

### `test/extension/raw/settings.test.ts`（2 件）

> Raw モード（実 VS Code）の拡張設定連携を検証する。
>
> 対象: `advanced.autoFormatTables` のオン/オフによる、行移動時のテーブル自動整形の有無。
>
> 実行: `node ./out-test/test/runTest.js`（VS Code を1回起動し、extension/ 配下の
> 全テストファイルと同じインスタンス内で実行する）。`MOCHA_GREP` でテスト名の絞り込みが可能。

- **Raw: settings**
  - **7. Advanced Settings**
    - 7.1 autoFormatTables がオンなら行移動時に表を整形する
    - 7.2 autoFormatTables がオフなら行移動時に表を整形しない

### `test/extension/raw/shortcuts.test.ts`（21 件）

> Raw モード（実 VS Code）のスラッシュコマンドを検証する。
>
> 対象: `/heading N`・`/table`・`/table normalize on|off`・`/code`・`/quote`・`/divider`・
> `/callout`・`/bullet`・`/numbered`・`/todo` の展開結果とカーソル位置、
> `/h1`〜`/h6` 省略形展開、複数カーソル時のスキップ、フェンスコードブロック内での抑止。
>
> 実行: `node ./out-test/test/runTest.js`（VS Code を1回起動し、extension/ 配下の
> 全テストファイルと同じインスタンス内で実行する）。`MOCHA_GREP` でテスト名の絞り込みが可能。

- **Raw: shortcuts**
  - **8. Slash Commands**
    - 8.1 /heading 1 を H1 に変換する
    - 8.2 /heading 2 仕様 を H2 に変換する
    - 8.3 /table で標準テーブルを挿入する
    - 8.4 /table normalize off で自動整形を抑止する
    - 8.5 /table normalize on で自動整形を有効化する
    - 8.7 無効な /heading は変換せずそのまま残る
    - 8.8 /code でフェンスコードブロックを挿入し、カーソルは中の空行に置かれる
    - 8.9 /code js は言語エイリアスを正規名（javascript）に展開する
    - 8.10 /quote 本文 は引用行に変換される
    - 8.11 本文無しの /quote は空の引用行になる
    - 8.12 /divider は水平線 --- に変換される
    - 8.13 /callout（種別省略）は note 用の絵文字プレフィックスになる
    - 8.14 /callout warn はエイリアス経由で warning 用の絵文字になる
    - 8.15 /bullet は箇条書きマーカーに変換される
    - 8.16 /numbered は番号付きリストマーカーに変換される
    - 8.17 /todo は未チェックのチェックボックスマーカーに変換される
    - 8.18 /h2 の省略形は /heading 2 と同じく H2 に展開される
    - 8.19 複数カーソルがある場合はスラッシュコマンドを展開しない
    - 8.20 フェンスコードブロック内では /todo をそのままの文字列として残す
    - 8.21 /table normalize（on/off 引数なし）は警告のみで行を変更しない
    - 8.22 /table normilize on（typo エイリアス）でも normalize on と同じく設定が反映される

## 2. 実 Chromium ブラウザ（Playwright + 実 webview バンドル）— すべて Preview — 461 件

実行: `npm run test:browser`

実レイアウト・実キー入力・実キャレット座標で Preview（Milkdown）を検証する。UI バグの最終判定。配下は `cursor-focus`/`focus-expand`/`ime` 等の症状カテゴリで分類。

### `test/browser/cursor-focus/caretRegression.test.ts`（6 件）

> 実ブラウザ回帰テスト: Preview のチェックボックス/リスト行頭 Backspace で
> **カーソルが上の行へ飛ばない**ことを、実際の Chrome + 実バンドルで検証する。
>
> 背景 (regression):
>   list-item-block コンポーネント（Web Component）はラベルを非同期再描画し、その際
>   DOM キャレットを奪う。markerBackspace の pinSelection（2 段 rAF）で補正しているが、
>   この不具合・修正は jsdom では再現できない。ここが唯一の防壁。
>
> 実行: `npm run test:browser`（事前に build:webview 必須）。
> ブラウザ（Chrome/Chromium）が無い環境では skip する（CI を壊さない）。

- **実ブラウザ回帰: Preview のキャレット保持（markerBackspace）**
  - 前に段落があるチェックボックス行頭で Backspace してもカーソルが上に飛ばない
  - リスト2番目のチェックボックスで Backspace してもカーソルが上の項目に飛ばない
  - チェック済み [x] + 前に段落でも Backspace でカーソルが飛ばない
  - 通常の箇条書き（非チェックボックス）+ 前に段落でも飛ばない
  - 単独チェックボックス（前に行なし）で連続 Backspace しても飛ばない（回帰）
  - コード本文の末尾にカーソルを置くと、キャレットは閉じフェンス行より上（最終行）に出る

### `test/browser/cursor-focus/checkboxCursorJump.test.ts`（16 件）

> 実ブラウザ回帰テスト: チェックボックス変換後にカーソルが別ブロックへ飛ぶ不具合。
>
> ## バグ内容
>
> 対象行をチェックボックスへ変換する（⌥⌘4 / ツールバーの ☑ ボタン）とき、対象行が
> まだリストでない場合は「bullet_list へ wrap」→「checked 属性を設定」の 2 回に
> 分けて `view.dispatch` している。チェックボックス項目は Milkdown の
> `list-item-block` Web Component でレンダリングされるため、1 回目の dispatch
> 直後は素の `<li>`、2 回目の dispatch で Web Component へ再マウントされる。
> この再マウントの瞬間にブラウザのネイティブ selection が失われ、ドキュメント内に
> 他のリストブロックが存在すると、そちらへ selection が退避してしまうことがある
> （selectionchange を ProseMirror がそのまま拾ってしまう）。
>
> 詳細設計: docs/specifications/fixes/checkbox-cursor-jump-fix.md
>
> 単独の段落しか無い文書では再現しない（`blockPrefixBugs.test.ts` の Bug4 が
> カバーしており、そちらは対象外）。本ファイルは「ドキュメント内の他の場所に
> 既存のリストブロックがある」場合に絞って、可能な限り多くの操作・周辺状態の
> 組み合わせを網羅する。
>
> 実行: `npm run test:browser`。ブラウザが無い環境では skip。

- **実ブラウザ: チェックボックス変換後のカーソル飛び回帰**
  - **⌥⌘4 ショートカット**
    - 上に既存の箇条書きがある場合、変換後もカーソルは対象行に留まる
    - 上に既存の番号付きリストがある場合、変換後もカーソルは対象行に留まる
    - 上に既存のチェックボックスがある場合、変換後もカーソルは対象行に留まる
    - 下に既存の箇条書きがある場合、変換後もカーソルは対象行に留まる
    - 上下両方に既存リストがある場合、変換後もカーソルは対象行に留まる
    - 対照群: 周辺に既存リストが無い場合も、変換後カーソルは対象行に留まる
  - **ツールバーのチェックボックスボタン**
    - 上に既存の箇条書きがある場合、変換後もカーソルは対象行に留まる
    - 上に既存のチェックボックスがある場合、変換後もカーソルは対象行に留まる
    - 下に既存の番号付きリストがある場合、変換後もカーソルは対象行に留まる
    - 見出しから変換する場合も、周辺に既存リストがあればカーソルは対象行に留まる
    - 下に既存の箇条書きがある場合、変換後もカーソルは対象行に留まる
    - 上下両方に既存リストがある場合、変換後もカーソルは対象行に留まる
    - 対照群: 周辺に既存リストが無い場合も、変換後カーソルは対象行に留まる
    - 上に既存の番号付きリストがある場合、変換後もカーソルは対象行に留まる
  - **⌥⌘4 ショートカット（見出し起点）**
    - 見出しから変換する場合も、周辺に既存リストがあればカーソルは対象行に留まる
  - 上に既存リストがあっても、対象行は checked=false の独立した list_item になる

### `test/browser/cursor-focus/codeBlockArrowUpJumpToTop.test.ts`（5 件）

> 実ブラウザ回帰テスト（修正確認）: コードブロック内での ↑/↓（縦移動）。
>
> ユーザー報告: Python の `class` 定義など、コードブロックの1行目にある単語（クラス名）を
> ダブルクリックで選択した状態で ↑ を押すと、直前の段落ではなく**文書の一番先頭**まで
> カーソルが飛ぶ。
>
> 原因: フォーカス中のコードブロックは開始行（```lang）/終了行（```）を
> `contenteditable="false"` の widget として表示していた（`focusSyntaxPlugin.ts`）。
> この widget には改行文字を含むテキストが入っており、ネイティブのキャレット上下移動が
> この widget の境界をまたぐ際に DOM 位置を正しく解決できず、文書の先頭付近へキャレットが
> 飛んでしまっていた（コードブロック末尾側の境界でも対称の問題があり、こちらは
> 「最終行から下へ抜けられない」という形で現れる）。`codeBlockArrowKeymap.ts` が
> コードブロック内の ↑/↓ を横取りし、`code_block` の生テキストを行分割して移動先を
> 手動計算することで、ネイティブのキャレット移動を経由しないようにした。
>
> ## 2026-07-26 の仕様変更に伴う更新
>
> 記法の実テキスト展開を廃止した（`docs/specifications/no-focus-expand.md`）ため、
> フォーカス中でもフェンス行はブロックの中身に存在しない。`codeBlockArrowKeymap.ts` の
> 行分割（`node.textContent` を見るだけ）から見えるのは実コード行だけになり、
> 最初の実コード行での ArrowUp は 1 回でブロックの外（直前の段落）へ抜ける。
> 最終行での ArrowDown も対称に 1 回で外（直後の見出し）へ抜ける。
>
> 実座標クリックについて: `page.getByText(...).click()` は要素境界（hljs のシンタックス
> ハイライト `<span>` 分割等）に依存して意図しない位置をクリックすることがあるため、
> ここでは `h.doubleClickTextAt`（DOM Range から実座標を計算して `page.mouse` で直接
> クリックする）を使う。`model().selParentText` は code_block ノード全体（複数行分）を
> 返すため特定の行の判定に使えず、代わりに `currentLineText()`（カーソルのある行だけを
> 切り出す）で検証する。
>
> 実行: `npm run test:browser`。ブラウザが無い環境では skip。

- **修正確認: コードブロック内 ↑/↓ でブロック境界を正しく越える**
  - コードブロック1行目の単語選択 → ArrowUp で、直前の段落（文書先頭ではない）へ抜ける
  - コードブロック2行目の単語選択 → ArrowUp で、ブロック内の1行目へ留まる
  - コードブロック3行目（最終行）の単語選択 → ArrowUp で、ブロック内の2行目へ留まる
  - コードブロック2行目の単語選択 → ArrowDown で、ブロック内の3行目（最終行）へ留まる
  - コードブロック最終行の単語選択 → ArrowDown で、直後の見出し（ブロック内に留まらない）へ抜ける

### `test/browser/cursor-focus/codeBlockTabFocus.test.ts`（4 件）

> 実ブラウザ回帰テスト: コードブロック内での Tab キー。
>
> ユーザー報告「``` の中を編集していると次の見出し(H2)に移動する」の原因調査で判明した
> バグ: ProseMirror は code_block に Tab を割り当てておらず、素通りするとブラウザ既定の
> 「次のフォーカス可能要素へ移動」が発動し、コードブロック自身の言語選択 <select> へ
> DOM フォーカスが飛んでしまう（詳細: docs/specifications/fixes/code-block-tab-focus-leak-fix.md）。
> ここでは Tab/Shift+Tab がフォーカスを外に漏らさず、タブ挿入/インデント解除として
> 機能することを検証する。
>
> 実行: `npm run test:browser`。ブラウザが無い環境では skip。

- **修正確認: コードブロック内 Tab でフォーカスが飛ばない**
  - コードブロック内で Tab キーを押してもフォーカスがエディタ外へ出ない
  - Tab キーでタブ文字が挿入される
  - Shift+Tab で行頭のインデントを1段階解除できる
  - コードブロック外の Tab は既存動作のまま（クラッシュしない）

### `test/browser/cursor-focus/dragSelectDuringExpand.test.ts`（2 件）

> 実ブラウザ回帰テスト: フォーカス展開中の別ブロックが残ったままドラッグ選択すると
> 選択が空になってしまう不具合。
>
> 症状: 文書を開くと最初のブロック（見出しなど）が自動でフォーカス展開される
> （`blockPrefixEditPlugin` の auto-expand）。この状態のまま、別のブロック（例:
> 最初の箇条書き項目のテキスト部分）でマウスドラッグによる範囲選択を始めると、
> 選択が完了しない（mouseup 後も選択が空のまま）。
>
> 原因: ドラッグの最中、ブラウザは mousedown 位置から mousemove の位置まで
> ネイティブ選択を伸ばしていくが、この過程で ProseMirror の selection も変化し、
> `blockPrefixEditPlugin` の `view.update` がフォーカス中ブロックの変化を検知して
> 展開中ブロックの collapse（テキスト削除を伴う transaction）を即座に発火させていた。
> ドラッグの途中でドキュメントが変化すると、ブラウザが内部で追跡しているネイティブ
> 選択の anchor/focus ノードが無効になり、mouseup 時点の最終選択が正しく
> 反映されない（空になる）。
>
> 修正方針: マウスボタンが押されている間（ドラッグ中）は expand/collapse の
> 処理を保留し、mouseup 後にまとめて 1 回だけ同期する。

- **実ブラウザ: フォーカス展開中の別ブロックが残ったままドラッグ選択できる**
  - 見出し（auto-expand 済み）が残ったまま最初の箇条書き項目のテキストをドラッグ選択できる
  - 比較: 見出しの展開が既に解除されていれば、同じドラッグは元から選択できる

### `test/browser/cursor-focus/externalUpdateRace.test.ts`（4 件）

> 実ブラウザ・ユースケーステスト: 編集中に外部 update（Raw エディタ・AI 等の編集反映）が
> 届いたときの挙動。
>
> preview-usage-flow-test-backlog.md の
> 「チェックボックス変換ガードと外部 update の衝突」を消化するテスト。
> ホストは外部編集を検知すると webview へ `{ type: 'update', markdown }` を送り、
> `applyExternalContent` が差分適用 + カーソル位置の維持を行う。
> これが (1) チェックボックス変換直後（selection guard の 1000ms 窓内）、
> (2) 通常の入力中、(3) 文書が短くなる update、のそれぞれで壊れないことを検証する。
>
> 実行: `npm run test:browser`。ブラウザが無い環境では skip。

- **実ブラウザ: 外部 update と編集の衝突**
  - チェックボックス変換の直後（ガード時間窓内）に外部 update が届いても、カーソルは変換した項目に残る
  - 外部 update の直後に続きをタイプしても、文字は元の項目に入る
  - 段落の途中にカーソルがある状態で外部 update が届いても、カーソルは同じ段落に残る
  - 文書が大幅に短くなる外部 update でもクラッシュせず、カーソルは文書内に収まる

### `test/browser/cursor-focus/headingFocusMarkerBugs.test.ts`（2 件）

> 実ブラウザ回帰テスト: 見出し行頭マーカー（`## `）の focusSyntaxPlugin 挙動の不具合。
>
> ## テスト対象バグ
>
> 1. **フォーカス時と非フォーカス時で見出し行の描画幅が変わる**
>    非フォーカス時は `## ` を CSS の `::before`（疑似要素）で表示し、フォーカス時は
>    blockPrefixEditPlugin が実テキストとして `## ` を挿入する。2つの描画経路が異なる
>    ため、同じ見出しでも状態によって行の実測幅が変わってしまう。
>
> 2. **Cmd+A（全選択）で見出しの `## ` だけが選択範囲に含まれない**
>    `::before` の内容は DOM テキストノードではないため、ブラウザのネイティブ選択
>    （Selection/Range API）に本質的に含まれない。全選択のハイライトが `## ` の部分にだけ
>    かからず、視覚的に選択範囲から除外されて見える。
>
> 実行: `npm run test:browser`。ブラウザが無い環境では skip。

- **実ブラウザ: 見出し行頭マーカー（## ）の focusSyntaxPlugin バグ回帰**
  - Bug1: 見出し行にフォーカスがある/ない状態で見出しの描画幅が変わらない
  - Bug2: Cmd+A（全選択）後、見出しの "## " がネイティブ選択範囲に含まれる

### `test/browser/cursor-focus/multiBlockExpandChain.test.ts`（3 件）

> 実ブラウザ回帰テスト: 3 つ以上の異なるブロック（見出し・チェックボックス・blockquote）を
> 連続でフォーカス移動したときの blockPrefixEditPlugin の expand/collapse チェーン。
>
> 既存の `focus-expand/blockPrefixBugs.test.ts` は「見出し ⇄ 段落」の 2 ブロック往復のみを
> 検証しており、test-directory-design.md §5 が挙げる「複数ブロックの展開が絡む編集中の
> 位置移動」は未カバーだった。ここでは異なる種別のブロックを 3 つ連鎖的に移動し、
> 前のブロックの collapse（プレフィックス削除・属性同期）が完了する前に次のブロックの
> expand が始まっても、いずれのブロックも記法が汚れず・カーソルが正しいブロックに残ることを
> 検証する。
>
> 実行: `npm run test:browser`。ブラウザが無い環境では skip。

- **実ブラウザ: 複数ブロックをまたぐ expand/collapse チェーン**
  - 見出し→チェックボックス→blockquote→見出し の連鎖移動で、どのブロックも記法が汚れない
  - 見出し→チェックボックス→blockquote を1往復した後、もう一往復しても記法が累積しない
  - 連鎖移動の最後にカーソルを置いたブロックへ正しくカーソルが残る

### `test/browser/editing-core/basicOperations.test.ts`（19 件）

> 実ブラウザ回帰テスト: Preview の基本操作を網羅的に検証する。
>
> 目的:
>   - 各種 Markdown が **実バンドル（Milkdown + 実コンポーネント）**で正しく構造化されること
>   - カーソルが触れても内容が壊れない（展開↔折りたたみのラウンドトリップ）こと
>   - インライン整形（Cmd+B / Cmd+I）が効くこと
>   - いずれの操作でも **page error が発生しない**こと（「すぐエラーが起きる」退行の防壁）
>
> jsdom（test/webview）では実レイアウト/コンポーネントが無く検出できない領域を守る。
> 実行: `npm run test:browser`。ブラウザが無い環境では skip。

- **実ブラウザ: Preview 基本操作の網羅**
  - **Markdown ロードと構造**
    - 見出し H1〜H3 がレベル付きで構造化される
    - 箇条書きリストが bullet_list/list_item で構造化される
    - 番号付きリストが ordered_list で構造化される
    - チェックボックス（未/済）が checked 属性付きで構造化される
    - ネストしたリストが入れ子で構造化される
    - 引用が blockquote で構造化される
    - コードブロックが言語付きで構造化される
    - インラインマーク（太字/斜体/コード/打消し）が構造化される
    - リンクが link マーク付きで構造化される
    - テーブルが table 構造で読み込める
    - 水平線（hr）が読み込める
    - 複合ドキュメント（見出し+リスト+コード+引用）がエラー無く読める
  - **カーソル進入→離脱で内容が壊れない（focus syntax ラウンドトリップ）**
    - 見出しに入って出ても内容が保持される
    - 箇条書きに入って出ても内容が保持される
    - 番号付きに入って出ても内容が保持される
    - 引用に入って出ても内容が保持される
  - **インライン整形ショートカット**
    - 選択して Cmd+B で太字（strong）が付く
    - 選択して Cmd+I で斜体（emphasis）が付く
    - 太字を選択して Cmd+B で解除できる（トグル）

### `test/browser/editing-core/codeFenceRealText.test.ts`（5 件）

> 実ブラウザテスト: コードフェンス（```）を常に実テキストとして文書に持つ
> （`code-fence-always-real-text.md` 段階1・2・3）。
>
> これまでフェンスは表示専用の widget だったため、フェンス行にカーソルを置けず、
> 「``` を1文字消したらリアルタイムでコード表示を解除する」ができなかった
> （2026-07-27 ユーザー要望）。フェンスを code_block の内容の先頭行・最終行として
> 常に持たせ、直列化の各経路（保存・コピー・行番号・差分）で剥がすことで、
> 「見えているものが文書そのもの」にする。
>
> **状態: 未実装（pending）**。仕様は `docs/specifications/code-fence-always-real-text.md`。
> ここに書かれているのは「これから実装する動作」であり、現状はすべて失敗する。
> 実装（段階1〜4を同時に入れる必要がある。途中まででは画面上フェンスが二重に見える）が
> 入った時点で `describe.skip` を `describe` に戻す。
>
> 実行: `npm run test:browser`。ブラウザが無い環境では skip。

- **実ブラウザ: コードフェンスを常に実テキストとして持つ（未実装: code-fence-always-real-text.md）**
  - コードブロックを開くと、フェンス行が文書の実テキストとして入っている
  - フェンス行にカーソルを置ける
  - フェンスが実テキストでも、保存 Markdown は二重フェンスにならない
  - 開きフェンスのバッククォートを1つ消すと、その場でコード表示が解除される
  - 壊したフェンスを打ち直して揃えると、その場でコード表示へ戻る

### `test/browser/editing-core/copyMarkdownFidelity.test.ts`（3 件）

> 実ブラウザ回帰テスト: Preview からコピーした Markdown がソースと同じ形になること。
>
> Preview は空行をソースと 1:1 で空 paragraph として保持している
> （`blank-line-preservation.md`）。この空 paragraph は remark-preserve-empty-line が
> `<br />` プレースホルダとして直列化するため、ファイルへ書き戻す `postChange` は
> `tightenListSpacing` → `stripPlaceholderLineBreaks` → `stripListItemPlaceholderBr` で
> 正規化してから保存している。
>
> ところがクリップボード用の直列化（`clipboardPlainTextPlugin`）はこの正規化を通さず、
> `<br />` を無条件に改行へ置換していたため、**コピーするたびに空行が増殖**していた
> （ソースの空行1行 → 貼り付け先で4行。2026-07-27 ユーザー報告「コピーすると内容が
> 崩れる」）。ここでは実ブラウザで copy イベントを発火させ、text/plain がソースと
> 同じ Markdown になることを固定する。
>
> 実行: `npm run test:browser`。ブラウザが無い環境では skip。

- **実ブラウザ: Preview からコピーした Markdown の忠実性**
  - 段落だけの文書をコピーしても空行が増えない
  - コードブロックを含む文書をコピーしても空行が増えない
  - 連続した空行が2行ある文書でも、コピー結果の空行本数がソースと一致する

### `test/browser/editing-core/editingOperations.test.ts`（18 件）

> 実ブラウザ回帰テスト: Preview の編集操作。
>
> Enter 継続 / リストのインデント / 各種 Backspace / Undo・Redo など、実際の編集で
> 壊れやすい操作を実バンドルで検証する。カーソル位置はキー（End/Home）に依存せず
> **プログラム的に**確定させ、テスト手法の不安定さを排除している
> （Playwright→Milkdown では End / Cmd+A が効かないため）。
>
> 各テストは結果構造に加えて **page error が無いこと**を必須でアサートする。
> 実行: `npm run test:browser`。ブラウザが無い環境では skip。

- **実ブラウザ: Preview 編集操作**
  - **Enter による継続**
    - 段落の行末で Enter → 同じ段落内に単一改行だけ入る
    - 箇条書きの行末で Enter → 新項目ができ、元の項目は保持される
    - チェックボックスの行末で Enter → 新項目は未チェックで継続する
  - **リストのインデント/アウトデント**
    - 2番目の項目で Tab → 入れ子になり、Shift+Tab で戻る
  - **行頭 Backspace によるブロック解除**
    - コードブロックの先頭で Backspace → その場で段落へ解除される（記法は本文に残らない）
    - 引用の先頭で Backspace してもクラッシュしない
  - **段落の分割と結合**
    - 段落途中で Enter の単一改行 → 行頭 Backspace で元通り結合できる
  - **インラインマーク端の Backspace（実マーカー文字を1文字ずつ編集）**
    - 太字の末尾で Backspace → その場で太字が外れ、本文は残る
    - インラインコードの末尾で Backspace → その場でコードが外れ、本文は残る
    - コードを外した後に別ブロックへ移っても、外れたままで本文も変わらない
  - **テーブルのセル間カーソル移動（実キー）**
    - ↓ で真下のセルへ（列を保つ）、↑ で戻る
    - → で隣のセルへ移る
    - 3列テーブルの2列目で ↓ → 列を保って真下のセルへ
    - 3列テーブルの3列目（最終列）で ↓ → 列を保って真下のセルへ
    - 移動先セルが空でも ↓ で同列の真下セルへ（分析シートバグ再現）
    - セル内テキストの先頭（中間）で ↓ → 同列の真下セルへ（ブラウザ任せで列ずれするバグ）
    - セル内テキストが選択状態（non-empty）で ↓ → 同列の真下セルへ（分析シートバグ再現）
  - **Undo / Redo**
    - Cmd+B の太字付与を Cmd+Z で取り消し、Cmd+Shift+Z でやり直せる

### `test/browser/editing-core/horizontalRuleEdit.test.ts`（11 件）

> 実ブラウザ回帰テスト: Preview の水平線（`---`）を編集できること。
>
> 水平線は ProseMirror の leaf ノードで、`.milkdown hr` は既定だと高さ 1px の
> 罫線しか持たない。そのため「クリックしても掴めない」「選択されても見た目が
> 変わらないので消せたか分からない」状態だった（ユーザー報告 2026-07-27
> 「ここの横棒も編集できるようにしたい」）。さらに remark-stringify の既定では
> thematicBreak が `***` で書き戻されるため、**別の場所を編集しただけで
> ソースの `---` が `***` に書き換わる**という破壊も起きていた。
>
> ここでは実バンドル・実 Chromium・実マウスクリックで、
> - 罫線を実際にクリックして水平線ノードを掴める（クリック判定領域がある）
> - 選択中は見た目で分かる
> - 選択した水平線を Backspace / Delete / 文字入力で編集できる
> - 前後のブロックからの Backspace / Delete でも消せる
> - 削除がホストへ送る Markdown に反映され、`---` は `---` のまま保たれる
> を検証する。
>
> 実行: `npm run test:browser`。ブラウザが無い環境では skip。

- **実ブラウザ: Preview の水平線（---）編集**
  - 水平線には実マウスで掴めるだけのクリック判定領域がある
  - 水平線をクリックすると水平線が選択される
  - 選択中の水平線は非選択時と見た目が変わる
  - 選択した水平線を Backspace で削除でき Markdown からも消える
  - 選択した水平線を Delete で削除できる
  - 水平線の直後のブロック先頭で Backspace を続けると水平線が削除される
  - 水平線の直前のブロック末尾で Delete すると水平線が削除される
  - 水平線を選択して文字を入力すると水平線が段落に置き換わる
  - 水平線を削除しても Undo で元に戻せる
  - 別の場所を編集しても水平線は --- のまま保存される（*** に書き換わらない）
  - 段落で --- と入力すると水平線になる

### `test/browser/editing-core/imageClickDelete.test.ts`（9 件）

> 実ブラウザ回帰テスト: Preview の画像をクリックで削除・右クリックでコピー/削除できること。
>
> 画像は ProseMirror の leaf ノードで、クリックすれば NodeSelection にはなるものの、
> 「選択されたことが見た目で分からない」「削除する手段が Backspace しかない」状態だった
> （ユーザー要望 2026-07-27「画像をクリックすることで削除できるようにしつつ、右クリックなどで
> コピーもできるようにして欲しい」）。コピー（Cmd+C / 右クリック「Copy Image」）は
> `imageCopyPlugin.ts` に実装済みだが、削除の導線が無かった。
>
> ここでは実バンドル・実 Chromium・実マウス操作で、
> - 画像をクリックすると画像ノードが選択され、選択中は見た目で分かる
> - 選択中の画像の右上に削除ボタン（×）が重なって表示される
> - × をクリックすると画像だけが削除され、前後の段落は壊れない
> - 選択解除（Escape / 他所クリック）で削除ボタンが消える
> - 右クリックメニューに「Copy Image」と「Delete Image」が並び、Delete で削除できる
> - 削除は Undo で元に戻せる
> を検証する。
>
> 画像の src は実ファイルに依存しない data: URL（120×80 の SVG）を使う。相対パスだと
> ブラウザが読み込めず矩形が潰れて実マウスで掴めないため。
>
> 実行: `npm run test:browser`。ブラウザが無い環境では skip。

- **実ブラウザ: Preview の画像をクリックで削除・右クリックでコピー/削除**
  - 画像をクリックすると画像ノードが選択される
  - 画像を選択すると削除ボタン（×）が画像の上に表示される
  - 削除ボタンをクリックすると画像だけが削除され前後の段落は残る
  - 画像以外の場所をクリックして選択を解除すると削除ボタンは消える
  - 選択中の画像は非選択時と見た目が変わる
  - 画像を右クリックするとコピーと削除のメニューが出る
  - 右クリックメニューの Delete Image で画像が削除される
  - 削除ボタンで消した画像は Undo で元に戻る
  - 動画には削除ボタンを出さない（ネイティブ controls の誤爆を避ける）

### `test/browser/editing-core/pasteIntoCodeBlock.test.ts`（4 件）

> 実ブラウザ回帰テスト: コードブロックへフェンス付きテキストを貼り付けても二重フェンスにならない。
>
> ChatGPT 等からコピーしたコードは `` ``` `` フェンスごとクリップボードに入っていることが多い。
> これを Preview の**コードブロックの中**へ貼り付けると、コードブロックの内容は常に
> リテラルなので `` ``` `` が本文として入り込む。保存時には remark がその内容を包める長さ
> （4連バッククォート）へ外側フェンスを広げるため、ファイルが二重フェンスになる:
>
> ````text
> ````            ← 外側（保存時に広げられた）
> ```             ← 貼り付けで本文に入ったフェンス
> Animate ...
> ```             ← 同上
> ````
> ````
>
> この状態になると Preview 上でフェンス行が4本並んで見え（`code-fence-display-length-fix.md`）、
> コードブロック内で Cmd+A しても「中身」に `` ``` `` が含まれるためコピー結果にも入る
> （2026-07-27 ユーザー報告）。貼り付け時点で外側フェンスを剥がして防ぐ。
>
> 実行: `npm run test:browser`。ブラウザが無い環境では skip。

- **実ブラウザ: コードブロックへの貼り付けで二重フェンスを作らない**
  - コードブロックの中にフェンス付きテキストを貼り付けると、フェンスは剥がされて中身だけが入る
  - 言語付きフェンス（```js）を貼り付けてもフェンス行は本文に残らない
  - フェンスを含まない普通のテキストの貼り付けは今までどおりそのまま入る
  - コードブロックの外（段落）へフェンス付きテキストを貼ると、これまでどおりコードブロックとして取り込まれる

### `test/browser/editing-core/plainTextEditing.test.ts`（11 件）

> 実ブラウザ回帰テスト: Preview の通常段落で最も頻繁に行う1文字編集を固定する。
>
> 実 Chromium の contenteditable へ実キーを送り、本文だけでなくProseMirror構造、
> selection、hostへ送るMarkdown、page errorを同時に検証する。
> 通常段落での文字入力・削除・改行（EDIT-001〜012）を実 Chromium で固定する。

- **実ブラウザ: 通常段落の基本入力 EDIT-001〜012**
  - EDIT-001 通常段落の途中で1文字入力すると、前後を保ちカーソルが入力直後へ進む
  - EDIT-002 通常段落の先頭で1文字入力すると、その段落の先頭にだけ追加される
  - EDIT-003 通常段落の末尾で1文字入力すると、次の段落へ混入しない
  - EDIT-004 通常段落の途中へXYZを1文字ずつ入力しても欠落・重複しない
  - EDIT-005 通常段落の途中でBackspaceすると、直前の1文字だけを削除する
  - EDIT-006 通常段落の途中でDeleteすると、直後の1文字だけを削除する
  - EDIT-007 文書先頭でBackspaceしても本文・構造・カーソルを変更しない
  - EDIT-008 文書末尾でDeleteしても本文・構造・カーソルを変更しない
  - EDIT-009 通常段落の途中でEnterすると、同じ段落内へ単一改行を入れる
  - EDIT-010 通常段落の末尾でEnterすると、単一改行を1個だけ追加する
  - EDIT-012 通常段落の途中でShift+Enterすると、単一改行を1個だけ追加する

### `test/browser/editing-core/tripleClickLine.test.ts`（6 件）

> 実ブラウザ回帰テスト: トリプルクリックは「クリックした1行」だけを選択する。
>
> この Preview では Enter が段落内の改行（hardbreak）になるため、見た目で何行にも
> わたる文章が **1つの paragraph ノード** になっている。ProseMirror 既定の
> トリプルクリックはテキストブロック全体を選ぶので、段落全体（＝画面上の十数行）が
> まとめて選択されてしまい「3回クリックすると全部選ばれる」状態だった
> （2026-07-27 ユーザー報告）。hardbreak を行境界として扱い、1行だけを選ぶ。
>
> コードブロック内は元から1行だけを選ぶ実装があり（`codeBlockLines.ts`）、その回帰も見る。
>
> 実行: `npm run test:browser`。ブラウザが無い環境では skip。

- **実ブラウザ: トリプルクリックで1行だけ選択する**
  - 段落内の真ん中の行をトリプルクリックすると、その行だけが選択される
  - 段落の最初の行をトリプルクリックしても、その行だけが選択される
  - 段落の最後の行をトリプルクリックしても、その行だけが選択される
  - 1行だけの段落では、その段落のテキストが選択される（従来どおり）
  - コードブロック内のトリプルクリックも1行だけ（回帰防止）
  - リスト項目のトリプルクリックはその項目のテキストだけ

### `test/browser/editing-core/typingFidelity.test.ts`（19 件）

> 実ブラウザ回帰テスト: タイプ中・確定後の「文字忠実性」。
>
> 目的:
>   既存の basicOperations/editingOperations は最終結果の**構造**を `includes` で
>   見ているだけで、途中経過と厳密一致（`===`）は見ていない。本ファイルは 1 打鍵ごとに
>   doc 全体のテキストを `assert.strictEqual` で突き合わせ、「途中の1文字だけ余分/欠落」
>   「冒頭が二重化する」といった崩れを検出できるようにする
>   （未再現のユーザー報告「連続した日本語入力で冒頭が二重化する」に対する最も細かい網）。
>
> `docs/specifications/typing-fidelity-test-proposal.md` §4.1 の TDD 実装。
> 実行: `npm run test:browser`。ブラウザが無い環境では skip。

- **実ブラウザ: タイプ中・確定後の文字忠実性**
  - **プレーンな文字列（空段落へ1文字ずつ）**
      - ${label}「${text}」を1文字ずつ打っても、各時点で全文が厳密一致する
    - 長文200文字を打鍵間ウェイトなしで連続タイプしても、最終結果が厳密一致する
  - **カーソル位置バリエーション**
    - 既存段落の先頭に打つ（冒頭挿入 = ユーザー報告の症状位置）
    - 既存段落の末尾から続けて打つ
    - 既存段落の中央に打つ
    - 空ドキュメントに最初の1文字から打つ
    - 文書の最終ブロック末尾（境界 pos）で打つ
  - **ブロック種別ごとの本文タイプ**
    - 見出し本文に打っても表示・markdown が厳密一致する
    - 箇条書き項目の本文に打っても厳密一致する
    - 番号付きリスト項目の本文に打っても厳密一致する
    - チェックボックスラベルに打っても checked が反転せず厳密一致する
    - blockquote 本文に打っても厳密一致する
    - インラインコード内に打っても input rule が発火せず文字がそのまま残る
    - fenced code block 内で "#" や "- " を打っても変換されずインデントも保持される
    - テーブルセル内（パイプ以外の通常文字）に打っても厳密一致する
  - **編集を挟むタイプ**
    - タイプ → Backspace 数回 → 打ち直し で最終文字列が厳密一致する
    - タイプ途中で ←← と戻って中央挿入しても最終文字列が厳密一致する
    - タイプ → Undo → 再タイプ → Undo → Redo の後の全文が厳密一致する
    - 2つの段落を行き来しながら交互に追記しても、それぞれ厳密一致する

### `test/browser/external-sync/diffGutterFocusExpand.test.ts`（7 件）

> 実ブラウザ回帰テスト: Git 差分ガター（青バー）× フォーカス展開。
>
> ## 背景
>
> ユーザー報告（2026-07-26）: `` `docs/spec.md` `` のようなインラインコードを含む
> テーブルセルにカーソルを入れただけで、まだ 1 文字も編集していないのに差分ガターの
> 青バー（`.diff-modified`）がテーブル全体の左に出る。差分の単位はトップレベルノード
> なので、セル 1 個の記法展開でテーブル全体が「編集済み」に見えてしまう。
>
> 原因は `inlineMarkEditPlugin` がフォーカス時にマーカー文字（`` ` `` / `**` / `](url)`）を
> **実テキスト**として挿入することで、`previewDiffPlugin` の比較用シグネチャが HEAD 側と
> 食い違うこと（`docs/specifications/inline-mark-focus-edit-fix.md` §3.2）。
>
> jsdom 側（`test/webview/focus-expand/previewDiffInlineMarkExpand.integration.test.ts`）でも
> 検証しているが、**実際に配信されるバンドル（media/milkdown.bundle.js）と実クリック**での
> 挙動が本判定なのでこの層でも固定する。
>
> 実行: `npm run test:browser`。ブラウザが無い環境では skip。

- **実ブラウザ: Git差分ガター × フォーカス展開（未編集で青バーが出ない）**
  - テーブルセル内のインラインコードをクリックしてもテーブルに青バーが出ない
  - インラインコードを含む段落をクリックしても青バーが出ない
  - 見出しをクリックしてもプレフィックス展開だけでは青バーが出ない
  - インラインコードを含む見出し（プレフィックス展開と同時）でも青バーが出ない
  - 見出し内インラインコードから別ブロックへ移っても青バーが残らない
  - コードブロックにカーソルを入れてもフェンス展開だけでは青バーが出ない
  - 実際に文字を打てばそのブロックに差分ガターが出る（除外しすぎていない）

### `test/browser/external-sync/rapidExternalUpdates.test.ts`（3 件）

> 実ブラウザ回帰テスト: 短時間に複数回連続する外部 update（AI がファイルを連続編集する
> ケースを想定）を受けても、最終的な内容が壊れずカーソルも文書内に留まることを検証する。
>
> test-directory-design.md §5 が挙げる「browser/external-sync/ は現状空。短時間に複数回の
> 外部 push が連続するケース（AI 編集を想定）」のギャップを埋める。既存の
> `cursor-focus/externalUpdateRace.test.ts` は 1 回の update のみを扱っており、
> 連続 update（前の update の適用が完了する前に次が届く）は未カバーだった。
>
> 実行: `npm run test:browser`。ブラウザが無い環境では skip。

- **実ブラウザ: 短時間に連続する外部 update**
  - 待機なしで5回連続の外部 update が届いても、最終的な内容は最後の update と一致する
  - 編集中に連続する外部 update が届いても、文書が壊れずカーソルは範囲内に収まる
  - 文書サイズが増減を繰り返す連続 update でもクラッシュしない

### `test/browser/external-sync/staleDocumentSaveDeferBug.test.ts`（1 件）

> 実バグ回帰テスト: 外部（AI等）書き換え直後に Preview で入力を続けると、host 側の
> 「document モデルの陳腐化」誤検知により、その入力が保存されずに消える不具合。
>
> ## 背景
>
> Preview だけを開いている（Raw のテキストエディタが無い）状態で外部ツールが .md を
> 直接書き換えると、`FileSystemWatcher` が検知してディスクの最新内容を webview へ push する
> （`readDocumentFromDisk()` 経由。`stale-external-push-cursor-jump-fix.md`）。この push は
> ディスクを直接読むため正しく機能する。
>
> 問題は **push した後、webview から戻ってくる次の `change`（ユーザーが続けて入力した内容）を
> host が保存してよいかどうかの判定**（`resolveWebviewSaveDecision`,
> `src/preview/host/externalEcho.ts`）にある。この判定は `document.getText()`
> （VS Code の TextDocument モデル）が最新かどうかに依存しているが、
> その TextDocument モデル自体は外部ディスク書き込みを自動リロードしないことがある
> （`test/extension/raw/external-sync.test.ts` 11.1/11.1c で確認済みの既知の制約）。
>
> 修正前は、host が「直近に webview へ push した内容」を追跡しておらず、
> `document.getText()` の陳腐化を「新たな外部割り込みが発生した」と誤認して defer し続け、
> ユーザーが外部編集の直後に Preview で入力した内容が **保存されず、host が古いディスク
> 内容を再 push することで画面上からも消えてしまう**（実バグ）。
>
> 実行: `npm run test:browser`。ブラウザが無い環境では skip。

- **実バグ回帰: 外部書き換え直後の入力が document モデル陳腐化で消える**
  - 外部 push 直後にユーザーが入力を続けても、host（修正後）は document モデルの陳腐化で保存を defer しない

### `test/browser/focus-expand/blockPrefixBugs.test.ts`（9 件）

> 実ブラウザ回帰テスト: blockPrefixEditPlugin の不具合回帰。
>
> ## テスト対象バグ
>
> 1. **チェックボックス変換時に checked=false が保持されない**
>    ⌥⌘4 でリストアイテムをチェックボックスに変換すると、blockPrefixEditPlugin が
>    collapse 処理で checked を null に戻してしまう。
>
> 2. **見出しからフォーカスを外すと ## プレフィックスが残る（見かけ上 #### 表示）**
>    collapse 処理が stale な nodePos/contentStart を使うためプレフィックス削除に
>    失敗し、focusSyntaxPlugin の CSS ::before 装飾と合わさって二重表示になる。
>
> 3. **⌥⌘5（箇条書きトグル）を複数回押すと "- " が累積する**
>    liftListItem 後に nodePos が無効になり collapse が早期 return するため、
>    "- " プレフィックスが段落テキストに残る。次回 wrap 時に再び "- " が挿入され
>    "- - text" など累積していく。
>
> 4. **⌥⌘4 後のカーソル位置がリスト項目外に飛ぶ**
>    expand/collapse サイクルが連鎖してカーソルが意図しない位置に移動する。
>
> 5. **展開中のブロック内でテキストを選択すると "## "/"- "/"> " が収縮する**
>    `getFocusedBlockInfo` が `!state.selection.empty` を無条件に「フォーカス対象なし」と
>    判定していたため、同じブロック内の選択でも収縮 → 再展開が起きてテキスト位置が
>    ずれ、選択中の編集がやりづらくなる（`inlineMarkEditPlugin` で既に修正済みの
>    「選択中は収縮させない」と同種の不具合が block prefix 側に残っていた）。
>
> 実行: `npm run test:browser`。ブラウザが無い環境では skip。

- **実ブラウザ: blockPrefixEditPlugin バグ回帰**
  - Bug1: ⌥⌘4 で段落をチェックボックスに変換後、list_item(checked=false) になる
  - Bug1: ⌥⌘4 変換後のテキスト内に "- " プレフィックスが残らない
  - Bug2: H2 にカーソルを置いて別ブロックへ移動後、見出しレベルは 2 のまま
  - Bug2: H2 フォーカス→外す を複数回繰り返してもプレフィックスが累積しない
  - Bug2: 見出し collapse 後にテキストに "## " が残らない（raw markdown を確認）
  - Bug3: ⌥⌘5 で箇条書きにして、もう一度 ⌥⌘5 で解除後、テキストに "- " が残らない
  - Bug3: ⌥⌘5 を 6 回押した後、テキストに "- - -" が累積しない
  - Bug4: ⌥⌘4 後のカーソルがリスト項目の段落内にある
  - Bug4: ⌥⌘4 後のカーソル位置が文書の先頭（pos=1）に飛ばない

### `test/browser/focus-expand/codeFenceLanguageEdit.test.ts`（4 件）

> 実ブラウザ回帰テスト: コードフェンスの言語名を自由テキストとして編集できること。
>
> ## 背景
>
> コードフェンス（`` ```lang `` 〜 `` ``` ``）のバッククォート自体は、実テキスト化すると
> 直列化（保存）時にコード本文へ紛れ込む恐れがあるため widget 表示のまま編集不可にしている
> （`code-fence-focus-markers.md`）。一方、言語名部分は `code_block` ノードの `language`
> 属性であり、内容テキストとは別管理なので実テキスト化のリスクが無い。
>
> 以前から `codeLanguagePlugin`（フォーカス中にブロック右上へ浮かぶ言語セレクタ）が
> 存在したが、`<select>` で固定リストからしか選べず、自由な文字列への打ち替え・
> Backspace による編集ができなかった。`<input>`（`<datalist>` でリストを提案）へ
> 変更し、キー入力のたびに `code_block` の `language` 属性へ反映するようにした
> （`code-fence-language-focus-edit-fix.md` 参照）。
>
> 実行: `npm run test:browser`。ブラウザが無い環境では skip。

- **実ブラウザ: コードフェンス言語名の自由テキスト編集**
  - コードブロックにフォーカスすると言語欄が <input> として表示される（<select> ではない）
  - 言語欄にプリセットに無い文字列を打つと、そのまま code_block の language 属性になる
  - 言語欄で Backspace すると1文字ずつ削除でき、それに応じて language 属性が更新される
  - 言語欄には既知の言語一覧が <datalist> の候補として提案される

### `test/browser/focus-expand/collapseMarkdownSync.test.ts`（5 件）

> 実ブラウザ回帰テスト: ブロックの collapse（フォーカスが外れた際の記法プレフィックス除去）が
> ホストへ同期されない（サイレントなデータ消失）不具合。
>
> ## バグ内容
>
> `blockPrefixEditPlugin` の collapse 処理（見出し/箇条書き/引用のプレフィックス除去）は
> Undo 履歴を汚さないため `addToHistory: false` を付けて dispatch する。ところが Milkdown
> 公式の `@milkdown/plugin-listener`（`markdownUpdated` の実体）は、内部の `state.apply` で
> `tr.getMeta('addToHistory') === false` の transaction を完全に無視する（`latestTr` を
> 更新しない）。そのため collapse で確定した最終テキストが、その後 **他に何の編集も
> 起きなければ永久にホストへ送られず**、保存ファイルからその内容が丸ごと欠落することがあった。
>
> 詳細設計: docs/specifications/fixes/collapse-markdown-sync-fix.md
>
> 実行: `npm run test:browser`。ブラウザが無い環境では skip。

- **実ブラウザ: collapse 後の markdown 同期回帰**
  - 見出しを新規タイプして離れるだけで、保存 markdown に見出しの内容が反映される
  - 箇条書きを新規タイプして離れるだけで、保存 markdown に内容が反映される
  - 引用を新規タイプして離れるだけで、保存 markdown に内容が反映される
  - 既存見出しに1文字追記して離れるだけで、保存 markdown に追記内容が反映される
  - 何も変更せずフォーカスして離れただけなら、余計な change は増えない（重複判定の回帰確認）

### `test/browser/focus-expand/headingBackspaceDemote.test.ts`（3 件）

> 実ブラウザ回帰テスト: 見出しの行頭 Backspace による 1 段階ずつの降格。
>
> ## 背景
>
> 記法の実テキスト展開があった頃は、フォーカスで挿入された `####` を 1 文字ずつ
> Backspace して見出しレベルを変えていた。この方式は「`#` を全部消すと区切りの NBSP が
> 本文に残り、再フォーカスのたびにレベルが増殖して見える」実バグを生んでいた
> （旧 `fixes/heading-prefix-zero-hash-collapse-fix.md`）。
>
> 展開を廃止（`docs/specifications/no-focus-expand.md`）した現在は、`markerBackspace.ts`
> が **行頭 Backspace で 1 段階ずつ降格**する（`H4 → H3 → … → H1 → 段落`）。本文へ記法
> 文字が入らないので残骸も増殖も原理的に起きない。ここではその降格が正しく進むこと、
> 何度繰り返しても本文が汚れないことを固定する。
>
> 実行: `npm run test:browser`。ブラウザが無い環境では skip。

- **実ブラウザ: 見出しの行頭 Backspace で 1 段階ずつ降格する**
  - H4 の行頭で Backspace すると H3 になる（本文に "#" は残らない）
  - Backspace を繰り返すと H4 → H3 → H2 → H1 → 段落 と 1 段階ずつ降格する
  - 降格を繰り返しても本文に記法文字（# や NBSP）の残骸が積み上がらない

### `test/browser/focus-expand/noFocusExpand.test.ts`（10 件）

> 実ブラウザ回帰テスト: 「フォーカスしても見た目が変わらない」Preview（記法の実テキスト展開の廃止）。
>
> ## 背景
>
> ユーザー要望（2026-07-26）: 「Preview は Raw と同じような見た目にしてほしい。`## ` は
> 見えず文字の大きさだけ変わる、その状態のままフォーカスしても変化しないようにしたい。
> ここで起こるエラーが多いから」。
>
> これまでは 3 つのプラグインがフォーカス時に Markdown 記法を**実テキストとして挿入**して
> いた（`blockPrefixEditPlugin` = `## ` `- ` `> `、`inlineMarkEditPlugin` = `` ` `` `**`
> `[..](..)`、`codeFenceEditPlugin` = ```` ``` ````）。ドキュメント本文が「フォーカスした
> だけ」で変わるため、カーソル飛び・差分ガターの誤判定・直列化の混入など多数の不具合の
> 温床になっていた。本テストはその展開が**一切起きない**ことを固定する。
>
> あわせて、記法を外す操作（行頭・マーク境界での Backspace）が **リアルタイムで**
> 見た目に反映されること（コードブロックの背景・インラインコードの色がその場で消える）も
> 検証する。展開時代はフォーカスが外れる collapse まで見た目が変わらなかった。
>
> 実行: `npm run test:browser`。ブラウザが無い環境では skip。

- **実ブラウザ: フォーカスしても記法が実テキストとして現れない**
  - 見出しにカーソルを置いても "## " が本文に挿入されない
  - 箇条書きにカーソルを置いても "- " が本文に挿入されない
  - 引用にカーソルを置いても "> " が本文に挿入されない
  - インラインコード・太字・リンクを含む段落にカーソルを置いても記法文字が現れない
  - コードブロックにカーソルを置いてもフェンス行が本文に挿入されない
  - 別のブロックへカーソルを移してもドキュメントは 1 文字も変化しない
- **実ブラウザ: 記法を外すと見た目がリアルタイムで普通の文字に戻る**
  - コードブロックの先頭で Backspace すると、背景と色がその場で消えて段落になる
  - インラインコードの末尾で Backspace すると、色がその場で消えて普通の文字になる
  - 見出しの行頭で Backspace すると、その場で 1 段階降格する（H2 → H1）
  - 箇条書きの行頭で Backspace すると、その場でリストが外れて段落になる

### `test/browser/focus-expand/typedBlockPrefixResult.test.ts`（6 件）

> 実ブラウザ回帰テスト: 行頭記法をタイプしたときの変換結果（`## ` `# ` `> `）。
>
> ## 背景
>
> かつては入力ルールで見出し化した直後に `blockPrefixEditPlugin` が `## ` を実テキストと
> して再挿入しており、その区切り文字（non-breaking space）が本文へ残る不具合があった。
> 記法の実テキスト展開は 2026-07-26 に廃止（`docs/specifications/no-focus-expand.md`）した
> ため、タイプ直後の本文には記法も NBSP も残らず、本文テキストだけになるのが正しい。
> 「打った直後の見た目」＝「ファイルを開き直した見た目」であることを固定する。
>
> 実行: `npm run test:browser`。ブラウザが無い環境では skip。

- **実ブラウザ: 見出し・引用のプレフィックス末尾スペース回帰**
  - "## heading" を1文字ずつタイプすると、記法は消えて本文だけの見出しになる
  - "# item"（H1）でも本文だけの見出しになる
  - "### h"（H3）でも本文だけの見出しになる
  - "> quote" でも本文だけの引用になる
  - 回帰確認: 見出しの collapse 後、保存 markdown に "## " が正しく（欠落・二重化せず）反映される
  - 回帰確認: 引用の collapse 後、保存 markdown に "> " が正しく反映される

### `test/browser/ime/imeCheckbox.test.ts`（5 件）

> 実ブラウザ・ユースケーステスト: 日本語 IME とチェックボックスの組み合わせ。
>
> preview-usage-flow-test-backlog.md の「IME（日本語変換）でのチェックボックス変換」を
> 消化するテスト。CDP（`Input.imeSetComposition` + `Input.insertText`）で本物の
> IME 変換確定を再現する（手法は imeEnterRace.test.ts と同じ）。
>
> 検証すること:
>   - チェックボックス項目の本文を IME で入力しても、項目・本文・保存 markdown が壊れない
>   - 全角の疑似マーカー（［ｘ］等）はチェックボックスに誤変換されない
>   - IME 確定直後にチェックボックスへ変換する操作（`] ` を後から打つ）でも変換される
>
> 実行: `npm run test:browser`。ブラウザが無い環境では skip。

- **実ブラウザ: IME とチェックボックスの組み合わせ**
  - チェックボックス項目の本文を IME 確定で入力しても、項目と保存 markdown が壊れない
  - IME 確定のあと半角の "] " を打ち足してもチェックボックスに変換される（確定→補完の流れ）
  - 全角の疑似マーカー（［ｘ］）はチェックボックスに誤変換されず、そのまま文字として残る
  - チェックボックスの変換トリガーとなる末尾スペース自体が IME 確定で入力されても変換される
  - IME で見出しの本文を確定した直後に Enter しても、見出しが壊れず次は段落になる

### `test/browser/ime/imeEnterRace.test.ts`（2 件）

> 実ブラウザ回帰テスト: 日本語 IME 変換確定 Enter と改行 Enter のレース。
>
> ## バグの背景
>
> ProseMirror は「IME 変換確定の Enter が、そのまま改行挿入の Enter としても
> 処理されてしまう」問題への対策（`inOrNearComposition`、prosemirror-view）を
> 持っているが、**Safari 限定**の分岐でしか働かない
> （`if (safari && Math.abs(Date.now() - view.input.compositionEndedAt) < 500)`）。
> VS Code の Webview は Chromium/Electron なので、この対策の恩恵を受けられない。
>
> 結果、チェックボックス項目のテキストを日本語 IME で確定した直後に Enter を押すと:
> 1. その Enter が「確定」だけでなく「改行」としても処理され、意図せず**空の
>    list_item が split される**（ユーザーは気づかない）。
> 2. ユーザーが「今度こそ改行」のつもりでもう一度 Enter を押すと、カーソルは
>    **空の list_item 内**にいるため、ProseMirror 標準の「空リスト項目で Enter
>    → リストから離脱」動作が発動し、**チェックボックスではないプレーン段落**に
>    なってしまう（チェックボックスが次の行に反映されない）。
>
> 修正: `imeEnterGuard.ts` で、`compositionend` から 500ms 以内の最初の Enter を
> 無視する（ProseMirror の Safari 分岐と同じ考え方をブラウザ非依存で行う）。
>
> 実行: `npm run test:browser`。ブラウザが無い環境では skip。

- **実ブラウザ: IME 確定 Enter と改行 Enter のレース**
  - IME確定Enter直後の連打でも、チェックボックス項目のテキストが失われず次の行もチェックボックスになる
  - composition confirmed WITHOUT Enter (space/click/auto-commit) does not swallow a later genuine Enter

### `test/browser/ime/imeExternalUpdateRace.test.ts`（3 件）

> 実ブラウザ回帰テスト: 日本語 IME 変換中（未確定 = compositionend 前）に
> 外部 update（Raw エディタ・AI 等の編集反映）が届いたときの挙動。
>
> test-directory-design.md §5 が挙げる「IME 変換中（未確定）に外部 update が届くケース」の
> ギャップを埋める。`applyExternalContent`/`milkdownApp.ts` には現状 IME composition 中かどうかの
> 判定が無く、変換中に届いた update がそのまま文書を書き換える。変換確定後にテキストが
> 失われたり、意図しない場所に挿入されたりしないことを検証する。
>
> 実行: `npm run test:browser`。ブラウザが無い環境では skip。

- **実ブラウザ: IME 変換中に届く外部 update**
  - 変換中（未確定）に無関係な段落への外部 update が届いても、確定後に変換テキストが失われない
  - 変換中に届いた外部 update の後も、通常の入力を継続できる（クラッシュしない）
  - 編集中の段落そのものに、自分の直前の内容を反映した（＝古い）update が変換中に届いても、確定後に先頭が二重化しない

### `test/browser/ime/imePersistence.test.ts`（5 件）

> 実ブラウザ回帰テスト: IME（日本語変換）入力と、記法ブロック編集の保存内容。
>
> 日本語ユーザーが主対象のため、IME での編集が **保存 Markdown を壊さない**ことが重要。
> jsdom では IME（composition）も blockPrefixEdit の rAF 展開も再現できないため、ここが唯一の砦。
>
> - IME 入力は CDP（`Input.imeSetComposition` + `Input.insertText`）でエミュレートする。
> - 「ホストへ送られる最終 Markdown」は、編集→離脱の後に別ブロックを編集して change を
>   発火させ、その内容で検証する（blockPrefixEdit は編集単独では即 change しないことがある）。
>
> 実行: `npm run test:browser`。ブラウザが無い環境では skip。

- **実ブラウザ: IME 入力と記法ブロックの保存内容**
  - IME: 段落に日本語を入力 → 保存 Markdown が正しい
  - IME: 見出しに日本語を追記 → 保存 Markdown が正しい（# が二重化しない）
  - IME: 箇条書きに日本語を追記 → 保存 Markdown が正しい（- が二重化しない）
  - 通常タイプ: 見出しに追記 → 保存 Markdown が正しい（# が二重化しない）
  - blockPrefixEdit: 見出し⇄段落を高速に出入りしても内容・構造が壊れない

### `test/browser/ime/imeSequentialConversionDuplication.test.ts`（4 件）

> 実ブラウザ回帰テスト: 同一段落内で日本語 IME 変換を複数回連続して確定したときの
> 保存内容。
>
> ユーザー報告: 「このアプリで、Aという文章を編集しているとして、」のように、句読点を
> 挟みながら一つの文をまとめて入力すると（＝IME 変換確定が段落内で複数回連続する）、
> 冒頭の一部（例: 「このアプリで」）が二重に挿入されてしまう。既存の `imePersistence.test.ts`
> は1段落につきIME変換確定が1回だけのケースしか検証しておらず、この「連続確定」の
> 組み合わせは未検証だった。
>
> 本ファイルの各パターン（句読点を挟んだ連続確定・非IME直接タイプとの混在・既存段落末尾からの
> 継続・待ち時間ゼロでの高速連続確定）はいずれも再現しなかった（実バグは見つからず、既存動作を
> 仕様として固定する）。CDP（`Input.imeSetComposition`/`insertText`）によるシミュレーションでは
> 再現しないため、実バグが実在するなら実 VS Code の Electron webview + 実 OS の日本語 IME 固有の
> タイミング（本テスト基盤では再現できない領域）に起因する可能性が高い。
>
> 実行: `npm run test:browser`。ブラウザが無い環境では skip。

- **実ブラウザ: 同一段落内での連続 IME 変換確定**
  - 句読点を挟んで IME 変換を連続確定しても、冒頭が二重化しない
  - 句読点は直接タイプ（非IME）、それ以外はIME変換という組み合わせでも壊れない
  - 既存の段落の末尾（Enter で新規作成した段落）から続けて連続 IME 変換しても壊れない
  - 待ち時間ゼロで複数の IME 変換確定を連続発行しても壊れない（極端な高速入力）

### `test/browser/lists-tables/checkboxEditDelete.test.ts`（4 件）

> 実ブラウザ回帰テスト: チェックボックス項目の Enter による文中分割、クリックによる
> チェック解除（既存の `listMarkerDragFix.test.ts` はチェック方向のみ検証済み）を、
> 実 DOM のカーソル位置・クリック座標を通して検証する。
> jsdom（`test/webview/editing-core/checkboxEditDelete.test.ts`）で構造レベルの
> 正しさは確認済みだが、実ブラウザのカーソル配置・DOM クリックでも同じ結果になることを
> ここで固定する。

- **実ブラウザ: チェックボックスの編集・削除**
  - チェック済み項目のテキスト中央で Enter して分割すると、新項目は未チェックになる
  - チェック済みのチェックボックスをクリックすると未チェックに戻る
  - リスト2番目のチェックボックスの行頭で Backspace すると、前の項目とマージせず箇条書きへ降格し、テキストは汚れない
  - 空チェックボックスで Backspace → 箇条書きを経由せず、その位置に空行を残す

### `test/browser/lists-tables/listMarkerDragFix.test.ts`（3 件）

> 実ブラウザ回帰テスト: 箇条書き・番号付きリストのマーカー（bullet/ordered アイコン）
> からドラッグを始めると選択できない不具合。
>
> 原因: `@milkdown/components` の `list-item-block` は、マーカーを囲む
> `.label-wrapper` の `pointerdown` で、チェックボックスかどうかに関わらず常に
> `preventDefault()` + `stopPropagation()` を呼ぶ。Pointer Events の仕様上、
> `pointerdown` を `preventDefault()` すると後続の互換 `mousedown` が発火しなくなり、
> `mousedown` を起点にする ProseMirror のネイティブなドラッグ選択が一切始まらない
> （マーカー上で mousedown → 別の位置まで動かして mouseup しても選択が空のまま）。
>
> 修正（`listMarkerDragFixPlugin.ts`）: bullet/ordered マーカーの `pointerdown` は
> capture フェーズで先取りして `stopPropagation()` し、component 側のハンドラに届く
> 前に伝播を止める（`preventDefault()` は呼ばない）。これにより後続の `mousedown` が
> 正常に発火し、ProseMirror が座標から最寄りのテキスト位置を解決してドラッグ選択を
> 開始できる。チェックボックスのマーカー（クリックでトグル、既存機能）は対象外とし、
> 挙動を変えない。

- **実ブラウザ: 箇条書き/番号付きリストのマーカーからドラッグ選択できる**
  - 箇条書きの bullet マーカーからドラッグを始めても選択できる
  - 番号付きリストの ordered マーカーからドラッグを始めても選択できる
  - （回帰確認）チェックボックスのマーカーはクリックで従来どおりトグルできる

### `test/browser/lists-tables/typedCheckboxConversion.test.ts`（8 件）

> 実ブラウザ回帰テスト: `- [ ] タスク` を1文字ずつ実際にタイプしてもチェックボックスの
> 見た目にならない不具合。
>
> ## バグ内容（2つ、独立して発生する）
>
> 1. `- ` を打つと段落が `bullet_list > list_item`（中身は空）へ変換されるが、
>    `blockPrefixEditPlugin`（Typora 風フォーカス展開）が即座に `- ` を実テキストとして
>    展開してしまう。続けて `[ ] ` をタイプしても、GFM の `wrapInTaskListInputRule`
>    （`^\[ \]\s$` にマッチする必要がある）が段落先頭の `^` にマッチできず、
>    チェックボックスへ変換されない。
> 2. 1 を塞いだ後も、`checked: null → boolean` の変換が Milkdown の `list-item-block`
>    Web Component を再マウントさせ、ブラウザのネイティブ selection を見失わせる。
>    直後に届く selectionchange 由来の transaction でカーソルが別ブロック（多くの場合
>    見出しなど）へ飛び、続けてタイプした文字がそちらに書き込まれてしまう。
>
> 詳細設計: docs/specifications/fixes/typed-checkbox-conversion-fix.md
>
> 既存のマークダウンを読み込んだ場合（初期ロード）は問題無い。実際にキーを1つずつ
> 押して作る場合にだけ再現するため、`h.type()`（実キーイベント）で検証する。
>
> 実行: `npm run test:browser`。ブラウザが無い環境では skip。

- **実ブラウザ: タイプによるチェックボックス変換の回帰**
  - "- [ ] task" を1文字ずつタイプするとチェックボックスになる
  - "* [ ] task"（アスタリスクマーカー）でもチェックボックスになる
  - "+ [ ] task"（プラスマーカー）でもチェックボックスになる
  - "- [x] task"（最初からチェック済み）は checked=true になる
  - "1. [ ] task"（番号付きリスト内）でもチェックボックスになる
  - 日本語本文（"- [ ] 買い物"）でもチェックボックスになる
  - 上に既存の箇条書きがあっても、タイプしたチェックボックスは独立して変換される
  - 見出しの直後でタイプしても、見出しへ文字が誤って書き込まれない（原因B）

### `test/browser/live/editing-core/documentFidelity.test.ts`（8 件）

> Live モード Phase 0 の受け入れテスト（実 Chromium）。
>
> requirements.md R1.1 / R1.2 の「ドキュメントは生 Markdown そのもの」「カーソルオフセットは
> 常にソースと 1:1」を、実ブラウザ上の本物の CodeMirror 6 で固定する。既存 Preview
> （Milkdown/ProseMirror）が往復変換で空行や記法を失ってきた問題を、Live モードでは
> 構造的に起こさないための最初の防壁。
>
> 受け入れ基準: requirements.md §6 の必須回帰テスト #1（バイト不変）。

- **Live モード: ドキュメント忠実性（実ブラウザ）**
  - 開いただけではドキュメントが1文字も変わらない
  - 連続する空行が失われない（往復変換をしていないことの証明）
  - 末尾の改行の有無がそのまま保たれる
  - カーソルを置いても（記法が展開されても）ドキュメントは変わらない
  - 記法の展開/収縮では host へ編集メッセージを送らない（Git 差分を汚さない）
  - 行末の End はソースの実長へ行く（隠れた記法ぶんズレない）
  - 隠れた記法の上を右矢印で1文字ずつ通過できる（まとめてスキップしない）
  - 文字を入力すると host へ差分（全体置換ではない）が送られる

### `test/browser/live/editing-core/liveKeymap.test.ts`（11 件）

> Live モードの Enter / Backspace / Tab / Home を、実 Chromium の実キー入力で固定する。
>
> 期待値は Obsidian 実測（obsidian-observed-spec.md §4）そのまま。
> **Backspace が記法解除しない**ことは既存 Preview / Raw モードと正反対の要件なので、
> ここで明示的にロックする（requirements.md R3.2・受け入れ基準 #4）。

- **Live モード: キー操作（実ブラウザ）**
  - **Enter**
    - リスト項目の行末で Enter すると次の項目ができる
    - 空のリスト項目で Enter するとマーカーだけ消えて行は増えない
    - 番号リストは次の番号を自動採番する
    - チェック済み項目で Enter すると新項目は未チェックで始まる
    - 引用行の行末で Enter すると "> " を継続する
    - 見出しの行末で Enter してもプレフィックスを引き継がない
  - **Backspace（記法解除をしない）**
      - ${name}で Backspace しても素の1文字削除になる
  - **Home（スマートホームはリスト系のみ）**
    - リスト行では 本文先頭 → 行頭 の2段階になる
    - 見出し行では一気に行頭へ行く
  - **Tab / Shift+Tab**
    - リスト項目で Tab するとインデントされる
    - ネスト項目で Shift+Tab するとアウトデントされる

### `test/browser/live/external-sync/diffGutter.test.ts`（9 件）

> Git 差分ガター（Phase 6b）の描画を実 Chromium で固定する。
>
> 最重要の不変条件は requirements.md 受け入れ基準 #9:
>   **記法の展開/収縮ではドキュメントが変わらないので、カーソルを動かしただけで
>   差分が変化してはならない。** 既存 Preview はここで実際に不具合を出している
>   （`63d6074`: フォーカス展開しただけで青バーが立つ）。

- **Live モード: Git 差分ガター（実ブラウザ）**
  - HEAD を受け取るまでは何も表示しない
  - HEAD と同じなら何も表示しない
  - 変更した行に青（modified）のバーが立つ
  - 追加した行に緑（added）のバーが立つ
  - 削除された位置に赤いマーカーが出る
  - git 管理外（HEAD が null）なら全行が追加扱い
  - 記法の展開/収縮では差分が変わらない（受け入れ基準 #9）
  - 実際に編集した行だけが差分になる
  - 畳まれた表の行にも差分が出る

### `test/browser/live/focus-expand/tokenReveal.test.ts`（12 件）

> Live モードの「カーソル位置で記法が出入りする」挙動を、実 Chromium の実 DOM で固定する。
>
> 期待値は Obsidian 1.13.4 の実測（obsidian-observed-spec.md §1・§2）そのまま。
> 純関数テスト（test/suite/live/focus-expand/revealScope.test.ts）は判定式を守るが、
> 「本当に DOM から文字が消えているか」はここでしか分からない。
>
> 受け入れ基準: requirements.md §6 の必須回帰テスト #2（トークン境界）#3（blur で全収縮）。

- **Live モード: カーソル位置による記法の展開/収縮（実ブラウザ）**
  - カーソルが無い行では記法文字が DOM から消える
  - 太字トークンの内側にカーソルを置くとその太字だけ展開する
  - トークンの1つ手前（from-1）では展開しない
  - トークンの開始位置（from）では展開する
  - 閉じ記号の直後（to）でも展開する
  - to の1つ先（to+1）では収縮に戻る
  - 見出しは行のどこにカーソルがあっても "# " が出る（行スコープ）
  - 見出し行を離れると "# " が消える
  - blur すると展開していた記法がすべて収縮する
  - 選択が複数のトークンにまたがると、またいだものはすべて展開する
  - リンクは収縮時に URL が消えて表示テキストだけになる
  - コードフェンスの中の "**" は展開対象にならない

### `test/browser/live/ime/composition.test.ts`（4 件）

> 日本語 IME（composition）中の挙動を実 Chromium で固定する。
>
> requirements.md R4.6:
>   変換中は展開/収縮の再計算を行わず、確定後に1回だけ再計算する。変換中に
>   カーソルが飛ばないこと。
>
> decoration を毎キーストローク作り直すと、変換中の DOM をエディタ側が差し替えて
> しまい、未確定文字列が消える・カーソルが行頭へ飛ぶといった典型的な不具合が出る。
> ここでは CDP の `Input.imeSetComposition` で**実際の composition イベント**を発生させて
> 検証する（jsdom では再現できない）。

- **Live モード: 日本語 IME（実ブラウザ）**
  - 変換中の文字列が消えず、確定するとその位置に入る
  - 記法のある行で変換してもカーソルが飛ばない
  - 変換中は記法の再計算をしない（確定後に反映される）
  - 変換確定後に記法が正しく収縮する

### `test/browser/live/lists-tables/listRendering.test.ts`（9 件）

> リスト・チェックボックス・引用の描画を実 Chromium で固定する。
>
> Obsidian 実測（obsidian-observed-spec.md §2.3〜§2.5）の要点:
>   - 箇条書きの "-" と引用の ">" は**文字を消さず透明化して幅を残す**。
>     したがって画面上の textContent には "-" や ">" が残っており、
>     カーソルの桁もソースと 1:1 のままになる。
>   - チェックボックスは "- [ ]" の5文字が `<input type=checkbox>` に置換され、
>     カーソルがオフセット 0〜5 に入ったときだけ生テキストへ戻る。
>
> 受け入れ基準: requirements.md §6 #10（Home 2段階の前提となる "-" の実在）。

- **Live モード: リスト・引用・チェックボックスの描画（実ブラウザ）**
  - 箇条書きの "-" は消さずに透明化する（カーソルが無くても文字は DOM に残る）
  - カーソルを箇条書き行に置いても表示は変わらない（常時変換）
  - 引用の ">" も透明化して残す
  - チェックボックスは "- [ ]" が input に置換される
  - チェックボックスのトークン内（0〜5）にカーソルを置くと生テキストに戻る
  - チェックボックスをクリックするとソースの [ ] が [x] になる
  - チェック済みをクリックすると未チェックに戻る
  - 番号リストの数字はそのまま表示される
  - 引用の中の太字も通常どおり収縮する

### `test/browser/live/lists-tables/tableCellEdit.test.ts`（14 件）

> Phase 4b: 表のセル内直接編集を実 Chromium で固定する。
>
> Obsidian 実測（obsidian-observed-spec.md §2.8）では、表は**常時レンダリング**され、
> カーソルが表の中にあってもパイプ記法の生表示に戻らない。編集はレンダリングされた
> セルの中で行う。Phase 4 ではブロックスコープ（カーソルを入れると生表示）で暫定実装
> していたが、ここで Obsidian と同じ「畳んだまま編集」に揃える。
>
> セルの範囲が1文字でもズレると入力が隣のセルへ入りドキュメントが壊れるため、
> 「入力した文字が正しいセルに入る」ことを複数のセルで確認する。

- **Live モード: 表のセル内編集（実ブラウザ）**
  - カーソルが表の行にあっても生のパイプ記法に戻らない
  - セルは編集可能になっている
  - 先頭セルに入力するとソースの該当セルだけが変わる
  - 2つ目以降のセルに入力しても位置がズレない
  - 本文行のセルにも入力できる
  - 連続して入力してもセルの範囲がズレない
  - あるセルを編集した後に別のセルを編集しても正しい位置に入る
  - Tab で次のセルへ移動する
  - Shift+Tab で前のセルへ移動する
  - セル内で Enter しても改行が入らず表が壊れない
  - セルの中のインライン記法は装飾されて表示される（記法文字は出ない）
  - セルにフォーカスすると生の Markdown に戻り、外すと再び装飾される
  - 装飾されたセルを編集してもソースの記法が壊れない
  - セル編集は差分として host へ送られる（全体置換しない）

### `test/browser/live/rendering/blockRendering.test.ts`（11 件）

> コードフェンス・表の描画と、背景が常に白であることを実 Chromium で固定する。
>
> 背景の要件はユーザー指示（2026-08-05）:
>   「そこの md ファイルの背景だけ常に白になるようにして欲しい」
> すなわち VS Code / Cursor のテーマがダークでも、Live の編集エリアだけは
> 白い紙のように見せる。テーマ変数に依存していないことをここでロックする。

- **Live モード: ブロック要素の描画（実ブラウザ）**
  - **背景（常に白）**
    - エディタの背景はテーマに関係なく白
    - 本文の文字色は白背景で読める暗い色
  - **コードフェンス（ブロックスコープ）**
    - カーソルが外にあるとき開始フェンスは言語ラベルになる
    - カーソルが外にあるとき終了フェンスは空表示になる
    - コード本文にカーソルを置くと両方のフェンスが生テキストに戻る
    - ブロック全体に背景が付く
    - コード本文の記法は装飾されない
  - **表**
    - カーソルが外にあるとき実 table として描画される
    - 区切り行は描画されない
    - 表の中にカーソルを置いても畳まれたまま（Phase 4b でセル内編集に変更）
    - 表を描画してもドキュメントは変わらない

### `test/browser/live/rendering/lineNumberGutter.test.ts`（7 件）

> Live モードの行番号ガターを実 Chromium で固定する。
>
> Obsidian 実測（obsidian-observed-spec.md §5）:
>   行番号は**視覚行に1対1**で対応し、ウィジェットに畳まれたブロック（表・コールアウト・
>   数式ブロック）はその**先頭のソース行番号だけ**を表示する。中間行の番号は
>   「空欄」ではなく**表示自体が無くなる**。
>
> 設定 `markdownInline.live.showLineNumbers` で出し分ける。

- **Live モード: 行番号ガター（実ブラウザ）**
  - 設定が有効なら行番号が出る
  - 設定が無効なら行番号は出ない
  - 畳まれた表は先頭のソース行番号だけを表示する（中間行の番号は出ない）
  - 表にカーソルを入れても畳まれたままなので行番号は変わらない（Phase 4b）
  - コールアウトにカーソルを入れて展開すると中間行の番号も戻る
  - 畳まれたコールアウトも先頭のソース行番号だけを表示する
  - 行番号は Raw モードと同じ実ソース行番号（記法の収縮でズレない）

### `test/browser/live/rendering/phase5Rendering.test.ts`（14 件）

> Phase 5（水平線・数式・コールアウト・画像・frontmatter）の描画を実 Chromium で固定する。
>
> 期待値は Obsidian 実測（obsidian-observed-spec.md §2.6・§2.9〜§2.11）。
> 数式ブロックは実測どおり「展開中もソースの下に描画結果を併記する」ところまで再現する。

- **Live モード: Phase 5 の描画（実ブラウザ）**
  - **水平線（行スコープ）**
    - カーソルが他の行にあるときは罫線として描かれる
    - その行にカーソルを置くと生の "---" に戻る
  - **数式ブロック（常にソース + 下にプレビュー）**
    - カーソルが外にあってもソースが見えたままで、下に KaTeX が出る
    - ブロックの中にカーソルを置いても表示は変わらない
    - 数式ブロックの行はコードブロックと同じ背景で編集しやすくする
    - 壊れた数式でもエディタが落ちない
  - **インライン数式（トークンスコープ）**
    - カーソルが外にあるとき KaTeX で描画される
    - トークンの中にカーソルを置くと生テキストに戻る
  - **コールアウト（ブロックスコープ）**
    - カーソルが外にあるときボックスとして描かれる
    - ブロックの中にカーソルを置くと素の引用行に戻る
  - **画像（トークンスコープ）**
    - カーソルが外にあるとき img として描画される
    - トークンの中にカーソルを置くと生テキストに戻る
  - **frontmatter（生表示のまま）**
    - YAML はそのまま表示され、専用の背景が付く
    - 先頭の "---" を水平線にしない

### `test/browser/live/rendering/typography.test.ts`（12 件）

> Live モードの「読みやすさ」を実 Chromium で固定する。
>
> ユーザー報告（2026-08-05）: 「引用が見えていなかったり、全体的に見た目がチープ」。
> 見た目は主観だが、**チープに見える原因は数値で押さえられる**ものが多い:
>   - 行間が詰まっている（line-height が 1.5 未満）
>   - 本文が画面幅いっぱいに広がる（読み幅の上限が無い）
>   - 見出しの前後に余白が無く、本文と同じ塊に見える
>   - 引用の罫線が薄すぎて背景と区別がつかない／本文が薄すぎて読めない
>   - チェックボックス行だけ本文の開始位置が箇条書きとずれる
> ここではその数値をテストにして、以後の変更で退行しないようにする。

- **Live モード: 読みやすさ（実ブラウザ）**
  - **本文の組版**
    - 行間は 1.5 以上ある（詰まって見えない）
    - 読み幅に上限があり、画面幅いっぱいに広がらない
    - 本文と背景のコントラストは十分にある
  - **見出し**
    - 見出しの上に本文より広い余白が入る
    - H1 と H2 の大きさに差がある
  - **引用（ユーザー報告: 見えていない）**
    - 左罫線が背景とはっきり区別できる
    - 引用の本文が薄すぎない（本文と同等に読める）
    - 引用ブロックに背景色が付いて塊として見える
  - **リストの見た目**
    - 箇条書きの点が背景とはっきり区別できる
  - **リストの揃え**
    - チェックボックス行の本文開始位置が箇条書き行と揃う
  - **コードブロック・表の仕上げ**
    - コードブロックは等幅フォントで背景と枠がある
    - 表のセルに十分なパディングがある

### `test/browser/live/usage-flows/performance.test.ts`（3 件）

> 大きなファイルでの応答性を実 Chromium で固定する。
>
> requirements.md §5:
>   1万行のファイルを開いて操作可能になるまで 1 秒以内 / 入力から描画まで 1 フレーム。
>
> decoration を StateField で供給している都合上、素朴に書くと**カーソルを動かすたびに
> 文書全体を再走査**してしまう。ここは実測値でしか守れないので、実ブラウザで測る。
> 閾値は環境差を見込んで要件より緩めてあるが、「毎回フルスキャン」に戻ると
> 確実に超える水準にしてある（退行検出が目的なので、これ以上緩めないこと）。

- **Live モード: 大きなファイルでの応答性（実ブラウザ）**
  - 1万行のファイルを2秒以内に開ける
  - 1万行でもカーソル移動が 60ms 以内に終わる（毎回フルスキャンしていない）
  - 1万行でも1文字の入力が 80ms 以内に終わる

### `test/browser/rendering/blankLineDisplay.test.ts`（10 件）

> 実ブラウザ回帰テスト（本番バンドル）: ソース Markdown の空行と、Preview 上に見える
> 空行ブロックの本数の対応を固定する。
>
> ## 仕様（2026-07-26 ユーザー指示で確定）
>
> **ソースの空行 N 行 → Preview 上でも見える空行 N 行**（1:1）。省略しない。
>
> Preview の段落は CSS で `margin: 0`（`media/milkdown-preview.css`）なので、空行を
> 空 paragraph として実体化しない限り、その行は画面上のどこにも現れず、左ガターの
> 行番号もその行を飛ばす。実際、一度「空行1行は普通の段落区切りだから追加ノード無し
> （N 行 → N-1 個）」へ変更したところ、`## 見出し` の下の空行3行が2行しか表示されず
> ガター番号が `1, 3, 4, 5` と 2 を飛ばす状態になり、ユーザー報告で差し戻した。
> Raw と Preview の行が 1:1 で対応することを優先する。
>
> ここでは「空行 N 行 → 見える空行ブロック N 個」「ガター番号が Raw と同じ連番になる」、
> および Enter → Markdown 自動変換（`hardbreakLine.ts` の分割）の結果が、同じ内容を
> 開き直したときの見え方と一致することを、実 DOM と保存 Markdown の両方で固定する。
>
> 実行: `npm run test:browser`。ブラウザが無い環境では skip。

- **実ブラウザ: 空行の表示本数（ソースの空行を省略しない）**
  - 空行1行で区切られた2段落は、その空行ぶんの空ブロックを1つ表示する
  - 空行2行なら、Preview に見える空行ブロックが2つ現れる
  - 見出しの下に空行が3行あると、ガター番号は 1,2,3,4,5 と Raw と同じ連番になる
  - 空行1行の文書を編集して保存しても、空行は1行のまま増えない
  - Enter の直後に見出し記法へ自動変換しても、保存される空行は1行のまま
  - 先頭が空行で始まる本文でも、その空行が Preview に1ブロックとして現れる
  - 先頭が空行の文書は、ガター番号が Raw と同じ 1,2,3,4 になる
  - 先頭が空行の文書を編集して保存しても、先頭の空行が消えない
  - 末尾に空行が続く文書を編集して保存しても、末尾の空行が消えない
  - Enter の直後に箇条書き記法へ自動変換しても、保存される空行は1行のまま

### `test/browser/rendering/frontmatterPanel.test.ts`（4 件）

> 実ブラウザ・仕様カバレッジテスト: frontmatter パネルの表示。
>
> preview-features.md の frontmatter サポート（`showFrontmatter`）で、YAML frontmatter が
> 本文とは分離された上部パネル（#frontmatter-panel）に key/value 表示されることを
> 実 DOM で検証する（spec-test-coverage.md ギャップ 3）。
> これまで YAML パース（test/suite/shared/frontmatter）のみで、パネル表示は未検証だった。
>
> 実行: `npm run test:browser`。ブラウザが無い環境では skip。

- **実ブラウザ: frontmatter パネル**
  - showFrontmatter: true なら frontmatter が上部パネルに key/value 表示され、本文には混ざらない
  - showFrontmatter: false なら frontmatter があってもパネルは非表示
  - 外部編集（update メッセージ）で frontmatter が変わるとパネルも追従する
  - frontmatter が無いファイルではパネルは出ない（showFrontmatter: true でも）

### `test/browser/rendering/inlineCodeAppearance.test.ts`（3 件）

> 実ブラウザ回帰テスト: インラインコード（`` `code` ``）の見た目を Raw（インラインプレビュー）に揃える。
>
> ## 背景
>
> ユーザー要望（2026-07-27）: 「`` の部分がほぼ inline preview と一緒になるようにして
> ほしい」。Raw モード（CodeMirror + VS Code のテーマ）のインラインコードは
> **背景チップを持たず、テーマのコード色（`textPreformat.foreground` 相当）が付いた等幅
> テキスト**として見える。一方 Preview は角丸グレーのチップ（背景 + padding）で描画して
> いたため、同じファイルをモード切替すると印象が大きく変わっていた。
>
> ここでは Preview 側のインラインコードから背景チップを外し、Raw と同じ「色 + 等幅」だけの
> 表現になっていることを実 Chromium の computed style で固定する。
> コードブロック（`pre`）の背景は対象外（ブロック要素としての区別に必要なので残す）。

- **実ブラウザ: インラインコードの見た目が Raw と揃っている**
  - インラインコードにグレーのチップ背景が付かない
  - インラインコードは等幅フォントとテーマのコード色で描画される
  - コードブロック（pre）の背景は従来どおり残る

### `test/browser/rendering/lineNumberGutter.test.ts`（22 件）

> 実ブラウザ回帰テスト: 行番号ガター（lineNumberGutterPlugin）。
>
> 各トップレベルブロック（＋リスト項目）の左に「ソース Markdown 上の実際の行番号」を出す機能。
> - 設定 showLineNumbers が true のときだけ表示する。
> - 番号は Raw モード（CodeMirror）が表示する行番号と一致する（blank-line-preservation.md 3節）。
>   1, 2, 3, ... の連番ではなく、実ソースの何行目かを示す。
> - 表（table）・コードブロック（code_block）のように複数の物理行にまたがるブロックは、
>   1ブロックにつき1番号ではなく、実際に表示される行ごとに1番号を出す（同 4節）。
>   表のアラインメント区切り行（`:---|:---`）は対応する行が描画されないため番号も出ない。
> - ソースの空行は blankLineRemarkPlugin により実体のある空 paragraph としてトップレベルに
>   復元表示され、そこにも自分自身の実際の空行の行番号が出る（空行と Preview 上の行は 1:1。
>   blank-line-preservation.md §1・§10）。
> - 既存の diff ガターと共存する（別レイヤ）。
>
> jsdom では座標・widget 描画の組み合わせを検証できないため、ここが砦。
> 実行: `npm run test:browser`。ブラウザが無い環境では skip。

- **実ブラウザ: 行番号ガター**
  - showLineNumbers=false のときは行番号を表示しない
  - showLineNumbers=true で各ブロックに実ソース行番号が出る
  - 新規空ページの編集用プレースホルダーには行番号を出さない
  - Rawの単一改行をPreviewでも改行表示し、改行後の行番号も出す
  - 段落内でEnterを連続で押しても、行番号は昇順のまま・後続ブロックより手前の番号にならない
  - 段落内でEnterを1回押した直後（まだ何も入力していない状態）でも、新しい行の行番号がすぐに表示される
  - 実ソース行番号が要素の並び順どおりに振られる（見出し/段落/リスト/コード/引用）
  - コードブロックの非フォーカス時も開閉フェンスとその行番号を表示する
  - リスト項目にフォーカスして記法展開（`2. ` の実テキスト挿入）中でも、行番号は実ソース行番号のまま変わらない
  - 引用にフォーカスして記法展開（`> ` の実テキスト挿入）中でも、行番号は実ソース行番号のまま変わらない
  - コードブロックが文書の先頭にあり、初期カーソルがその場でフォーカス（実テキスト展開）されても、行番号は実ソース行番号のまま変わらない
  - 内容自体が完全なフェンス形（```〜```）のコードブロックでも、非フォーカス時は外側フェンス widget が表示される（誤って消えない）
  - 水平線にも実ソース行番号が出る
  - リストは各項目に実ソース行番号が出る（先頭だけでない）
  - 番号付きリストも各項目に実ソース行番号が出る
  - 表は行（ヘッダ行＋各データ行）ごとに実ソース行番号が出る（区切り行は対象外）
  - コードブロックは物理行ごとに実ソース行番号が出る（空行を含む）
  - コードブロックの行番号も（pre の overflow に）クリップされず表示される
  - showToolbar: true のときも行番号が viewport 左端よりも右にある（クリップされない）
  - showLineNumbers: true のとき .milkdown に padding-left が付与されて行番号スペースが確保される
  - 行番号は差分色バーより左に離れて表示される
  - 空行スペーサーは自分自身の実ソース行番号を表示し、カーソルを置いて入力・Backspaceで削除できる

### `test/browser/rendering/mathRendering.test.ts`（10 件）

> 実ブラウザ・仕様カバレッジテスト: 数式（KaTeX）レンダリング。
>
> preview-features.md「リッチコンテンツ」の数式サポート（`enableMath`）が
> 実 Chromium で本当に描画されることを検証する（spec-test-coverage.md ギャップ 1）。
>
> 数式は `katex/contrib/auto-render` が Milkdown（ProseMirror）管理下の DOM を
> 直接書き換える方式のため、Mermaid で起きた「セレクタ不一致で一度も描画されない」
> 「ProseMirror の mutation observer に巻き戻される」系の退行が起きやすい。
> DOM に `.katex` が実在すること、編集後も保存 markdown に KaTeX の HTML が
> 混入しないこと（数式ソースが保たれること）まで確認する。
>
> 実行: `npm run test:browser`。ブラウザが無い環境では skip。

- **実ブラウザ: 数式（KaTeX）レンダリング**
  - enableMath: true でインライン数式 $E=mc^2$ が KaTeX で描画される
  - enableMath: true でブロック数式 $$...$$ が描画される
  - enableMath: false なら数式は描画されず、$ 記法がそのまま見える
  - 数式が描画された後に別の場所を編集しても、保存 markdown には数式ソースが保たれ KaTeX の HTML が混入しない
  - 数式を含む行そのものを編集しても文書が壊れない
  - インラインコード内の $...$ は数式化されず、コードとしてそのまま表示される
  - コードブロック内の $...$ は数式化されず、コードとしてそのまま表示される
  - "$ 100" のような $ 直後が空白の金額表記は数式化されない
  - ハードブレイクを挟んで $$ が分割される（複数行にまたがる）場合は数式として描画されず、ソースのまま残る
  - enableMath を設定メッセージで true → false → true と動的に切り替えると、都度すぐに反映される

### `test/browser/rendering/mediaEmbeds.test.ts`（4 件）

> 実ブラウザ・仕様カバレッジテスト: 動画・音声・webp 画像の埋め込み表示。
>
> `![alt](path)` という通常の Markdown 画像記法を、拡張子に応じて
> `<img>`（画像）/ `<video controls>`（動画）/ `<audio controls>`（音声）の
> いずれかで描画する（imageMediaView.ts / classifyMediaKind）。
>
> webp は元々 `<img>` へ変換する経路（markdownTransform.ts）が拡張子非依存のため
> 実は元から動作していたはずだが、明示的なテストが無かったので回帰防止として追加する。
> mp4/mp3 はこれまで `<img>` としてしか描画されず再生できなかった（新機能）。
>
> 実行: `npm run test:browser`。ブラウザが無い環境では skip。

- **実ブラウザ: 動画・音声・画像の埋め込み表示**
  - .mp4 は <video controls> で描画される
  - .mp3 は <audio controls> で描画される
  - .webp は引き続き <img> で描画される（既存動作の回帰防止）
  - 動画ノードを選択して Backspace で削除しても他のノードは壊れない

### `test/browser/rendering/mermaidNodeLabelEdit.test.ts`（5 件）

> 実ブラウザ回帰テスト: Preview 上の Mermaid 図を「見たまま」編集する。
>
> Mermaid の標準構文にはノードの座標（レイアウト）を保存する仕組みが無く、レイアウトは
> 常に Mermaid が自動計算するため、「図をドラッグして自由配置する」編集はソースへ
> 反映しようがない。そのため対応範囲を「ノードラベルのダブルクリック編集」に絞る:
> SVG 上のノードをダブルクリックするとインライン入力欄が現れ、確定すると
> ソースの ```mermaid コードブロック中の対応ノードのラベル文字列だけが書き換わり、
> 図も新しいラベルで再描画される。純粋な文字列置換ロジックは
> `src/preview/webview/mermaidNodeLabelEdit.ts`（`updateMermaidNodeLabel`）が担う。
>
> 実行: `npm run test:browser`。ブラウザが無い環境では skip。

- **実ブラウザ: Preview の Mermaid ノードラベルのダブルクリック編集**
  - 図のノードをダブルクリックすると、現在のラベルが入った入力欄が開く
  - 編集開始後にもう一度ダブルクリックしても編集欄は1つで図は崩れない
  - ラベルを書き換えて Enter で確定すると、ソースへ反映され図も新しいラベルで再描画される
  - Escape でキャンセルすると、ソースも図も変更されない
  - ラベルの無いベアノード（ID がそのままラベル）も編集して角括弧ラベルを付与できる

### `test/browser/rendering/mermaidRendering.test.ts`（2 件）

> 実ブラウザ回帰テスト: Preview モードでの Mermaid 図の描画。
>
> バグ1: ```mermaid コードブロックが図として描画されない。
> milkdown の code_block ノードは `<pre data-language="mermaid"><code>...</code></pre>`
> という DOM を生成する（`data-language` は `<pre>` 側の属性で、`<code>` に
> `language-mermaid` のような class は一切付かない）。旧実装は
> `pre code.language-mermaid` というセレクタでコードブロックを探しており、
> これは絶対にヒットしないため mermaid.render が呼ばれなかった。
>
> バグ2: セレクタを直しても、`pre.replaceWith(container)` で ProseMirror が
> 管理する contentDOM を直接書き換えると、MutationObserver が「自分が作って
> いない変更」とみなして再パースし、コードブロックが壊れてしまう
> （`codeHighlightPlugin.ts` のコメントにある教訓と同じ問題）。
>
> 修正: `mermaidDiagramPlugin.ts` で ProseMirror デコレーション（`Decoration.widget`）
> としてコードブロックの**直後**に図を挿入する方式にした。ソースの `<pre><code>` は
> そのまま残る（引き続き編集できる）ので、ソースの下に図が並んで表示される。
>
> 実行: `npm run test:browser`。ブラウザが無い環境では skip。

- **実ブラウザ: Preview の Mermaid 図描画**
  - ```mermaid コードブロックの下に SVG 図が描画される（ソースは編集可能なまま残る）
  - enableMermaid が false のときは図を描画しない

### `test/browser/rendering/mermaidTextSelection.test.ts`（2 件）

> 実ブラウザ回帰テスト: Mermaid 図（SVG）内テキストのマウスドラッグ選択・コピー。
>
> ユーザー報告「Mermaid図のテキストをコピーできるようにしてほしい」の調査で判明した
> バグ: Mermaid 図は `Decoration.widget`（`mermaidDiagramPlugin.ts`）として描画されるが、
> widget の spec に `ignoreSelection: true` を付けていなかったため、ProseMirror の
> `WidgetViewDesc.ignoreMutation`（`type: "selection"` のミューテーションは
> `widget.spec.ignoreSelection` が true の場合のみ無視する）がデフォルトの `false` を返し、
> widget 内でのネイティブ選択（selectionchange）を ProseMirror が「無視すべきでない変更」と
> みなして処理してしまい、結果としてドラッグ選択した内容が消えてしまっていた
> （詳細: docs/specifications/fixes/mermaid-text-selection-fix.md）。
>
> 実行: `npm run test:browser`。ブラウザが無い環境では skip。

- **実ブラウザ: Mermaid図内テキストの選択**
  - 図のノードラベルをマウスドラッグで選択でき、getSelection() にテキストが残る
  - 図の選択中もコードブロックの編集（打鍵）は通常どおり効く

### `test/browser/rendering/nestedFenceSerialization.test.ts`（6 件）

> 実ブラウザ回帰テスト: 内容自体が `` ``` `` を含むコードブロック（ネストフェンス）の直列化。
>
> ## 背景
>
> コードブロックの内容が `` ``` `` で始まる/終わる場合、保存 Markdown ではフェンスを
> 4 連バッククォートへ広げないと構造が壊れる。フォーカスしても Preview は記法を実テキスト
> として挿入しない（`docs/specifications/no-focus-expand.md`）ので、フォーカスの前後で
> 内容が変化しないこと、および編集しても外側フェンスが 4 連のまま維持されることを固定する。
>
> 実行: `npm run test:browser`。ブラウザが無い環境では skip。

- **実ブラウザ: ネストフェンスを含むコードブロックの直列化**
  - 内容の1行目が ``` で始まるコードブロックにフォーカスしても、同じフェンス行が二重に見えない
  - 内容の最終行が ``` のコードブロックでも、閉じフェンスが二重に見えない
  - 外側フェンスが4連バッククォートのブロックでは、表示されるフェンス行も4連になる
  - 通常のコードブロックの表示フェンスは3連バッククォートのまま
  - ネストフェンスのブロックは、フォーカス→離脱しても内容が変化せず change も送られない
  - ネストフェンスのブロック内を編集しても、保存 markdown では外側フェンスが4連バッククォートのまま維持される

### `test/browser/rendering/visualShowcase.test.ts`（6 件）

> 実ブラウザ「視覚確認」スクリーンショット撮影。
>
> 各種 Markdown を実バンドルでレンダリングしてスクリーンショットを test-screenshots/ に保存する。
> - 開発者（および AI）が画像を目視して、レイアウト崩れ・記号欠落・装飾の異常を発見する。
> - `HEADED=1 npm run test:browser` で実ブラウザ画面を見ながら実行できる。
>
> これ自体はアサーションが緩い（page error が無いことのみ）。視覚的退行の「観測点」を作るのが目的。

- **実ブラウザ: 視覚確認スクリーンショット**
  - 見出しレベル
  - リストとチェックボックス
  - インライン装飾
  - 引用とコードブロック
  - テーブル
  - 複合ドキュメント

### `test/browser/shortcuts/previewToolbar.test.ts`（16 件）

> 実ブラウザ回帰テスト: Preview ツールバーのレイアウト仕様 + ボタンの実クリック効果。
>
> ## 仕様
> - ツールバーは「スクロール可能な書式ボタン領域（左）」と「固定右端領域」に分かれる。
> - 書式ボタン（Undo/Redo/H1–H3/チェックボックス/箇条書き/番号付き/引用/コード/テーブル）は
>   `.preview-toolbar-scroll` 内に配置され、幅が足りないときは横スクロールで辿れる。
> - Zoom / Export / Raw-Preview 切り替えは `.preview-toolbar-fixed` 内に固定表示し、
>   スクロール対象外とする。
> - `showLineNumbers: true` のときも行番号ガターはツールバーの影に隠れず表示される。
> - ボタンをクリックすると実際にドキュメントが変わる（従来 DOM レイアウトのみ検証しており
>   クリックの実効果は未検証だったギャップを埋める。preview-usage-flow-test-backlog.md §4.2）。
> - `toolbarShowShortcuts` によりホバーツールチップのショートカットキー表示が切り替わる。
>
> 実行: `npm run test:browser`。ブラウザが無い環境では skip。

- **実ブラウザ: Preview ツールバー レイアウト**
  - .preview-toolbar-scroll が存在し overflow-x が auto/scroll である
  - .preview-toolbar-fixed が存在する
  - H1/H2/H3 ボタンは .preview-toolbar-scroll 内にある
  - Undo/Redo ボタンは .preview-toolbar-scroll 内にある
  - Export ボタンは .preview-toolbar-fixed 内にある
  - Raw/Preview トグルグループは .preview-toolbar-fixed 内にある
  - Zoom グループは .preview-toolbar-fixed 内にある
  - viewport が 400px でも .preview-toolbar-fixed は visible 範囲内にある
  - showToolbar + showLineNumbers の両方が有効でも行番号が visible 範囲で表示される
  - showToolbar: true のとき .preview-toolbar-scroll 内が横スクロール可能（スクロール幅 > 表示幅で確認）
  - H2 ボタンをクリックすると段落が見出し(H2)に変わる
  - 箇条書きボタンをクリックすると段落が bullet_list に変わる
  - 引用ボタンをクリックすると段落が blockquote に変わる
  - Undo ボタンをクリックすると直前の変換が取り消される
  - toolbarShowShortcuts: false のときホバーツールチップにショートカットキー表示が出ない
  - toolbarShowShortcuts: true（既定）のときホバーツールチップにショートカットキーが表示される

### `test/browser/shortcuts/selectAllBrackets.test.ts`（4 件）

> 実ブラウザ回帰テスト: Cmd+A 段階選択の「括弧の中身」優先段階を、
> **ビルド済みの実 webview バンドル**（media/milkdown.bundle.js）に対して実キー操作で検証する。
>
> test/webview（jsdom）はソースの .ts を直接 esbuild でバンドルしてテストするため、
> `npm run build:webview` を忘れて media/milkdown.bundle.js が古いままでも green になり得る
> （実際にこの抜け穴で本番バンドルへの反映漏れが一度発生した）。ここでは実際に VS Code の
> Preview が読み込むファイルそのものを実 Chromium にロードし、実 Meta+a キー入力で検証する。
>
> 実行: `npm run test:browser`。ブラウザが無い環境では skip。

- **実ブラウザ: Cmd+A 括弧の中身優先選択（本番バンドル）**
  - 丸括弧の中にカーソルがあれば1回目のCmd+Aで括弧の中身だけを選択する
  - 角括弧の中にカーソルがあれば1回目のCmd+Aで括弧の中身だけを選択する
  - 括弧の中身→行全体→文書全体と3回のCmd+Aで段階的に広がる
  - ネストした括弧では最も内側の中身を1回目のCmd+Aで選択する

### `test/browser/shortcuts/selectAllCodeFence.test.ts`（3 件）

> 実ブラウザ回帰テスト（本番バンドル）: フォーカス中のコードブロックで Cmd/Ctrl+A したとき、
> `codeFenceEditPlugin` が実テキストとして挿入した開き/閉じフェンス（```lang` / ```）を
> 選択範囲に含めない。
>
> ## 背景
>
> `codeFenceEditPlugin.ts` はフォーカス中のコードブロックの開き・閉じフェンスを実テキスト
> として挿入する（`code-fence-real-text-edit-fix.md`）。`previewKeymapPlugin.ts` の
> `handleSelectAll` は `code_block` 内では `$from.start(depth)`〜`$from.end(depth)`
> （ノードの中身全体）を選択していたため、フォーカス中はこの実テキスト化されたフェンスも
> 選択に含まれてしまい、ユーザーが Cmd+A → コピー したときにコード本文だけでなく
> ```` ```lang ```` 〜 ```` ``` ```` まで含まれてしまっていた（ユーザー報告）。
>
> 実行: `npm run test:browser`。ブラウザが無い環境では skip。

- **実ブラウザ: コードブロックの Cmd+A がフェンス自体を選択に含まない**
  - コードブロック内の Cmd+A はコード本文だけを選択する（記法は本文に無い）
  - コードブロック内の Cmd+A で、表示用フェンス行が選択のハイライトに入らない（開き・閉じとも）
  - コードブロック内の Cmd+A → もう一度で文書全体になる（段階選択が壊れない）

### `test/browser/shortcuts/slashMenuDom.test.ts`（6 件）

> 実ブラウザ・仕様カバレッジテスト: Preview スラッシュメニューの実 DOM 操作。
>
> preview-features.md「スラッシュメニュー（Preview）」の一連の操作
> （`/` で開く → 文字で絞り込む → Enter で確定 / Escape で閉じる）を
> 実 Chromium の実キー入力で検証する（spec-test-coverage.md ギャップ 2）。
> これまで項目定義（slashMenuItems）と適用ロジック（applyPreviewSlash）の
> ユニットテストしか無く、「メニューが実際に画面に出て操作できる」ことは未検証だった。
>
> 実行: `npm run test:browser`。ブラウザが無い環境では skip。

- **実ブラウザ: Preview スラッシュメニューの DOM 操作**
  - 空行で "/" をタイプするとメニューが開き、全コマンドが並ぶ
  - "/todo" と絞り込むと todo だけが残り、Enter で空のチェックボックス項目になる
  - "/h2" を Enter で確定して見出しを作り、続けてタイトルを入力できる
  - Escape でメニューが閉じ、打った "/" テキストはそのまま残る
  - ArrowDown で選択位置が移動し、その項目が Enter で適用される
  - enableSlashMenu: false なら "/" をタイプしてもメニューは開かない

### `test/browser/usage-flows/usageFlows.test.ts`（15 件）

> 実ブラウザ・ユースケーステスト: ユーザーが Markdown メモを書くときの**日常的な操作フロー**を
> そのまま実キー入力で再現し、「この操作をしたら、こう動く」を保証する。
>
> docs/testing/preview-usage-flow-test-backlog.md のバックログを消化するテスト群。
> 個別のバグ再現ではなく、次のような「実際に毎日起きる操作の連なり」を対象にする:
>
>   - 買い物リストを一気に書き出す（チェックボックス + Enter の高速反復）
>   - 会議メモ（見出し → チェックリスト → 見出し → チェックリスト）
>   - 普通の箇条書きとチェックボックスを同じリスト内に混在させる
>   - 書いた行の選択削除 → Undo、段落の分割 → 結合、といった編集の往復
>   - テーブルセル内での誤操作（チェックボックス記法）でも壊れないこと
>
> いずれの操作でも (1) 文書構造が期待通り、(2) カーソルが意図した場所に残る、
> (3) page error が発生しない、の 3 点を検証する。
>
> 実行: `npm run test:browser`。ブラウザが無い環境では skip。

- **実ブラウザ: 実利用フロー（日常操作のユースケース）**
  - **チェックリスト作成フロー**
    - 買い物リストを一気に書き出す（チェックボックス + Enter の反復）と全項目が未チェックで並ぶ
    - 普通の箇条書きの下にチェックボックスを続けると、同じリスト内に checked=null と checked=false が混在する
    - 会議メモの流れ（見出し → チェックリスト → 見出し → チェックリスト）を連続で作れる
    - リストを抜けて2つ目のチェックボックスを素早く作っても、カーソルは2つ目の項目に残る
    - 文書の一番先頭（上に何も無い）でもチェックボックスを作れる
    - チェックボックス変換の直後に Cmd+Z すると、内容の Undo になる（カーソル復元だけで終わらない）
    - マーカーを打ちかけて別の文字を入力し、Backspace で戻ってから完成させてもチェックボックスになる
    - チェックボックス入力後にフォーカスを外して戻っても、続きは同じ項目に入力される
  - **編集の往復**
    - チェック済み/未チェックの行をまとめて選択削除 → Undo で checked 状態ごと復元される
    - 段落の途中で Enter すると同じ段落内の改行(hardbreak)になり、Backspace で1行に戻る
    - 見出しの末尾で Enter すると、次の行は本文（段落）になり見出しは汚れない
    - 箇条書き項目の途中で Enter すると項目が2つに分割される
  - **テーブルでの境界操作**
    - テーブルセルの先頭でチェックボックス記法を打っても、ただの文字列として扱われテーブルは壊れない
  - **コピー & ペースト**
    - チェックボックス項目をコピーして別の場所にペーストすると、同じ内容の未チェック項目として挿入される
    - チェックボックスをペーストした直後に別の行で [ ] を追記しても、両方の項目が正しいまま残る

## 3. webview 統合（jsdom + Milkdown 実エディタ）— すべて Preview — 210 件

実行: `npm run test:unit`

jsdom 上で Milkdown エディタを実際に組み立てて、ドキュメント変換・シリアライズを検証する。配下は browser/ と同じ症状カテゴリで分類。

### `test/webview/cursor-focus/cursorAnchor.integration.test.ts`（4 件）

> Preview（ProseMirror）側のカーソル ⇄ ブロックアンカー変換の統合テスト。
> Raw ⇄ Preview のカーソル引き継ぎの中核（往復で同じ位置に戻ること）。

- **webview統合: カーソル ⇄ ブロックアンカー**
  - 2 番目の段落のカーソルは block=2, offset=その位置
  - アンカー → カーソル復元で元の位置に戻る（往復）
  - オフセットが行末を超えてもクランプして落ちない
  - 範囲外ブロックはクランプ（最後のブロックへ）

### `test/webview/cursor-focus/focusSyntaxMarker.test.ts`（5 件）

> フォーカス時の行内記法マーカー（`**` 等）の装飾要素のテスト。
>
> 回帰防止の主眼: マーカー `<span>` が `contenteditable="false"` であること。
> これが無いとエディタから contenteditable=true を継承し、矢印キーのキャレットが
> マーカー文字の中に入り込んで「これ以上右に行けない」状態になる。

- **focusSyntax: 行内記法マーカー要素**
  - contenteditable="false"（キャレットが入り込まない）
  - クラス・本文・aria-hidden が正しい
- **focusSyntax: マーカークリック位置ナビゲーション**
  - createSyntaxMarkerElement は data-pm-pos を持たない（位置は widget 生成時に付与）
  - mkMarker 相当: dataset.pmPos をセットした要素はクリック位置として使える
  - data-pm-pos が数値として正しくパースできる

### `test/webview/editing-core/blankLines.integration.test.ts`（3 件）

> 段落間の空行が Preview で保持されることの統合テスト。
> 「`A\n\nB` の空行が preview に入る（= 空 paragraph として読み込まれ、空行ぶんの高さが出る）」の回帰防止。
>
> 空行は blankLineRemarkPlugin により本数分の空 paragraph が実体として復元される
> （blank-line-preservation.md）。

- **webview統合: 段落間の空行の保持**
  - 空行で区切られた `A\\n\\nB` は空 paragraph を含む 3 段落として読み込まれる
  - 単一改行 `A\\nB`（ソフトブレイク）は 1 段落のまま
  - 複数の空行はその本数ぶんの空 paragraph が復元される（3行なら計5段落）

### `test/webview/editing-core/checkboxEditDelete.test.ts`（7 件）

> チェックボックス（タスクリスト）項目の Enter 継続以外の編集操作
> （文中 Enter による分割・Delete によるマージ・テキスト編集・
> インデント/アウトデント・複数項目にまたがる選択削除）を検証する。
> `checkboxEnter.test.ts` は行末 Enter のみを扱うため、それ以外の編集経路の
> `checked` 属性の扱いをここで固定する。
>
> このファイルのハーネス（`milkdownHarness.ts`）は `commonmark`/`gfm` プリセットのみで、
> `markerBackspace`/`blockPrefixEditPlugin` 等の実アプリのカスタムプラグインを含まない
> （list-item-block が jsdom で使えないため素の schema-list 既定動作の確認用）。
> そのため **「チェックボックス項目の行頭」での単発 Backspace** は本ファイルでは扱わない
> （markerBackspace が横取りする経路のため、素の ProseMirror 既定動作は実際のアプリ挙動と
> 異なる＝偽装カバレッジになる）。その経路は
> `test/webview/focus-expand/blockPrefixEdit.integration.test.ts`
> （`markerBackspace`+`blockPrefixEditPlugin` を両方ロードする専用ハーネス）で検証する。
> 範囲選択を伴う Backspace は markerBackspace が selection.empty で早期リターンするため
> ここでの検証で実挙動と一致する。

- **webview統合: チェックボックスの編集・削除・インデント**
  - チェック済み項目のテキスト中央で Enter して分割すると、新項目は未チェックになる
  - チェックボックス項目末尾での Delete は後続の通常段落を同じリストの新規項目として取り込む
  - チェック済み項目のテキストを編集しても checked は反転しない
  - 未チェック項目のテキストを編集しても checked は反転しない
  - Tab でチェックボックス項目をインデントしても、各項目の checked は独立して保たれる
  - Shift+Tab でネストしたチェックボックス項目をアウトデントしても checked は保たれる
  - 2つのチェックボックス項目にまたがる範囲選択を削除しても、先頭項目の checked のまま1項目にマージされる

### `test/webview/editing-core/checkboxEnter.test.ts`（5 件）

> チェックボックス（タスクリスト）項目で Enter を押したときの継続テスト。
> `- [x]` で改行しても新しい項目は常に未チェック（`- [ ]`）になること。
> また空項目での Enter でリストを抜ける動作も検証する。

- **webview統合: チェックボックスの Enter 継続**
  - チェック済み項目で Enter → 新項目は未チェック
  - 未チェック項目で Enter → 新項目も未チェック
  - 通常の箇条書き（タスクでない）には関与しない
  - Enter 後の新チェックボックス項目は postChange 後も "[ ] " 構文を保持する
  - 空チェックボックスで Enter → リストを抜ける（2回 Enter でリスト離脱）

### `test/webview/editing-core/clipboardHardbreak.test.ts`（2 件）

> Preview でテーブルセル内の改行（hardbreak）を含む範囲をコピーすると、クリップボードの
> text/plain に markdown 用の `<br>` がそのまま入ってしまう不具合の回帰テスト。
>
> `overrideHardbreakSerializer` はセル内 hardbreak を保存用 markdown として `<br>` に
> するが、`@milkdown/plugin-clipboard` の既定 `clipboardTextSerializer` は
> コピー時にも同じ markdown シリアライザをそのまま使うため、他アプリへ貼り付けたときに
> 読める改行ではなく文字列 `<br>` が入ってしまう。

- **Preview: セル内改行を含む範囲のコピーで <br> が漏れない**
  - 表セル内の hardbreak を含む選択をコピーすると、clipboardTextSerializer の出力に <br> ではなく改行が入る
  - フォーカス中コードフェンスの実テキストをコピーしてもフェンスを二重化しない

### `test/webview/editing-core/codeBlockBackspace.integration.test.ts`（3 件）

> コードブロックの解除（先頭 Backspace → 段落）統合テスト。
> 「コードブロックの ``` を消せず編集できない」不具合の回帰防止。

- **webview統合: コードブロックの解除（先頭 Backspace）**
  - コードブロック先頭で Backspace → 段落に解除（中身は残る）
  - 先頭以外（中身の途中）では解除しない
  - codeBlockAtContentStart: 先頭なら depth>0、それ以外は -1

### `test/webview/editing-core/inlineFormatting.integration.test.ts`（5 件）

> インライン書式トグル（Cmd+B / Cmd+I）の統合テスト。
>
> テキストを選択して Cmd+B で太字、Cmd+I で斜体、もう一度押すと解除という
> 日常操作の回帰防止。commonmark プリセットのキーマップ（Mod-b / Mod-i）が
> ハーネスエディタ上で機能することを検証する。
>
> 注意: commonmark の keymap は prosemirror-keymap の `Mod` 解決に従う。jsdom では
> navigator.platform が "" のため `Mod` は Ctrl に解決される（Mac 実機では Cmd）。
> よってここでは ctrl 修飾で押下する（= 実機の Cmd/Ctrl 押下に相当）。

- **webview統合: インライン書式トグル (Cmd+B / Cmd+I)**
  - テキスト選択 + Cmd+B → 太字(strong)になる
  - 太字を選択して再度 Cmd+B → 太字が解除される
  - テキスト選択 + Cmd+I → 斜体(emphasis)になる
  - 斜体を選択して再度 Cmd+I → 斜体が解除される
  - 太字にしてから Cmd+I → 太字+斜体が共存する

### `test/webview/editing-core/inlineMarkBackspace.integration.test.ts`（5 件）

> インライン記法マーカーの削除（インラインコード等の解除）統合テスト。
>
> 「`` ` `` が消せず記法を解除できない（編集できない）」不具合の回帰防止。
> 実 Milkdown（jsdom）で、マーク範囲の端で Backspace/Delete するとそのマークが外れることを検証。

- **webview統合: インライン記法マーカーの削除**
  - インラインコードの末尾で Backspace → コード装飾が外れる（文字は残る）
  - インラインコードの先頭で Delete → コード装飾が外れる
  - 太字(strong)の末尾で Backspace → 太字が外れる
  - マーク中ほどでの Backspace は通常削除（マークは外さない）
  - マークが無い箇所では何もしない（null）

### `test/webview/editing-core/listEnter.integration.test.ts`（5 件）

> リスト項目での Enter（継続・離脱）の統合テスト。
>
> 日常操作の回帰防止:
>  - 箇条書き項目末尾の Enter → 新しい箇条書き項目
>  - 番号付き項目末尾の Enter → 次の番号の項目
>  - 空項目での Enter → リストを抜けて段落
>  - 項目途中での Enter → カーソル位置で項目分割

- **webview統合: リスト項目での Enter**
  - 箇条書き項目末尾で Enter → 項目が1つ増える
  - 番号付き項目末尾で Enter → 項目が増えリストを維持
  - 項目途中で Enter → カーソル位置で2項目に分割される
  - 空の箇条書き項目で Enter → リストを抜けて段落になる
  - 空の番号付き項目で Enter → リストを抜けて段落になる

### `test/webview/editing-core/markerBackspace.integration.test.ts`（10 件）

> 行頭マーカーの段階的削除（markerBackspace）統合テスト。
>
> 「`##` 等を一度に全部消すのではなく、Raw のように 1 段階ずつ外したい」要望の回帰防止。
> - 見出し: H2 → H1 → 段落
> - チェックボックス: `- [ ]` → 箇条書き → 段落
> - 箇条書き: → 段落

- **webview統合: 行頭マーカーの段階的削除（markerBackspace）**
  - 見出し H2 → Backspace で H1（1 段階だけ）
  - 見出し H1 → Backspace で段落（# は残さない、中身は残す）
  - H2 を 2 回 Backspace で「H1 → 段落」と段階的に降格
  - 行頭以外（見出しの途中）では降格しない
  - チェックボックス → Backspace で箇条書き（checked が外れる）
  - 空チェックボックス → Backspace 1回で空段落になり、行自体とカーソルを維持する
  - 箇条書き → Backspace で段落（リストから外れる）
  - チェックボックスは 2 回で「箇条書き → 段落」と段階的に外れる
  - 前に段落があってもカーソルはチェックボックスの行に残る（モデル契約）
  - リスト2番目のチェックボックスでもカーソルはその行に残る（モデル契約）

### `test/webview/editing-core/paragraphEnter.integration.test.ts`（5 件）

> 段落での Enter / Shift+Enter の統合テスト。
>
> 日常で最も多い操作（改行）の回帰防止:
>  - 段落末尾の Enter → 新しい空段落
>  - 段落途中の Enter → カーソル位置で分割
>  - Shift+Enter → 同一段落内のソフトブレイク（hardBreak）
>
> previewKeymapPlugin を載せたハーネスエディタで、DOM keydown を送って検証する。
> （Enter の段落分割自体は commonmark の baseKeymap が担うが、previewKeymapPlugin が
>  Enter を奪っていない＝通常の改行を妨げないことの回帰防止も兼ねる。）

- **webview統合: 段落での Enter / Shift+Enter**
  - 段落末尾で Enter → 段落を増やさず単一改行を1つ挿入する
  - 段落途中で Enter → 同じ段落内で単一改行になる
  - 段落先頭で Enter → 同じ段落の先頭に単一改行が入る
  - Shift+Enter → 段落は増えず、hardBreak が1つ挿入される
  - 空段落で Enter → 空段落を増やさず単一改行を挿入する

### `test/webview/editing-core/serializeRoundtrip.integration.test.ts`（15 件）

> Markdown 直列化 round-trip の統合テスト。
>
> Preview（Milkdown）で読み込んだ Markdown が、編集なしで直列化したときに
> 構造・記法を保ったまま出力されることを検証する。特に:
>  - 箇条書きマーカーが `-`（`*` ではない）で出力される（remarkStringifyOptionsCtx の bullet: '-'）
>  - GFM チェックボックス `- [ ]` / `- [x]`
>  - 強調・コード・取り消し線などのインライン記法
>
> milkdownApp.ts と同じ remarkStringifyOptionsCtx 設定を再現したエディタで検証する。

- **webview統合: Markdown 直列化 round-trip**
  - 見出し H1 が `# ` 形式で出力される
  - 見出し H3 が `### ` 形式で出力される
  - 箇条書きは `-` マーカーで出力される（`*` ではない）
  - `* item`（アスタリスク）を読み込んでも `-` に正規化される
  - 複数行の箇条書きがすべて `-` で出力される
  - 番号付きリストは `1.` 形式で出力される
  - 未チェックのタスク項目は `- [ ]` 形式で出力される
  - チェック済みのタスク項目は `- [x]` 形式で出力される
  - 太字 `**bold**` が保持される
  - インラインコード `` `code` `` が保持される
  - 取り消し線 `~~strike~~` が保持される
  - 引用 `> quote` が保持される
  - 段落間の空行が保持される（2段落のまま）
  - 言語付きコードブロックが ```lang フェンスで出力される
  - 複合構造（見出し+リスト+引用）が round-trip で崩れない

### `test/webview/editing-core/textEscape.test.ts`（5 件）

> テキストエスケープ無効化（disableTextEscape）の round-trip テスト。
> - Milkdown 既定では段落中の `[` 等が `\[` にエスケープされる。
> - disableTextEscape を適用すると、テキストは素のまま（バックスラッシュなし）で
>   シリアライズされ、Raw に戻しても汚れない。

- **テキストエスケープ無効化**
  - （前提）既定では段落中の `[` が `\\[` にエスケープされる
  - disableTextEscape で `[` `]` はエスケープされない
  - 配列風テキスト a[0] / a[1] もエスケープされない
  - 複数の特殊文字を含む段落でバックスラッシュが一切混入しない
  - round-trip が安定（[括弧] → parse → serialize → [括弧]）

### `test/webview/external-sync/applyExternalContent.integration.test.ts`（8 件）

> applyExternalContent の統合テスト（jsdom 上の実 Milkdown）。
>
> 「Preview 表示中に外部（Raw / AI / 他ツール）が .md を編集した内容が WebView に反映される」
> 経路の中核。外部 Markdown でエディタ本文が置き換わること、選択位置が新しい文書サイズへ
> クランプされて落ちないことを検証する。

- **webview統合: applyExternalContent（外部編集の反映）**
  - 外部 Markdown でエディタ本文が置き換わる
  - 追記された内容も反映される
  - 置換後にカーソルが新しい文書サイズへクランプされ、落ちない
  - 空文書への置換でも落ちない
  - **hadFocus: 更新前後でフォーカス状態を保つ**
    - 差分置換パス: フォーカスがある状態での外部更新後もフォーカスが保たれる
    - 差分置換パス: フォーカスが無い状態での外部更新はフォーカスを奪わない
    - 全置換フォールバックパス（空文書）: フォーカスがある状態では更新後もフォーカスが保たれる
    - 全置換フォールバックパス（空文書）: フォーカスが無い状態では更新後もフォーカスを奪わない

### `test/webview/external-sync/previewDiff.integration.test.ts`（4 件）

> Git 差分（Preview ガター）の基準正規化テスト。
>
> 不具合: Preview 本文は `normalizePreviewMarkdown` を通して読み込むのに、差分の基準
> （Git HEAD 本文）は素のまま比較していた。そのため Raw では無変更でも、表セルの
> `<br>`（→ `&#10;` に正規化）などで本文テキストが食い違い、Preview のガターだけ
> 「変更（青）」に見えていた。
>
> ここでは「基準も本文と同じ正規形にすれば差分が出ない」ことを、実際の Milkdown
> パーサ（jsdom）でブロックシグネチャを作って検証する。

- **webview統合: Git 差分の基準正規化**
  - （前提）正規化で Markdown が実際に変わる（表セルの <br>）
  - 素の基準 vs 正規化済み本文 → 誤って「変更」と判定される（不具合の再現）
  - 基準も本文と同じ正規形にすると差分が出ない（修正後）
  - 本文を実際に編集したら差分は出る（正規化が差分を消し過ぎない）

### `test/webview/lists-tables/tableArrowKeymap.integration.test.ts`（6 件）

> 表セル内の ↑/↓ で「真下/真上のセル（同じ列）」へ移ることのテスト。
> 「↓ を押すと右のセルに飛ぶ」不具合の回帰防止。
>
> 端判定（endOfTextblock）はレイアウト依存で jsdom では検証しづらいため、移動先を計算する
> `tableCellVerticalTarget` を直接テストする（これが「同じ列の上下」を担保する中核）。

- **webview統合: 表セルの ↑/↓ ナビゲーション**
  - ↓: 真下のセル（同じ列）へ移る（右へ飛ばない）
  - ↑: 真上のセル（同じ列）へ移る
  - ↑: 本文先頭行からヘッダの同じ列へ移る
  - 2列目でも真下のセルへ（列を保つ）
  - 最終行で ↓ は表の外へ抜ける（セルではない）
  - 表の外にカーソルがあるときは null（既定の移動に委ねる）

### `test/webview/lists-tables/tableCellBreak.test.ts`（5 件）

> テーブルセル内改行の round-trip テスト。
> - overrideHardbreakSerializer: セル内 hardbreak → `<br>`（表の外は既定）。
> - convertTableCellBreaksToEntities + Milkdown parse: `<br>` → hardbreak。

- **テーブルセル内改行 round-trip**
  - セル内 hardbreak は <br> としてシリアライズされる
  - 段落の hardbreak は <br> にならない（既定のまま）
  - <br> を含むセルは normalize 経由で hardbreak としてパースされる
  - セル内で Enter キーを押すと <br> 付きでシリアライズされる（実操作）
  - round-trip が安定（<br> → hardbreak → <br>）

### `test/webview/lists-tables/tableMove.integration.test.ts`（6 件）

> テーブルの行/列の入れ替え（移動）統合テスト。
> 「行を上下に入れ替えられるか」の確認＋回帰防止。ヘッダ行（index 0）は動かさない。

- **webview統合: テーブルの行/列移動**
  - 本文行を下へ移動できる（a行 → b行の下）
  - ヘッダ行（index 0）は動かさない（カーソルがヘッダなら null）
  - 先頭本文行は上へ移動できない（ヘッダ位置に入れない）
  - 最終本文行は下へ移動できない（範囲外）
  - 列を右へ移動できる（1列目 → 2列目）
  - 最左列は左へ移動できない（範囲外）

### `test/webview/lists-tables/tableSelection.integration.test.ts`（5 件）

> テーブルのセル選択（CellSelection）統合テスト。
>
> 「複数セルを選択できない」不具合の調査・回帰防止。ハーネスはアプリと同じ
> commonmark + gfm（= prosemirror-tables の tableEditing / columnResizing を含む）を
> 使うので、ここで CellSelection が作れて保持されることを検証する。

- **webview統合: テーブルのセル選択（CellSelection）**
  - gfm によりテーブルが table_cell/table_header としてパースされる
  - 同じ行の2セルにまたがる CellSelection を作れる
  - 列全体（colSelection）を作れる
  - 行全体（rowSelection）を作れる
  - セル選択は、無関係なメタ更新（プラグインの再描画相当）の後も保持される

### `test/webview/lists-tables/tableSelectionFix.integration.test.ts`（5 件）

> 表境界をまたぐ範囲選択（Shift+↓/↑ で表の外→中へ伸ばした選択）の正規化テスト。
>
> prosemirror-tables の normalizeSelection は「表の外→中」をまたぐ TextSelection を壊す
> （最初のセルにスナップ/collapse）。fixTableCrossingSelection はそれを「表全体を含む」形に
> 直す。マウスドラッグと同じく、表をまたいでも選択を保てるようにするのが目的。

- **webview統合: 表境界をまたぐ選択の正規化**
  - 段落 → 表の中（下方向）の選択は、表全体を含む形へ広がる
  - 表の中 → 下の段落（上方向に anchor が表内）でも表全体を含む
  - 表の外だけの選択は触らない（null）
  - カーソル（空選択）は触らない（null）
  - end-to-end: プラグインを載せて dispatch すると、表をまたぐ選択が保持される（壊れない）

### `test/webview/rendering/blankLineRoundtrip.test.ts`（4 件）

> ソースMarkdown中の「連続した複数の空行」を Preview に実体のある空 paragraph
> ノードとして復元し、保存時にも同じ本数の空行として書き戻せることを検証する。
>
> 従来: `remark-parse` は空行そのものをノード化しないため、隣接する2ブロック間に
> 何行空行があったかという情報はパース時点で失われていた（1行でも5行でも同じ
> 2ブロック構成になる）。このテストは、その本数がドキュメントモデル（空 paragraph
> ノードの個数）として復元され、round-trip でも往復することを固定する。

- **webview統合: 連続する空行の復元とround-trip**
  - 空行1つも空 paragraph として復元される
  - 空行2つは間に空 paragraph が2つ復元される
  - 空行3つは間に空 paragraph が3つ復元される
  - 見出しと本文の間の空行2つも復元される（段落以外の組み合わせ）

### `test/webview/rendering/codeHighlight.integration.test.ts`（5 件）

> codeHighlightPlugin（コードブロックのシンタックスハイライト）の統合テスト。
>
> 実 Milkdown（jsdom）でコードブロックを含む文書を作り、buildCodeDecorations が
> hljs ベースの inline decoration を生成することを検証する。これは「python と分かる色付け」
> が出る前提条件（旧実装では DOM 書き換えが ProseMirror に戻されて色が付かなかった）。

- **webview統合: codeHighlightPlugin（コードのシンタックスハイライト）**
  - python のコードブロックに色付け用デコレーションが生成される
  - 言語指定なしのコードブロックでも自動判定で色付けされる（落ちない）
  - デコレーションはコードブロックの範囲内に収まる
  - mermaid ブロックにはシンタックス色を付けない
  - コードブロックが無い文書ではデコレーション 0

### `test/webview/rendering/imageCopy.test.ts`（16 件）

> Preview 画像コピープラグイン（imageCopyPlugin.ts）のユニットテスト。
>
> カバー範囲:
>   - dataUrlToBlob: data: URL → Blob 変換の正確さ
>   - writeDataUrlToClipboard: Clipboard API への書き込み（モック）
>   - createImageCopyPlugin: 画像ノード選択時の copy イベント処理
>   - 右クリックコンテキストメニューの表示・削除
>
> navigator.clipboard.write は jsdom では未実装のため、モックに差し替えて検証する。

- **imageCopyPlugin: dataUrlToBlob**
  - PNG data URL を正しい MIME type の Blob に変換する
  - JPEG data URL を image/jpeg Blob に変換する
  - MIME type が無い場合は image/png にフォールバックする
  - base64 のバイト数が元データと一致する
- **imageCopyPlugin: isCopyableImageSrc（動画・音声はコピー対象外）**
  - 画像拡張子は true（従来通りコピー対象）
  - 動画・音声拡張子は false（動画/音声バイトを画像として誤コピーしないため）
- **imageCopyPlugin: writeDataUrlToClipboard**
  - PNG dataUrl をクリップボードに image/png として書き込む
  - image に加えて text/html(<img data:>) も書き込む（Notion 等で画像として貼れる）
  - Clipboard API が失敗しても false を返し throw しない
  - JPEG 画像は image/png に変換して書き込む（Chromium は image/jpeg を拒否するため）
  - PNG 画像は変換せずそのまま書き込む（余計な再エンコードをしない）
  - 書き込みに失敗したら理由を通知する（無言で失敗しない）
  - PNG への変換自体に失敗しても throw せず理由を通知する
- **imageCopyPlugin: createImageCopyPlugin — 画像ノード選択時の copy**
  - 画像以外の NodeSelection では copy イベントを横取りしない
  - createImageCopyPlugin は MilkdownPlugin を返す
- **imageCopyPlugin: コンテキストメニュー DOM**
  - dismissContextMenu 相当: 2 回表示したときに古いメニューが削除される

### `test/webview/rendering/imageIsolation.integration.test.ts`（5 件）

> 画像分離プラグイン（imageIsolationPlugin）の統合テスト。
>
> 「テキストと画像を同一段落に混在させない」要件の回帰防止。
> appendTransaction でテキスト+画像が混在する段落を検知し、
> 「テキストのみ」「画像のみ」の連続グループへ自動分割することを検証する。
>
> 注意: appendTransaction は「トランザクション」発生時のみ走り、初期ロード
> （defaultValueCtx）では走らない。したがって各テストは画像挿入などの
> トランザクションを dispatch して分離をトリガーする。

- **webview統合: 画像分離プラグイン（imageIsolation）**
  - テキスト段落の途中に画像を挿入 → テキストと画像が別段落へ分離される
  - テキスト末尾に画像を挿入 → 画像専用の新段落になる
  - 画像のみの段落に2枚目を追加 → 同じ段落に並ぶ（分離しない）
  - テキストのみ・画像のみが既に分離済みなら変更しない（無限ループ防止）
  - 分離後はトップレベルが段落の連続になる（リストやテーブルを壊さない）

### `test/webview/rendering/whitespaceMarker.test.ts`（8 件）

> whitespaceMarkerPlugin（空白のみのコンテンツを視覚的に区別する）の統合テスト。
>
> ユーザー報告: 「行に文字がなく全角スペースだけ／表セルの中に全角スペースだけ／
> 行末に全角・半角スペースだけ入っている」場合、Preview 上では見た目上の空白と
> 区別が付かない。これらを ProseMirror デコレーション（`ipreview-whitespace-marker`
> クラス）でマークし、視覚的に判別できるようにする（表示のみ・doc は不変更）。
>
> `blankLineRemarkPlugin` が空行本数の往復のために作る「真に空」の paragraph
> （テキストノードを一切持たない）は対象外（このプラグインの対象は「1文字以上の
> 空白文字」を持つテキストノード）。code_block・インラインコードも対象外
> （ソースの逐語的な内容のため）。

- **webview統合: whitespaceMarkerPlugin（空白のみコンテンツの可視化）**
  - 全角スペースのみの段落全体にマーカーが付く
  - 半角スペースのみの段落全体にマーカーが付く
  - 表セルの中身が全角スペースのみのときそのセルにマーカーが付く
  - 行末の全角スペースにマーカーが付く（本文部分は対象外）
  - 行末の半角スペース複数にマーカーが付く（本文部分は対象外）
  - 通常の文字だけの段落にはマーカーが付かない
  - blankLineRemarkPluginが作る真に空の段落（空行保持用）は対象外
  - コードブロック内の行末・内部の空白は対象外

### `test/webview/shortcuts/blockConvert.integration.test.ts`（7 件）

> Notion 風ブロック変換（Cmd/Ctrl+Opt+数字）の未カバー分の統合テスト。
>
> previewKeymap.integration.test.ts では 1/5/6/8/9 を検証済み。
> ここでは残りの 2(H2) / 3(H3) / 4(todo) / 0(段落へ戻す) と、
> 見出しレベルの上書き・解除トグルを補完する。

- **webview統合: ブロック変換 残りのキー (2/3/4/0) とトグル**
  - Cmd+Opt+2 で段落→見出し H2
  - Cmd+Opt+3 で段落→見出し H3
  - Cmd+Opt+4 で段落→タスクリスト（未チェック）
  - H2 で Cmd+Opt+1 → H1 に上書きされる
  - Cmd+Opt+0 で見出し→段落に戻る
  - Cmd+Opt+0 で箇条書き→段落に戻る
  - 同じ見出しレベルを再度押すと段落に戻る（トグル）

### `test/webview/shortcuts/previewFindReplace.integration.test.ts`（3 件）

> Preview 内検索／置換バーの「実反応」統合テスト。
>
> previewFindBar は一致を CSS Custom Highlight でハイライトするだけでなく、
> 置換では一致 DOM レンジを ProseMirror の位置に変換してトランザクションで
> 書き換える。ここでは実際のエディタに対して Replace / Replace All が
> ドキュメントを正しく書き換えるかを検証する。

- **webview統合: Preview 検索／置換バー — 実置換**
  - Replace All ですべての一致を置換する
  - Replace は現在の一致だけを置換し、残りは保持する
  - 置換テキストが空なら一致を削除できる

### `test/webview/shortcuts/previewKeymap.integration.test.ts`（36 件）

> previewKeymapPlugin の統合テスト。
> 実 Milkdown エディタ（jsdom）に対して DOM keydown を送り、
> handleKeyDown → コマンド実行 → 文書変換 までの一連を検証する。

- **webview統合: Notion風ブロック変換 (Cmd/Ctrl+Opt+数字)**
  - Cmd+Opt+1 で段落→見出し(level1)
  - Cmd+Opt+8 で段落→コードブロック
  - Cmd+Opt+5 で段落→箇条書きリスト
  - Cmd+Opt+6 で段落→番号付きリスト
  - Cmd+Opt+6 で既存の箇条書き→番号付きへ変換（番号も振り直す）
  - Cmd+Opt+5 で既存の番号付き→箇条書きへ変換
  - Cmd+Opt+6 を番号付きリスト内でもう一度 → リスト解除
  - Cmd+Opt+9 で段落→引用
  - Ctrl+Alt+1 (Win/Linux) でも見出しになる
  - Cmd+Opt+7 (未割り当て) は文書を変えない
  - Opt のみ(Mod なし)では変換されない
- **webview統合: Cmd/Ctrl+A 段階選択**
  - セル内で Cmd+A: 1回目=セル内容 を選択
  - セル内容選択済みで再度 Cmd+A: 行全体(CellSelection の行選択)へ
  - 行選択済みで再度 Cmd+A: 表全体(行かつ列)へ進み、セルへ巻き戻らない
  - 表全体の次（4回目）で文書全体になり、5回目は何もしない
  - previewSelectAllApplies が各段階の preventDefault と一致する
  - コードブロック内 Cmd+A: 1回目=ブロック内容を選択
  - 通常の段落で Cmd+A: 1回目=その行(段落)全体を選択
  - 段落の行全体を選択済みで再度 Cmd+A: 文書全体になる
  - 見出しでも Cmd+A: 1回目=その行(見出し)全体を選択
  - 通常の段落でも previewSelectAllApplies が各段階の preventDefault と一致する
- **webview統合: Cmd/Ctrl+A 括弧の中身優先選択**
  - 丸括弧の中にカーソルがあれば1回目で括弧の中身だけを選択する
  - 角括弧の中にカーソルがあれば1回目で括弧の中身だけを選択する
  - 括弧の中身選択済みで2回目は行（段落）全体を選択する
  - 行全体選択済みで3回目は文書全体を選択する
  - 括弧の外にカーソルがある場合は従来通り行全体が1回目で選ばれる
  - ネストした括弧では最も内側の中身を1回目に選択する
- **webview統合: Cmd/Ctrl+A capture ハンドラ（milkdownApp 相当）**
  - capture が native を抑止し、1 押下で 1 段階だけ進む（plugin と二重発火しない）
  - capture でも 1 押下ごとに セル内容→行→表 と 1 段階ずつ進む
  - 表全体の次（4回目）で文書全体になり、5回目は capture が抑止しない
  - フォーカスが無いときは何もしない（preventDefault/stopPropagation せず false）
- **webview統合: Cmd/Ctrl+A 2回で文書全体になる（native 任せにしない）**
  - 段落: 1回目=その行, 2回目=文書全体
  - 段落: 3回目も文書全体のまま（先頭行へ巻き戻らない）
  - pressKey 経由でも 2回目で文書全体（plugin 経路、native 不要）
  - コードブロック: 2回目で文書全体
- **webview統合: ``` + Enter でコードブロック化**
  - 段落 "```js" で Enter → コードブロック

### `test/webview/shortcuts/shortcutCoverage.integration.test.ts`（8 件）

> ショートカット「実反応」カバレッジの統合テスト。
>
> previewShortcuts.test.ts は分類ロジック（KeyboardEvent → どの種別か）を網羅するが、
> 「実際にキーを押して期待どおり反応するか」までは見ていないものがあった。
> ここではその穴を埋める:
>   - Cmd/Ctrl+Enter      : チェックボックスのトグル（checkboxToggle プラグイン）
>   - Cmd/Ctrl+Shift+.    : Raw へ戻る（milkdownApp の capture → postMessage 配線）
>   - Cmd/Ctrl+F          : Preview 内検索バーを開く（capture → PreviewFindBar）
>   - Cmd/Ctrl+←          : 展開プレフィックスが無いときは既定へ委ねる（preventDefault しない）
>
> 他のショートカットの実反応は既存ファイルで担保:
>   - Cmd/Ctrl+Opt+0..9 / Cmd/Ctrl+A / Enter(```): previewKeymap.integration.test.ts + blockConvert
>   - Cmd/Ctrl+B / I                              : inlineFormatting.integration.test.ts
>   - 表の矢印/Tab・行列移動                        : tableArrowKeymap / tableMove / tableNavigationEdgeCases
>   - Backspace 各種                              : markerBackspace / inlineMarkBackspace / codeBlockBackspace

- **webview統合: ショートカット実反応 — Cmd/Ctrl+Enter でチェックボックス切替**
  - 未チェック項目で Cmd/Ctrl+Enter → チェック済みになる
  - チェック済み項目で Cmd/Ctrl+Enter → 未チェックに戻る
  - チェックボックス外（通常段落）では何もしない（既定へ委ねる）
  - Shift を伴う Cmd/Ctrl+Shift+Enter ではトグルしない
- **webview統合: ショートカット実反応 — Cmd/Ctrl+Shift+. で toggleRaw 通知**
  - Cmd/Ctrl+Shift+. の分類が toggleRaw で、ハンドラが1回メッセージを送る
  - Shift 無しの Cmd/Ctrl+. では toggleRaw を送らない
- **webview統合: ショートカット実反応 — Cmd/Ctrl+F で検索バーを開く**
  - Cmd/Ctrl+F で find と分類され、検索バーが開く（hidden=false）
- **webview統合: ショートカット実反応 — Cmd/Ctrl+← の行頭移動**
  - プレフィックス展開が無い段落では preventDefault せず既定に委ねる

## 4. ユニット・純関数（jsdom）— preview/ raw/ shared/ に分類 — 873 件

実行: `npm run test:unit`

ロジック単体の高速テスト。`preview/`＝Preview 側、`raw/`＝Raw 側（各々さらに症状カテゴリで分類）、`shared/`＝両モード共通のロジック（カテゴリ分割せず均質に管理）。

### `test/suite/live/editing-core/liveEnter.test.ts`（23 件）

> Live モードの Enter / Home の挙動を、CodeMirror に依存しない純関数として固定する。
>
> 期待値は Obsidian 実測（obsidian-observed-spec.md §4.1・§3.3）そのまま。
> 特に既存 Preview / Raw モードと**違う**点:
>   - 見出しの行末で Enter しても "# " を引き継がない
>   - チェック済み項目の行末で Enter すると新項目は**未チェック**で始まる
>   - 空のリスト項目で Enter するとマーカーだけ消えて行は増えない
>   - 行頭付近の Backspace は記法解除しない（＝ここに Backspace のロジックは無い）
>
> 受け入れ基準: requirements.md §6 の必須回帰テスト #5 #6 #10。

- **Live モード: Enter の解決**
  - リスト項目の行末では次の行に同じマーカーを継続する
  - "* " のリストは "* " を継続する
  - インデントを保ったまま継続する
  - 番号リストは次の番号を自動採番する
  - 番号は2桁以上でも繰り上がる
  - 未チェック項目の行末では未チェックの新項目を作る
  - チェック済み項目の行末でも新項目は未チェックで始まる（実測）
  - 引用行の行末では "> " を継続する
  - 見出しの行末ではプレフィックスを引き継がない（実測）
  - 素の段落では既定の Enter に委ねる
  - **空のマーカーだけの行**
    - 空のリスト項目ではマーカーを削除して行を増やさない
    - 空の番号リストでもマーカーを削除する
    - 空のチェックボックスでもマーカーを削除する
    - インデントされた空項目はインデントごと消す
  - **行の途中での Enter**
    - リスト項目の途中では分割して後半にマーカーを付ける
    - マーカーより手前にカーソルがあるときは既定に委ねる
- **Live モード: スマートホーム**
  - リスト行の1回目はマーカーの後ろへ
  - すでにマーカーの後ろにいるときは行頭へ
  - チェックボックスは "- [ ] " の後ろへ
  - インデントされた項目も本文先頭へ
  - 見出し行は2段階にせず行頭へ（実測）
  - 引用行も行頭へ（実測: スマートホームはリスト系のみ）
  - 素の段落は行頭へ

### `test/suite/live/external-sync/diffGutter.test.ts`（9 件）

> Phase 6b: Git HEAD との行差分（純関数）のテスト。
>
> Live モードはドキュメントが生 Markdown そのものなので、差分も**行単位**で取れる
> （既存 Preview はブロック単位だった）。既存の `diffBlocks` を行の配列に対して
> 使い回す薄いラッパを検証する。
>
> 「記法の展開/収縮では差分が変わらない」ことは requirements.md 受け入れ基準 #9 で
> 実ブラウザ側が担保する。ここでは行差分そのものの正しさを固定する。

- **Live モード: 行差分**
  - 変更が無ければすべて unchanged
  - 行を書き換えると modified になる
  - 行を足すと added になる
  - 行を消すとその位置に削除マーカーが立つ
  - HEAD が無い（新規ファイル）ときは全行 added
  - 空の HEAD でも落ちない
  - CRLF の HEAD でも行として比較できる
  - 先頭への挿入も正しく added になる
  - 複数行の連続変更をまとめて modified にする

### `test/suite/live/external-sync/documentSync.test.ts`（17 件）

> Live モードの host ⇄ webview 差分同期の純関数テスト。
>
> requirements.md R4.2 のとおり、Live モードは**文書全体の置き換えを絶対にしない**。
> webview の編集は `{ from, to, insert }` の差分として host へ渡り、host はそれを
> VS Code の `Range` へ変換して `WorkspaceEdit` にする。全体置換をすると
> Undo 履歴と Git 差分が壊れる（既存 Preview が過去に踏んだ問題）。
>
> また、host→webview→host のエコーバックで編集が二重適用されないよう、
> リビジョン番号でガードする。ここではその判定ロジックを固定する。

- **Live モード: オフセット → 行/桁の変換**
  - 先頭は 0行0桁
  - 行内のオフセットを桁に変換する
  - 改行の直後は次の行の0桁
  - 空行を正しく数える
  - 末尾のオフセットも変換できる
  - CRLF でも行数を1回だけ数える
- **Live モード: 差分 → Range の変換**
  - 1文字挿入は幅0の Range になる
  - 置換は元テキストの範囲を指す
  - 改行をまたぐ削除も行/桁で表現できる
- **Live モード: 差分の適用**
  - 単一の差分を適用する
  - 複数の差分を「元テキストのオフセット」基準で適用する
  - 挿入だけの差分も扱える
  - 差分が空なら元のまま
- **Live モード: エコーバック抑止**
  - 自分が送った編集の反映は無視する
  - 外部（Raw / AI / Git）由来の変更は適用する
  - 同じリビジョンを2回無視しない（1度消費したら次は適用する）
  - 複数の未確定編集があっても、対応するものだけ無視する

### `test/suite/live/focus-expand/revealScope.test.ts`（17 件）

> Live モードの中核判定「この記法は今、生テキストとして見えているべきか」の純関数テスト。
>
> 期待値の出典は Obsidian 1.13.4 の実測仕様
> （docs/specifications/live-mode/obsidian-observed-spec.md §1 原則2〜4）。
> 特にトークンスコープの境界は `from <= cursor <= to`（**両端を含む**）であり、
> `from - 1` では展開せず `to`（閉じ記号の直後）では展開する、という非対称でない
> 厳密な規則を実測で確認している。ここが崩れると「閉じ記号を打ち終わった瞬間に
> 記法が畳まれる」といった操作感の破綻に直結するため、最優先で固定する。
>
> 受け入れ基準: requirements.md §6 の必須回帰テスト #2 #3。

- **Live モード: 展開スコープ判定 isRevealed**
  - **トークンスコープの境界（実測: from <= cursor <= to）**
    - トークンの1つ手前（from-1）では展開しない
    - トークンの開始位置（from）では展開する
    - トークンの内側では展開する
    - 閉じ記号の直後（to）でも展開する
    - to の1つ先（to+1）では展開しない
    - 同じ行の別トークンはカーソルが触れていなければ展開しない
  - **行スコープ（見出し）**
    - 行内のどのオフセットでも展開する
    - 行の外では展開しない
  - **ブロックスコープ（コードフェンス・数式ブロック・コールアウト）**
    - ブロック本文にカーソルがあればブロック全体を展開する
    - ブロックの外では展開しない
  - **常時変換スコープ（リストの "-"・引用の ">"・表）**
    - カーソルが真上にあっても展開しない
  - **フォーカス（実測: blur したら全部収縮する）**
    - フォーカスが無ければトークンの中にカーソルがあっても展開しない
    - フォーカスが無ければ行スコープも展開しない
  - **選択範囲（実測: 触れている要素はすべて展開する）**
    - 選択がトークンをまたいでいれば展開する
    - 選択の終端がトークンの先頭に接していれば展開する
    - 選択がトークンに届いていなければ展開しない
    - 複数選択のうち1つでも触れていれば展開する

### `test/suite/live/focus-expand/syntaxRanges.test.ts`（18 件）

> Live モードの記法スキャナ（ソース文字列 → 記法トークンの範囲）の純関数テスト。
>
> Live モードは Markdown を別のドキュメントモデルへ変換しない（requirements.md R1.1）。
> 代わりに「生テキストのどこからどこまでが何の記法か」を切り出し、その範囲へ
> decoration を当てる。したがってこのスキャナの出す `from`/`to` が1文字でもズレると、
> 隠す文字がズレて表示が壊れる。
>
> 期待値は Obsidian 実測仕様（obsidian-observed-spec.md §2）に一致させること。
> 特に `revealFrom`/`revealTo` は展開判定に直接使われるので、
> 実測した「`**太字bold**` は オフセット 4〜14 で展開」と厳密に対応する。

- **Live モード: 記法スキャナ scanSyntaxRanges**
  - **見出し（行スコープ）**
    - H1〜H6 をレベル付きで検出する
    - 隠す範囲は "#"＋直後の空白（実測: "# " が消える）
    - 展開範囲は行全体（実測: 行内のどこにカーソルがあっても "# " が出る）
    - "#" の後ろに空白が無いものは見出しではない
    - "#" が7個以上は見出しではない
  - **インライン記法（トークンスコープ）**
    - 太字の範囲が実測どおり [4, 14)
    - 斜体の範囲が実測どおり [17, 27)
    - *** は1つのトークンとして扱う（実測: 6文字が同時に出入りする）
    - 隠すのは前後のマーカーだけで、本文は隠さない
    - 取り消し線・ハイライト・インラインコードを検出する
    - インラインコードの中の "*" は強調として扱わない
    - バックスラッシュでエスケープした "*" は強調にしない
    - 閉じ記号が無い強調は検出しない
    - 強調は行をまたがない
  - **リンク（トークンスコープ・URL 部分を隠す）**
    - [表示](URL) は "](URL)" と "[" を隠して表示テキストだけ残す
    - 生 URL は記法トークンではない（実測: 常に生表示）
  - **コードフェンスの内側は走査しない**
    - フェンス内の "**" を強調として拾わない
    - フェンス内の "# " を見出しとして拾わない

### `test/suite/live/lists-tables/inlineSegments.test.ts`（9 件）

> 表のセルなど「1行ぶんのインライン記法をレンダリングする」ための分割（純関数）。
>
> 表はウィジェットとして描画するため、セルの中身は CodeMirror の decoration が
> 効かない。そのままだと `**太字**` がセルに生のまま出てしまう（2026-08-05 の
> ユーザー報告）。ここで「表示する文字」と「その装飾クラス」に分割して、
> ウィジェット側が同じ見た目を再現できるようにする。

- **Live モード: インライン記法の分割**
  - 装飾が無ければ1つのセグメントになる
  - 太字はマーカーを落として装飾クラスを付ける
  - 前後に地の文があっても分割できる
  - 斜体・取り消し線・インラインコードも扱える
  - リンクは表示テキストだけ残す
  - 複数の記法が並んでも順序どおりに分割する
  - 閉じていない記法はそのまま文字として残す
  - 空文字は空配列
  - セグメントを繋ぐと記法文字を除いた表示テキストになる

### `test/suite/live/lists-tables/listSyntax.test.ts`（20 件）

> Live モード Phase 2: リスト・チェックボックス・引用の記法スキャン（純関数）。
>
> Obsidian 実測（obsidian-observed-spec.md §2.3〜§2.5）では、この3つは他の記法と
> 扱いが違う:
>   - 箇条書きの "-" と引用の ">" は **常時変換**（never スコープ）。カーソルが真上に
>     来ても生の記号に戻らない。ただし文字は DOM から消さず**透明化して幅を残す**ので、
>     カーソルは普通に通過でき、桁位置はソースと 1:1 のまま。
>   - チェックボックス "- [ ]" は**トークンスコープ**で、オフセット 0〜5 では生テキスト、
>     6 以降ではチェックボックス UI になる。
>
> この違いを取り違えると「リストにカーソルを置いたら - が出てガタッとずれる」など、
> Obsidian と明確に違う操作感になるため、純関数のレベルで固定する。

- **Live モード: 箇条書きマーカー**
  - "- " をマーカーとして検出する
  - "* " と "+ " もマーカーとして検出する
  - 常時変換（never）スコープ = カーソルが来ても展開しない
  - DOM から文字を消さない（hidden は空）
  - インデントされたネスト項目も検出し、階層を持つ
  - タブインデントも階層として数える
  - 番号リストは数字ごと表示するので別 kind にする
  - 水平線 "---" はリストマーカーではない
  - "-" の後ろに空白が無いものはリストではない
- **Live モード: チェックボックス**
  - "- [ ] " を task として検出する
  - "- [x] " はチェック済みとして検出する
  - 大文字の [X] もチェック済み
  - トークンスコープで、展開範囲は行頭〜行頭+5（実測どおり）
  - 収縮時は "- [ ]" の5文字を置換する（後ろの空白は残す）
  - チェックボックス行は箇条書きマーカーとして二重検出しない
  - "- [] " はチェックボックスではない（実測: Obsidian も補正しない）
- **Live モード: 引用マーカー**
  - "> " をマーカーとして検出する
  - 多重引用はネスト段数を持つ
  - 引用の中の強調も通常どおり検出する
  - 引用の中の箇条書きも検出する

### `test/suite/live/lists-tables/tableCells.test.ts`（9 件）

> 表のセル範囲解析（純関数）のテスト。
>
> Phase 4b では表を畳んだまま**セルの中で直接編集**できるようにする。そのためには
> 「画面上のこのセルは、ソースのどこからどこまでか」を1文字もズラさずに知る必要がある。
> ここがズレると、入力した文字が隣のセルへ入る・パイプ記法が壊れる、という形で
> ドキュメントが破壊されるため、純関数として厳密に固定する。

- **Live モード: 表のセル範囲解析**
  - 区切り行を除いた行を返す
  - 各セルのテキストを返す
  - セルの範囲がソースの実オフセットと一致する
  - baseOffset を足した絶対オフセットを返す
  - 空のセルは幅0の範囲になる（挿入位置として使える）
  - 列数が揃っていない行も落ちずに解析できる
  - 区切り行から列の配置を読む
  - 配置指定が無ければ align は空
  - セル内のパイプのエスケープ（\\|）で分割しない

### `test/suite/live/rendering/blockSyntax.test.ts`（17 件）

> Live モード Phase 3・4: コードフェンスと表のブロック記法スキャン（純関数）。
>
> Obsidian 実測（obsidian-observed-spec.md §2.7・§2.8）:
>   - コードフェンスは **ブロックスコープ**。本文行にカーソルを置くだけで開始・終了の
>     両フェンスが生テキストに戻る。収縮時は開始フェンスが言語ラベル、終了フェンスが空。
>   - 表は Obsidian では「常時レンダリング（never）＋セル内編集」だが、我々は
>     まず**ブロックスコープ**で実装する（カーソルが表の中にあるときだけ生のパイプ記法）。
>     この差分は requirements.md §2.7 の逸脱として明記してある。

- **Live モード: コードフェンス**
  - フェンスブロックを1つのトークンとして検出する
  - ブロックスコープになる（本文行でも両フェンスが展開される）
  - 展開範囲は開始フェンス行頭から終了フェンス行末まで
  - 言語（info string）を持つ
  - 隠す範囲は開始フェンス行と終了フェンス行の2つ
  - 言語指定が無いフェンスも検出する
  - 閉じられていないフェンスは文書末までをブロックとする
  - チルダフェンスも検出する
  - フェンスが2つ並んでいればブロックも2つ
- **Live モード: 表**
  - 表ブロックを1つのトークンとして検出する
  - 展開範囲は表の先頭行から最終行まで
  - 収縮時はブロック全体を1つのウィジェットで置換する
  - 区切り行が無ければ表ではない
  - 見出し行と区切り行だけ（本文0行）でも表として扱う
  - コロン付きの区切り行（配置指定）も認める
  - コードフェンスの中のパイプ行は表にしない
  - 表の中のパイプ行を強調記法として拾わない

### `test/suite/live/rendering/phase5Syntax.test.ts`（20 件）

> Live モード Phase 5: 水平線・数式ブロック・コールアウト・画像・インライン数式の走査（純関数）。
>
> Obsidian 実測（obsidian-observed-spec.md §2.6・§2.9〜§2.11）:
>   - 水平線 `---` は **行スコープ**。カーソルがその行に来ると生の `---` に戻る。
>   - 数式ブロック `$$ … $$` は **ブロックスコープ**。
>   - コールアウト `> [!note]` + 続く `>` 行は **ブロックスコープ**で、
>     展開すると素の引用行に戻る。
>   - 画像 `![alt](url)` とインライン数式 `$…$` は **トークンスコープ**。
>   - frontmatter は Obsidian ではプロパティパネルに置換されるが、我々は
>     生表示のまま（requirements.md §2.9 の意図的な逸脱）。ただし水平線として
>     誤検出しないこと。

- **Live モード: 水平線**
  - "---" を行スコープの水平線として検出する
  - "***" と "___" も水平線
  - 4文字以上でも水平線
  - 2文字は水平線ではない
  - 表の区切り行は水平線にしない
  - 文書先頭の "---" は frontmatter なので水平線にしない
  - frontmatter は生表示のまま（never スコープ）で1ブロックとして検出する
- **Live モード: 数式ブロック**
  - "$$ … $$" を検出し、ソースは常に表示する（mermaid と同じ見せ方）
  - 数式本体を持つ
  - ソースを隠さない（hidden は空）
  - 数式ブロックの中身は他の記法として解釈しない
- **Live モード: コールアウト**
  - "> [!type]" から始まる引用ブロックをコールアウトとして検出する
  - 種別（note / warning など）を持つ
  - コールアウトの行は素の引用マーカーとして二重検出しない
  - "[!" が無い引用は普通の引用のまま
  - 1行だけのコールアウトも検出する
- **Live モード: 画像とインライン数式**
  - 画像はトークンスコープで URL を持つ
  - インライン数式 "$…$" をトークンスコープで検出する
  - 金額のような単独の "$" は数式にしない
  - インラインコードの中の "$" は数式にしない

### `test/suite/live/tabs-editors/liveWebviewHtml.test.ts`（6 件）

> Live モード webview の HTML 組み立て（純関数）のテスト。
>
> 2026-08-05 に「host 側の HTML に KaTeX の CSS を入れ忘れ、数式が MathML と
> 二重に描画される」不具合を実際に踏んだ。webview の見た目はブラウザテスト
> （バンドルを直接読む固定 HTML）では検出できないため、host が組み立てる HTML
> そのものをここで検証する。

- **Live モード: webview HTML の組み立て**
  - Live のスタイルシートを読み込む
  - KaTeX のスタイルシートを読み込む（数式が MathML と二重に見えるのを防ぐ）
  - KaTeX の CSS は Live の CSS より先に読み込む（上書きできるように）
  - スクリプトを nonce 付きで読み込む
  - CSP を meta タグに入れる
  - エディタのマウント先 #live-root を持つ

### `test/suite/preview/cursor-focus/codeBlockTripleClick.test.ts`（9 件）

> lineRangeAt（コードブロック内トリプルクリックの「行範囲」算出）のユニットテスト。

- **lineRangeAt**
  - 1行目の途中 → その行だけ
  - 1行目の行頭
  - 2行目の途中 → 2行目だけ（前後の \\n は含めない）
  - 2行目の行頭（直前が \\n）
  - 最終行（末尾に \\n なし）
  - 改行位置（\\n そのもの）は手前の行に属する
  - 改行のみの空行
  - 1行だけのテキストは全体
  - 範囲外オフセットはクランプ

### `test/suite/preview/cursor-focus/cursorAnchor.test.ts`（13 件）

> Raw ⇄ Preview のカーソル位置引き継ぎ（共有マッピング）のユニットテスト。

- **cursorAnchor: blockPrefixLength**
  - 見出し/リスト/番号/チェックボックス/引用の行頭マーカー長
- **cursorAnchor: segmentBlocks**
  - 空行で段落を分割する
  - 連続するリスト行は 1 ブロック
  - フェンスコードは中の空行も含めて 1 ブロック
  - 見出し・段落・リストの混在
- **cursorAnchor: rawToCursorAnchor / cursorAnchorToRaw**
  - プレーン段落はオフセットがそのまま
  - 見出しは行頭マーカーを除いたオフセット
  - リスト項目も行頭マーカーを除く
  - 2 番目の段落はブロック index 1
  - 往復で元の位置に戻る（プレーン段落）
  - 往復で元の位置に戻る（見出し/リスト）
  - 空行上のカーソルは近いブロック先頭へ寄せる
  - 範囲外ブロック index はクランプ

### `test/suite/preview/cursor-focus/previewFocusSyntax.test.ts`（25 件）

- **focusSyntaxHelpers**
  - getHeadingPrefix returns correct hashes
  - getInlineMarkMarker maps common marks
  - getBlockPrefix resolves the list-item prefix from the inner paragraph depth
  - getCodeFenceMarkers returns the open/close fence text for a code_block
  - getCodeFenceMarkers omits the language when empty
  - getCodeFenceMarkers returns null for non-code_block nodes
  - parseCodeFenceRealText parses a well-formed expanded fence with a language
  - parseCodeFenceRealText parses a well-formed expanded fence without a language
  - parseCodeFenceRealText handles genuinely empty code content between the markers
  - parseCodeFenceRealText returns null when the opening fence is broken
  - parseCodeFenceRealText returns null when the closing fence is broken
  - parseCodeFenceRealText returns null when both fences have been fully deleted
  - parseCodeFenceRealText returns null for the degenerate case where open/close markers would overlap (no room for real code)
  - hasBoundaryFenceLine detects a content whose first line is itself a fence line (nested fence)
  - hasBoundaryFenceLine detects a content whose last line is itself a fence line
  - hasBoundaryFenceLine detects a content that is a single fence line
  - hasBoundaryFenceLine ignores fence lines in the middle of the content (no visual doubling at the boundaries)
  - hasBoundaryFenceLine returns false for ordinary code content
  - findFocusedBlockDepth resolves a position inside a code_block
- **slashMenuItems**
  - filterSlashMenuItems matches label prefix
  - filterSlashMenuItems returns all when query empty
- **detectSlashMatch**
  - detects slash at paragraph start
- **headingBackspace**
  - headingDowngradeLevel は 1 段階ずつ下げ、H1 は段落(null)
  - isAtHeadingContentStart detects cursor at heading inline start
- **applyPreviewSlash**
  - getSlashLineBlockRange wraps the current textblock

### `test/suite/preview/external-sync/externalEcho.test.ts`（11 件）

> resolveExternalPush（自分の書き込みのエコーを内容ベースで弾く）のユニットテスト。
>
> 回帰の主眼: `onExternalFileChange`（FileSystemWatcher 経由の外部変更検知）が
> 同期フラグ（`applyingRemoteEdit`）だけに頼っていると、自分の保存の遅延エコーを
> 取りこぼし、古い・短いディスク内容が Webview へ push されて、入力継続中のカーソルが
> 文書末尾へ飛んでしまう（詳細: docs/specifications/fixes/stale-external-push-cursor-jump-fix.md）。
> `resolveExternalPush` はこの判定を `changeSub` と `onExternalFileChange` の両方で
> 共有し、内容が一致すれば push しない（null を返す）ことを保証する。

- **resolveExternalPush**
  - 直近に自分が書き込んだ内容と一致するなら push しない（null）
  - 自分が書き込んだ内容と異なれば、その内容をそのまま返す（push する）
  - lastAppliedFromWebview が null（まだ何も書いていない）なら常に push する
  - 両方が空文字列でも一致すれば push しない
- **resolveWebviewSaveDecision**
  - ディスク内容が document モデルと一致するなら適用してよい（apply）
  - ディスク内容が自分の直近の書き込みと一致するなら適用してよい（apply）
  - ディスクが document モデルとも自分の直近の書き込みとも食い違うなら見送る（defer） — 外部ツールが割り込んで書き換えた可能性
  - lastAppliedFromWebview が null（まだ何も保存していない）でも、document モデルと食い違えば defer
  - 直近に webview へ push した内容（lastPushedToWebview）とディスクが一致するなら、document モデルが陳腐化していても適用してよい（apply）
  - lastPushedToWebview が無い（何も push していない）なら、document モデルとの食い違いは今まで通り defer する
  - lastPushedToWebview とも食い違うディスク内容は、新たな外部割り込みとみなし defer する

### `test/suite/preview/external-sync/scrollAnchor.test.ts`（4 件）

- **scrollAnchor**
  - finds nearest heading above cursor line
  - maps slug back to line
  - creates scroll anchor from heading title
  - matches heading text by slug or title

### `test/suite/preview/external-sync/scrollSync.test.ts`（22 件）

- **scrollSync: scrollRatioFromLine（行 → 比率）**
  - 先頭行は 0
  - 中ほどの行は topLine / lineCount
  - 1 行以下のドキュメントは同期しない（undefined）
  - 範囲外の行はクランプされる
- **scrollSync: scrollRatioFromPixels（px → 比率）**
  - スクロール最上部は 0
  - 最下部は 1
  - 中間は比率になる
  - スクロール不能（中身がビューより小さい）でも 0 を返す
  - 0〜1 にクランプ
- **scrollSync: lineFromScrollRatio（比率 → 行）**
  - 0 は先頭行
  - 0.5 は中ほどの行
  - 1 は最終行にクランプ
  - 空ドキュメントは 0
- **scrollSync: pixelsFromScrollRatio（比率 → px）**
  - 0 は最上部
  - 1 は最大スクロール量
  - スクロール不能なら 0
- **scrollSync: contentScrollHeight（scroll-beyond 余白の除外）**
  - 余白分を差し引いた実コンテンツ高を返す
  - 余白 0 ならそのまま
  - 負値（余白が高さを超える）でも 0 未満にならない
  - 実コンテンツ末尾は ratio≈1、さらに余白内へスクロールしても 1 にクランプ
  - 余白を除外しないと末尾でも ratio<1 になってしまう（除外の必要性）
- **scrollSync: 行 ↔ 比率 の往復が安定している**
  - 行 → 比率 → 行 で元に戻る（代表値）

### `test/suite/preview/external-sync/serialQueue.test.ts`（5 件）

> createSerialQueue（Webview → ドキュメント書き込みの直列化）のユニットテスト。
>
> 回帰の主眼: Preview で高速に文字入力すると、各キー入力ごとの「変更をドキュメントへ
> 書き込む」処理（WorkspaceEdit 生成 + 保存）が前の書き込み完了を待たずに走り、
> 古いドキュメント内容を前提にした差分を作ってしまうことがある（結果、ドキュメントが
> 壊れ、Webview へ書き戻されたときにカーソル位置が意図しない場所へずれる＝
> 「入力中に急にカーソルが下の行へ飛ぶ」不具合の原因）。
> `createSerialQueue` はタスクを FIFO で直列実行し、後続タスクの本体が実行される時点では
> 必ず先行タスクが完了している（＝最新のドキュメント状態を読める）ことを保証する。

- **createSerialQueue**
  - 後から積んだタスクは、先行タスクが完了してから実行される（早く積んでも追い越さない）
  - 先行タスクが失敗しても、後続タスクは実行される
- **reportRejection**
  - タスクが失敗したとき、onError にそのエラーが渡る（webview からの編集保存失敗を気づけるようにする）
  - タスクが成功したときは onError が呼ばれない
  - onError 自体が例外を投げても、元の Promise の reject 伝播やテストランナーを壊さない

### `test/suite/preview/rendering/imageUriRoundtrip.test.ts`（7 件）

- **画像URLの往復（特殊文字対応）**
  - 括弧を含むパスでも復元できる（データ損失の回帰防止）
  - 角括弧 [ ] を含むパスでも復元できる
  - 山括弧 <...> で囲んだスペース入りパスを画像として認識・往復できる
  - クエリ & を含む webview URI でも復元できる（実 VSCode の典型）
  - タイトル付き画像も復元できる
  - （回帰）通常の相対パスは従来どおり往復できる
  - （回帰）絶対URLはマップに入らず変化しない

### `test/suite/preview/rendering/markdownAssets.test.ts`（2 件）

- **markdownAssets**
  - rewrites relative image paths and restores them
  - leaves absolute URLs unchanged

### `test/suite/preview/rendering/mediaKind.test.ts`（6 件）

- **classifyMediaKind（画像/動画/音声の拡張子判定）**
  - mp4・webm は video と判定する
  - mp3・wav・ogg・m4a は audio と判定する
  - png・jpg・gif・webp・svg は image と判定する（既存動作の回帰防止）
  - 拡張子が無い・未知の場合は image にフォールバックする
  - webview URI のクエリ文字列・フラグメントを無視して判定する
  - 拡張子の大文字小文字を区別しない

### `test/suite/preview/rendering/mermaidNodeLabelEdit.test.ts`（6 件）

> `updateMermaidNodeLabel`（純関数）: Mermaid ソーステキスト中の、指定ノード ID の
> ラベル文字列だけを書き換える。Preview 上で図のノードラベルをダブルクリック編集
> したときに、ソースの ```mermaid コードブロックへ反映するために使う。
> 図のレイアウト（座標）は Mermaid が自動計算するため保存できない・しない。
> 対応するのは「ラベル文字列の書き換え」のみ（ノード/エッジの追加・削除・付け替えは対象外）。

- **updateMermaidNodeLabel**
  - ラベルの無い（ID がそのままラベルになっている）ノードに角括弧ラベルを付与する
  - 既存の角括弧ラベルを新しいテキストに置き換える（形状は維持）
  - 丸括弧（角丸）ノードの形状を維持したままラベルを置き換える
  - 波括弧（ひし形）ノードの形状を維持したままラベルを置き換える
  - 同じ ID が複数箇所に出現しても最初の宣言（形状/ラベルを持つ箇所）だけを書き換える
  - 存在しないノード ID を指定した場合はソースをそのまま返す

### `test/suite/preview/rendering/previewCsp.test.ts`（2 件）

- **buildPreviewCsp（webview CSP 文字列組み立て）**
  - media-src に cspSource（ローカルリソース）と https: を含む
  - 既存の img-src・script-src・default-src は維持される（回帰防止）

### `test/suite/preview/rendering/webviewI18n.test.ts`（8 件）

> WebView i18n（src/preview/webview/i18n.ts）のユニットテスト。
> 純粋ロジック（言語判定・辞書ルックアップ・フォールバック）を検証する。

- **webview i18n: t / setLanguage**
  - 既定（英語）はソース文字列をそのまま返す
  - 日本語（ja）は辞書の訳を返す
  - ja-JP など地域コードも前方一致で日本語扱い
  - 大文字小文字を問わず ja を判定する
  - 辞書に無いキーはソース（英語）にフォールバック
  - 日本語以外の言語はソース（英語）を返す
  - undefined / 空文字は英語扱い
  - 全スラッシュメニュー項目の detail に日本語訳がある（英語のまま漏れない）

### `test/suite/preview/shortcuts/previewShortcuts.test.ts`（38 件）

- **previewShortcuts: getNotionBlockAction**
    - ${n} -> ${action ?? 'null'}
  - keymap has no entry for 7
- **previewShortcuts: isModPressed**
  - true for Cmd (meta)
  - true for Ctrl
  - false for Alt/Shift only
- **previewShortcuts: classifyPreviewShortcut - Notion blocks**
  - Cmd+Opt+5 (Mac) -> bulletList
  - Ctrl+Alt+5 (Win/Linux) -> bulletList
  - Cmd+Opt+1 -> heading1
  - Cmd+Opt+7 -> null (未割り当て)
  - Mac の Alt+数字で key が記号でも code で判定できる
  - Opt+5（Mod なし）は無効
  - Cmd+5（Opt なし）は Notion ブロックではない
  - Cmd+Opt+Shift+5 は無効（Shift 付き）
- **previewShortcuts: classifyPreviewShortcut - selectAll / find**
  - Cmd+A -> selectAll
  - Ctrl+A -> selectAll
  - Cmd+F -> find
  - Cmd+Opt+F (Mac) -> replace
  - Ctrl+H (Win/Linux) -> replace
  - Cmd+Opt+A は selectAll ではない（Alt 付き）
  - A 単体は無効
- **previewShortcuts: classifyPreviewShortcut - toggleRaw**
  - Cmd+Shift+. -> toggleRaw
  - Ctrl+Shift+.（key が > の配列）-> toggleRaw
  - Cmd+.（Shift なし）は無効
  - Cmd+Shift+Opt+.（Alt 付き）は toggleRaw ではない
- **previewShortcuts: classifyPreviewShortcut - fenceEnter**
  - Enter（修飾なし）-> fenceEnter
  - Shift+Enter は fenceEnter ではない
  - Cmd+Enter は fenceEnter ではない
- **previewShortcuts: classifyPreviewShortcut - lineStart**
  - Cmd+← -> lineStart (code)
  - Ctrl+← -> lineStart (Windows)
  - Cmd+Shift+← は lineStart ではない（Shift 付き）
  - ← 単体は lineStart ではない
- **previewShortcuts: classifyPreviewShortcut - codeBlockTab**
  - Tab（修飾なし）-> codeBlockTab (shift: false)
  - Shift+Tab -> codeBlockTab (shift: true)
  - Cmd+Tab は codeBlockTab ではない（ウィンドウ切替等に譲る）
  - Ctrl+Tab は codeBlockTab ではない
  - Alt+Tab は codeBlockTab ではない（OS のウィンドウ切替）
- **previewShortcuts: 関係ないキー**
  - Cmd+S -> null
  - 修飾なしの普通の文字 -> null

### `test/suite/preview/tabs-editors/defaultEditorAssociation.test.ts`（15 件）

> `.md` の既定エディタ（VS Code 本体の `workbench.editorAssociations`）を、
> 現在の Raw/Preview モードに追従させるための純関数を検証する。
>
> なぜ必要か: customEditor の `priority: "default"` だけでは、Raw モードでも
> 一度 Preview の Custom Editor が生成されてから Raw へ跳ね返る（bounceToRawEditor）。
> この「2手」がちらつきと一瞬のタブ2枚並存の原因であり、さらに同じく
> `priority: default` を名乗る他拡張（例: cweijan.vscode-office）が居ると
> どちらが開くか VS Code 側で一意に決まらない。ユーザー設定の
> `workbench.editorAssociations` は拡張機能の宣言より強いので、ここを
> モードに同期させれば「開く前から解決先が1つに決まっている」状態を作れる。
>
> 層: jsdom（純関数）。実際に設定へ書き込む経路は
> `test/extension/preview/settings.test.ts`（実 VS Code）が担当する。

- **defaultEditorAssociation**
  - **resolveDefaultOpenMode（次に開く Markdown をどちらで開くか）**
    - 記憶モードがあればそれを使う
    - 記憶モードが無ければ defaultMode 設定を使う
    - どちらも無ければ preview（package.json の既定値と揃える）
    - 未知の defaultMode 値は preview として扱う（設定の手書きミスで壊さない）
  - **computeEditorAssociations（本体設定へ書き戻す値の計算）**
    - preview モードでは *.md / *.markdown を Preview の viewType に向ける
    - raw モードでは *.md / *.markdown を VS Code 標準テキストエディタに向ける
    - 管理対象外のパターン（他拡張のための関連付け）は書き換えない
    - *.md が他拡張のビューアに向いていてもモード側で上書きする（競合の解消が目的のため）
    - 制御 OFF（null）では、自分が書いた値だけを取り除く
    - 制御 OFF でも、自分が書いた値でない *.md の関連付けは残す
  - **editorAssociationsEqual（無駄な settings.json 書き込みを避ける）**
    - 同じ内容なら true（モード切替のたびに書き込まない）
    - キーの順序が違うだけなら true
    - 値が違えば false
    - undefined と空オブジェクトは同じ扱い（未設定 ⇔ 空を往復させない）
    - キーが増えていれば false

### `test/suite/preview/tabs-editors/previewTabs.test.ts`（8 件）

> pickPreviewUri（Preview タブ選択ロジック）のユニットテスト。
>
> 回帰の主眼: 複数の Preview を開いた状態で「Raw に戻す対象」を取り違えて
> 別ファイルへ飛ばないこと（曖昧なときは undefined を返す）。

- **pickPreviewUri**
  - アクティブグループのアクティブタブが Preview ならそれを返す
  - 複数の Preview があってもアクティブな方を正しく選ぶ（別ファイルへ飛ばない）
  - アクティブタブが Preview でない（テキスト等）ときはアクティブな Preview を採らない
  - Preview が 1 枚だけならアクティブでなくてもそれを返す
  - Preview が複数あり、どれもアクティブでない → 曖昧なので undefined（誤爆防止）
  - 同一 URI の Preview が複数タブにあっても一意とみなして返す
  - Preview タブが 1 枚も無ければ undefined
  - 空配列なら undefined

### `test/suite/preview/tabs-editors/titleBarToggle.test.ts`（4 件）

> エディタ・タイトルバーの Preview/Raw トグルボタン（package.json の貢献）の回帰防止。
>
> 以前は Raw では「Preview を開く」($(open-preview))、Preview では「Raw を開く」($(code))と、
> モードごとに**別コマンド・別アイコン**の2種類を出し分けていた。アイコンが2種類あると
> 紛らわしいという指摘を受け、**常に同じ1つのアイコン**（`markdownInline.togglePreview`,
> `$(book)`）に統一した。クリックすると現在のモードに応じて Raw⇄Preview を切り替える。
> ※テキストエディタ内に浮動固定ウィジェットは API 上作れないため、上部固定はここ（タイトルバー）。

- **editor/title: Preview/Raw トグルボタン**
  - togglePreview だけを、Raw・Preview どちらでも出す単一の when 条件で上部に出す
  - togglePreview は navigation グループ（タイトルバー右上）に置く
  - togglePreview のアイコンは常に同じ $(book)（モードで切り替わらない）
  - openPreview / openRaw はモード別の別アイコンとして editor/title には出さない（1アイコンに統一）

### `test/suite/preview/tabs-editors/toggleDecision.test.ts`（4 件）

> decidePreviewToggle（Raw ⇄ Preview 切替判定）のユニットテスト。
>
> 回帰の主眼（ユーザー報告）: 他のファイルが Preview で開いていると、Raw で編集中の
> ファイルに対する toggle が効かず、別ファイルの Preview が Raw に戻ってしまう。

- **decidePreviewToggle**
  - Raw の Markdown を編集中なら、そのファイルを Preview にする
  - 【再現】別ファイルが Preview 中でも、Raw 編集中のファイルを Preview にする（別ファイルを Raw に戻さない）
  - Preview にフォーカス中（Raw エディタ非アクティブ）なら、その Preview を Raw に戻す
  - Markdown でも Preview でもなければ何もしない

### `test/suite/raw/lists-tables/listEdgeCases.test.ts`（27 件）

- **List Edge Cases**
  - **6.1 Empty line in lists**
    - should detect list block boundaries with empty line
    - should renumber lists separately when separated by empty line
    - should not merge lists across empty lines
    - should handle multiple empty lines between lists
    - should detect empty list item
  - **6.2 Mixed list types**
    - should correctly identify different list types
    - should handle mixed list types in sequence
    - should extract content from different list types
    - should handle indented mixed lists
    - should preserve indent when converting types
  - **List number extraction**
    - should extract numbers from numbered lists
    - should return null for non-numbered lists
    - should handle indented numbered lists
  - **Nested list handling**
    - should calculate correct indent levels
    - should renumber nested lists correctly
    - should reset numbering at each indent level
  - **Edge cases with special characters**
    - should handle list items with special markdown characters
    - should handle checkbox with various states
    - should handle numbered list with both dot and parenthesis
  - **List continuation behavior**
    - should continue bullet list
    - should continue numbered list with incremented number
    - should continue checkbox with unchecked state
    - should exit list on empty item
  - **Block range calculation**
    - should find block boundaries
    - should handle single item block
    - should handle block at start of document
    - should handle block at end of document

### `test/suite/raw/lists-tables/tableCellNavigation.test.ts`（10 件）

- **Table Cell Navigation**
  - **getTableCellInfo**
    - should return null for non-table lines
    - should return null for separator rows
    - should detect first cell correctly
    - should detect second cell correctly
    - should handle cursor at pipe character
    - should handle cells with extra spaces
    - should handle Japanese content
  - **smartMoveLeft behavior**
    - should move to content start from middle of cell
    - should move to cell start when already at content start
    - should handle second cell correctly

### `test/suite/raw/lists-tables/tableFormatting.test.ts`（23 件）

- **Table Formatting**
  - **splitTableLine**
    - should return null for non-table lines
    - should split basic table line
    - should handle table line without outer pipes
    - should trim whitespace from cells
    - should handle empty cells
    - should handle Japanese content
  - **isSeparatorRow**
    - should return false for null or empty
    - should detect basic separator row
    - should detect separator with alignment
    - should return false for content rows
    - should return false for mixed rows
  - **getDisplayWidthWithHeuristics**
    - should calculate width for ASCII text
    - should calculate width for Japanese text (double width)
    - should calculate width for mixed text
    - should handle empty string
  - **padCell**
    - should pad basic cell content
    - should add minimum padding
    - should handle empty content
  - **isFullWidthCodePoint**
    - should detect CJK characters
    - should detect Hiragana
    - should detect Katakana
    - should return false for ASCII
    - should detect Korean Hangul

### `test/suite/raw/lists-tables/tableNavigationEdgeCases.test.ts`（34 件）

- **Table Navigation Edge Cases**
  - **TestCase 3: Cell left edge to left cell content end**
    - should move from second cell left edge to first cell content end
    - should move from third cell to second cell content end
  - **TestCase 4: Empty cell handling**
    - should handle navigation to empty cell
    - should detect empty cell correctly
    - should handle completely empty cell
    - should navigate through multiple empty cells
  - **TestCase 5: First cell left edge to line start**
    - should move from first cell left edge to line start
    - should move from first cell content start to cell start then to line start
  - **Cmd+Right navigation**
    - should move from middle to content end
    - should move from content end to cell end
    - should move from cell end to next cell content start
    - should move to line end from last cell
  - **Tab/Shift+Tab navigation**
    - Tab should move to next cell content start
    - Tab at last cell should stay in place
    - Shift+Tab should move to previous cell content start
    - Shift+Tab at first cell should stay in place
    - Tab through all cells sequentially
    - Tab should move to first non-space character in next cell
    - Tab should move to cell start for whitespace-only next cell
  - **Up/Down arrow same cell position**
    - should find same cell index in different row
    - should handle rows with different cell counts
    - should preserve the same offset in the target cell
    - should clamp to target cell end when the destination cell is shorter
    - should preserve relative content position across rows
    - should leave one space when moving into an empty cell
  - **Selection operations (Shift+Cmd+Left)**
    - should select from cursor to content start
    - should extend selection to cell start on second press
    - should extend selection to previous cell on third press
  - **Edge cases with various table formats**
    - should handle table without leading pipe
    - should handle table without trailing pipe
    - should handle single cell table
    - should handle cells with only spaces
    - should handle wide cell content (Japanese)
    - should handle mixed width content

### `test/suite/raw/navigation/lineMoveAndIndent.test.ts`（29 件）

- **Line Move and Indent**
  - **getIndentLevel**
    - should return 0 for no indent
    - should count spaces as indent levels
    - should count tabs as indent levels
    - should handle mixed spaces and tabs
    - should round up odd number of spaces
  - **getIndentString**
    - should extract leading whitespace
    - should handle empty lines
  - **isListItem**
    - should detect bullet lists
    - should detect numbered lists
    - should detect checkboxes
    - should detect indented lists
    - should return false for non-list lines
  - **extractListNumber**
    - should extract number from numbered list
    - should handle large numbers
    - should handle parenthesis delimiter
    - should preserve indent
    - should return null for non-numbered lines
  - **getLineType**
    - should detect checkbox
    - should detect numbered list
    - should detect bullet list
    - should detect heading
    - should detect quote
    - should detect code block
    - should detect empty line
    - should detect text
  - **Block movement logic**
    - should calculate block range for single line
    - should include child items in block range
    - should include nested children
    - should stop at empty line

### `test/suite/raw/navigation/selectionEdgeCases.test.ts`（31 件）

- **Selection Edge Cases**
  - **Shift+Cmd+Left selection**
    - should select from cursor to content start for heading
    - should select from cursor to content start for checkbox
    - should select from cursor to content start for numbered list
    - should select from cursor to content start for bullet
    - should select to line start when already at content start
  - **Selection with indented content**
    - should handle indented bullet list selection
    - should handle indented numbered list selection
    - should handle indented checkbox selection
  - **Selection with quote markers**
    - should handle single quote selection
    - should handle nested quote selection
  - **Selection edge cases**
    - should handle selection in plain text (no marker)
    - should handle selection at line start
    - should handle selection with existing selection
    - should handle empty line selection
    - should handle whitespace only line
  - **Selection text extraction**
    - should extract correct text from heading
    - should extract correct text from bullet
    - should extract correct text including partial word
  - **Multi-level heading selection**
    - should handle H1 selection
    - should handle H6 selection
    - should handle heading with extra spaces
  - **Checkbox state variations**
    - should handle unchecked checkbox selection
    - should handle checked checkbox selection (lowercase x)
    - should handle checked checkbox selection (uppercase X)
  - **Cmd+Shift+Left from content start to line start**
    - should select to line start when cursor at checkbox content start
    - should select marker text when going from content start to line start
    - should select to line start for bullet list at content start
    - should select to line start for numbered list at content start
    - should select to line start for heading at content start
    - should select to line start for indented checkbox at content start
    - should handle Japanese content checkbox

### `test/suite/raw/navigation/smartNavigation.test.ts`（19 件）

- **Smart Navigation**
  - **getMarkerEndPosition**
    - should detect heading markers
    - should detect checkbox markers
    - should detect checked checkbox markers
    - should detect numbered list markers
    - should detect bullet list markers
    - should detect indented markers
    - should detect quote markers
    - should detect nested quote markers
    - should detect code fence markers
    - should return no marker for plain text
  - **smartMoveLeft logic for non-table**
    - should move to content start for heading
    - should move to content start for checkbox
    - should move to content start for numbered list
  - **smartMoveRight logic for table**
    - should move to content end from middle of cell
    - should move to next cell from cell end
  - **getTableCellInfo extended**
    - should return allCells array
    - should track cell index
    - should calculate content boundaries correctly
    - should handle empty cells

### `test/suite/raw/rendering/decorationTheme.test.ts`（19 件）

> Raw モードの装飾（decoration）テスト。
>
> 前半: decoration の色・スタイル定義をソースから静的抽出して検証（VSCode API 不要）。
> 後半: decoration が「どのテキスト範囲」に付くかを検証する。`src/raw/decorations/updaters.ts`
> は `vscode.Range`/`vscode.Position` に依存し実 VS Code 拡張ホストが無いと import できないため、
> このプロジェクトの test/suite/raw/ の慣習（本ファイル以外の raw ユニットテストも同様）に
> 倣い、同じ正規表現・同じ範囲計算ロジックを `vscode` 型に依存しない純関数として複製し、
> 行・列単位で範囲が一致するかを検証する。updaters.ts の該当ロジックを変更したら、
> ここの複製もあわせて更新すること。

- **Decoration Theme**
  - **codeBlock decoration**
    - should define light and dark backgroundColor variants
    - light backgroundColor should be light (low alpha or white-based)
    - dark backgroundColor should be dark (high alpha or dark-based)
    - should NOT use a single hardcoded dark backgroundColor without light/dark split
  - **horizontalRule decoration**
    - should have light and dark borderColor variants
  - **heading decorations**
    - should define at least 6 heading levels
  - **Decoration range computation（適用されるテキスト範囲）**
    - **チェック済みチェックボックスの取り消し線範囲**
      - マーカー "- [x] " を除いたラベル部分だけに範囲が付く
      - ネストしたチェック済み項目でもインデント込みのマーカー直後から範囲が始まる
      - 未チェック "- [ ]" には範囲が付かない
      - ラベルが空（"- [x] " のみ）の行には範囲が付かない（startPos < line.length を満たさない）
    - **見出しの範囲とレベル判定**
      - # 〜 ###### の各行が行頭から行末までの範囲で、正しいレベルに割り当てられる
      - # の後にスペースが無い行は見出しとして扱われない
      - # が7つ以上連続する行は見出しとして扱われない（無効な Markdown 見出し）
    - **水平線（hr）の範囲**
      - --- / *** / ___ の行は行全体が範囲になる
      - ハイフンの間にスペースがある "- - -" は水平線として扱われない
    - **コードブロック背景の範囲**
      - 開始 ``` 行の先頭から終了 ``` 行の末尾までが範囲になる
      - 閉じフェンスが無い場合は文書末尾までが範囲になる（未終端フェンス）
    - **コードブロック内シンタックスハイライトの範囲**
      - python の keyword / string / comment / number / function 各トークンが正しい列位置で検出される
      - startLine/endLine の範囲外の行はトークン抽出の対象にならない

### `test/suite/shared/blockDiff.test.ts`（8 件）

- **diffBlocks**
  - marks everything unchanged when identical
  - marks an appended block as added
  - marks an inserted block as added
  - treats a replaced block as modified
  - records a deletion position
  - records trailing deletions
  - handles all-new (no base)
  - mixes modified and added in one change region

### `test/suite/shared/bracketSelection.test.ts`（12 件）

- **bracketSelection: findEnclosingBracketContent**
  - カーソルが丸括弧の中にあれば中身の範囲を返す
  - カーソルが角括弧の中にあれば中身の範囲を返す
  - 括弧の外（開き括弧より前）にカーソルがあれば null を返す
  - 括弧が全く無い行では null を返す
  - ネストした括弧では最も内側の範囲を返す
  - ネストした括弧の外側部分にカーソルがあれば外側の範囲を返す
  - 複数の独立した括弧では現在位置を含む方だけを返す
  - 開き括弧の直後にカーソルがあれば中身（空でも）を選択対象にする
  - 閉じ括弧の直前（中身の末尾と同じ位置）にカーソルがあれば中身に含める
  - 開き括弧の直前にカーソルがあれば括弧の外とみなす
  - 対応しない閉じ括弧は無視して外側の対応する開き括弧とペアにする
  - 種類の異なる括弧はまたがず、対応する種類同士だけをペアにする

### `test/suite/shared/codeFence.test.ts`（18 件）

> コードフェンス関連の純関数（`src/shared/markdown/codeFence.ts`）のユニットテスト。
>
> - `codeFenceMarker`: 内容を包める最短のフェンス（remark-stringify と同じ規則）
> - `unwrapFencedBlock`: テキスト全体が単一の完結したフェンスブロックなら中身を取り出す
> - `repairNestedCodeFences`: 二重フェンスになってしまった Markdown を修復する
>
> 二重フェンスは「コードブロックの中へフェンス付きテキストを貼り付ける」と発生し
> （`code-fence-display-length-fix.md` / `nested-code-fence-repair.md`）、Preview では
> フェンス行が4本並んで見え、コードブロック内の Cmd+A にもフェンスが混ざる
> （2026-07-27 ユーザー報告）。貼り付け時の防止とは別に、既存ファイルを直す手段が要る。

- **codeFenceMarker**
  - バッククォートを含まない内容は3連バッククォート
  - 内容に3連バッククォートがあれば4連に広げる（remark-stringify と同じ規則）
  - 内容に4連バッククォートがあれば5連に広げる
  - インラインコード程度（1〜2連）では3連のまま
- **unwrapFencedBlock**
  - 単一の完結したフェンスブロックなら中身と言語を返す
  - 言語指定が無ければ language は空文字
  - 前後の空行は無視する
  - フェンスで囲まれていないテキストは null
  - 閉じフェンスが無ければ null
  - 複数のフェンスブロックが並ぶテキストは null（外側だけ剥がすと壊れるため）
  - チルダフェンス（~~~）にも対応する
- **repairNestedCodeFences**
  - 二重フェンスのコードブロックを1重に戻す
  - 内側の言語指定を引き継ぐ
  - 外側に言語がある場合は外側を優先する
  - 三重フェンスも1重まで戻す
  - 正常なコードブロックは1文字も変えない
  - 中身が「フェンスを含む説明」である正当なブロックは壊さない（複数ブロックの例示）
  - 複数の壊れたブロックをまとめて直す

### `test/suite/shared/frontmatter.test.ts`（2 件）

- **frontmatter**
  - splits and merges frontmatter
  - parses frontmatter entries

### `test/suite/shared/inlineEmphasis.test.ts`（14 件）

- **findInlineEmphasis**
  - detects bold with **
  - detects bold with __
  - detects italic with *
  - detects italic with _
  - detects strikethrough
  - detects inline code
  - treats code span content as opaque to other emphasis
  - detects multiple distinct spans on one line in order
  - does not italicize underscores inside snake_case identifiers
  - ignores escaped markers
  - ignores markers with whitespace immediately inside
  - ignores a single unpaired asterisk used as multiplication
  - does not double-count the outer ** as italic when bold already matched
  - returns matches sorted by position

### `test/suite/shared/lineBreaks.test.ts`（35 件）

- **collapseBlankLineChains（空 paragraph の連鎖 → 空行の本数）**
  - 空 paragraph 1 個は空行 1 行に戻る
  - 空 paragraph 2 個は空行 2 行に戻る
  - 空 paragraph が無ければそのまま（変換対象にしない）
- **stripPlaceholderLineBreaks**
  - turns a standalone <br /> line into an empty line
  - handles <br>, <br/>, <br /> variants
  - empties placeholder cells in a table row
  - keeps intentional inline <br /> inside text
  - keeps inline <br /> inside a non-empty cell
  - leaves normal markdown untouched
- **convertTableCellBreaksToEntities**
  - converts <br> inside a table row to &#10;
  - handles <br>, <br/>, <br /> variants in cells
  - leaves <br> in normal paragraphs untouched
  - does not touch table-like lines inside fenced code
- **tightenListSpacing**
  - removes blank lines between checkbox items
  - removes blank lines between bullets and numbered items
  - keeps blank lines around non-list paragraphs
  - tightens nested items too
  - does not touch blank lines inside a fenced code block
  - leaves an already-tight list unchanged
  - tightens around empty marker-only items
  - does not collapse around a thematic break (***)
  - does not treat emphasis as a list item
- **tightenParagraphSpacing**
  - collapses a blank line between two plain paragraphs
  - collapses multiple blank lines between paragraphs
  - keeps the blank line next to a heading
  - keeps the blank line next to a list
  - keeps the blank line next to a table
  - does not touch blank lines inside a fenced code block
  - keeps blank line next to a blockquote
- **normalizePreviewMarkdown（段落間の空行を保持する）**
  - 段落どうしの空行を保持する（詰めない）
  - 複数の空行も保持する
  - 単一改行（ソフトブレイク）はそのまま
  - リストの余分な空行は引き続き詰める（tight リスト）
  - テーブルセル内の <br> は &#10; に変換する
  - <br /> プレースホルダは除去する

### `test/suite/shared/listCoverage.test.ts`（70 件）

- **List Coverage Tests**
  - **getNextListNumber**
    - should generate next number with dot delimiter
    - should generate next number with parenthesis delimiter
    - should handle large numbers
    - should handle zero
    - should use default dot delimiter
  - **convertLineToType with quotes**
    - should convert bullet to numbered in quote
    - should convert numbered to bullet in quote
    - should convert to checkbox in quote
    - should convert checkbox to normal in quote
    - should handle nested quotes
    - should handle quote with spaces
  - **convertLineToType edge cases**
    - should handle plain text to bullet
    - should handle plain text to numbered
    - should handle plain text to checkbox
    - should convert plain text to headings
    - should re-level an existing heading
    - should convert a heading to a list or plain text
    - should handle checkbox with X to numbered
    - should handle checkbox with uppercase X
    - should preserve indentation
    - should handle asterisk bullet
    - should handle plus bullet
    - should handle unknown target type
    - should handle numbered with parenthesis
  - **getListContinuationMarker**
    - should return marker for checkbox
    - should return marker for checked checkbox
    - should return next number for numbered list
    - should handle numbered list with parenthesis format
    - should return bullet for bullet list
    - should return asterisk bullet for asterisk list
    - should return plus bullet for plus list
    - should return quote marker for quote
    - should return null for plain text
    - should preserve indentation
    - should preserve indentation for numbered list
  - **toggleCheckboxState**
    - should toggle unchecked to checked
    - should toggle checked to unchecked
    - should toggle uppercase X to unchecked
    - should preserve indentation when toggling
    - should return unchanged for non-checkbox
    - should return unchanged for numbered list
  - **calculateBlockRange edge cases**
    - should handle single line block
    - should include nested children
    - should stop at empty line
    - should stop at same or lower indent level
  - **createIndent**
    - should create space indent by default
    - should create tab indent when specified
    - should handle zero level
  - **getIndentLevel edge cases**
    - should handle null input
    - should handle undefined input
    - should handle empty string
    - should handle mixed tabs and spaces
    - should round up odd spaces
  - **getListType edge cases**
    - should return null for heading
    - should return null for quote
    - should return null for code block
    - should return null for empty line
  - **Smart Enter - List continuation without duplicate markers**
    - should return only marker without duplicating for checkbox
    - should return only marker for checked checkbox
    - should return only marker for numbered list
    - should return only marker for bullet list
    - should preserve indentation without duplicating content
    - should handle long checkbox content correctly
  - **Smart Enter - Mid-line split with existing marker detection**
    - should detect existing checkbox marker in remaining text
    - should detect existing bullet marker in remaining text
    - should detect existing numbered list marker in remaining text
    - should NOT detect marker in plain text
    - should correctly identify split point scenario - checkbox case
    - should correctly identify split point scenario - real user case
    - should use isListItem to detect list marker at start

### `test/suite/shared/markdownInlineSettings.test.ts`（9 件）

- **markdownInlineSettings**
  - resolves preview enabled with default true
  - respects slash table normalize override
  - **resolveImageThumbnailEnabled**
    - 既定では off（サムネイルを隠す）
    - showThumbnail=true を明示したときだけ on
    - imagePreview.enabled=false なら showThumbnail=true でも off
    - preview 機能自体が無効なら off
  - **resolveShowLineNumbers**
    - 既定では on（Preview でもソース行番号を表示する）
    - showLineNumbers=false を明示したときは off
    - package.json の contributes 既定値も on（resolve 側の既定とズレない）

### `test/suite/shared/patterns.test.ts`（40 件）

- **Patterns Module**
  - **patterns.HEADING**
    - should match H1-H6
    - should not match invalid headings
  - **patterns.CHECKBOX**
    - should match unchecked checkbox
    - should match checked checkbox
    - should match indented checkbox
  - **patterns.NUMBERED_LIST**
    - should match numbered lists
    - should match indented numbered lists
  - **patterns.BULLET_LIST**
    - should match bullet lists
  - **getLineType**
    - should detect checkbox
    - should detect numbered list
    - should detect bullet list
    - should detect heading
    - should detect quote
    - should detect codeblock
    - should detect empty
    - should detect text
  - **getMarkerInfo**
    - should get heading marker info
    - should get checkbox marker info
    - should get numbered list marker info
    - should get bullet list marker info
    - should get quote marker info
    - should return no marker for plain text
  - **extractNumberedList**
    - should extract numbered list info
    - should handle large numbers
    - should preserve indent
    - should return null for non-numbered
  - **extractCheckbox**
    - should extract unchecked checkbox
    - should extract checked checkbox
    - should handle uppercase X
    - should preserve indent
    - should return null for non-checkbox
  - **extractHeading**
    - should extract heading level and text
    - should handle all levels
    - should return null for non-heading
  - **isListItem**
    - should detect all list types
    - should detect indented lists
    - should return false for non-lists
  - **isSeparatorRow**
    - should detect separator rows
    - should return false for content rows
    - should return false for empty/null

### `test/suite/shared/slashMenuItems.test.ts`（2 件）

- **slash menu items**
  - defines a stable set of slash commands for Raw and Preview
  - provides both raw snippet and preview markdown for each item

### `test/suite/shared/slugShared.test.ts`（2 件）

- **shared/markdown/slug**
  - matches scroll anchor slug rules for Japanese headings
  - strips punctuation and collapses hyphens

### `test/suite/shared/tableCoverage.test.ts`（26 件）

- **Table Coverage Tests**
  - **formatTableRow**
    - should format separator row with basic dashes
    - should format separator row with left alignment
    - should format separator row with right alignment
    - should format separator row with center alignment
    - should format content row with padding
    - should handle empty cells in content row
    - should handle missing cells
    - should format separator row with missing cells
  - **calculateColumnWidths**
    - should calculate widths for simple table
    - should skip separator rows when calculating
    - should detect full-width characters in columns
    - should handle empty cells
    - should handle missing cells in row
    - should calculate width for mixed content
  - **getTableCellInfo edge cases**
    - should handle cursor at pipe character
    - should handle cursor at middle pipe
    - should return fallback for cursor outside cells
    - should handle pipe at specific position
  - **getAllTableCells edge cases**
    - should handle line ending without pipe
    - should handle multiple pipes together
    - should handle only pipes
  - **Mock document tests**
    - should find table block boundaries
    - should handle table at document start
    - should handle table at document end
    - should parse table rows
    - should handle empty lines in table

### `test/suite/shared/utils.test.ts`（27 件）

- **Shared Module Integration**
  - **Width Utils**
    - should calculate string width correctly
    - should pad cells correctly
    - should detect full width characters
  - **Table Utils**
    - should split table line
    - should get all table cells
    - should get table cell info
    - should move to first non-space character for non-empty cells
    - should use cell start for whitespace-only cells
  - **TOC Utils**
    - should generate slug
    - should collect headings from text
  - **Slash Command Utils**
    - should parse slash command line
    - should parse heading slash command
    - should default heading slash command to level 1
    - should parse table normalize slash command
    - should build heading line
    - should create default table template
  - **List Utils**
    - should get indent string
    - should get indent level
    - should create indent
    - should get list type
    - should convert line to type
    - should toggle checkbox state
    - should calculate block range
    - should get list continuation marker
  - **Settings Utils**
    - should read advanced boolean settings directly
    - should prefer legacy value when advanced setting is not explicitly set
    - should prefer explicit advanced value over legacy value

### `test/suite/shared/widthCoverage.test.ts`（62 件）

- **Width Coverage Tests**
  - **isZeroWidthCombining**
    - should detect Combining Diacritical Marks (0x0300-0x036F)
    - should detect Combining Diacritical Marks Extended (0x1AB0-0x1AFF)
    - should detect Combining Diacritical Marks Supplement (0x1DC0-0x1DFF)
    - should detect Combining Diacritical Marks for Symbols (0x20D0-0x20FF)
    - should detect Variation Selectors (0xFE00-0xFE0F)
    - should detect Combining Half Marks (0xFE20-0xFE2F)
    - should detect Zero Width Space (0x200B)
    - should detect Zero Width Non-Joiner (0x200C)
    - should detect Zero Width Joiner (0x200D)
    - should detect BOM (0xFEFF)
    - should return false for regular characters
  - **isFullWidthCodePoint edge cases**
    - should detect Hangul Jamo (0x1100-0x115F)
    - should detect CJK range (0x2E80-0x9FFF)
    - should detect Hangul Syllables (0xAC00-0xD7A3)
    - should detect CJK Compatibility Ideographs (0xF900-0xFAFF)
    - should detect Vertical forms (0xFE10-0xFE1F)
    - should detect CJK Compatibility Forms (0xFE30-0xFE6F)
    - should detect Fullwidth Forms (0xFF00-0xFF60)
    - should detect Fullwidth Symbol Variants (0xFFE0-0xFFE6)
    - should detect CJK Extension B-F (0x20000-0x2FA1F)
    - should detect CJK Extension G (0x30000-0x3FFFF)
    - should return false for ASCII
  - **isNarrowChar**
    - should detect narrow lowercase i
    - should detect narrow lowercase l
    - should detect narrow number 1
    - should detect narrow pipe |
    - should detect narrow exclamation !
    - should detect narrow colon :
    - should detect narrow semicolon ;
    - should detect narrow period .
    - should detect narrow comma ,
    - should detect narrow apostrophe '
    - should return false for normal width characters
  - **isWideChar**
    - should detect wide uppercase W
    - should detect wide uppercase M
    - should detect wide lowercase w
    - should detect wide lowercase m
    - should detect wide @ symbol
    - should detect wide # symbol
    - should detect wide % symbol
    - should return false for normal width characters
  - **getStringWidth**
    - should calculate width for ASCII string
    - should calculate width for Japanese string
    - should calculate width for mixed string
    - should handle empty string
    - should skip zero-width characters
    - should handle zero width joiner
  - **getDisplayWidthWithHeuristics**
    - should match getStringWidth for basic text
    - should handle CJK text
    - should handle mixed ASCII and CJK
    - should skip combining characters
  - **padCell**
    - should pad simple content
    - should add minimum padding
    - should handle empty content
    - should handle content with leading/trailing spaces
    - should handle full-width content flag
    - should handle content longer than target width
  - **Unicode edge cases**
    - should handle emoji (not full-width in this implementation)
    - should handle Korean text
    - should handle hiragana
    - should handle katakana
    - should handle fullwidth alphabet
