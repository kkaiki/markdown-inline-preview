# テストの掟（testing-rules）

最終更新: 2026-07-07

このプロジェクトのテストに関する**判断基準と禁止事項**を一元化した文書。
「どこに何を書くか」の分類は [test-directory-design.md](specifications/test-directory-design.md)、
「まだ何が足りないか」は [preview-usage-flow-test-backlog.md](specifications/preview-usage-flow-test-backlog.md)、
「どう進めるか（TDD手順）」は `.claude/skills/tdd-browser-preview/SKILL.md` を参照。
本書はそれらの上位にある**原則**を定める。矛盾したら本書が勝つ。

***

## 1. 大原則: 実環境テストが主軸、下位レイヤーは補助

このプロジェクトで実際にユーザーを苦しめてきたバグ（タブ複製・フォーカス飛び・
カーソルズレ・IME破壊）は、**すべて実環境（実 VS Code・実 Chromium）でしか
再現できなかった**。jsdom や純関数テストが緑でも、実環境で壊れていれば壊れている。

したがってレイヤーには**信頼度の序列**がある:

```
信頼度高  extension/  実 VS Code     ← 最終判定。タブ・フォーカス・コマンド・保存はここでしか守れない
   │      browser/    実 Chromium    ← webview 内の最終判定。キャレット座標・IME・rAF・contenteditable
   │      webview/    jsdom+Milkdown ← ProseMirror transaction レベルの高速な回帰検知
信頼度低  suite/      jsdom 純関数   ← ロジック単体の最速フィードバック
```

**ルール 1-1**: バグ修正の再現テストは、**その症状をユーザーが体験するのと同じ
レイヤー**に必ず1本書く。下位レイヤーのテストは「速い回帰検知」として併設して
よいが、**上位レイヤーのテストの代わりにはならない**。

**ルール 1-2**: 「実 VS Code で再現テストを書くのが大変だから jsdom で済ませる」は
禁止。書けない技術的理由（例: webview 内部は extension テストから駆動できない）が
ある場合のみ下位で代替し、**その旨をテストファイル冒頭コメントとバックログに明記**する
（例: `preview-external-write-race-fix.md` の e2e 不可能性の明記）。

**ルール 1-3**: 新機能は最低限、実環境レイヤー（extension/ または browser/）に
ハッピーパス1本を持つこと。純関数テストだけの新機能を認めない。

## 2. 偽装カバレッジの禁止

過去の監査（バックログ §4.1・§4.3）で見つかった「テストがあるように見えて
実は守っていない」パターン。**新規テストで同じ轍を踏まない**こと。

**ルール 2-1（コピー実装テストの制限）**: `test/suite/raw/` の一部は、`vscode` 型に
依存する実装を jsdom で検証できないため、**実ソースを import せずロジックを複製した
関数**をテストしている。この手法は許容するが:

- ファイル冒頭コメントに「実装のコピーである」ことを必ず明記する
- 実装側を変更したらコピー側も同期する（コメントで相互参照する）
- **コピー実装テストは spec-test-coverage.md 上で「実ソース未検証」と区別して数える**
- 可能な限り `test/extension/raw/` に実コマンド（`markdownInline.*`）を実行する
  統合テストを併設する。コピー側だけ足してカバレッジ完了と見なさない

**ルール 2-2（アサーションの的）**: 「〜してもクラッシュしない」「タブが残る」だけの
テストは、本来守りたい性質（内容が正しい・上書きされない・フォーカスが正しい位置）を
守っていないことがある（例: 旧 12.2 は「タブが残る」ことしか見ておらず、外部編集が
Preview の保存で上書きされないこと自体は未検証だった）。テストタイトルの仕様文と
アサーションが一致しているかを書いた直後に見直す。

**ルール 2-3（最初から通るテスト）**: TDD で書いたテストが最初から通ってしまったら、
(a) バグの発火条件が違う（SKILL.md のチェックリストで条件を振る）、
(b) 既存動作の仕様固定として価値がある、のどちらかを判断して**コミットメッセージと
バックログに明記**する。「通ったからヨシ」で黙って足さない。

## 3. 失敗に強いテスト（アンチフレーク）

