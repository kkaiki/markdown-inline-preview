# Preview テストカタログ（ユースケース一覧）

<!-- このファイルは自動生成。手で編集しない。`npm run docs:test-catalog` で再生成する。 -->

最終生成: 2026-07-08

テストのタイトルは「この操作をしたら、こう動く」という仕様文として書かれている。
このカタログは全テストファイルからタイトルを抽出したもので、拡張機能が保証する
ユースケースの一覧（生きた仕様書）として読める。

**総テスト数: 1170 件**

## 1. 実 VS Code 拡張ホスト（`@vscode/test-electron`） — 104 件

実行: `npx tsc -p tsconfig.test.json && node ./out-test/test/runTest.js`

実際の VS Code を **1 回だけ起動し、その同じインスタンス内で** raw/preview 両方・全カテゴリのテストを連続実行する。コマンド・タブ・フォーカス・設定連携を検証する、最も実践に近い層。`raw/`＝Raw、`preview/`＝Preview、それぞれ配下を `lists-tables`/`navigation`/`tabs-editors` 等の症状カテゴリで分類。`MOCHA_GREP` で絞り込み可。

### `test/extension/preview/external-sync.test.ts`（6 件）

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
> 発端: 2026-07-08、`docs/specifications/preview-usage-flow-test-backlog.md` 4.2 の監査で
> `test/extension/preview/` に lists-tables カテゴリ（チェックボックス関連）が
> 1件も存在しないことが判明した。
>
> 実行: `node ./out-test/test/runTest.js`（VS Code を1回起動し、extension/ 配下の
> 全テストファイルと同じインスタンス内で実行する）。`MOCHA_GREP` でテスト名の絞り込みが可能。

- **Preview: lists-tables（実 VS Code end-to-end）**
  - 13.1 チェックボックスのトグル（未チェック→チェック済み→未チェック）が実ドキュメント・実ディスクへ反映される
  - 13.2 Enter でチェックボックス項目を継続して増やした結果が実ドキュメント・実ディスクへ反映される
  - 13.3 行頭 Backspace によるチェックボックス→箇条書きの降格が実ドキュメント・実ディスクへ反映される

### `test/extension/preview/settings.test.ts`（9 件）

> Preview モード（実 VS Code）の VS Code 本体設定との連携を検証する。
>
> 対象: `alwaysOpenNewTab` → `workbench.editor.enablePreview`、
> `wordWrap` → markdown 言語スコープの `editor.wordWrap`、
> `wrapTabs` → `workbench.editor.wrapTabs` への反映。
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

### `test/extension/preview/tabs-editors.test.ts`（10 件）

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
    - 13.2 別のビューカラム（右側）に同じファイルを開く場合はPreviewと統一されず両方開いたままになる
    - 13.3 Previewタブ作成直後（500ms未満）にサイドバーから再オープンすると、その時点ではRawタブの重複解消が見送られ、後でアクティブエディタが変化すると解消される
    - 13.4 togglePreviewの実行中にサイドバー再オープンが重なっても例外にならず、最終的にPreviewタブ1枚に収束する

### `test/extension/raw/editing-core.test.ts`（3 件）

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

### `test/extension/raw/navigation.test.ts`（26 件）

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

## 2. 実 Chromium ブラウザ（Playwright + 実 webview バンドル）— すべて Preview — 206 件

実行: `npm run test:browser`

実レイアウト・実キー入力・実キャレット座標で Preview（Milkdown）を検証する。UI バグの最終判定。配下は `cursor-focus`/`focus-expand`/`ime` 等の症状カテゴリで分類。

### `test/browser/cursor-focus/caretRegression.test.ts`（5 件）

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
> 詳細設計: docs/specifications/checkbox-cursor-jump-fix.md
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

### `test/browser/cursor-focus/codeBlockTabFocus.test.ts`（4 件）

