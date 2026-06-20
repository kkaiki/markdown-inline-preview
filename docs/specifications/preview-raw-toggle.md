# Preview / Raw トグル機能 要件定義

## 概要

Cursor のようなインライン Markdown 編集体験を VSCode で実現する機能です。
MDファイルを開いた際、エディタ右上に **Preview** / **Raw** の切り替えボタンを表示し、
レンダリング済みプレビュー（**編集可能**）とソース表示をシームレスに切り替えられます。

> **設計の核心**: Raw でも Preview でも「いい感じに編集できる」ことが目標。
> Preview は閲覧専用ではなく、WYSIWYG スタイルで直接編集できるモードとして扱う。

---

## 背景・動機

### 現状の課題

| 問題 | 詳細 |
|------|------|
| VSCode標準のプレビュー | サイドペインに別タブで開く → 画面分割が必要で集中しにくい |
| インラインプレビューなし | Markdownを書きながらレンダリング結果を同一エリアで確認できない |
| Preview は読み取り専用 | Notion/Cursor のように Preview で直接編集できない |
| テーマ追従の難しさ | WebView はエディタの CSS 変数を自動継承しないため手動対応が必要 |

### Cursor の実装から学んだこと

Cursor の Markdown Preview は `.markdown-editor-react` コンポーネントで実装されており、
背景色は `--cursor-editor` / `--cursor-bg-editor` などの **独自 CSS 変数**で決まっている。
`markdown.styles` や外部設定では上書きできず、WebView 側でテーマを正しく引き継ぐ必要がある。

VSCode でも同様に `--vscode-editor-background` / `--vscode-editor-foreground` 等の
CSS 変数を WebView 側で明示的に参照することでテーマ追従を実現する。

```
Cursor:   [ファイルタブ]  ... [Preview] [Raw]  ← エディタ右上に常時表示
VSCode現状: [ファイルタブ]  ... [Open Preview ▶]  ← 別タブ・読み取り専用
VSCode目標: [ファイルタブ]  ... [◉ Preview] [Raw]  ← 同一エディタで切替・編集可能
```

---

## ユーザーストーリー

```
As a 開発者/ライター
I want MDファイルを開いたとき右上のボタン一つでプレビューとRawを切り替えたい
And Preview モードでもそのまま文章を編集したい
So that 画面を分割せず、Notion のような集中した編集・閲覧体験を得られる
```

### サブストーリー

1. **初回体験** — MDファイルを開いた瞬間に右上へ `Preview` `Raw` ボタンが自動表示される
2. **プレビュー閲覧** — `Preview` をクリックするとエディタ領域全体がレンダリング表示に切り替わる
3. **プレビュー内編集** — Preview モード上でテキストをクリックすると、そのブロックを直接編集できる
4. **Raw 編集復帰** — `Raw` をクリックするとカーソル位置を保ったままソース編集へ戻る
5. **シームレスな同期** — Preview で編集した内容が Raw ドキュメントに即座に反映される
6. **キーボード操作** — ショートカット一発でモードを反転できる
7. **状態の記憶** — ファイルを閉じて再度開いても前回のモードが復元される

---

## 機能要件

### FR-01: エディタタイトルバーのトグルUI

#### FR-01-1 ボタン表示条件
- `.md` / `.markdown` ファイルを開いたとき**のみ**表示する
- `.json` `.ts` 等の非Markdownファイルでは非表示

#### FR-01-2 ボタン配置
- VSCode エディタタイトル右端（`editor/title` メニュー）に配置
- ボタン2つを横並び：`[⬜ Preview]` `[◉ Raw]` （アクティブ側が強調）
- アイコン + テキストラベルで視認性を確保

#### FR-01-3 ボタン状態
| 状態 | Preview ボタン | Raw ボタン |
|------|--------------|-----------|
| Raw モード中 | 通常（クリックで切替） | アクティブ（強調・無効化） |
| Preview モード中 | アクティブ（強調・無効化） | 通常（クリックで切替） |