実環境テストは本質的にレースやタイミングに晒される。**フレークは「たまに落ちる」
ではなく「バグ検出力がある証拠」か「テストの書き方が悪い証拠」のどちらか**であり、
放置も retry での隠蔽も禁止。

**ルール 3-1（前提条件アサート）**: 操作の前に「本当に対象タブがアクティブか」
「フォーカスは期待の場所か」を assert してから本題に進む。前提が崩れた失敗と
本題の失敗を区別できないテストは、落ちたとき何も教えてくれない。

**ルール 3-2（待機は短く始める）**: `setTimeout` 待機を最初から長く取らない。
長い待機は VS Code 内部状態が完全に安定してからのテストになり、**レース起因の
バグがすり抜ける**。まず待機なし/最短で書き、通ってしまう場合のみ延ばして
原因を切り分ける。待機時間には「何を待っているか」のコメントを必ず付ける。

**ルール 3-3（インデックス指定の禁止）**: タブ操作は
`vscode.openWith(uri, viewType, column)` のように **URI を明示するコマンド**を使う。
`openEditorAtIndex` 等のインデックス指定は 0/1-based が不明瞭で誤検出の実績がある。

**ルール 3-4（確率的再現の扱い）**: 「約25%で再現」のようなレースは、テスト内で
複数回試行して**1回でも発生したら失敗**とする形に書く（発生確率を上げる方向は良い、
握りつぶす方向は禁止）。安定再現の条件が見つかったらそちらへ書き換える。

**ルール 3-5（skip の条件）**: `test.skip` を許すのは「根本原因がこのプロジェクトの
外（VS Code 本体等）にあり、修正リスクが利益を上回る」と判断した場合のみ。
skip には再現条件・調査結果・判断理由を fix ドキュメントに残す
（例: `untitled-preview-content-loss-fix.md`）。理由のない skip は削除対象。

**ルール 3-6（環境非依存）**: テストがローカルの言語設定・タイムゾーン・
ホームディレクトリ・画面サイズに依存しないこと。ビューポート幅が意味を持つ
テスト（狭いパネル等）は幅を明示的に固定する。

## 4. 運用ルール（既存の掟の再掲・本書が正）

- **TDD 必須**: 失敗するテスト → 失敗確認 → 仕様更新 → 実装 → 成功確認。
  実装が先のコミットを認めない（CLAUDE.md と同一）。

- **タイトルは仕様文**: 「この操作をしたら、こう動く」。カタログ
  （[preview-test-catalog.md](specifications/preview-test-catalog.md)）が
  生きた仕様書になるのはタイトルが仕様文のときだけ。

- **カタログ再生成**: テストの追加・改名・削除をしたら `npm run docs:test-catalog` を
  実行し、コミットに含める。

- **バックログ駆動**: 未テストのユースケースは思いついた時点で
  [preview-usage-flow-test-backlog.md](specifications/preview-usage-flow-test-backlog.md) に
  書く。テスト化したらバックログから消して「消化済み」に移す（発見バグの有無も書く）。

- **仕様との対応表**: 仕様書（機能仕様・fix 仕様）を追加・変更したら
  [spec-test-coverage.md](specifications/spec-test-coverage.md) を更新する。

- **ビルドを忘れない**: `src/preview/webview/` を変えたら `npm run build:webview`、
  ホスト側を変えたら `npm run build:host` をしてからテスト。古いバンドルへの
  テストは緑でも意味がない。

## 5. 今後の拡充マップ（どこを増やすか）

優先度順。詳細な個別項目はバックログ §4.2 が正で、ここは方針だけを示す。

### 5-1. extension/（実 VS Code）を主軸として厚くする【最優先】

現状 extension/ は 9 ファイルで、browser/（28）・webview/（31）・suite/（34）より薄い。
しかし「致命的」と分類されるバグ（タブ複製・別ファイルへのフォーカス移動・
dirty 編集の喪失）はすべてこの層の守備範囲。増やす方向:

