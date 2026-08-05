# Preview テストカタログ（ユースケース一覧）

<!-- このファイルは自動生成。手で編集しない。`npm run docs:test-catalog` で再生成する。 -->

最終生成: 2026-08-05

テストのタイトルは「この操作をしたら、こう動く」という仕様文として書かれている。
このカタログは全テストファイルからタイトルを抽出したもので、拡張機能が保証する
ユースケースの一覧（生きた仕様書）として読める。

**総テスト数: 1000 件**

## 1. 実 VS Code 拡張ホスト（`@vscode/test-electron`） — 88 件

実行: `npx tsc -p tsconfig.test.json && node ./out-test/test/runTest.js`

実際の VS Code を **1 回だけ起動し、その同じインスタンス内で** raw/live 両方・全カテゴリのテストを連続実行する。コマンド・タブ・フォーカス・設定連携を検証する、最も実践に近い層。`raw/`＝Raw、`live/`＝Live、それぞれ配下を `lists-tables`/`navigation`/`tabs-editors` 等の症状カテゴリで分類。`MOCHA_GREP` で絞り込み可。

### `test/extension/live/tabs-editors.test.ts`（4 件）

> 実 VS Code でのモード記憶とタブ制御。
>
> ユーザー指示（2026-08-05）:
>   「デフォルトで開くときに live にしたときは、そのあとは live で開き、
>    raw にどこかでしたものがあれば、それは以降は raw で開き続ける」
>   「上部のタブに、raw live どちらかのタブだけが開かれるように制御して欲しい」
>
> 記憶はファイルごとなので、あるファイルを Raw にしても他のファイルは Live のまま
> であることまで確認する。ここは実 VS Code でしか検証できない層。

- **Live モード: モード記憶とタブ制御（実 VS Code）**
  - openLive で Live のカスタムエディタが開く
  - 同じファイルの Raw タブと Live タブが同時に開かない
  - toggleLive で Raw にすると、次に開いても Raw のまま
  - Raw にしたのは そのファイルだけで、他のファイルは Live のまま

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

## 2. 実 Chromium ブラウザ（Playwright + 実 webview バンドル）— すべて Live — 146 件

実行: `npm run test:browser`

実レイアウト・実キー入力・実キャレット座標で Live（CodeMirror 6）を検証する。UI バグの最終判定。配下は `focus-expand`/`editing-core`/`ime` 等の症状カテゴリで分類。

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

### `test/browser/live/editing-core/fenceCursor.test.ts`（5 件）

> コードフェンスの中にカーソルを入れられることを実 Chromium で固定する。
>
> ユーザー報告（2026-08-05）:「``` ``` この中にカーソルを入れることができない」。
> 原因は「開始フェンスを打っても本文行が作られない」こと。本文行が無いと
> カーソルを置く場所そのものが存在しない。

- **Live モード: コードフェンスの中への入力（実ブラウザ）**
  - "```" を打って Enter すると本文行と閉じフェンスができる
  - 補完直後のカーソルは本文行にある（そのまま打てる）
  - すでに閉じているフェンスでは二重に補完しない
  - 空のフェンスでも開始行の末尾で Enter すれば本文行を作れる
  - 本文行があればクリックでその行に入れる

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

### `test/browser/live/lists-tables/tableCellEdit.test.ts`（19 件）

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
  - **セルをまたぐ範囲選択（ユーザー報告: 表の複数選択ができない）**
    - ドラッグで複数セルが選択される
    - 横方向のドラッグで同じ行のセルだけ選択される
    - 単一セルのクリックでは範囲選択にならない（通常のテキスト選択のまま）
    - 選択したセルはドキュメントを変更しない
    - Escape で選択が解除される
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

### `test/browser/live/rendering/typography.test.ts`（14 件）

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
    - 画面が狭いときは本文が画面幅に収まり、横スクロールが出ない
    - 画面が広いときは読み幅で頭打ちになり中央に寄る
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

### `test/browser/live/shortcuts/selectAllSteps.test.ts`（7 件）