---

### FR-02: Raw モード（デフォルト）

- 通常の VSCode テキストエディタをそのまま表示
- 本拡張の既存インライン装飾（チェックボックス・テーブル整形等）は**すべて維持**
- カーソル位置・スクロール位置を保持

---

### FR-03: Preview モード（読み取り + 編集）

#### FR-03-1 表示エンジン
- WebView パネルを同一エディタ列に開き、エディタを隠す形で表示
- Raw モードに戻った際は WebView を破棄、エディタを前面に戻す
- WebView 内には **WYSIWYG エディタ**を埋め込む（後述 FR-08）

#### FR-03-2 レンダリング要件

| 要素 | 要件 |
|------|------|
| 見出し（h1〜h6） | フォントサイズ・余白でレベル差を明確化 |
| 太字・斜体・コード | CommonMark 準拠でレンダリング |
| コードブロック | シンタックスハイライト（Shiki 推奨 / highlight.js） |
| テーブル | 罫線あり、ヘッダ行強調 |
| チェックボックス | `- [ ]` / `- [x]` をインタラクティブなチェックボックスとして表示 |
| 画像 | `![alt](path)` を実際の画像として表示（ワークスペース相対パス対応） |
| リンク | クリックでブラウザ or VSCode 内ナビゲーション |
| 数式（任意） | KaTeX 対応（拡張設定で ON/OFF） |
| Frontmatter | `---` YAML ブロックをメタ情報として整形表示 |

#### FR-03-3 スタイリング（テーマ追従）

VSCode が提供する CSS 変数を WebView 側で参照し、エディタテーマに自動追従する。

```css
/* WebView 内で参照する VSCode CSS 変数 */
:root {
  background: var(--vscode-editor-background);
  color: var(--vscode-editor-foreground);
  font-family: var(--vscode-editor-font-family);
  font-size: var(--vscode-editor-font-size);
}

/* コードブロック */
pre, code {
  background: var(--vscode-textCodeBlock-background);
  color: var(--vscode-textPreformat-foreground);
}

/* リンク */
a {
  color: var(--vscode-textLink-foreground);
}

/* テーブル・区切り線 */
table, hr {
  border-color: var(--vscode-editorGroup-border);
}
```

- `markdownInline.preview.theme` 設定が `"light"` / `"dark"` の場合は上書き可能
- フォントは `--vscode-editor-font-family` を参照（ユーザー設定で上書き可能）
- 読み心地を優先した余白・行間（Notion ライク、最大幅 800px）

#### FR-03-4 ライブ同期（両方向・自動保存）

- **Raw → Preview**: Raw ドキュメントが変更されると debounce 100ms でリアルタイムに Preview へ反映
- **Preview → Raw**: Milkdown の編集内容を debounce 200ms で Markdown シリアライズし、TextDocument へ即時反映。さらに `workspace.save()` を自動呼び出してファイルへ書き込む
- ユーザーが Cmd+S を押す必要はない。常にファイルがライブ保存済み状態を保つ
- 循環更新防止: 自己起因の TextDocument 変更は `onDidChangeTextDocument` で無視するフラグを持つ

#### FR-03-5 スクロール連動（オプション）

- Raw ↔ Preview 切替時にスクロール位置を近似マッピング（見出しアンカーで対応）

---

### FR-04: チェックボックスのインタラクション（Preview内）

- Preview モードのチェックボックスをクリックすると Raw ドキュメントを即時更新
- `- [ ]` ↔ `- [x]` のトグルは `workspace.save()` と組み合わせてライブ保存する
- WYSIWYG エディタ（Milkdown）が扱うテキスト編集と、チェックボックスのクリック操作は独立して維持する

---

### FR-05: キーボードショートカット

| アクション | デフォルトキー | 設定キー名 |
|-----------|--------------|-----------|
| Preview / Raw 切替 | `Ctrl+Shift+V`（Win/Linux）/ `Cmd+Shift+V`（Mac）※ | `markdownInline.togglePreview` |