> 実ブラウザ回帰テスト: コードブロック内での Tab キー。
>
> ユーザー報告「``` の中を編集していると次の見出し(H2)に移動する」の原因調査で判明した
> バグ: ProseMirror は code_block に Tab を割り当てておらず、素通りするとブラウザ既定の
> 「次のフォーカス可能要素へ移動」が発動し、コードブロック自身の言語選択 <select> へ
> DOM フォーカスが飛んでしまう（詳細: docs/specifications/code-block-tab-focus-leak-fix.md）。
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

### `test/browser/editing-core/editingOperations.test.ts`（17 件）

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
    - 段落の行末で Enter → 新しい段落ができ、内容は分割されない
    - 箇条書きの行末で Enter → 新項目ができ、元の項目は保持される
    - チェックボックスの行末で Enter → 新項目は未チェックで継続する
  - **リストのインデント/アウトデント**
    - 2番目の項目で Tab → 入れ子になり、Shift+Tab で戻る
  - **行頭 Backspace によるブロック解除**
    - コードブロックの先頭で Backspace → 段落に解除される
    - 引用の先頭で Backspace してもクラッシュしない
  - **段落の分割と結合**
    - 段落途中で Enter 分割 → 先頭 Backspace で元通り結合できる
  - **インラインマーク端の Backspace で解除**
    - 太字の末尾で Backspace → 太字が外れ、テキストは残る
    - インラインコードの末尾で Backspace → コードが外れ、テキストは残る
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

### `test/browser/focus-expand/codeFenceFocusMarkers.test.ts`（3 件）

> 実ブラウザ回帰テスト: コードフェンス（```lang` / ```` ``` ````）の focus-expand。
>
> 見出し（`## `）やインライン記法（`**` `` ` ``）は、フォーカスが中にあるあいだ
> `focusSyntaxPlugin` が Markdown 記法（マーカー）を widget decoration として表示する
> （Obsidian の Live Preview と同様）。フェンスコードブロック（```` ``` ````）だけは
> この対象になっておらず、フォーカスの有無にかかわらず言語名やフェンス行が一切
> 見えない。Obsidian 同様、コードブロックにフォーカスがある間は開始行（```` ```js ````
> 等）と終了行（```` ``` ````）を表示し、フォーカスが外れると隠れるようにする。
>
> 実行: `npm run test:browser`。ブラウザが無い環境では skip。

- **実ブラウザ: コードフェンスの focus-expand（```lang` / ```` ``` ````表示）**
  - コードブロックにフォーカスがあるあいだ、開始行（```js` を含む）と終了行（```` ``` ````）が表示される
  - フォーカスがコードブロックから外れると、フェンスマーカーは隠れる
  - フェンスマーカーは装飾のみで、実文書やホストへ送る Markdown には混入しない

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
> 詳細設計: docs/specifications/collapse-markdown-sync-fix.md
>
> 実行: `npm run test:browser`。ブラウザが無い環境では skip。

- **実ブラウザ: collapse 後の markdown 同期回帰**
  - 見出しを新規タイプして離れるだけで、保存 markdown に見出しの内容が反映される
  - 箇条書きを新規タイプして離れるだけで、保存 markdown に内容が反映される
  - 引用を新規タイプして離れるだけで、保存 markdown に内容が反映される
  - 既存見出しに1文字追記して離れるだけで、保存 markdown に追記内容が反映される
  - 何も変更せずフォーカスして離れただけなら、余計な change は増えない（重複判定の回帰確認）

### `test/browser/focus-expand/headingBlockquotePrefixSpace.test.ts`（6 件）

