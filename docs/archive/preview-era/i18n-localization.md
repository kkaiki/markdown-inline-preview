# 多言語対応（i18n / ローカライズ）仕様

最終更新: 2026-06-22
対象: iPreview（Markdown Inline Preview）の英語 / 日本語 UI 対応
方針: グローバル＝英語ファースト、注力＝日本ニッチ（事業戦略・ロードマップは別管理）

> 方針: **ソース言語は英語**（コード中の文字列は英語で書く）、**日本語はオーバーレイ**として翻訳辞書で上乗せする。表示言語はユーザーの VS Code 設定（`vscode.env.language`）に追従する。

---

## 0. なぜこの形か

- プロダクトは「初日からグローバル（英語ファースト）」。コードの素の文字列を英語にしておけば、翻訳が無い言語でも英語で破綻なく動く（安全なフォールバック）。
- 日本ニッチが当面の注力なので、日本語訳は最優先で用意する。
- ユーザーに言語を選ばせる独自設定は作らない。**VS Code の「表示言語の構成（Configure Display Language）」に追従**するのが OS/エディタとして自然。

---

## 1. ユーザーの表示言語の取得

```ts
vscode.env.language   // 例: "en", "ja", "pt-br", "zh-cn"
```

- VS Code の表示言語設定をそのまま返す（読み取り専用）。変更後はエディタ再起動が必要。
- **拡張ホスト（Node 側）**は `vscode.l10n` が内部でこれを見るため、明示的に読む必要はない。
- **WebView（ブラウザ側）**は `vscode.env` を参照できないため、ホストが `vscode.env.language` を settings ペイロードに載せて渡す（[§3](#3-webview-milkdown-側)）。

判定は前方一致でゆるく行う（`language.toLowerCase().startsWith('ja')` → 日本語）。地域差（`ja-JP` 等）を将来増やしても壊れない。

---

## 2. 拡張ホスト（Node 側）: `vscode.l10n`

VS Code 標準のローカライズ機構を使う。

### 構成

```jsonc
// package.json
"l10n": "./l10n"
```

```
l10n/
  bundle.l10n.json       … 英語（ソース）。省略可だが索引として置く
  bundle.l10n.ja.json    … 日本語訳（キー = 英語ソース文字列）
```

### 使い方

```ts
import * as vscode from 'vscode';

vscode.window.showWarningMessage(vscode.l10n.t('Failed to save image.'));
```

- `vscode.l10n.t('English source')` は、表示言語が `ja` なら `bundle.l10n.ja.json` の該当訳を、無ければソース（英語）を返す。
- プレースホルダは `vscode.l10n.t('Updated to v{0}.', version)` のように `{0}` で渡す。

### 対象（実 UI 文字列のみ。コメントは対象外）

| ファイル | 文字列 |
|----------|--------|
| `src/preview/host/previewPanel.ts` | 画像保存失敗、Pro 案内（本文＋「アップグレード」「あとで」）、ステータスバーのツールチップ 2 種 |
| `src/raw/whatsNew.ts` | 更新通知の本文、「リリースノート」「使い方ガイド」 |

---

## 3. WebView（Milkdown）側

WebView は別コンテキストで `vscode.l10n` を使えない。小さな自前 i18n を持つ。

### 仕組み

- `src/preview/webview/i18n.ts`
  - `setLanguage(lang: string)` … ホストから渡る `language` を保持（`ja` 判定）。
  - `t(en: string): string` … 日本語なら辞書 `JA[en] ?? en`、それ以外は `en`。
- 辞書はソース（英語）→ 日本語の単純な `Record<string, string>`。
- ホスト → WebView:
  - `PreviewSettings` に `language: string` を追加（`src/preview/webview/types.ts`）。
  - `buildSettingsPayload()` で `language: vscode.env.language` を載せる（`previewPanel.ts`）。
  - WebView は `init` / `settings` 受信時に `setLanguage(settings.language)` を**ツールバー等を組む前に**呼ぶ。

### 対象

`previewToolbarPlugin.ts`（見出し/チェックボックス/リスト/テーブル挿入/ズーム/Export/Preview・Raw ラベル）、`tableToolbarPlugin.ts`（行・列・表の追加削除）、`previewFindBar.ts`（検索）、`milkdownApp.ts`（初期化失敗メッセージ）。

> 注意: モジュール読込時に確定する文字列（例: `tableToolbarPlugin` の `BUTTONS` 配列、`previewFindBar` のプレースホルダ）は、**ソース＝英語のキーだけ保持し、描画時に `t()` を呼ぶ**。`setLanguage` は `init` メッセージで初めて呼ばれるため、モジュール読込時点で `t()` を評価すると英語に固定されてしまう。

### スラッシュメニューの `detail`（対応済み）

`src/shared/slash/slashMenuItems.ts` の `detail` は**英語ソース**に統一し、表示時に各コンテキストで訳す:
- Raw（VS Code 補完）: `slashCompletion.ts` で `vscode.l10n.t(item.detail)`。
- Preview（WebView）: `previewSlashMenu.ts` で `t(item.detail)`。

訳はホスト（`l10n/bundle.l10n.ja.json`）と WebView（`i18n.ts` の `JA`）の両方に持つ。`test/suite/webviewI18n.test.ts` が**全項目に日本語訳がある**ことを保証する（新項目を足して訳を忘れると失敗）。

### 未対応（任意・将来）

- package.json のコマンド名・設定説明は**現状すべて英語**（日本語残りは無い）。日本語訳を足すなら `%key%` + `package.nls*.json` で対応可能だが、英語のままでも実害が小さいため任意。

---

## 4. package.json の貢献点（コマンド/設定/ウォークスルー）

- VS Code は `%key%` プレースホルダ + `package.nls.json`（英語＝既定）/ `package.nls.ja.json`（日本語）で**表示言語に応じて自動選択**する。
- 現状コマンド名・設定説明はほぼ英語なので、**まずは日本語が残っているウォークスルー（タイトル/説明）を nls 化**する。コマンド/設定の全 nls 化は将来タスク（量が多く、英語のままでも実害が小さいため）。
- ウォークスルーの本文 Markdown（`media/walkthrough/*.md`）は VS Code が言語別に自動切替しないため、**英語を正**とし、必要なら別途ローカライズ版の配信方法を検討する。

```jsonc
// package.json
"title": "%walkthrough.title%"
// package.nls.json         { "walkthrough.title": "Get started with iPreview" }
// package.nls.ja.json      { "walkthrough.title": "iPreview をはじめる" }
```

---

## 5. テスト

- `test/suite/webviewI18n.test.ts` … `t()` / `setLanguage()` の純粋ロジック（英語フォールバック、日本語ルックアップ、未知キーはソースを返す、`ja-JP` 等の前方一致）。
- ホストの `vscode.l10n` は VS Code ランタイム依存のためユニットテスト対象外（手動確認）。

---

## 6. 翻訳の追加手順（運用）

1. コードには**英語のソース文字列**を書く（`t('…')` / `vscode.l10n.t('…')`）。
2. 日本語訳を `l10n/bundle.l10n.ja.json`（ホスト）または `i18n.ts` の `JA` 辞書（WebView）に追加。
3. ウォークスルー等の貢献文字列は `package.nls*.json` に追加。
4. 言語を増やすときは `bundle.l10n.<locale>.json` と WebView 辞書を足す（コードは触らない）。