> ※ VSCode 標準の `Open Preview to the Side` と競合する場合は別キーを提案（`Ctrl+Shift+M` など）

---

### FR-06: 状態の永続化

- モード（Preview / Raw）をファイル URI をキーにしてワークスペース状態（`context.workspaceState`）へ保存
- VSCode を再起動しても前回のモードを復元

---

### FR-07: 設定項目

| 設定キー | 型 | デフォルト | 説明 |
|---------|-----|-----------|------|
| `markdownInline.preview.defaultMode` | `"raw"` \| `"preview"` | `"raw"` | MDファイルを開いた際のデフォルトモード |
| `markdownInline.preview.rememberMode` | boolean | `true` | ファイルごとにモードを記憶 |
| `markdownInline.preview.syncScroll` | boolean | `true` | モード切替時のスクロール同期 |
| `markdownInline.preview.enableMath` | boolean | `false` | KaTeX 数式レンダリング |
| `markdownInline.preview.theme` | `"auto"` \| `"light"` \| `"dark"` | `"auto"` | プレビューのカラーテーマ |
| `markdownInline.preview.fontFamily` | string | `""` | プレビューのフォント（空欄 = VSCode 設定に従う） |
| `markdownInline.preview.fontSize` | number | 15 | プレビューの本文フォントサイズ（px） |
| `markdownInline.preview.maxWidth` | number | 800 | プレビューの最大横幅（px）、0=無制限 |
| `markdownInline.preview.editable` | boolean | `true` | Preview モードでの直接編集を許可 |

---

### FR-08: Preview 内 WYSIWYG 編集（採用確定）

#### FR-08-1 編集モデル：フル WYSIWYG

Preview モード全体が Milkdown エディタとして機能する。クリックした場所でそのままカーソルが入り、
Markdown 記法を意識せずにリッチテキストとして編集できる。

```
[通常閲覧・編集（常時）]
  Hello World          ← クリックで即カーソル、タイプして編集
  ═══════════
  This is bold text... ← **bold** を入力すると即座に太字で表示

[見出しレベルの変更]
  # を打ち込む、またはツールバーの H1/H2/H3 で変更

[コードブロック内]
  Raw コード入力（シンタックスハイライトはリアルタイム）
```

#### FR-08-2 採用ライブラリ: Milkdown（確定）

| ライブラリ | バンドルサイズ | Markdown I/O | 採用判断 |
|-----------|--------------|--------------|---------|
| **Milkdown** | ~200KB | ◎ ネイティブ対応 | **採用確定** |
| TipTap | ~150KB | ○ 拡張で対応 | 見送り（Markdown I/O に追加実装が必要） |
| ProseMirror | ~100KB | △ 自前実装 | 見送り（ゼロから実装コストが大きい） |

Milkdown を採用する理由:
- Markdown をネイティブ入出力として扱い、AST を経由した双方向変換が組み込み済み
- ProseMirror ベースで VSCode WebView との相性が良い
- プラグインで KaTeX / Mermaid 等の将来拡張に対応できる

#### FR-08-3 ライブ保存の双方向同期

```
[WebView] Milkdown editor
    |
    | onChange (debounce 200ms)
    | postMessage({ type: 'content', markdown: '...' })
    ↓
[Extension Host]
    TextDocument.applyEdit()   ← Raw に即時反映
    workspace.save()           ← ファイルに自動書き込み
    |
    | onDidChangeTextDocument（外部変更のみ）
    | postMessage({ type: 'update', markdown: '...' })
    ↓
[WebView] Milkdown editor.setContent()  ← カーソル位置を保持して更新
```

- **Preview → ファイル**: debounce 200ms → `applyEdit` → `workspace.save()` で自動保存
- **外部変更 → Preview**: Raw を直接編集した場合も debounce 100ms で Preview に即反映
- **循環防止**: `applyEdit` 起因の `onDidChangeTextDocument` は専用フラグで無視
- Undo/Redo は Milkdown 内部の履歴（ProseMirror）が管理。Raw に戻った後は VSCode の Undo で復元可能