> 実ブラウザ回帰テスト: 見出し・引用のフォーカス展開で、プレフィックスと本文の間の
> 半角スペースが消える不具合。
>
> ## バグ内容
>
> `## heading` や `> quote` を1文字ずつ実際にタイプすると、`## `/`> ` へ変換された直後
> （プレフィックスがまだ空の状態）に続けて文字を打つと、プレフィックスと本文の間の
> スペースが消える（`##heading`、`>quote` のようにくっつく）。`blockPrefixEditPlugin` が
> プログラム的に挿入する末尾スペース（素の半角スペース）を、ブラウザが視覚的に潰して
> しまい、続く実キー入力で ProseMirror の domObserver がその潰れたスペースを文字に
> 置き換えられたものとして扱ってしまうことが原因。箇条書き・番号付き・チェックボックス
> （`list-item-block` Web Component でレンダリング）では再現しない。
>
> 詳細設計: docs/specifications/heading-blockquote-prefix-space-fix.md
>
> 既存のマークダウンを読み込んだ場合は問題無い。実際にキーを1つずつ押した場合にだけ
> 再現するため、`h.type()`（実キーイベント）で検証する。
>
> 実行: `npm run test:browser`。ブラウザが無い環境では skip。

- **実ブラウザ: 見出し・引用のプレフィックス末尾スペース回帰**
  - "## heading" を1文字ずつタイプすると、プレフィックスと本文の間にスペースが保持される
  - "# item"（H1）でもスペースが保持される
  - "### h"（H3）でもスペースが保持される
  - "> quote" でもスペースが保持される
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

### `test/browser/lists-tables/checkboxEditDelete.test.ts`（3 件）

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

### `test/browser/lists-tables/typedCheckboxConversion.test.ts`（9 件）

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
> 詳細設計: docs/specifications/typed-checkbox-conversion-fix.md
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
  - 回帰確認: 通常の箇条書き（チェックボックスでない）は今まで通りフォーカス中に "- " が展開される

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

### `test/browser/rendering/lineNumberGutter.test.ts`（8 件）

> 実ブラウザ回帰テスト: 行番号ガター（lineNumberGutterPlugin）。
>
> 各トップレベルブロックの左に「ソース Markdown の開始行番号」を出す機能。
> - 設定 showLineNumbers が true のときだけ表示する。
> - 行番号は保存ファイルと同じ整形（tight リスト等）を通して数えるため、実際のソース行と一致する。
> - 既存の diff ガターと共存する（別レイヤ）。
>
> jsdom では座標・widget 描画・シリアライズ整形の組み合わせを検証できないため、ここが砦。
> 実行: `npm run test:browser`。ブラウザが無い環境では skip。

- **実ブラウザ: 行番号ガター**
  - showLineNumbers=false のときは行番号を表示しない
  - showLineNumbers=true で各ブロックに行番号が出る
  - 行番号が実際のソース行と一致する（見出し/段落/リスト/コード/引用）
  - リストは各項目に行番号が出る（先頭だけでない）
  - 番号付きリストも各項目に行番号が出る
  - コードブロックの行番号も（pre の overflow に）クリップされず表示される
  - showToolbar: true のときも行番号が viewport 左端よりも右にある（クリップされない）
  - showLineNumbers: true のとき .milkdown に padding-left が付与されて行番号スペースが確保される

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

### `test/browser/rendering/mermaidNodeLabelEdit.test.ts`（4 件）

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
> （詳細: docs/specifications/mermaid-text-selection-fix.md）。
>
> 実行: `npm run test:browser`。ブラウザが無い環境では skip。

- **実ブラウザ: Mermaid図内テキストの選択**
  - 図のノードラベルをマウスドラッグで選択でき、getSelection() にテキストが残る
  - 図の選択中もコードブロックの編集（打鍵）は通常どおり効く

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
> docs/specifications/preview-usage-flow-test-backlog.md のバックログを消化するテスト群。
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
    - 段落の途中で Enter して分割し、Backspace で結合すると元の段落に戻る
    - 見出しの末尾で Enter すると、次の行は本文（段落）になり見出しは汚れない
    - 箇条書き項目の途中で Enter すると項目が2つに分割される
  - **テーブルでの境界操作**
    - テーブルセルの先頭でチェックボックス記法を打っても、ただの文字列として扱われテーブルは壊れない
  - **コピー & ペースト**
    - チェックボックス項目をコピーして別の場所にペーストすると、同じ内容の未チェック項目として挿入される
    - チェックボックスをペーストした直後に別の行で [ ] を追記しても、両方の項目が正しいまま残る

