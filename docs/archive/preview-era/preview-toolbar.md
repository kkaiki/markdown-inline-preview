# Preview 上部ツールバー 設計書（ドラフト・実装前）

最終更新: 2026-06-21
対象: Preview（Milkdown WYSIWYG モード）
ステータス: **設計（実装前）** — この md で設計を固めてから実装に入る
関連: Export/Pro 課金導線の仕様（別管理）

---

## 0. 目的

Preview（Milkdown webview）の**上部に常設ツールバー**を置き、マウス操作だけで主要な書式（見出し・チェックボックス・番号付きリストなど）を適用できるようにする。あわせて:

- 各ボタンを**ホバーするとショートカットキーを表示**（学習導線）。
- 右端に **Export ボタン**を置き、押すと **Pro 課金の導線**（別管理の仕様書）へつなぐ。

Notion / Typora のような「触れば分かる」編集体験を Preview にもたらすのが狙い。

---

## 1. スコープ

### 1.1 今回やる（MVP）

1. Preview 上部に sticky なツールバー領域を新設。
2. ボタン: **戻る/進む（Undo/Redo）｜ 見出し H1–H3 / チェックボックス / 箇条書き / 番号付きリスト / 引用 / コードブロック / テーブル**。
   - 左端に **戻る ↶ / 進む ↷**（区切り線で書式ボタンと分離）。ショートカットは VS Code/Milkdown 標準の `Cmd/Ctrl+Z` / `Cmd/Ctrl+Shift+Z`（ヒント表示のみ。keybinding の追加割り当ては不要）。
   - **引用 ❝**（`Cmd+Opt+9`）と **コードブロック `</>`**（`Cmd+Opt+8`）を追加。
3. ホバーで「機能名 + ショートカット」を表示するツールチップ。
4. **Export ボタン**（押下で Pro アップグレード案内モーダル/通知を表示。実出力は別管理の仕様書側で実装）。

### 1.2 任意（設定で表示/非表示）

- 区切り線 / 太字・斜体・取り消し線。

### 1.3 非ゴール

- 実際の PDF/Marp 生成（別管理の仕様書）。
- ライセンス検証基盤そのもの（同上。ここでは「Export 押下 → 未課金なら案内を出す」フックだけ用意）。
- Raw 側へのツールバー追加（Raw は既存のキーバインド/CodeLens で対応済み）。

---

## 2. UI 仕様

### 2.1 レイアウト

```
┌─────────────────────────────────────────────────────────────────────┐
│  [↶][↷] | [H1][H2][H3][☑][•][1.][❝][</>][―]  ← ←   │ [−][%][+] [Export] [Preview|Raw] │
│  ←── .preview-toolbar-scroll（横スクロール可能） ──→   │ ←── .preview-toolbar-fixed ───→ │
└─────────────────────────────────────────────────────────────────────┘
```

- ツールバーは編集エリアの**上に固定（position: sticky; top: 0）**。スクロールしても残る。
- **左スクロール領域（`.preview-toolbar-scroll`）**: Undo/Redo / 書式ボタン群。
  幅が足りないとき横スクロールで辿れる（スクロールバーは非表示、タッチ/トラックパッドで操作）。
- **右固定領域（`.preview-toolbar-fixed`）**: Zoom / Export / Preview-Raw トグル。
  常に右端に固定表示し、スクロール対象外とする。左端に区切り線を設ける。
- 既存の `table-toolbar`（フローティング）とは別。こちらは**常設の上部バー**。

### 2.2 ボタン定義（必須3点 + Export）

| ボタン | アイコン候補 | 動作 | 既存の再利用先 | ショートカット(表示用) |
|---|---|---|---|---|
| 見出し | `$(text-size)` + `H▼`（H1–H3 ドロップダウン） | 現在行を見出しに変換 | slash `h1/h2/h3`, `convertToHeading1..3` | ⌥⌘1 / ⌥⌘2 / ⌥⌘3 |
| チェックボックス | `$(checklist)` ☑ | 現在行を `- [ ]` に | slash `todo`, `convertToCheckbox` | ⌥⌘4 |
| 番号付きリスト | `$(list-ordered)` 🔢 | 現在行を `1.` に | slash `numbered`, `convertToNumbered` | ⌥⌘6 |
| Export | `$(export)` 📤（未課金は ✨/🔒 付与） | エクスポート開始（Pro ゲート） | 別管理の仕様書 | （なし） |

> アイコンの最終決定は当時のアイコン候補比較（文書は削除済み）のセクション B で選定。

### 2.3 状態表示（アクティブ強調）

- カーソル位置のブロック種別に応じて、対応ボタンを**アクティブ表示**（例: 見出し行なら見出しボタンをハイライト）。
- 再押下でトグル解除（見出し→通常段落）できると望ましい（MVP は適用のみでも可）。

### 2.4 ホバーでショートカット表示

要件: ボタンにマウスを乗せると「機能名 + ショートカット」を表示。

実装方針（2 択、推奨は B）:

- **A. ネイティブ `title` 属性**: `btn.title = "見出し H1  (⌥⌘1)"`。実装が最も簡単。ただし表示の遅延・スタイル不可。
- **B. 自前ツールチップ（推奨）**: ホバーで小さな吹き出しを表示。`previewSlashMenu` 同様の DOM 生成で実現。遅延なし・キーキャップ風スタイル可。

ショートカット文字列はプラットフォームで出し分け:

| 機能 | mac 表示 | win/linux 表示 | コマンド |
|---|---|---|---|
| 見出し H1/H2/H3 | ⌥⌘1 / ⌥⌘2 / ⌥⌘3 | Alt+Ctrl+1/2/3 | `convertToHeading1..3` |
| チェックボックス | ⌥⌘4 | Alt+Ctrl+4 | `convertToCheckbox` |
| 番号付きリスト | ⌥⌘6 | Alt+Ctrl+6 | `convertToNumbered` |
| （箇条書き） | ⌥⌘5 | Alt+Ctrl+5 | `convertToBullet` |

> 注意: これらのキーバインドは現状 `when: editorLangId == markdown`（= **Raw 専用**）。Preview（webview/カスタムエディタ）ではそのままでは発火しない。§4.3 参照。

### 2.5 Export ボタンと Pro 導線

- クリック時、Pro ライセンスの課金状態を確認:
  - **未課金**: アップグレード案内を表示（「Pro にすると PDF / Marp で書き出せます」+ 「アップグレード」「あとで」）。導線は VSCode の通知 or webview 内モーダルのどちらか（§4.4）。
  - **課金済み / トライアル**: エクスポート処理へ（別仕様）。
- ボタンには未課金時 ✨/🔒 バッジを付け、Pro 機能であることを示す。

---

## 3. 設定（package.json / configuration）

| 設定キー | 既定 | 説明 |
|---|---|---|
| `markdownInline.preview.showToolbar` | `true` | Preview 上部ツールバーの表示 |
| `markdownInline.preview.toolbarItems` | `["heading","checkbox","numbered","export"]` | 表示する項目と順序 |
| `markdownInline.preview.toolbarShowShortcuts` | `true` | ホバー時にショートカットを表示 |

---

## 4. 技術設計

### 4.1 配置先

- webview 側: `src/preview/webview/` に **`previewToolbarPlugin.ts`** を新規作成。
  - 既存 `tableToolbarPlugin.ts` の `$prose` プラグイン構成を雛形にする（DOM 生成 + ボタン + クリックで command 実行）。
  - ただし table-toolbar はフローティング。今回は**エディタ親要素の先頭に固定の bar を差し込む**形にする（`milkdownApp.ts` 側でラッパ DOM に append）。
- `milkdownApp.ts` の `.use(...)` チェーンに `createPreviewToolbarPlugin(...)` を追加（`createTableToolbarPlugin()` の隣・434 行付近）。

### 4.2 ボタンのアクション

- 既存の **slash コマンド資産**を再利用するのが最短。`SLASH_MENU_ITEMS`（`src/shared/slash/slashMenuItems.ts`）の `previewMarkdown` と `applyPreviewSlash` の仕組みで、現在行/選択へブロックを適用できる。
- 見出しトグル等は Milkdown のコマンド（`@milkdown/preset-commonmark` の `wrapInHeading` 等）を直接呼ぶ方が自然な場合あり。MVP は「現在行のブロック種別を変換」で実装し、slash の適用ロジックに合わせる。

### 4.3 ショートカットの実発火（重要）

- 表示だけなら §2.4 で完結。**Preview 内で実際にキーを効かせたい**場合は、`previewKeymapPlugin.ts` に Preview 用キーマップを追加する必要がある（Raw 用 keybinding は Preview で発火しないため）。
- MVP の割り切り: **ツールバーのクリックは必ず動く**。キーボードショートカットの Preview 対応は次フェーズ（表示は先に出しておき「Raw で使える」旨を伝える、または Preview キーマップを併せて実装）。
- → **要決定**: Preview でもショートカットを発火させるか（§6 オープン issue）。

### 4.4 Pro 導線の出し方

- 候補1: Extension Host 側で `vscode.window.showInformationMessage(..., 'アップグレード', 'あとで')`。実装が軽く、VSCode らしい。
- 候補2: webview 内モーダル（リッチに見せられる）。
- webview のクリック → `postMessage({ type: 'export-request' })` → `previewPanel.ts` が受けてライセンス確認 → 未課金なら案内。配線は別管理の仕様書（Pro Export）の構成に合流。

### 4.5 アクセシビリティ / 既存との整合

- 各ボタン `role="button"` / `aria-label` / キーボードフォーカス可。
- `mousedown` で `preventDefault()`（table-toolbar と同様、エディタの選択を奪わない）。
- テーマ: `markdownInline.preview.theme`（light/dark/auto）に追従。CSS は `media/milkdown-preview.css` に追記。

---

## 5. 実装ステップ（合意後）

1. `previewToolbarPlugin.ts` 新規（DOM + 必須3点ボタン、クリックで適用）。
2. `milkdownApp.ts` に組み込み + sticky CSS（`milkdown-preview.css`）。
3. ホバーのツールチップ（§2.4 B 案）+ プラットフォーム別ショートカット文字列。
4. アクティブ状態のハイライト。
5. Export ボタン + Pro 導線フック（未課金案内のみ。生成は別仕様）。
6. 設定キー 3 つを `package.json` に追加。
7. 任意ボタン（箇条書き/引用/コード/区切り線）を `toolbarItems` 設定で追加可能に。

---

## 6. 要決定（オープン issue）

1. **見出しボタンの形**: `H▼` 1 つ（ドロップダウンで H1–H3） vs `H1`/`H2`/`H3` 個別ボタン。
2. **ボタン表示**: アイコンのみ / アイコン+ラベル。
3. **Preview でショートカットを実発火させるか**（§4.3）。MVP はクリックのみで割り切る案。
4. **Pro 導線 UI**: VSCode 通知（軽い） vs webview モーダル（リッチ）。
5. **任意ボタンの初期セット**: 箇条書き・引用・コード・区切り線のうちどれを既定表示にするか。
6. **webview でのアイコン描画方式**: `@vscode/codicons` フォント同梱 vs インライン SVG vs 絵文字/文字（§B 参照）。コドアイコン採用なら font 同梱が必要。