#### FR-08-4 編集可能な要素と制約

| 要素 | 編集可否 | 備考 |
|------|---------|------|
| 段落テキスト | ○ | インライン Markdown 記法（`**bold**` 等）も入力可 |
| 見出し | ○ | レベル変更はツールバーまたは `#` 入力 |
| 箇条書き / 番号リスト | ○ | Enter で継続、Tab でインデント |
| チェックボックス | ○ | クリックでトグル、テキスト部分は編集可 |
| コードブロック | ○ | コード内は Raw 入力（シンタックスハイライトはリアルタイム） |
| テーブル | △ | Phase 2 以降（セル編集のみ、行列追加は Raw で対応） |
| 画像 | △ | alt テキスト編集のみ、パス変更は Raw で対応 |
| Frontmatter | × | Raw モードで編集（Preview では整形表示のみ） |

#### FR-08-5 ツールバー（廃止）

~~Preview 編集中にフローティングツールバーを表示する~~ → **v1.8.3 で削除**。  
書式・ブロック挿入は **`/` スラッシュメニュー**（`preview.enableSlashMenu`、既定: on）を使用する。

---

## 非機能要件

### NFR-01: パフォーマンス

| 指標 | 目標値 |
|------|--------|
| Raw→Preview 切替時間 | < 300ms（10,000行以下のファイル） |
| Preview 内編集のレイテンシ | キー入力から表示まで < 50ms |
| Preview→ファイル保存ラグ | debounce 200ms 後 < 100ms でファイル書き込み完了 |
| Raw変更→Preview反映ラグ | debounce 100ms 後 < 100ms |
| Preview 内スクロール滑らかさ | 60fps |
| メモリ使用増加量（WebView） | < 50MB / ファイル |

### NFR-02: 互換性

- VSCode バージョン: `1.80.0` 以上
- OS: macOS / Windows / Linux
- **既存機能（チェックボックス・テーブル・TOC等）と競合しない**
- Raw モードの装飾は Preview モード中も裏で維持（戻ったとき即座に有効）

### NFR-03: アクセシビリティ

- ボタンに `aria-label` を付与（スクリーンリーダー対応）
- キーボードのみで全操作完結
- プレビュー HTML 内のコントラスト比: WCAG AA 以上

### NFR-04: セキュリティ

- WebView は `localResourceRoots` を厳格に制限
- 外部スクリプトの読み込み禁止（CDN 不使用、ローカルバンドルのみ）
- CSP（Content Security Policy）を必ず設定
- Markdown コンテンツのサニタイズ（XSS 対策）
- WYSIWYG エディタの出力も必ずサニタイズしてから `applyEdit` に渡す

---

## UX 設計方針

### 視覚デザイン原則

```
1. 一目でわかる   — ボタンのアクティブ状態が色とアイコンで即判断できる
2. 邪魔しない    — 閲覧・編集中はUIを最小化（ツールバーは選択時のみ表示）
3. 素早い       — モード切替にアニメーションは 0.1 秒以内のフェード程度
4. 一貫性        — VSCode 標準の色・スタイルに準拠（CSS 変数で自動追従）
5. 編集しやすい  — Preview でも Raw でも「自然に編集できる」感触を優先
```

### ボタンUI詳細（モックアップ）