## 3. webview 統合（jsdom + Milkdown 実エディタ）— すべて Preview — 223 件

実行: `npm run test:unit`

jsdom 上で Milkdown エディタを実際に組み立てて、ドキュメント変換・シリアライズを検証する。配下は browser/ と同じ症状カテゴリで分類。

### `test/webview/cursor-focus/blockPrefixEditSelectionMap.test.ts`（4 件）

> blockPrefixEditPlugin: 展開中に「別ブロック」で起きた編集による nodePos/contentStart の
> 再マッピング（`appendTransaction` の `tr.mapping.map`）を単体で固定するテスト。
>
> test-directory-design.md §5 の「blockPrefixEditPlugin の expand/collapse が走る瞬間の
> selection.map（トランザクションによるカーソル位置の写像）を単体で固定するテスト」の
> ギャップを埋める。既存の `blockPrefixEdit.integration.test.ts`
> 「複数ブロック間の移動」は H2→H3 の直接移動のみを検証しており、「展開中のブロックより
> 前のブロックが編集されて文書長が変わる」ケース（ソースコメントで言及されている
> Bug2 防止ロジックの本体）は未カバーだった。

- **blockPrefixEditPlugin: 展開中の別ブロック編集による位置の再マッピング**
  - 展開中のブロックより前のブロックへテキストを追加すると、nodePos/contentStart が挿入分だけ前進する
  - 再マッピング後に別ブロックへ抜けても、見出しは正しく collapse される（プレフィックス残存しない）
  - 展開中のブロックより前のブロックからテキストを削除すると、nodePos/contentStart が削除分だけ後退する
  - 複数回の別ブロック編集を経ても、最終的な collapse でプレフィックスが二重化しない

### `test/webview/cursor-focus/checkboxSelectionGuard.test.ts`（3 件）

> blockPrefixEditPlugin 内 `pendingCheckboxSelectionGuard`（1000ms のチェックボックス
> 変換直後カーソル保護ガード）の内部ロジック単体テスト。
>
> 症状レベルの再現（実 Chromium・`test/browser/cursor-focus/checkboxCursorJump.test.ts`）は
> 既に対称カバレッジ済みだが、ガード自身の「armedAt からの経過判定」「実タイプでは
> 追跡位置と selection が一致し続けるので誤爆しない」「ドキュメントを変えない
> transaction（selectionchange 由来）でズレたら復元する」という内部の時間窓・判定ロジックは
> jsdom 上で直接 transaction を発行することで、実ブラウザより高速かつ決定的に検証できる。

- **blockPrefixEditPlugin: pendingCheckboxSelectionGuard（変換直後カーソル保護ガード）**
  - checked が null→boolean に変わった直後、ドキュメントを変えない selectionchange でカーソルがズレても元の位置へ復元される
  - 変換直後に実際にタイプを続けても、ガードは追跡位置を更新するだけで誤って元に戻さない
  - ガード窓（1000ms）経過後は、ドキュメントを変えない selectionchange があっても復元しない

### `test/webview/cursor-focus/cursorAnchor.integration.test.ts`（4 件）

> Preview（ProseMirror）側のカーソル ⇄ ブロックアンカー変換の統合テスト。
> Raw ⇄ Preview のカーソル引き継ぎの中核（往復で同じ位置に戻ること）。

- **webview統合: カーソル ⇄ ブロックアンカー**
  - 2 番目の段落のカーソルは block=1, offset=その位置
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
> 「`A\n\nB` の空行が preview に入る（= 2 段落として読み込まれ、空行ぶんの隙間が出る）」の回帰防止。

