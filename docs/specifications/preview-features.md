# Preview（WYSIWYG モード）仕様

最終更新: 2026-06-28  
バージョン: **1.9.8**

**Preview** = Milkdown ベースの **WYSIWYG モード**（Custom Text Editor）です。  
レンダリング結果をそのまま編集し、変更は自動で `.md` ファイルに保存されます。

Inline Preview（Raw モード）は [inline-preview-features.md](./inline-preview-features.md) を参照してください。

---

## モード概要

| 項目 | 内容 |
|------|------|
| 別名 | Preview / WYSIWYG モード |
| エンジン | Milkdown（WebView） |
| 記法の表示 | **レンダリング結果**（非フォーカス時）。フォーカス中ブロックでは `##`・`**` 等の記法マーカーを表示 |
| Raw への切替 | タイトルバー `Raw` / `Cmd+Shift+.` |
| 保存 | 編集後 約 200ms でファイルへ自動反映 |
| 向いている作業 | 読みやすさ重視の執筆・推敲 |

### Raw との比較

| | **Raw** | **Preview** |
|---|---------|-------------|
| 見た目 | 記法 + 装飾 | レンダリング結果を直接編集 |
| エンジン | TextEditor + Decoration | Milkdown WebView |
| 数式・Mermaid | なし（ソースのみ） | KaTeX / Mermaid 表示 |
| スラッシュ | VS Code 補完 | WebView 内メニュー |

### 設計原則

1. **非破壊** — 保存形式は CommonMark / GFM 準拠の Markdown
2. **双方向同期** — Raw 変更を約 100ms 後に反映。循環更新を防止
3. **編集優先** — フォーカスブロックでは記法を見せて精密編集を支援

### 制限事項

- Wiki リンク、Obsidian コールアウト等は未対応（CommonMark/GFM 中心）
- WebView バンドル（Mermaid + KaTeX）は約 4MB
- XSS 対策は CSP + Milkdown 依存。明示的サニタイズは残タスク

---

## 編集・レンダリング