```
Raw モード時:
┌─────────────────────────────────────────┬──────────────────────┐
│ README.md                               │ [👁 Preview]  [✎ Raw●] │
├─────────────────────────────────────────┴──────────────────────┤
│ # Hello World                                                   │
│ This is **bold** text...                                        │

Preview モード時（Milkdown WYSIWYG・常時編集可能）:
┌─────────────────────────────────────────┬──────────────────────┐
│ README.md                               │ [👁 Preview●] [✎ Raw]  │
├─────────────────────────────────────────┴──────────────────────┤
│   Hello World               ← クリックで即カーソル              │
│   ═══════════                                                   │
│   This is bold text...      ← タイプして即編集・即保存          │

Preview モード時（タイピング中）:
┌─────────────────────────────────────────┬──────────────────────┐
│ README.md                               │ [👁 Preview●] [✎ Raw]  │
├─────────────────────────────────────────┴──────────────────────┤
│   Hello World                                                   │
│   ═══════════                                                   │
│   This is bold text and more...▌  ← ライブ保存済み（● なし）   │
```

> **ライブ保存**: Preview での変更は debounce 200ms 後に自動でファイルへ書き込まれる。
> タブに `●` は表示されない（常に保存済み状態）。

### トランジション設計

```
Raw → Preview:
  1. Preview ボタンをクリック
  2. エディタ領域が 100ms でフェードアウト
  3. WebView が表示（Milkdown エディタ初期化済み HTML）
  4. スクロール位置を見出しアンカーで近似復元

Preview → Raw:
  1. Raw ボタンをクリック（または Cmd+Shift+V）
  2. 未コミットの編集を即座に TextDocument へ反映
  3. WebView が 100ms でフェードアウト
  4. テキストエディタが前面に表示（カーソル位置復元）

Preview 内編集 → ライブ保存:
  1. Milkdown の onChange イベント発火
  2. Markdown シリアライズ（debounce 200ms）
  3. postMessage で Extension Host へ送信
  4. TextDocument.applyEdit() で差分適用
  5. workspace.save() で自動ファイル書き込み（Cmd+S 不要）
```

---

## 実装スコープ（フェーズ分け）

### Phase 1 — MVP（読み取り専用プレビュー）

- [ ] エディタタイトルバーへの Preview / Raw ボタン追加
- [ ] WebView による Markdown レンダリング（CommonMark + GFM）
- [ ] コードブロックのシンタックスハイライト
- [ ] VSCode CSS 変数によるテーマ追従（light / dark 自動対応）
- [ ] キーボードショートカット
- [ ] チェックボックスのクリックインタラクション

### Phase 2 — フル WYSIWYG プレビュー（コア目標）

- [ ] Milkdown の WebView 組み込み
- [ ] Preview → ファイルへのライブ保存（debounce 200ms + `workspace.save()`）
- [ ] Raw 変更 → Preview へのライブ反映（debounce 100ms）
- [ ] 循環更新防止フラグの実装
- [ ] スクロール位置の同期
- [ ] モード状態の永続化

### Phase 3 — 高度機能

- [ ] フローティングツールバー（Bold / Italic / Code / Link / Heading）
- [ ] テーブルセルのインライン編集
- [ ] KaTeX 数式サポート
- [ ] Mermaid ダイアグラムサポート
- [ ] Frontmatter の整形表示
- [ ] プレビュー内リンクの VSCode ナビゲーション
- [ ] アクセシビリティ強化

---

## 除外スコープ（今回対象外）

- コラボレーション / リアルタイム共同編集
- PDF / HTML へのエクスポート
- カスタム CSS の完全サポート
- Preview 内での画像アップロード / パス変更

---

## 技術的考慮事項

### WebView の実装方法（推奨: Option B）

```
Option A: CustomEditorProvider
  - ファイルそのものをWebViewとして開く
  - Undo 履歴との整合が複雑
  - Pro: タブと1対1で管理しやすい

Option B: WebviewPanel（推奨）
  - エディタを隠して WebView を前面に出す擬似切替
  - 実装がシンプル
  - Pro: 既存の WebView 実装を流用可能、双方向同期が実装しやすい

Option C: TextEditorDecoration + WebView overlay
  - エディタ上に HTML をオーバーレイ表示
  - VSCode API の制約で実現困難
```

### WYSIWYG エディタライブラリ（採用確定: Milkdown）