> ⌘A の段階的な全選択と、mermaid のプレビューを実 Chromium で固定する。
>
> ユーザー指示（2026-08-05）:
>   「表のセルの中で command a で、そのセルを全部。もう一度でその行、もう一度で表全部、
>    もう一度で全てのファイルの内容」「``` も、同じようにその中をコピーするように」
>   「mermaid だけはその下に preview で見やすくなるように」

- **Live モード: 段階的な全選択と mermaid（実ブラウザ）**
  - **コードフェンスの中での ⌘A**
    - 1回目はフェンスの中身だけを選ぶ
    - 2回目はフェンス行を含むブロック全体
    - 3回目は文書全体
    - コードブロックの外では1回で文書全体
  - **mermaid**
    - ソースは畳まれず、その下に図が描かれる
    - 壊れた図でもエディタが落ちない
    - mermaid 以外のコードブロックには図を出さない

### `test/browser/live/shortcuts/toolbarAndSlash.test.ts`（13 件）

> ツールバー・Notion 風ショートカット（⌥⌘数字）・スラッシュコマンドを
> 実 Chromium で固定する。
>
> ユーザー要望（2026-08-05）:
>   「画面上部に他のモード（Raw）へ切り替えられるツールバーが欲しい」
>   「notion のショートカットキーのように option command number で入れられるようにして欲しい。またスラッシュコマンドなども」
>
> ブロック変換の対応表とスラッシュ項目は Raw と共通の定義を使うので、
> ここでは「Live でも同じ操作ができる」ことを担保する。

- **Live モード: ツールバーとショートカット（実ブラウザ）**
  - **Notion 風ショートカット（⌥⌘数字）**
    - 種別をまたいでもプレフィックスが二重にならない
    - 複数行を選択すると全行に当たる
  - **ツールバー**
    - 既定で表示され、モード切替ボタンがある
    - 現在のモードが Live と表示される
    - H1 ボタンで見出しになる
    - B ボタンで選択を太字にする
    - Raw ボタンで host へモード切替を送る
    - PDF ボタンで host へ書き出しを依頼する
    - ツールバーを押してもエディタのフォーカスが外れない
  - **スラッシュコマンド**
    - "/" を打つとメニューが出る
    - 絞り込むと候補が減る
    - Enter で選ぶと記法が挿入され "/" は残らない
    - URL の中の "/" では発火しない

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

## 3. ユニット・純関数（jsdom）— live/ raw/ shared/ に分類 — 766 件

実行: `npm run test:unit`

ロジック単体の高速テスト。`live/`＝Live 側、`raw/`＝Raw 側（各々さらに症状カテゴリで分類）、`shared/`＝両モード共通のロジック（カテゴリ分割せず均質に管理）。

### `test/suite/live/editing-core/fenceEnter.test.ts`（9 件）

> コードフェンスの Enter（閉じフェンスの自動補完）の純関数テスト。
>
> ユーザー報告（2026-08-05）:「``` ``` この中にカーソルを入れることができない」。
> 原因は「開始フェンスを打っても本文行が作られない」こと。Obsidian は
> ` ```js ` + Enter で `\n\n``` ` を補い、本文行にカーソルを置く（実測 §2.7）。
> ここでその補完を固定する。

- **Live モード: コードフェンスの Enter**
  - 閉じていない開始フェンスの行末で Enter すると閉じフェンスを補う
  - 言語指定が無くても補う
  - チルダフェンスは同じ記号で閉じる
  - 4連バッククォートも同じ長さで閉じる
  - すでに閉じているフェンスでは補わない（既定の Enter に委ねる）
  - 本文の途中では補わない
  - 行末以外では補わない
  - フェンスではない行では補わない
  - 後ろに別のフェンスがあっても、自分が閉じていなければ補う

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

### `test/suite/live/lists-tables/tableSelection.test.ts`（10 件）

> 表のセル範囲選択（純関数）のテスト。
>
> ユーザー報告（2026-08-05）: 「表の複数選択ができない」。
> セルを個別の contenteditable にしている都合上、ブラウザの選択はセルをまたげない。
> そこで「アンカーセルとフォーカスセルの矩形」を自前で持つ。ここではその範囲計算と、
> 選択セルを Markdown へ書き出す処理を固定する。

- **Live モード: 表のセル範囲**
  - 同じセルを指すと1つだけ
  - 横方向の範囲
  - 縦方向の範囲
  - 矩形の範囲（行優先の順で返す）
  - 逆向きにドラッグしても同じ範囲になる
- **Live モード: 選択セルの書き出し**
  - 1セルならその中身だけ
  - 横の複数セルはタブ区切り
  - 縦の複数セルは改行区切り
  - 矩形は行ごとに改行、列はタブ
  - 範囲外のセルは無視する

### `test/suite/live/rendering/blockSyntax.test.ts`（19 件）

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
- **Live モード: mermaid コードブロック**
  - 言語が mermaid のフェンスとして検出できる
  - mermaid でもソースは畳まない（コードフェンスと同じ扱い）

### `test/suite/live/rendering/fenceBlocks.test.ts`（8 件）

> コードフェンスのブロック検出（純関数）。
>
> ユーザー報告（2026-08-05）:「``` の中で ⌘A してもその中以外の全てが選択される」。
> 原因は **フェンス検出が装飾側と ⌘A 側で別実装**になっていて、ペアリング規則が
> 食い違っていたこと。判定をこのモジュールに集約し、CommonMark の規則
> （閉じフェンスは開きと同じ記号・同じ長さ以上・info string を持たない）を固定する。

- **Live モード: コードフェンスのブロック検出**
  - 開きと閉じのペアを見つける
  - 閉じていないフェンスは closeLine が null
  - 開いたままのフェンスの中の "```js" は閉じフェンスにしない
  - 4連バッククォートの中の3連は閉じフェンスにしない（CommonMark の長さ規則）
  - info string を持つ行は閉じフェンスにしない
  - チルダとバッククォートは互いに閉じない
  - 本文が無いフェンスも1つのブロックとして返す
  - フェンスが2つ並べばブロックも2つ

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