| 機能 | 説明 |
|------|------|
| CommonMark | 見出し、段落、引用、コード、リンク等 |
| GFM | テーブル、チェックボックス、取り消し線等 |
| テーブル編集 | 標準テーブル（セルに通常のテキストカーソル、`Tab` でセル移動）。カーソルが表内にある間、表の左上にフロートツールバーを表示し「＋行 / ＋列 / **↑行 / ↓行 / ←列 / →列（移動）** / 行を削除 / 列を削除 / 表を削除」を操作。行/列の移動は `moveTableRow` / `moveTableColumn`（**ヘッダ行は固定**し本文行だけ入れ替え）。**ドラッグで複数セルを選択**できる（prosemirror-tables の CellSelection）。選択セルはアクセント色のティント＋内側ボーダーではっきり表示。複数セル選択中は**セル内のネイティブなテキスト選択ハイライトを消す**（`.selectedCell ::selection { background: transparent }`）ので、オーバーレイの上に text 選択が重なって「全部選択されて汚い」状態にならない。**Shift+↑/↓ などキーボードで表境界をまたぐ範囲選択**も壊れない（`tableSelectionFix`：表の外→中をまたぐ選択を「表全体を含む」形に正規化。gfm の `normalizeSelection` より前に挿入）。**セル内で ↓/↑ は同じ列の真下/真上のセル**へ移る（`tableArrowKeymap`：gfm は Tab/Enter しか割り当てず ↓/↑ がブラウザ既定＝右のセルへ流れていたのを、prosemirror-tables の `nextCell` で列を保って移動。複数行セルの途中は `endOfTextblock` で既定のキャレット移動に委ねる）。**表の下の余白は 0**（`margin: 2.6em 0 0`。上はツールバー用） |
| テーブル挿入 | `/table` は空セルのテーブルを挿入し、カーソルを先頭セルに置く（`Header 1` 等のダミーは入れない） |
| 空行・空セル | 通常の空行／空セルとして保存（`<br />` プレースホルダは出力しない。既存ファイルの `<br />` は読み込み時に正規化） |
| テーブル内改行 | セル内で `Enter` → セル内に改行（GFM では `<br>`）。テーブル下に行は作らない |
| ソフトブレイク表示 | 単一改行（ソフトブレイク）を見た目の改行として表示。保存は `\n` のまま（非破壊） |
| エスケープ無効化 | テキストノードの自動エスケープを源流（remark stringify の `text` ハンドラ）で無効化。Milkdown 既定では段落中の `[` 等が round-trip 安全のため一律 `\[` になり、Raw に戻すとソースが汚れる。本拡張では `[` `*` `_` `#` 等を**エスケープせず素のまま保存**する（`src/preview/webview/disableTextEscape.ts`）。トレードオフ: 素の `\|` がテーブルを壊す等の構文衝突は防がない（ユーザー自身が編集する .md 前提） |
| リスト詰め（tight） | 連続するリスト項目の間の空行を除去し、tight なリストにして表示・保存（loose リストを残さない） |
| 段落間の空行を保持 | 段落どうしの間の空行（`A\n\nB`）は**詰めずに保持**する（2 段落として読み込み、Preview でも空行ぶんの余白＝`p` の下マージン 0.85em を見せる。保存ファイルにも空行を残す）。単一改行（`A\nB`）は同じ段落内のソフトブレイク。<br>※以前は空行を詰めていた（`tightenParagraphSpacing`）が、ユーザーが意図して入れた空行が表示・保存とも消えてしまうため廃止。リストの空行詰め（tight）は引き続き有効 |
| WYSIWYG 編集 | レンダリング結果を直接編集 |
| ファイル同期 | Markdown ソースとして保存 |
| 高速入力時のドキュメント書き込み直列化 | Preview から届く各キー入力ぶんの `change` メッセージは、前の書き込み（`WorkspaceEdit` 適用 + 保存）が完了してから次を処理する（`createSerialQueue`）。直列化しないと、後続のキー入力が前の書き込み完了前の古いドキュメント内容を前提に差分（置換範囲）を組み立ててしまい、ドキュメントが壊れ、Webview へ書き戻されたときにカーソルが意図しない位置（別の行）へ飛ぶことがあった（チェックボックス項目・通常の段落問わず、文中にカーソルがある状態ですばやく文字入力すると発生） |
| チェックボックス変換のブロック変換 dispatch の単一化 | 対象行をチェックボックスへ変換する（⌥⌘4 / ツールバーの ☑ ボタン）とき、「`bullet_list` へ wrap」→「`checked` 属性を設定」を **同じ transaction にまとめて 1 回だけ dispatch**する（`wrapInBulletListAndSetChecked`、`previewKeymapPlugin.ts`）。2 回に分けて dispatch すると、その間に素の `<li>` → `list-item-block` Web Component への再マウントが挟まり、ブラウザのネイティブ選択が失われてドキュメント内の別ブロックへカーソルが飛ぶことがあった。詳細: [checkbox-cursor-jump-fix.md](./checkbox-cursor-jump-fix.md) |
| チェックボックス変換直後のカーソル飛び保護（GFM 組み込み InputRule 経由） | GFM の `wrapInTaskListInputRule`（`[ ] ` / `[x] ` を打つと `checked` を設定する組み込み InputRule）は単一 transaction で完結するが、それでも `checked: null → boolean` の変化で `list-item-block` Web Component が再マウントされ、ブラウザのネイティブ選択が失われることがある。呼び出し元がこちらのコードではない（Milkdown 組み込み）ため dispatch をまとめる対処ができず、代わりに `blockPrefixEditPlugin.ts` に変換直後の正しい selection 位置を一定時間（1000ms）追跡するガード（`pendingCheckboxSelectionGuard`）を追加し、selectionchange 由来の誤爆を検知して戻す。詳細: [typed-checkbox-conversion-fix.md](./typed-checkbox-conversion-fix.md) |
| 古い外部内容の push によるカーソル飛び防止 | `FileSystemWatcher` 経由の外部変更検知（`onExternalFileChange`）は、`onDidChangeTextDocument` と同じ**内容ベースの自分エコー判定**（`resolveExternalPush`、`src/preview/host/externalEcho.ts`）を経由してから push する。同期フラグ（書き込み中かどうか）だけに頼ると、fs イベントの発火タイミングが不安定なぶん自分の保存の遅延エコーを取りこぼし、入力継続中（特にテーブルのセル編集）に古い・短いディスク内容が push されて `applyExternalContent` のクランプでカーソルが文書末尾へ飛ぶことがあった。詳細: [stale-external-push-cursor-jump-fix.md](./stale-external-push-cursor-jump-fix.md) |
| Preview→Raw 切替時の未反映書き込みフラッシュ | `switchToRaw` は、対象 URI の webview 由来の直列化キュー（`enqueueWebviewChange`）にまだ積まれている書き込みがあれば、Preview を破棄する前に必ず完了を待つ（`pendingWebviewFlush`）。これを待たずに切り替えると、タイプ直後にすぐ Raw へ切り替えた場合、直前の編集が Raw 側に反映される前に Preview が破棄され、反映されていないように見える（体感として「編集が消えた」）ことがあった。詳細: [preview-to-raw-pending-edit-loss-fix.md](./preview-to-raw-pending-edit-loss-fix.md) |
| 外部編集の反映 | Raw エディタからの編集に加え、**外部（AI・他ツール）が .md をディスク上で直接編集**した場合も WebView に反映する。Preview だけを開いていて `onDidChangeTextDocument` が発火しないケースに備え、ホストが `FileSystemWatcher` でファイル変更も拾い、最新のディスク内容を push する（自分の保存によるエコーは WebView 側の重複判定で無視）。約 100ms デバウンス。**外部 push 直後にユーザーが Preview で入力を続けても保存が defer され続けない**よう、host は「直近に webview へ push した内容」（`lastPushedToWebview`）を追跡し、`document`（TextDocument）モデル自体の陳腐化（Preview だけを開いている場合、外部書き込みを自動リロードしないことがある）だけを理由に defer しない。詳細: [stale-document-model-save-defer-fix.md](./stale-document-model-save-defer-fix.md) |
| スクロール余白（最終行送り） | 最終行を画面最上部まで送れるよう、コンテンツ下に「ビューポート高 − 1行」の余白を常に確保（scroll beyond last line 相当）。行高はフォントサイズ依存なので、設定変更・ズーム・リサイズで再計算（`--preview-scroll-beyond`）。この**追加余白はスクロール同期の比率計算から除外**するため Raw⇄Preview の位置がズレない（`contentScrollHeight`） |
| チェックボックス | **クリックで常にトグル** → `- [x]` として保存。フォーカス中でも視覚的なチェックボックス（`label-wrapper`）は常に表示され、クリックで即座にトグルできる（`blockPrefixEditPlugin` によるプレフィックス展開はチェックボックス項目には適用しない）。`Cmd+Enter` でもトグル可。枠線は本文色から作るため（`--preview-checkbox-border`）テーマが薄くても見やすい。チェック済みは枠線スタイル（塗りつぶさず）＋本文色のチェックマーク。チェック済みの本文は少し暗く（`--preview-done-fg`）＋取り消し線（フォーカス中も維持） |
| 箇条書き/番号付きリストのマーカーからドラッグ選択できる | `@milkdown/components` の `list-item-block` は、マーカーを囲む `.label-wrapper` の `pointerdown` でチェックボックスかどうかに関わらず常に `preventDefault()` + `stopPropagation()` を呼ぶ。Pointer Events の仕様上 `pointerdown` を `preventDefault()` すると後続の互換 `mousedown` が発火しなくなり、`mousedown` を起点にする通常の選択が bullet/ordered マーカー上では一切始まらない不具合があった（マーカーから他の位置までドラッグしても選択が空のまま）。`listMarkerDragFixPlugin.ts` が bullet/ordered マーカー（チェックボックスは対象外・既存のクリックトグルは維持）の `pointerdown` を capture フェーズで先取りして `stopPropagation()` し、component 側に届く前に伝播を止めたうえで、選択のアンカー設定と `mousemove` ごとの `TextSelection` 更新を手動で行う（マーカー自体が `contenteditable="false"` のため、ブラウザのネイティブなドラッグ選択もそこを起点には伸びないため）。詳細: [list-marker-drag-fix.md](./list-marker-drag-fix.md) |
| IME 確定 Enter と改行 Enter のレース対策 | 日本語 IME でチェックボックス項目のテキストを変換確定した直後に Enter を押すと、その Enter が「確定」だけでなく「改行（`splitListItem`）」としても処理され、意図せず空の `list_item` が出来ることがあった（ProseMirror 自身の対策 `inOrNearComposition` は **Safari 限定**で、VS Code の Chromium/Electron Webview では効かない）。ユーザーが続けてもう一度 Enter を押すと、カーソルが**空の list_item 内**にいるため ProseMirror 標準の「空リスト項目で Enter → リストから離脱」が発動し、チェックボックスではないプレーン段落になってしまっていた（＝チェックボックスが次の行に反映されない）。`imeEnterGuard.ts` が「同一の物理 Enter 押下が `compositionend` と `keydown` の 2 イベントに分裂して届いた」場合だけを無視する。判定は `Date.now()` の固定時間窓ではなく、**ブラウザが記録するネイティブの `event.timeStamp` どうしの差**（50ms 未満）で行う。固定 500ms 窓（ProseMirror の Safari 分岐と同じ値）を最初に試したが、`compositionend` は Enter 以外（スペース/クリック/自動確定）でも発火するため、**IME 確定を Enter 以外で行った直後に本当に改行したくて押した Enter まで誤って無視してしまう**回帰があった（`imeEnterRace.test.ts`）。`event.timeStamp` は実際にその入力が起きた瞬間の値なので、JS コールバックの実行遅延や CDP 経由のテストのラウンドトリップ遅延に影響されず、「同じ物理キー押下の分裂」だけを正確に検出できる |
| Git 差分ガター | Git HEAD（コミット済み）と比較し、ブロック左に 追加=緑 / 変更=青 のバー、削除位置に赤い線を表示（ブロック単位）。基準は開いた時点の HEAD。git 管理外/新規ファイルは非表示。**基準（HEAD 本文）も本文ドキュメントと同じ正規形（`normalizePreviewMarkdown`）に揃えてから比較する**ため、表セルの `<br>`（→ `&#10;`）等で Raw は無変更なのに Preview だけ青く見える誤検出は起きない。**フォーカスで記法展開（Typora 風）中のブロックは、展開中プレフィックス（`## `/`- `/`> ` 等）をシグネチャ比較から除外する**（`blockSignatures(doc, expandedRange)`）。除外しないと、見出し/箇条書き/blockquote にカーソルを合わせただけで（未編集でも）`blockPrefixEditPlugin` が挿入する実テキストのプレフィックス分だけシグネチャが変わり、無変更のブロックがフォーカスした瞬間だけ「変更（青）」に見えてしまう |
| Undo / Redo | VS Code 標準のテキスト履歴 |
| フォーカス時記法表示 | カーソルがある行だけ、行頭マーカー（`## ` `- ` `1. ` `> `）と行内記法（`**` `*` `` ` `` `~~` `[..](..)`）を薄字で表示（`preview.showFocusSyntax`）。フォーカスが外れた行は隠れてレンダリング表示に戻る。行頭マーカーの表示方法は 2 通りある: **展開モード**（後述「フォーカスで記法展開（Typora 風）」）と、フォールバック用の CSS 生成内容（`::before`）。<br>**行内記法マーカーの `<span>` は `contenteditable="false"`**（`createSyntaxMarkerElement`）にしてあり、これが無いとエディタの `contenteditable=true` を継承して矢印キーのキャレットがマーカー文字の中に入り込んで先へ進めなくなる。false にすることでキャレットはマーカーを飛ばして次の文書位置へ進める。<br>**マーカーをクリックするとカーソルがその位置へ移動する**（`handleDOMEvents.mousedown` でマーカー要素への `mousedown` を検出し `data-pm-pos` 属性の ProseMirror 位置へ `TextSelection` を dispatch）。これにより `` ` ``・`**`・`*`・`~~` 等のマーカー付近でクリックが迷子にならない。<br>**フェンスコードブロック**（`` ```lang `` 〜 `` ``` ``）もこの対象で、カーソルがブロック内にあるあいだだけ開始行（`` ```js `` 等、言語名込み）と終了行（`` ``` ``）を widget として表示する（`getCodeFenceMarkers`）。見出しと異なり実テキスト展開（`blockPrefixEditPlugin`）の対象にはしない — コードブロックの内容は `code_block` ノードの生テキストであり、フェンス行を実テキストとして混ぜるとシリアライズ（保存）時に本来のコードへ不要な `` ``` `` 文字列が混入するおそれがあるため。詳細: [code-fence-focus-markers.md](./code-fence-focus-markers.md) |
| フォーカスで記法展開（Typora 風） | カーソルがあるブロックの行頭マーカーを**実際のテキストとして展開**し、カーソルをマーカーの中まで移動・編集できるようにする（`blockPrefixEditPlugin`）。<br>・**見出し** (`heading`): `## ` を先頭に挿入。マーカーを編集（`# ` / `### ` 等）して抜けると、文字数に応じて `level` 属性が自動更新される。<br>・**箇条書き** (`list_item`): `- ` を挿入。<br>・**番号付きリスト** (`list_item` + `order_list`): `1. ` を挿入（番号は表示用のみ。保存は Milkdown が番号を管理）。<br>・**引用** (`blockquote`): `> ` を挿入。<br>**タスクリスト（チェックボックス）は展開しない**。展開すると `md-prefix-expanded` クラスにより視覚的チェックボックス（`label-wrapper`）が非表示になり、クリックによるトグルが動作しなくなるため。チェックボックスのトグルはクリック / `Cmd+Enter` で行う。<br>展開されたプレフィックスは `addToHistory: false` で挿入するため Undo 履歴を汚さない。抜けると自動 collapse（プレフィックス削除 + 属性更新）する。展開中は `focusSyntaxPlugin` の CSS `::before` ベースの行頭マーカーを非表示にして二重表示を防ぐ。リスト項目は `md-prefix-expanded` クラスで bullet の `label-wrapper` を CSS で隠す（実テキストと二重に見えないように）。展開中は `markdownUpdated` リスナーを抑制して `## ## Hello` のような二重プレフィックスが Raw に書き込まれないようにする（`milkdownApp.ts`）。`markerBackspace` は展開中にスキップし、ProseMirror 既定の文字削除に委ねる。<br>**リスト項目の内容が「まだチェックボックス記法 `[ ]`/`[x]` を打っている途中」に見える（空、または `[`, `[ ]`, `[x]` 等）あいだは展開を保留する**（`isPendingTaskMarkerText`）。`- ` でリスト化した直後に即座に `- ` を展開すると、続けて `[ ] ` を打っても GFM の `wrapInTaskListInputRule`（段落先頭 `^` にマッチする必要がある）が阻まれ、チェックボックスへ変換されない不具合があった。詳細: [typed-checkbox-conversion-fix.md](./typed-checkbox-conversion-fix.md)<br>**見出し・引用のプレフィックス区切りは non-breaking space**（` `）を挿入する。素の半角スペースだと、末尾に来た時点でブラウザが視覚的に潰してしまい、続く実キー入力でスペースが失われることがあった（箇条書き系は `list-item-block` Web Component 経由のため再現しない）。詳細: [heading-blockquote-prefix-space-fix.md](./heading-blockquote-prefix-space-fix.md)<br>**collapse 完了時に現在の doc を明示的に再シリアライズしてホストへ送る**（`setOnCollapseSync`）。collapse の transaction は `addToHistory: false` のため Milkdown 公式の `markdownUpdated` リスナー（`@milkdown/plugin-listener`）から完全に無視され、他の編集が続かない限りその内容が永久にホストへ届かない（＝保存ファイルから消える）不具合があった。詳細: [collapse-markdown-sync-fix.md](./collapse-markdown-sync-fix.md)<br>**挿入するプレフィックスは明示的にマーク無しのテキストノードとして挿入する**（`state.schema.text(prefix)` を `tr.insert` — `tr.insertText` は挿入位置直後のマークを継承するため使わない）。内容がリンク等のマーク付きテキストから始まるブロック（例: `- [1. 見出し](#anchor)`）にフォーカスすると、挿入した `- ` がリンクのマークを継承し、`[- 1. 見出し](#anchor)` のようにプレフィックスがリンクの内側に取り込まれて見える不具合があった。詳細: [prefix-expand-mark-inheritance-fix.md](./prefix-expand-mark-inheritance-fix.md)<br>**マウスドラッグ中（mousedown〜mouseup）は expand/collapse の同期を保留し、mouseup 後にまとめて 1 回だけ同期する**。保留しないと、フォーカス展開中のブロックが残ったまま別ブロックをドラッグ選択しようとしたとき、ドラッグの途中で selection が変わるたびに collapse の transaction（テキスト削除を伴う）が発火し、ブラウザが内部で追跡しているネイティブ選択の anchor/focus ノードが無効になって、mouseup 時点の最終選択が反映されない（選択が空になる）不具合があった。mouseup 時点ではブラウザの `selectionchange` がまだ ProseMirror 側に反映されていない場合があるため、同期は `setTimeout` で 1 tick 遅らせる。詳細: [drag-select-during-expand-fix.md](./drag-select-during-expand-fix.md) |
| ペースト（Markdown 対応） | `@milkdown/plugin-clipboard` により、貼り付け／コピーを **Markdown ベース**で扱う。これが無いと ProseMirror 既定（HTML/プレーンテキスト）任せになり、Raw と違って貼り付けた内容の構造が崩れていた |
| コピー時に保存用 `<br>` を漏らさない | 表セル内の改行（hardbreak）は、GFM テーブルのセルがリテラル改行を持てないため保存用 markdown として `<br>` にシリアライズされる（`overrideHardbreakSerializer`）。既定の `@milkdown/plugin-clipboard` はコピー時も同じシリアライザをそのまま使うため、セル内改行を含む範囲を他アプリへコピー＆ペーストすると、読める改行ではなく文字列 `<br>` がそのまま入ってしまっていた。`createClipboardPlainTextPlugin`（`clipboard` より前に登録し、ProseMirror の `someProp` の先勝ちで上書き）で、シリアライズ後の `<br>` だけを実際の改行に戻してからクリップボードへ渡す |
| URL 貼り付けでリンク化 | テキストを選択して URL を貼ると、選択範囲をリンクにする（テキストは保持） |
| コードブロックのトリプルクリック | コードブロックは 1 つのテキストブロック（複数行が `\n` 区切り）なので、既定のトリプルクリックだと**ブロック全体**が選択される。これを横取りし、**クリックした行だけ**を選択する（`codeBlockTripleClick`） |
| 行頭マーカーの段階的削除 | 行頭で Backspace すると、Raw のように**マーカーを 1 段階ずつ**外す（`markerBackspace`）。一度に全部消さない。<br>・見出し: `H2 → H1 → 段落`（`#` を 1 つずつ）<br>・チェックボックス: `- [ ] → 箇条書き → 段落`<br>・箇条書き/番号付き: `→ 段落`（リストから持ち上げ）。<br>行頭以外の Backspace は通常どおり。<br>**フォーカスで記法展開**（Typora 風）中は `markerBackspace` をスキップし、プレフィックス文字の直接削除（ProseMirror 既定の文字削除）に委ねる。これにより展開されたプレフィックスを 1 文字ずつ編集してから抜けると、属性（`level` 等）が自動更新される |
| インライン記法の解除 | インライン記法（`` ` `` `**` `*` `~~` `[..](..)`）はマークなので、フォーカス中に見えるマーカーは装飾で消せなかった。カーソルがマーク範囲の**端**にあるとき、**Backspace（閉じ側）/ Delete（開き側）でそのマークを解除**できる（`inlineMarkBackspace`）。例: `` `code` `` の末尾で Backspace → コード装飾が外れる（文字は残る） |
| コードブロックの解除 | コードブロックの**先頭で Backspace → 段落へ解除**（中身は残す。`codeBlockBackspace`）。見出し降格と同じ発想で「```」を消せるようにする。フォーカス中は言語ドロップダウン（`codeLanguagePlugin`）が右上に出る |