- **webview統合: 段落間の空行の保持**
  - 空行で区切られた `A\\n\\nB` は 2 段落として読み込まれる
  - 単一改行 `A\\nB`（ソフトブレイク）は 1 段落のまま
  - 複数の空行があっても本文が 2 段落で保持される

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

### `test/webview/editing-core/clipboardHardbreak.test.ts`（1 件）

> Preview でテーブルセル内の改行（hardbreak）を含む範囲をコピーすると、クリップボードの
> text/plain に markdown 用の `<br>` がそのまま入ってしまう不具合の回帰テスト。
>
> `overrideHardbreakSerializer` はセル内 hardbreak を保存用 markdown として `<br>` に
> するが、`@milkdown/plugin-clipboard` の既定 `clipboardTextSerializer` は
> コピー時にも同じ markdown シリアライザをそのまま使うため、他アプリへ貼り付けたときに
> 読める改行ではなく文字列 `<br>` が入ってしまう。

- **Preview: セル内改行を含む範囲のコピーで <br> が漏れない**
  - 表セル内の hardbreak を含む選択をコピーすると、clipboardTextSerializer の出力に <br> ではなく改行が入る

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

### `test/webview/editing-core/markerBackspace.integration.test.ts`（9 件）

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
  - 段落末尾で Enter → 段落が1つ増える
  - 段落途中で Enter → カーソル位置で2段落に分割される
  - 段落先頭で Enter → 上に空段落が入り、本文は2段落目になる
  - Shift+Enter → 段落は増えず、hardBreak が1つ挿入される
  - 空段落で Enter → さらに空段落が増える（エラーにならない）

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

### `test/webview/focus-expand/blockPrefixEdit.integration.test.ts`（28 件）

> blockPrefixEditPlugin 統合テスト（Typora 風「フォーカスで記法展開」）。
>
> ### テスト設計上の前提
> - エディタ作成直後、カーソルはドキュメント先頭ブロックに置かれる。
>   第 1 ブロックが見出し / リスト項目なら plugin が即座に展開する（auto-expand）。
> - そのため「初期状態 = null」ではなく「第 1 ブロックが段落の場合は null」で確認する。
> - テキスト検索は展開後に `## Hello` となっているため、ノード位置で移動する。
> - listItemBlockComponent は jsdom で SVGElement が無くてエラーになるため、
>   基本の gfm プリセットだけでリスト項目をテストする。

- **blockPrefixEditPlugin: フォーカスでプレフィックス展開**
  - **見出し**
    - 段落が最初のブロックのときは getExpandedBlock() は null
    - H2 にカーソルを移すと getExpandedBlock() が non-null になる
    - H2 にフォーカスすると "## " がテキスト先頭に現れる
    - 別の段落に移ると getExpandedBlock() が null に戻る
    - 別の段落に移るとプレフィックスが削除される
    - H2 に入った直後（auto-expand）でも展開状態になっている
    - プレフィックスを "### " に変えて抜けると H3 に昇格
    - 2 番目の "#" を削除して抜けると H1 に降格
    - リンクで始まる見出しにフォーカスしても、挿入した "## " がリンクのマークを継承しない
  - **タスクリスト**
    - - [ ] item にカーソルを入れても展開しない（getExpandedBlock() = null）
    - - [x] item にカーソルを入れても展開しない
    - チェックボックス項目を通過しても他ブロックの展開に影響しない
    - checked 属性が保持される（展開なしでも属性は変わらない）
    - markerBackspace のチェックボックス→箇条書き降格直後に "- " が実テキストとして漏れない（実バグ回帰・2026-07-08 発見/修正）
  - **箇条書き**
    - - item にカーソルを入れると "- " が先頭に現れる
    - 抜けると "- " が消えてテキストだけ残る
    - リンクで始まる箇条書きにフォーカスしても、挿入した "- " がリンクのマークを継承しない
  - **番号付きリスト**
    - 1. item にカーソルを入れると "1. " が先頭に現れる
    - 抜けると "1. " が消えてテキストだけ残る
    - 2番目の項目にカーソルを入れると項目自身の番号 "2. " が現れる（常に "1. " にならない）
    - 抜けても番号は変化しない（"2. " のまま維持される）
    - リンクで始まる番号付き項目にフォーカスしても、挿入した番号プレフィックスがリンクのマークを継承しない
  - **blockquote**
    - > text にカーソルを入れると "> " が先頭に現れる
    - 抜けると "> " が消える
    - リンクで始まる blockquote にフォーカスしても、挿入した "> " がリンクのマークを継承しない
  - **markerBackspace との共存**
    - 展開中は getExpandedBlock() が non-null を返すため markerBackspace は return false できる
    - 展開中に tr.delete でプレフィックスの # を削除して抜けると level が更新される
  - **複数ブロック間の移動**
    - H2 → H3 と移動すると旧ブロックのプレフィックスが消え新ブロックが展開