### `test/suite/live/shortcuts/blockActions.test.ts`（17 件）

> Notion 風のブロック変換（⌥⌘0〜9）の純関数テスト。
>
> 対応表は Raw / Preview と共通の `NOTION_BLOCK_KEYMAP` を使う。
> Live モードはドキュメントが生 Markdown なので、変換は「行頭のプレフィックスを
> 差し替えるだけ」で済む。既存のプレフィックスを消し忘れると
> `## - 項目` のような壊れた行になるため、種別をまたぐ変換を重点的に固定する。

- **Live モード: ブロック変換**
  - 段落を見出し1にする
  - 見出しレベルを変える（既存の # を消してから付ける）
  - 見出しを段落に戻す
  - 箇条書きにする
  - 番号リストにする
  - チェックボックスにする
  - 引用にする
  - **種別をまたぐ変換（プレフィックスの二重付与を防ぐ）**
    - 箇条書き → 見出し
    - チェックボックス → 見出し
    - チェックボックス → 箇条書き
    - 番号リスト → チェックボックス
    - 引用 → 箇条書き
    - 見出し → 番号リスト
  - インデントは保つ
  - 同じ種別をもう一度当てても壊れない
  - 空行にも当てられる
  - コードブロックは行の置換では表せないので null を返す

### `test/suite/live/shortcuts/selectAllScope.test.ts`（12 件）

> 段階的な全選択（⌘A を押すたびに範囲が広がる）の純関数テスト。
>
> ユーザー指示（2026-08-05）:
>   「表のセルの中で command a で、そのセルを全部。もう一度でその行、
>    もう一度で表全部、もう一度で全てのファイルの内容」
>   「``` も、同じようにその中をコピーするように」
>
> 直前の選択範囲を見て「今どの段階か」を判定し、次の段階の範囲を返す。

- **Live モード: 段階的な全選択（コードフェンス）**
  - 1回目はフェンスの中身だけを選ぶ
  - 2回目はフェンス行を含むブロック全体
  - 3回目は文書全体
  - 文書全体まで来たらそれ以上広がらない
  - 本文が無いフェンスは1回目でブロック全体（中が存在しないため）
  - 前に閉じていないフェンスがあっても、正しいブロックを選ぶ
  - 4連バッククォートの中の3連は閉じフェンスにしない
  - コードブロックの外では最初から文書全体
  - フェンス行の上でも中身から始まる
- **Live モード: 段階的な全選択（表）**
  - 1回目はカーソルのある行だけ
  - 2回目は表全体
  - 3回目は文書全体

### `test/suite/live/tabs-editors/defaultMode.test.ts`（11 件）

> 「次に Markdown を開くモード」の決定（純関数）。
>
> ユーザー指示（2026-08-05）:
>   「最初のデフォルトは live、その後は raw の時は raw などのようにする」
> つまり **初回は Live**、以後は**直前に使ったモードに追従**する。

- **Live モード: 次に開くモードの決定**
  - 記憶が無ければ Live（初回の既定）
  - 直前が Raw なら Raw で開く
  - 直前が Live なら Live で開く
  - 記憶より設定が優先されることはない（記憶が最優先）
  - 記憶が無いときは設定に従う
  - 設定が未知の値でも Live に丸める
- **Live モード: 既定エディタの関連付け**
  - Live のときは *.md を Live の viewType に向ける
  - Raw のときは標準テキストエディタに向ける
  - 制御 OFF のときは自分が書いた値だけ取り除く
  - ユーザーが他拡張のビューアへ向けている設定は上書きしない
  - 同じ内容なら書き戻し不要と判定する

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

### `test/suite/live/tabs-editors/modeMemory.test.ts`（13 件）

> ファイル単位のモード記憶とタブの重複防止（純関数）。
>
> ユーザー指示（2026-08-05）:
>   「デフォルトで開くときに live にしたときは、そのあとは live で開き、
>    raw にどこかでしたものがあれば、それは以降は raw で開き続ける」
>   「上部のタブに、raw live どちらかのタブだけが開かれるように制御して欲しい」
>
> 記憶は**ファイルごと**。あるファイルを Raw にしても、他のファイルは Live のまま。

- **Live モード: ファイル単位のモード記憶**
  - 記憶が無ければ undefined（呼び出し側が既定へ倒す）
  - ファイルごとに覚える
  - あるファイルを Raw にしても他のファイルには影響しない
  - 同じファイルを開き直すと上書きされる
  - 元の記憶を破壊しない（新しいオブジェクトを返す）
  - 記憶を消せる
  - 際限なく溜まらないよう、古いものから捨てる
- **Live モード: タブの重複防止**
  - Live で開くとき、同じファイルの Raw タブを閉じる
  - Raw で開くとき、同じファイルの Live タブを閉じる
  - 他のファイルのタブは閉じない
  - 閉じる対象が無ければ空
  - 同じモードのタブは閉じない（開き直しで自分を消さない）
  - Markdown 以外のタブ（viewType が別の拡張）は触らない

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
    - 既定では on（Live でもソース行番号を表示する）
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