---

## リッチコンテンツ

| 機能 | 説明 | 設定キー |
|------|------|----------|
| シンタックスハイライト | highlight.js（主要言語）。**ProseMirror の inline decoration として**色を載せる（`codeHighlightPlugin`）。以前は `hljs.highlightElement` で `<pre><code>` の DOM を直接書き換えていたが、ProseMirror が「自分の作っていない変更」とみなして即座に元へ戻すため**色が付かなかった**。デコレーション方式なら消えず、編集中のブロックでもカーソルが飛ばない。色はテーマ追従（`media/hljs-github.css` は Light 固定なので、ダークでは `--hl-*` 変数で上書き） | 常時 on |
| コードブロック作成 | 段落で ` ``` ` または ` ```bash ` と入力して `Enter`（またはスペース）でコードブロック化。言語も反映 | 自動 |
| コードブロック言語選択 | カーソルがコードブロック内にある間、ブロック右上に言語ドロップダウン（`bash`/`js`/`python` 等）をフロート表示。選択で `language` 属性に保存 | 自動 |
| KaTeX 数式 | `$...$`（インライン）、`$$...$$`（ブロック）。**デコレーション方式**（`mathDecorationPlugin`）: カーソルが数式の外にある間はソースを隠して KaTeX の描画結果を表示し、カーソルが触れるとソースに戻る（Typora 風）。DOM を外側から直接書き換える方式は ProseMirror の MutationObserver に巻き戻されるため使わない（`math-decoration-rendering-fix.md`） | `preview.enableMath` |
| Mermaid 図 | ` ```mermaid ` コードブロックの直後に **`Decoration.widget`** として図を表示する（`mermaidDiagramPlugin`）。ソーステキストは `<pre><code>` にそのまま残り編集できる。DOM 直接置換は ProseMirror に巻き戻されるため使わない | `preview.enableMermaid` |
| 画像表示 | `![alt](./path)` を本文中に表示。ワークスペース相対パス解決 | 自動 |
| 画像の貼り付け / ドロップ | クリップボード画像やファイルを Preview に貼る/ドロップすると、ドキュメント隣の `assets/` に保存し `![](assets/…)` を挿入 | 自動 |
| **画像をコピー** | 画像ノードを選択して `Cmd/Ctrl+C`、または画像を**右クリック → "Copy Image"** で、パス文字列ではなく**画像データそのもの**をクリップボードにコピーする（`imageCopyPlugin`）。ワークスペース内のローカル画像は Extension Host がファイルを読んで `data:` URL に変換し、WebView の `navigator.clipboard.write()` で書き込む。`data:` 埋め込み画像（過去に貼り付けたもの）はホストを経由せず直接書き込む。テキスト選択を含む範囲選択は従来どおり Markdown テキストとしてコピー（`@milkdown/plugin-clipboard`） | 自動 |
| Frontmatter | YAML を整形パネルで表示（本文は Milkdown） | `preview.showFrontmatter` |

画像は Raw と異なり、行末サムネイルではなく**本文中にフル表示**されます。

---

## スラッシュメニュー（Preview）

空行または `/` のみの行でメニュー表示（`preview.enableSlashMenu`）。  
コマンド定義は Raw と共通（`src/shared/slash/slashMenuItems.ts`）。

| コマンド | Preview での動作 |
|----------|------------------|
| `h1`〜`h6` | 見出しブロック挿入 |
| `table` | 2 列表挿入 |
| `code` | コードブロック挿入 |
| `quote` / `divider` / `callout` | 対応ブロック挿入 |
| `bullet` / `numbered` / `todo` | リスト挿入 |
| `heading` | レベル指定見出し |

`/table normalize` は Raw 専用（ワークスペース設定の切替）。

---

## UI・ナビゲーション

| 機能 | 説明 | 設定キー |
|------|------|----------|
| リンククリック | 相対パス → VS Code でファイルを開く | 常時 |
| 外部リンク | `https://` → 既定ブラウザ | 常時 |
| テーマ | VS Code 追従 or light/dark 固定 | `preview.theme` |
| フォント | ファミリー・サイズ（既定は CJK 対応の比例フォント。等幅だと ASCII と日本語で太さが不揃いに見えるため） | `preview.fontFamily`, `fontSize` |
| 最大幅 | 本文の最大表示幅 | `preview.maxWidth` |
| スクロール同期 | Raw ⇄ Preview 切替時に**画面最上部の位置**を双方向で引き継ぐ（見出しアンカー優先・比率フォールバック）。詳細は [preview-scroll-sync.md](./preview-scroll-sync.md) | `preview.syncScroll` |
| カーソル位置の引き継ぎ | Raw ⇄ Preview 切替時に**テキストカーソルを同じ位置**へ復元し、その場で編集を続けられるようにする。両表現で共通計算できる「**トップレベルブロック index + ブロック内オフセット**」をアンカーにする（`src/shared/preview/cursorAnchor.ts`）。Raw 側はソースの空行区切りでブロック分割し行頭マーカー長を除いたオフセット、Preview 側は ProseMirror のトップノード index + textContent オフセット。プレーン段落・見出し・リストは正確、行内記法（`**`/`` ` `` 等）を挟む位置は近似。スクロール同期より優先（カーソルを画面内に見せる） | 常時 |
| 切替アニメーション | Preview 表示時のフェードイン | `preview.enableTransitions` |
| モード記憶 | 最後に使用したモードを記憶し、**新規に開く** Markdown ファイルにのみ適用（最後に Preview なら新規は Preview、最後に Raw なら新規は Raw）。**既に開いているファイルには強制しない**（別ファイルでモードを切り替えても、アクティブにしても、現在のモードを維持） | `preview.rememberMode` |
| 既定モード | 初回オープン時 Raw or Preview | `preview.defaultMode` |

---

## モード切替

| 操作 | 説明 |
|------|------|
| タイトルバー（上部固定） | **画面最上部に常時固定**の、Raw/Preview 共通の**単一アイコン**トグルボタン（`markdownInline.togglePreview`、アイコン `$(book)`、常に同じ見た目）を `editor/title` の navigation グループに出す。以前は Raw 中= `$(open-preview) Preview`、Preview 中= `$(code) Raw` とモードごとに別コマンド・別アイコンを出し分けていたが、アイコンが2種類あって紛らわしいという指摘を受け1つに統一した。`when`: `editorLangId == markdown || activeCustomEditorId == 'ipreview.preview'`（Raw・Preview どちらでも表示）。テキストエディタ内に「浮動固定ウィジェット」を置く API は無いため、上部固定はここで実現（CodeLens は本文と一緒にスクロールする）|
| `Cmd+Shift+.` | Raw ↔ Preview トグル |
| 同一タブ切替 | 別タブを開かず `vscode.openWith` で切替 |

Preview から Raw に戻すとき（`Cmd+Shift+.` / タイトルバー）は、**その Preview の `document.uri` を直接 Raw に切り替える**。`findPreviewUri` の推測には頼らない（複数の Preview を開いていると別ファイルへ飛ぶことがあったため）。推測が必要な経路（ステータスバー等）でも、対象が一意に決まらないときは何もしない（`pickPreviewUri`／`previewTabs.ts`、ユニットテストあり）。

**フォーカスの保証**: 対象 URI が正しく解決されていても、複数ファイルを Preview 中に切替を行うと、VS Code のタブクローズ処理のタイミング次第でフォーカスが隣のタブ（別ファイルの Preview）へ移ってしまうことがある（`switchToRaw` が新しい Raw エディタを開いた後に古い Preview タブを閉じる際、閉じた瞬間にまだそのタブがアクティブ扱いだと、VS Code が「閉じたタブの右隣」を自動選択してしまうため）。**切替後は必ず対象ファイルの Raw エディタがアクティブになっていることを明示的に保証する**（結果を確認するだけで諦めない）。再現テスト: `test/extension/preview.test.ts` の「9. 複数ファイル Preview/Raw トグル」（実 VS Code 拡張ホストが必要 — `npx tsc -p tsconfig.test.json && node ./out-test/test/runTest.js`。jsdom/Playwright では再現不可）。

スクロール同期: 切替時、**画面最上部の可視行**を基準に、Raw 側の見出しスラッグと Preview の DOM を突き合わせて位置を引き継ぐ（見出しが無ければスクロール比率でフォールバック）。Raw→Preview / Preview→Raw の双方向で動作（`preview.syncScroll`）。設計の詳細は [preview-scroll-sync.md](./preview-scroll-sync.md)。

**アイコン（タイトルバー / CodeLens）と行ウィジェット（1行目上）の Raw→Preview 切替は同じロジックを使う**: `markdownInline.openPreview`（CodeLens の Preview 項目）と `markdownInline.togglePreview`（タイトルバーのアイコン、1行目上の行ウィジェット、ステータスバー）は、どちらも「今 Raw で編集中のファイルを Preview にする」動作を最優先する（`decidePreviewToggle`、`toggleDecision.ts`）。**他ファイルの Preview が別グループに既に開いていても、それに引きずられて何もしない・別ファイルを操作する、といったことがあってはならない**（`openPreview` はかつて `findPreviewUri()`— ワークスペース全体でユニークな Preview を推測するグローバルなガード — を使っており、他ファイルの Preview が既に1枚開いていると何もしないバグがあった）。再現テスト: `test/extension/preview.test.ts` の「9. 複数ファイル Preview/Raw トグル」9.2（実 VS Code 拡張ホストが必要）。

---

## VS Code 本体設定との連携

`markdownInline.*` の一部の設定は、値を保持するだけでなく **VS Code 本体の設定を直接書き換える**（`disableCompetingMarkdownFeatures` → `applyMarkdownSettings()` と同じ方針。`src/raw/settings.ts`）。UI 上は「Markdown Inline Preview」の設定項目として見えるが、実体は本体設定そのものなので、ユーザーが本体設定側を直接いじっても矛盾しない。

| 設定キー | 既定値 | 書き込み先の VS Code 本体設定 | 挙動 |
|---|---|---|---|
| `preview.alwaysOpenNewTab` | `true` | `workbench.editor.enablePreview`（Global） | `true` → `enablePreview: false`（常に新規タブで開く。VS Code の「シングルクリックで開いたタブは次のファイルで上書きされる」プレビュータブ機能を無効化）。`false` → `enablePreview: true`（VS Code既定のタブ再利用に戻す）。**注意**: `workbench.editor.enablePreview` は VS Code 側に言語別のスコープが無いグローバル設定のため、Markdown 以外のファイルにも影響する。 |
| `preview.wordWrap` | `true` | `editor.wordWrap`（`[markdown]` 言語オーバーライド、Global） | `true` → `"on"`（Markdown ファイルは折り返し表示）。`false` → `"off"`。`editor.wordWrap` は言語オーバーライド可能なので、他言語のファイルには影響しない。 |
| `preview.wrapTabs` | `true` | `workbench.editor.wrapTabs`（Global） | `true` → `wrapTabs: true`（エディタタブバーのタブが多いとき、横スクロールではなく複数行に折り返して表示する）。`false` → `wrapTabs: false`（VS Code既定の横スクロールに戻す）。**注意**: `workbench.editor.wrapTabs` は `alwaysOpenNewTab` と同様、VS Code 側に言語別のスコープが無いグローバル設定のため、Markdown 以外のファイルにも影響する。 |

適用タイミング: 拡張機能の `activate()` 時に現在の設定値で 1 度適用し、以後は `onDidChangeConfiguration` で `markdownInline.preview.alwaysOpenNewTab` / `preview.wordWrap` / `preview.wrapTabs` の変更を検知するたびに再適用する（`src/raw/handlers/onDidChangeConfiguration.ts`）。一方向（`markdownInline.*` → 本体設定）のみで、本体設定側の変更を `markdownInline.*` に書き戻すことはしない。

再現・検証テスト: `test/extension/preview.test.ts` の「10. VS Code 本体設定との連携」（実 VS Code 拡張ホストが必要。`workbench.editor.enablePreview` / `editor.wordWrap` の実際の書き込みを検証するため jsdom/Playwright では再現不可）。

---

## コマンド

| コマンド ID | 用途 |
|-------------|------|
| `markdownInline.openPreview` | Raw から Preview へ |
| `markdownInline.openRaw` | Preview から Raw へ |
| `markdownInline.togglePreview` | トグル |
| `markdownInline.toggleLineNumbers` | `preview.showLineNumbers` の on/off をコマンドパレットから直接切り替え（設定 UI で毎回検索する手間を省く。タイトルバーへのアイコンは無く、コマンドパレット専用） |

---

## 設定一覧

```jsonc
// モード
"markdownInline.preview.defaultMode": "raw",     // raw | preview
"markdownInline.preview.rememberMode": true,
"markdownInline.preview.editable": true,

