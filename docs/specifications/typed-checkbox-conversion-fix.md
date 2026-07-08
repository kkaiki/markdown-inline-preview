# Preview: `- [ ] ` を1文字ずつタイプしてもチェックボックスにならない不具合の修正 仕様

最終更新: 2026-07-01

## 1. 症状

Preview（Milkdown WYSIWYG）で、新しい行に `- [ ] タスク` のようなチェックボックス記法を**1文字ずつ実際にタイプ**すると、チェックボックスの見た目（`list_item(checked=false/true)`）にならず、`- [ ] タスク` が**リスト項目の中の生テキストとして残ってしまう**ことがあった（`*`/`+` マーカー、`[x]`、番号付きリスト、日本語本文、既存ブロックの直後など、条件によらず広く再現する）。

既存のマークダウンを読み込んだ場合（`openPreview(browser, '- [ ] task\n', ...)` のように初期ロード時に渡す場合）は正しくチェックボックスとして構造化される。**実際にキーを1つずつ押して作る場合にだけ**再現する。

## 2. 根本原因（2つ、独立して発生する）

### 原因A: `blockPrefixEditPlugin` の展開が GFM の InputRule を邪魔する

チェックボックスは Milkdown/GFM の組み込み InputRule `wrapInTaskListInputRule`（正規表現 `/^\[(?<checked>\s|x)\]\s$/`）が担う。この InputRule は「**リスト項目の段落の先頭（`^`）に** `[ ] ` や `[x] ` がちょうどある」ことを要求する。

`- ` を打つと別の InputRule が現在の段落を `bullet_list > list_item > paragraph`（中身は空）へ変換する。この直後、`blockPrefixEditPlugin`（Typora 風フォーカス展開）が「フォーカス中の list_item」とみなし、**即座に `- ` をプレフィックスとして実テキスト挿入**していた。続けて `[`, ` `, `]`, ` ` をタイプしても、段落の先頭には既に展開済みの `- ` が残っているため、`wrapInTaskListInputRule` の `^` にマッチできず、チェックボックスへ変換されない。

**修正**: `blockPrefixEditPlugin.getFocusedBlockInfo` の list_item 分岐に、段落内容が「まだチェックボックス記法を打っている途中」に見える（空文字列、または `[`, `[ ]`, `[x]` 等にマッチする）あいだは展開を保留するチェックを追加した（`isPendingTaskMarkerText`、`blockPrefixEditPlugin.ts`）。記法として成立しない内容（`a` など）を打ち始めたら通常どおり展開を再開する。

ブラウザの contenteditable は、末尾のスペースキー入力を ` `（non-breaking space）として挿入することがある（視覚的な折り畳みを防ぐため）。判定の正規表現は素の半角スペース `[ xX]` ではなく `\s` を使った `[\sxX]` にする必要がある（`\s` は ` ` にもマッチする）。素の半角スペースだけを見ていると、実際にブラウザでタイプした場合は常に不一致になり、展開抑制が効かなかった。

### 原因B: チェックボックス変換自体が Web Component 再マウントでカーソルを飛ばす

原因Aを塞いだ後も、**見出しの直後**など特定の周辺構造で、変換後にカーソルが対象のチェックボックスではなく別ブロック（多くの場合ドキュメント内の別の場所、体感としては直前の見出しなど）へ飛び、その後に続けてタイプした文字がそちらに書き込まれてしまう不具合が残っていた。

これはチェックボックス変換完了時に共通する既知のクラスの不具合（詳細: [checkbox-cursor-jump-fix.md](./checkbox-cursor-jump-fix.md)）と同じ原因: `list_item` の `checked` が `null` から `boolean` へ変わると、Milkdown の `list-item-block` Web Component が「素の `<li>`」から再マウントされ、ブラウザのネイティブ selection を見失う。見失った直後に届く（ドキュメントを変えない）selectionchange 由来の transaction がカーソルを別ブロックへ動かしてしまう。

以前（`checkbox-cursor-jump-fix.md`）は、自前のコード（`makeTodo` / `toggleCheckbox`）が「wrap」と「checked 設定」を2回に分けて dispatch していたのが原因だったため、1回の transaction にまとめることで解決できた。**今回は GFM 組み込みの `wrapInTaskListInputRule` 自体が単一 transaction で `checked` を設定しており、呼び出し側で dispatch をまとめる余地が無い**。そのため別の対策が必要だった。

**修正**: `blockPrefixEditPlugin.ts` に「チェックボックス変換直後の正しい selection 位置を追跡するガード」を追加した（`pendingCheckboxSelectionGuard`）。

- `appendTransaction` で `checked: null → boolean` の変換を検知したら、変換直後の selection 位置を覚える。
- 以降の transaction ごとに、覚えた位置を `tr.mapping` で更新し続ける。実際のタイプが続く限り、追跡位置と実際の selection は同じだけ前進するため一致し続ける。
- selectionchange 由来の誤爆は**ドキュメントを変えない**（`tr.mapping` が恒等写像）ため、追跡位置は動かない。この状態で実際の selection が追跡位置と異なっていれば誤爆と判断し、selection を追跡位置へ戻す。
- 誤爆は変換直後の短い時間内に起きるため、`CHECKBOX_SELECTION_GUARD_WINDOW_MS`（1000ms）を超えたら追跡をやめる（無関係な将来の selection 変更を巻き戻さないため）。

一度きりの「次の update だけ保護する」方式では不十分だった: 高速にタイプすると、誤爆（selectionchange）が届くより前に次のキー入力の update が先に来てガードが消費されてしまい、その後の誤爆を防げなかった（見出し直後に `- [ ] task` を高速タイプすると `task` が見出し側に書き込まれる不具合として再現した）。時間ベースの持続的追跡にしたことで解決した。

## 3. テスト方針

DOM 実レイアウト・実 Web Component の再マウント・ブラウザのネイティブ selection 挙動・実際のキー入力タイミングが絡むため、jsdom では再現できない。`test/browser/typedCheckboxConversion.test.ts` に実 Chromium テストとして追加し、以下を網羅する:

- マーカー種別: `-` / `*` / `+`（箇条書き）、`1.`（番号付き）
- チェック状態: `[ ]`（未チェック）/ `[x]`（チェック済み）
- 言語: 英語 / 日本語
- 周辺状態: 独立した段落の後 / 既存リストの直後 / 見出しの直後（原因Bが顕著に再現する構成）
- 回帰確認: 通常の箇条書き（チェックボックスでない）は今まで通りフォーカス中に `- ` がプレフィックス展開されること