- **実コマンドの統合テスト**: `test/suite/raw/` のコピー実装テストしかない
  コマンド（smart select のテーブル境界、smart move の文書端、コードフェンス内
  Select All progression 等）を `extension/raw/navigation.test.ts` で実コマンド実行に
  する（ルール 2-1 の返済）。

- **設定の実反映**: `settings.test.ts` は現状 `autoFormatTables` 等ごく一部。
  `src/raw/settings.ts` の10種以上の設定それぞれに「設定を変える → 挙動が変わる」を
  1本ずつ。

- **複数ファイル・複数タブの現実的な作業パターン**: 「3ファイル開いて交互に編集して
  保存」「Preview 中に Git checkout でファイルが差し替わる」等、usage-flows 的な
  複合シナリオの extension 版。

### 5-2. browser/（実 Chromium）は IME とテーブルの実操作を埋める

- テーブルセル内の実 IME composition（`overrideHardbreakSerializer` との組み合わせ）
- IME 確定直後の Cmd/Ctrl+Enter トグル
- `typedCheckboxConversion` の日本語ケースを CDP の実 composition 経路に置き換える
- テーブル形状のバリエーション（単一列・ヘッダのみ・列数不揃い）

### 5-3. webview/・suite/ は「実環境テストの高速な影」として補完

新規に増やすのは (a) 実環境で見つけたバグの最小再現、(b) 分岐網羅が物量になる
純ロジック（`renumberLists` のインデント混在等）に限る。この層を単独で
増やしてカバレッジ数値を稼ぐことはしない（ルール 1-1・2-1）。

### 5-4. テスト基盤自体の強化（中期）

- **フレーク検出**: extension テストを N 回連続実行するスクリプト
  （`for i in $(seq 5); do ... done`）を scripts/ に用意し、レース系の修正時は
  5回連続緑を確認してからコミットする慣習にする。

- **失敗時の証拠保全**: browser テスト失敗時に スクリーンショット + `h.model()` の
  ダンプを自動保存する（現状は目視 `HEADED=1` のみ）。

- **CI マトリクス**: 実 VS Code テストを stable / insiders の両方で回す
  （VS Code 本体側の挙動変化＝untitled 問題のような外部要因を早期検知）。

## 5-5. 優先順位付き実装リスト（統合版・2026-07-08）

バックログ §4.2（個別ギャップ）と本書 §5（方針）を1本化した、着手順の実行リスト。
上から着手する。各項目はバックログの元記述にも対応がある。

### P0 — 実 VS Code（extension/）、致命的バグ級カテゴリの返済

タブ複製・フォーカス移動を守る層が最も薄い（9ファイル）ため最優先。

1. ~~`test/extension/raw/navigation.test.ts`: `src/raw/commands/navigation.ts` の実コマンドを
   一切実行していない組み合わせを埋める~~ → **消化済み（2026-07-08）**: smart select left
   のテーブル境界分岐、smart move up/down の文書端フォールバック、コードフェンス内
   Select All progression の9件を実コマンドで追加。実バグなし、仕様固定。
   （`moveLineWithHierarchy` はまだ未消化 — バックログ §4.2 lists-tables 参照）。
   副産物として、フルスイート実行時のみ発生する既存テストの flake（`8.5`/`8.22`）を
   発見（バックログ §4.1b）。
2. `test/extension/raw/settings.test.ts`: `src/raw/settings.ts` の `autoFormatTables` 以外
   10 種以上（`isCodeBlockAutoCompleteEnabled` 等）に「設定変更 → 実行時の挙動が変わる」
   テストを1本ずつ追加。
3. `onDidChangeConfiguration.ts`: `headingColorScheme` 変更時のデコレーション再生成、
   複数の `markdownInline.*` 設定が1回の更新でまとめて変わるケース。

### P1 — lists-tables の実コマンド化（コピー実装債務の返済）

4. `src/raw/list/moveLine.ts` の `moveLineWithHierarchy` を実コマンド経由で
   `test/extension/raw/lists-tables.test.ts` に統合テスト追加。
5. `src/raw/list/toggleCheckbox.ts` の `moveCompletedTaskToBottom`
   （`autoMoveCompletedTasks` 設定）— 実装確認済み・テスト0件。