// 見た目
"markdownInline.preview.theme": "auto",
"markdownInline.preview.fontFamily": "",
"markdownInline.preview.fontSize": 12,
"markdownInline.preview.maxWidth": 800,
"markdownInline.preview.enableTransitions": true,
"markdownInline.preview.showFocusSyntax": true,
"markdownInline.preview.enableSlashMenu": true,

// リッチコンテンツ
"markdownInline.preview.enableMath": true,
"markdownInline.preview.enableMermaid": true,
"markdownInline.preview.showFrontmatter": true,
"markdownInline.preview.showLineNumbers": true, // 既定 on。Raw の行番号との一貫性のため

// Raw との連携
"markdownInline.preview.syncScroll": true
```

Raw モード共通の `markdownInline.enablePreview` が `false` の場合、装飾・画像サムネイル等の Raw 機能も無効になります。

---

## ショートカット

| 機能 | Mac | Windows/Linux |
|------|-----|---------------|
| Raw ↔ Preview 切替 | `Cmd+Shift+.` | `Ctrl+Shift+.` |
| 段階選択（括弧の中身 → 行 → セル/コードブロック → 全文） | `Cmd+A` | `Ctrl+A` |
| Preview 内検索 | `Cmd+F` | `Ctrl+F` |
| Preview 内置換 | `Cmd+Opt+F` | `Ctrl+H` |
| **行頭への 2 段階移動** | `Cmd+←` | `Ctrl+←` |

#### `Cmd+←`（行頭への 2 段階移動）

フォーカスで記法展開（Typora 風）が有効な状態（`blockPrefixEditPlugin` でプレフィックスが実テキストとして展開中）で、行頭プレフィックスをスキップした位置とブロック先頭を 2 段階で行き来する。

| 現在のカーソル位置 | 1 回目の `Cmd+←` |
|---|---|
| プレフィックス後のコンテンツ内（`## ` より右） | プレフィックス直後（コンテンツ先頭）へ移動 |
| コンテンツ先頭（プレフィックス直後） | ブロック先頭（`##` の直前）へ移動 |
| ブロック先頭（`##` の直前） | ブラウザ既定（前ブロック末尾等）に委ねる |