### `test/webview/focus-expand/previewDiffFocusExpand.integration.test.ts`（4 件）

> Preview の Git 差分ガター（previewDiffPlugin）× Typora 風フォーカス展開
> （blockPrefixEditPlugin）の相互作用テスト。
>
> 不具合: 見出し / 箇条書き / blockquote にカーソルを合わせただけ（実編集なし）で、
> blockPrefixEditPlugin が行頭記法（`## ` 等）を実テキストとしてドキュメントに
> 挿入するため、previewDiffPlugin が比較する「現在ブロックのシグネチャ」が
> Git HEAD と無変更でも変わってしまい、フォーカスした瞬間だけブロックが
> 「変更（青）」として表示されてしまう。

- **webview統合: Git差分ガター × フォーカス展開の相互作用**
  - 見出しにフォーカスしただけ（未編集）で誤って「変更」と判定される（不具合の再現）
  - 見出しにフォーカスしても、展開中プレフィックスを除いて比較すれば差分は出ない（修正後）
  - 箇条書きにフォーカスしても、展開中プレフィックスを除いて比較すれば差分は出ない（修正後）
  - blockquote にフォーカスしても、展開中プレフィックスを除いて比較すれば差分は出ない（修正後）

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

### `test/webview/rendering/imageCopy.test.ts`（10 件）

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
- **imageCopyPlugin: writeDataUrlToClipboard**
  - PNG dataUrl をクリップボードに image/png として書き込む
  - image に加えて text/html(<img data:>) も書き込む（Notion 等で画像として貼れる）
  - Clipboard API が失敗しても false を返し throw しない
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

### `test/webview/shortcuts/previewKeymap.integration.test.ts`（30 件）

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

## 4. ユニット・純関数（jsdom）— preview/ raw/ shared/ に分類 — 637 件

実行: `npm run test:unit`

ロジック単体の高速テスト。`preview/`＝Preview 側、`raw/`＝Raw 側（各々さらに症状カテゴリで分類）、`shared/`＝両モード共通のロジック（カテゴリ分割せず均質に管理）。

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

### `test/suite/preview/cursor-focus/previewFocusSyntax.test.ts`（13 件）

- **focusSyntaxHelpers**
  - getHeadingPrefix returns correct hashes
  - getInlineMarkMarker maps common marks
  - getBlockPrefix resolves the list-item prefix from the inner paragraph depth
  - getCodeFenceMarkers returns the open/close fence text for a code_block
  - getCodeFenceMarkers omits the language when empty
  - getCodeFenceMarkers returns null for non-code_block nodes
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
> 文書末尾へ飛んでしまう（詳細: docs/specifications/stale-external-push-cursor-jump-fix.md）。
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

### `test/suite/preview/external-sync/serialQueue.test.ts`（2 件）

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

### `test/suite/shared/lineBreaks.test.ts`（32 件）

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