6. `adjustIndent` のテーブルセル内 Tab/Shift+Tab 分岐、複数行選択時の一括インデント。
7. `renumberLists`: タブ/スペース混在インデント、番号付きリスト間への bullet/checkbox
   割り込み、4段以上のネスト。
8. `tableArrowKeymap`/`tableMove`/`tableSelection`/`tableSelectionFix`/`tableCellBreak`:
   全テストが同一の定型テーブル（2列×2-3行）のみ使用 → 単一列・ヘッダのみ・
   列数不揃いテーブルのバリエーションを追加。

### P2 — browser/webview の機能別ギャップ

9. `codeLanguagePlugin.ts`（コードブロック言語選択ドロップダウン）— テスト0件。
10. `previewToolbarPlugin.ts`: ツールバーボタンクリック → 実際にドキュメントが変わることの
    確認（現状は DOM レイアウトのみ）。`toolbarShowShortcuts: false` の表示消失も未検証。
11. `previewSlashMenu.ts`: `/table` 実適用でカーソルが最初のセルに入ることの検証
    （フィルタ一覧表示のみ確認済み）。
12. `codeBlockTripleClickPlugin.ts`: 純関数 `lineRangeAt` のみテスト済み →
    webview/browser 統合テストを追加。
13. `disableTextEscape.ts`: 設定オン時に `|` を含む本文・テーブルセルでテーブルが
    壊れるケース（コード側コメントで明記のトレードオフ）。
14. `mathDecorationPlugin.ts`: `$ 100` のような金額表記を数式と誤認しないことのテスト
    （保証コメントはあるがテスト0件）。
15. `mermaidDiagramPlugin.ts`: 不正な Mermaid 構文のエラーパス（`errorCache`/
    `mermaid-diagram-error`）、同一ソースの複数コードブロックの `liveElements` 再描画。
16. `milkdownApp.ts` のズーム機能全体（`setZoom`/`applyZoom`/`readSavedZoom`、
    `ZOOM_MIN`/`ZOOM_MAX` クランプ、リロード後の永続化）— テスト0件。同ファイルの
    `updateScrollBeyondPadding`、`enableTransitions`、`insertImageSrc` も未検証。
17. `src/raw/decorations/imageInline.ts`/`tableWrapInline.ts`: 編集中行のインライン
    プレビュー非表示分岐、ファイル存在チェックのフォールバック。
18. IME確定直後の Cmd/Ctrl+Enter チェックボックストグル、テーブルセル内の実 IME
    composition（`overrideHardbreakSerializer` との組み合わせ）。
19. `typedCheckboxConversion.test.ts` の日本語ケースを CDP の実 composition 経路
    （`imeEnterRace.test.ts` と同じ手法）へ置き換え。
20. usage-flows: テーブル貼り付け→Undo→Redo 往復、テーブル×IME、リスト項目から
    テーブルセルへドラッグする構造境界をまたぐ選択。
21. `applyExternalContent.ts` のパーサー例外時フォールバック
    （`replaceAllWithClamp` への到達条件のうち実際に parser が例外を投げる入力。
    空文書＝childCount 0 の経路は 2026-07-07 に検証済み・残りは例外系のみ）。

P0/P1 はタブ複製・フォーカス系および「実装をコピーしただけで満足しない」という
本書ルール 2-1 に直結するため先に着手する。P2 は機能別の穴埋めで、緊急性は相対的に低い。

## 6. 新テスト追加チェックリスト

1. [ ] 症状と同じレイヤーに書いたか（ルール 1-1）。下位で代替したなら理由を明記したか
2. [ ] タイトルは「操作 → 期待動作」の仕様文か
3. [ ] アサーションはタイトルの仕様を本当に検証しているか（ルール 2-2）
4. [ ] 失敗を確認したか。最初から通ったなら判断を明記したか（ルール 2-3）
5. [ ] 前提条件アサートがあるか。待機は最短か（ルール 3-1・3-2）
6. [ ] ファイル冒頭に「何を・なぜ・どの層で」の `/** */` コメントを書いたか
7. [ ] `npm run docs:test-catalog` を実行したか
8. [ ] バックログ / spec-test-coverage.md を更新したか