展開中でない場合はブラウザ / ProseMirror 既定の `Cmd+←`（ブロック先頭移動）に委ねる。

### Notion 風ブロック変換（`Cmd+Opt+<数字>`）

カーソル位置のブロックを変換する。Raw モードと共通の体系（Raw 側は VS Code キーバインド、Preview 側は WebView 内キーマップで実装）。

| キー | ブロック |
|------|----------|
| `Cmd+Opt+0` | 本文（段落） |
| `Cmd+Opt+1` | 見出し H1 |
| `Cmd+Opt+2` | 見出し H2 |
| `Cmd+Opt+3` | 見出し H3 |
| `Cmd+Opt+4` | チェックボックス（ToDo） |
| `Cmd+Opt+5` | 箇条書きリスト |
| `Cmd+Opt+6` | 番号付きリスト |
| `Cmd+Opt+8` | コードブロック（Preview のみ） |
| `Cmd+Opt+9` | 引用（Preview のみ） |

Windows/Linux は `Alt+Ctrl+<数字>`。

### `Cmd+A`（段階選択）

押すたびに 1 段階ずつ選択範囲を広げる。各段階の選択種別は次のとおり。

> **文書全体の段階は `AllSelection` を明示的に dispatch する。** 以前は `false` を返してブラウザ/Electron の native「Select All」に委ねていたが、webview では効かない・効いても**先頭行へ巻き戻る**等で不安定だった。明示選択にしたことで「2 回目で確実に文書全体」になり、ユニットテストでも検証できる。文書全体（`AllSelection`）まで来たら以降は `false`（何もしない）で、先頭行へ巻き戻らない。

