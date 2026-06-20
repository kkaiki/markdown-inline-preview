# アーキテクチャ概要

> **ディレクトリ構成の目標・段階的移行計画**は [directory-architecture-plan.md](./directory-architecture-plan.md) を参照（本ファイルのツリー図は 2026-06 時点で古い）。

## システム構成

```
markdown-inline-preview/
├── src/
│   ├── extension-markdown-inline.js  # メインの拡張機能コード
│   └── utils/settings.ts             # Advanced設定解決ヘルパー
├── package.json                       # 拡張機能マニフェスト
├── test/
│   ├── runTest.js                     # テストランナー
│   └── suite/                         # テストスイート
└── docs/                              # ドキュメント
```

## コア機能モジュール

### 1. 装飾システム (Decoration System)

VSCode Decoration APIを使用してエディタの表示を拡張。

```
┌──────────────────────────────────────────────────────┐
│                  装飾タイプ                           │
├──────────────────────────────────────────────────────┤
│ checkedDecoration      │ チェック済み取り消し線        │
│ headingDecorations[]   │ H1〜H6の見出しスタイル        │
│ codeBlockDecoration    │ コードブロック背景            │
│ horizontalRuleDecoration│ 水平線                      │
│ languageDecorations    │ 言語別コードハイライト        │
└──────────────────────────────────────────────────────┘
```

### 2. イベントハンドラ

```
┌─────────────────────────────────────────────────────────────┐
│                    イベントフロー                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  onDidChangeTextDocument ──→ デバウンス ──→ 装飾更新         │
│          │                                                  │
│          └──→ コードブロック自動補完                         │
│          └──→ 目次自動更新（見出し変更時）                   │
│               ただし Advanced設定で個別に抑制可能            │
│                                                             │
│  onDidChangeTextEditorSelection ──→ テーブル自動整形         │
│          │                                                  │
│          └──→ チェックボックスクリック検出                   │
│          └──→ 編集行の装飾制御                              │
│               ただし Advanced設定で個別に抑制可能            │
│                                                             │
│  onDidChangeActiveTextEditor ──→ 装飾の再適用               │
│  onDidChangeConfiguration ──→ 設定変更の再反映              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.5 設定解決レイヤー

`src/utils/settings.ts` が、次の役割を持ちます。

- `advanced.*` の取得
- 既存設定との後方互換
- 明示的に設定された `advanced.*` を優先する判定

これにより、拡張本体のイベント処理は「その機能が有効か」を毎回同じルールで判断できます。

### 3. コマンドシステム

```javascript
// コマンド登録パターン
const safeRegister = (commandId, handler) => {
    try {
        const disposable = vscode.commands.registerCommand(commandId, handler);
        context.subscriptions.push(disposable);
    } catch (error) {
        // 競合時のエラーハンドリング
    }
};
```

主要コマンド:
- `markdownInline.smartEnter` - スマートEnter
- `markdownInline.toggleCheckbox` - チェックボックストグル
- `markdownInline.formatTable` - テーブル整形
- `markdownInline.updateTableOfContents` - 目次更新

## データフロー

### テキスト変更時

```
ユーザー入力
    │
    ▼
onDidChangeTextDocument
    │
    ├──→ 設定判定
    │      │
    │      ├──→ code block auto complete on/off
    │      └──→ TOC auto update on/off
    │
    ├──→ デバウンス (50ms)
    │         │
    │         ▼
    │    updateAllDecorations()
    │         │
    │         ├──→ updateHeadingDecorations()
    │         ├──→ updateCheckboxDecorations()
    │         ├──→ updateCodeBlockDecorations()
    │         └──→ updateHorizontalRules()
    │
    └──→ 見出し変更検出
              │
              ▼
         目次自動更新 (500msデバウンス)
```

### カーソル移動時

```
カーソル移動/クリック
    │
    ▼
onDidChangeTextEditorSelection
    │
    ├──→ 設定判定
    │      │
    │      ├──→ autoFormatTables on/off
    │      └──→ enableCheckboxMouseToggle on/off
    │
    ├──→ 行変更検出
    │         │
    │         ├──→ 前の行がテーブル → formatTableAtLine()
    │         └──→ 装飾更新
    │
    └──→ マウスクリック検出
              │
              └──→ チェックボックス判定 → toggleCheckbox()
```

## 状態管理

### グローバル状態

```javascript
let updateTimer = null;           // 装飾更新デバウンス用
let tocUpdateTimer = null;        // 目次更新デバウンス用
let currentEditingLine = -1;      // 編集中の行番号
let isDragging = false;           // ドラッグ選択中フラグ
let languageDecorations = new Map(); // 言語別装飾キャッシュ
```

補足:
- 設定値自体は永続グローバル状態として保持せず、必要時に `vscode.workspace.getConfiguration('markdownInline')` から解決
- 設定変更時は `onDidChangeConfiguration` で装飾を再適用

### ライフサイクル

```
activate()
    │
    ├──→ 装飾タイプ作成
    ├──→ コマンド登録
    ├──→ イベントハンドラ登録
    └──→ 初期装飾適用

    ↓ (拡張機能使用中)

deactivate()
    │
    ├──→ 装飾タイプ破棄
    ├──→ タイマークリア
    └──→ リソース解放
```

## パフォーマンス最適化

### 1. デバウンス処理

頻繁なイベントに対してデバウンスを適用:
- 装飾更新: 50ms
- 目次更新: 500ms

### 2. 部分更新

変更された行のみを更新（将来実装予定）:
```javascript
// 変更行のトラッキング
const changedLines = new Set();

// 部分更新
function performIncrementalUpdate(editor, changedLines) {
    // 変更行のみ処理
}
```

### 3. キャッシュ

- `languageDecorations`: 言語別装飾タイプをキャッシュ
- 装飾タイプの再利用（グローバル変数で保持）

## 拡張ポイント

### 新しいコマンドの追加

1. `registerCommands()` 内で `safeRegister()` を使用
2. `package.json` の `contributes.commands` に追加
3. 必要に応じて `contributes.keybindings` にショートカットを追加

### 新しい装飾の追加

1. グローバル変数で装飾タイプを定義
2. `activate()` で `createTextEditorDecorationType()` を呼び出し
3. `updateAllDecorations()` から更新関数を呼び出し
4. `deactivate()` で破棄処理を追加

### 新しいイベントハンドラの追加

1. `activate()` 内で `context.subscriptions.push()` を使用
2. 適切なイベントを購読
3. デバウンスが必要な場合はタイマーを使用