| ライブラリ | バンドルサイズ | Markdown I/O | VSCode WebView 実績 | 採用判断 |
|-----------|--------------|--------------|-------------------|---------|
| **Milkdown** | ~200KB | ◎ ネイティブ対応 | ○ | **推奨**（Markdown ファースト設計） |
| TipTap | ~150KB | ○ 拡張で対応 | ○ | 次点（拡張性高い） |
| ProseMirror | ~100KB | △ 自前実装 | ○ | 将来カスタム実装時 |
| Quill | ~300KB | × HTML 出力 | △ | 不採用（Markdown 変換が困難） |

### Markdown パーサー（読み取り専用レンダリング用）

| ライブラリ | サイズ | GFM | 拡張性 | 採用判断 |
|-----------|--------|-----|--------|---------|
| `markdown-it` | 中 | ○ | ◎ | **推奨**（Phase 1 / プラグイン豊富） |
| `marked` | 小 | ○ | △ | 軽量候補 |
| `unified/remark` | 大 | ○ | ◎ | Phase 3 以降で検討 |

### テーマ追従の実装パターン

```typescript
// Extension Host 側: WebView に VSCode テーマ情報を渡す
function getThemeCSS(): string {
  const kind = vscode.window.activeColorTheme.kind;
  return kind === vscode.ColorThemeKind.Light ? 'light' : 'dark';
}

// WebView 側: VSCode CSS 変数を直接参照
// vscode-webview-ui-toolkit を使うと自動追従
```

---

## 受け入れ基準（Acceptance Criteria）

```gherkin
Feature: Preview / Raw トグル

  Scenario: MDファイルを開くとボタンが表示される
    Given VSCode で MDファイルを開く
    Then エディタ右上に "Preview" と "Raw" ボタンが表示される
    And "Raw" ボタンがアクティブ状態（デフォルト設定の場合）

  Scenario: Preview モードへの切替
    Given Raw モードで README.md を開いている
    When "Preview" ボタンをクリックする
    Then エディタ領域がレンダリング済み WYSIWYG エディタに切り替わる
    And "Preview" ボタンがアクティブ状態になる
    And 見出しやコードブロックが適切にレンダリングされる
    And テキストをクリックすると編集状態に入る

  Scenario: Preview 内での編集とライブ保存
    Given Preview モードで README.md を表示している
    When テキストを直接タイプする
    Then 200ms 以内に Raw ドキュメントに変更が反映される
    And ファイルが自動保存される（タブに "●" は出ない）

  Scenario: Raw 変更の Preview へのライブ反映
    Given Preview モードで README.md を表示している
    When 別ターミナルや外部ツールで README.md を変更する
    Then 100ms 以内に Preview の表示が更新される

  Scenario: Raw モードへの復帰（常に最新状態）
    Given Preview モードで編集を行った
    When "Raw" ボタンをクリックする
    Then テキストエディタが前面に戻る
    And Preview での編集内容がすでにファイルに保存されている
    And カーソル位置が維持されている

  Scenario: テーマ追従
    Given VSCode のカラーテーマが Light に設定されている
    When Preview モードを開く
    Then プレビュー背景が白、文字が黒で表示される
    Given VSCode のカラーテーマが Dark に設定されている
    When Preview モードを開く
    Then プレビュー背景がエディタの背景色、文字が前景色で表示される

  Scenario: キーボードショートカットでの切替
    Given Raw モードで README.md を開いている
    When Cmd+Shift+V を押す
    Then Preview モードに切り替わる

  Scenario: 非MDファイルにはボタンが表示されない
    Given VSCode で main.ts を開いている
    Then "Preview" / "Raw" ボタンは表示されない

  Scenario: 既存機能との共存
    Given Raw モードで README.md を開いている
    Then チェックボックスのクリック操作が動作する
    And テーブルの自動整形が動作する
    And TOC 生成が動作する
```

---

## 関連ドキュメント

- [機能索引](../feature-overview.md)
- [画像インラインプレビュー仕様](image-preview.md)
- [テスト仕様](test-specification.md)