- **通常のテキストブロック**（段落・見出し・リスト項目など）:
  1. カーソルが `(...)` / `[...]` の中にあれば、まず**その括弧の中身だけ**（`findEnclosingBracketContent`、`src/shared/markdown/bracketSelection.ts`）。ネストしている場合は最も内側の括弧を優先する。括弧の外にカーソルがある場合はこの段階を飛ばす。
  2. カーソルのある「行（テキストブロック）」の中身を丸ごと（`$from.start()`〜`$from.end()` の `TextSelection`）
  3. 既に行全体が選択済みなら **`AllSelection`（文書全体）** を選ぶ

  括弧の中身が行全体と同じ範囲になる場合（行が丸ごと1組の括弧である等）は、中身の段階と行の段階が同一になり実質1段階に短縮される。
- **テーブルセル内**（押下回数）:
  1. セルの中身（`TextSelection`）
  2. 行全体（`CellSelection`・`isRowSelection()===true` / `isColSelection()===false`）
  3. 表全体（`CellSelection`・行かつ列＝`isRowSelection() && isColSelection()`）
  4. **`AllSelection`（文書全体）**
- **コードブロック内**: 1. ブロック内容（`TextSelection`） → 2. **`AllSelection`（文書全体）**。
- テキストブロック外（画像など）: `false`（既定に委ねる）。

実装メモ（重要）:

- `Cmd/Ctrl+A` は **`document` の capture フェーズ**（`milkdownApp.ts`）で横取りし、その場で
  `handleSelectAll` を呼んで選択変更まで行う。処理したら `preventDefault` に加えて
  **`stopPropagation` する**。理由は 2 つ:
  1. ブラウザ/Electron の native「Select All」より先に処理するため。プラグインの
     `handleKeyDown` は**読み込み順により負けることがあり**、その場合 native の全選択が先に
     走って段階選択（セル/行/表）が無視される（＝「`Cmd+A` で全部選択されてしまう」バグ）。
  2. capture で処理したら同じ keydown を plugin の `handleKeyDown` にも流さないため。両方走ると
     1 回の押下で 2 段階進む（capture=セル内容 → plugin=行 …）。
- 段階選択のロジック自体は `previewKeymapPlugin.ts` の `handleSelectAll` に集約し、capture
  ハンドラと plugin の `handleKeyDown` の両方から共有する。plugin 経路は実運用では capture が
  止めるため通常は走らないが、回帰テストが `view.dom` へ直接 keydown を送ってこのロジックを検証する。
- 回帰テスト: `test/webview/previewKeymap.integration.test.ts` の「Cmd/Ctrl+A 段階選択」。
  行（段階2）と表全体（段階3）を `isRowSelection()` / `isColSelection()` で厳密に区別し、
  段階4は `false`（既定の全選択に委ねる）ことまで検証する。

### `Cmd+F`（Preview 内検索）／`Cmd+Opt+F`・`Ctrl+H`（置換）

WebView 内に検索バーを表示し、レンダリング結果のテキストを検索する。一致箇所を CSS Custom Highlight API でハイライト（DOM 非破壊）。`Enter`/`Shift+Enter` で次/前へ、`Esc` で閉じる。

検索バー左端のシェブロン、または置換ショートカット（`Cmd+Opt+F` / `Ctrl+H`）で**置換行**を展開する。置換は DOM を直接いじらず、一致 DOM レンジを `EditorView.posAtDOM` で ProseMirror の位置に変換し、トランザクションで書き換える（ハイライトは非破壊のまま）。**Replace** は現在の一致 1 件を置換して次へ進み、**Replace All** は全一致を文末側から 1 トランザクションで置換する（位置ずれ防止）。置換入力で `Enter`＝現在を置換、`Cmd/Ctrl+Enter`＝全置換。Preview が読み取り専用（`view.editable=false`）のときは置換ボタンを無効化する。

書式操作は `/` スラッシュメニューも使用可。詳細: [keyboard-shortcuts.md](../user-guide/keyboard-shortcuts.md)

---

## 残タスク

| 項目 | 現状 | これから |
|------|------|----------|
| テーブル編集 | 標準テーブル + フロートツールバー（行/列の追加・削除） | 列幅ドラッグ、整列、セル結合 |
| Frontmatter | 表示のみ | Preview 内での YAML 編集 |
| アクセシビリティ | aria-label 一部 | キーボード・スクリーンリーダー対応 |
| XSS サニタイズ | CSP + Milkdown 依存 | 出力の明示的サニタイズ |
| 統合テスト | なし | 切替・保存・同期の E2E |
| WebView サイズ | ~4MB | Mermaid/KaTeX の遅延ロード |
| Obsidian 互換 | 未対応 | コールアウト、ウィキリンクの WYSIWYG（検討） |

---

## これからの機能

1. テーブル UI 強化 — セルのドラッグ移動・結合（行/列の追加・削除・整列は実装済み）
2. Frontmatter 編集 — パネル上で YAML を直接編集
3. バンドル最適化 — Mermaid / KaTeX の遅延ロード
4. 共同編集プレビュー — 同期基盤完成後のライブ更新（未実装）

---

## リッチエディタ化ロードマップ

「リッチで使いやすいエディタ」にするための施策一覧。優先度 高 → 中 → 低。
（このセクションは継続的に追記していく作業リスト）

### 入力・ブロック操作

| 項目 | 内容 | 優先 |
|------|------|------|
| ブロックのドラッグ並べ替え | 行頭グリップ（⠿）で段落・リスト・見出しを掴んで移動 | 高 |
| ペーストの賢い変換 | URL ペースト → 選択をリンク化（実装済み ✅）。HTML → Markdown、コード片保持は今後 | 中 |
| 画像のドラッグ&ドロップ / 貼り付け（実装済み） | クリップボード画像/ファイルを `assets/` に保存し `![](assets/…)` 挿入 | ✅ |
| 画像リサイズ | ハンドルで幅指定（`![]( ){width=...}` 等の拡張） | 低 |
| Markdown 直接ペースト（実装済み） | `@milkdown/plugin-clipboard` でクリップボードの Markdown をパースして挿入 | ✅ |
| 取り消し・やり直しの粒度改善 | IME 確定・装飾単位での履歴 | 中 |

### テーブル

| 項目 | 内容 | 優先 |
|------|------|------|
| セル内改行（実装済み） | セル内 Enter で `<br>` を挿入 | ✅ |
| 列幅ドラッグ | 境界ドラッグで列幅変更（columnResizing の UI 表面化） | 中 |
| セル結合・分割 | colspan/rowspan（標準 Markdown では非対応 → 拡張記法検討） | 低 |
| CSV/TSV 貼り付け → 表 | 表データを貼ると自動でテーブル化 | 中 |

### スラッシュ・コマンド

| 項目 | 内容 | 優先 |
|------|------|------|
| コマンド拡充 | callout 種別、トグル/折りたたみ、目次、日付、絵文字、区切り | 高 |
| アイコン・説明付き表示 | 各コマンドにアイコンとプレビュー | 中 |
| 最近使った項目 | 利用頻度順の並べ替え | 低 |

### インライン・記法

| 項目 | 内容 | 優先 |
|------|------|------|
| リンク編集ツールチップ | リンクにホバー/フォーカスで URL 編集・解除 UI | 高 |
| ソフトブレイク表示（実装済み） | 単一改行を見た目の改行として表示（保存は `\n` のまま） | ✅ |
| 絵文字ピッカー | `:` 入力で候補表示 | 低 |
| `@` メンション / `#` タグ | 補完と装飾 | 低 |
| 脚注・定義リスト | `[^1]` 等のサポート | 中 |
| Obsidian コールアウト / Wiki リンク | `> [!note]`、`[[link]]` の WYSIWYG | 中 |

### 体験・パフォーマンス

| 項目 | 内容 | 優先 |
|------|------|------|
| Find / Replace（実装済み ✅） | `Cmd+F` 検索、`Cmd+Opt+F`・`Ctrl+H` 置換（Replace / Replace All） | 中 |
| 保存状態インジケータ | 保存中/保存済みの可視化 | 中 |
| コードブロック強化 | 言語ピッカー（実装済み ✅）。コピーボタン、行番号、編集中ハイライトは今後 | 中 |
| 遅延ロード | Mermaid / KaTeX を必要時のみ読み込みバンドル削減 | 中 |
| 大規模文書の仮想化 | 画面外ブロックの描画スキップ | 低 |
| アクセシビリティ | キーボード操作、ARIA、スクリーンリーダー対応 | 中 |

---

## 関連ドキュメント

| ファイル | 内容 |
|----------|------|
| [inline-preview-features.md](./inline-preview-features.md) | Raw モード仕様 |
| [developer/architecture.md](../developer/architecture.md) | アーキテクチャ概要（開発者向け） |
| [README.md](../README.md) | ドキュメント目次 |
