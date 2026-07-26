---
name: tdd-browser-preview
description: "markdown-inline-preview プロジェクトでのバグ修正 TDD ワークフロー。失敗テスト作成 → 失敗確認 → 仕様更新 → 実装修正 → 成功確認の順で進める。webview/DOM バグだけでなく、VS Code のタブ・フォーカス・エディタ管理まわりのバグ（実拡張ホストが要る）も対象。"
---

# TDD ワークフロー: markdown-inline-preview

> テストの**原則**（レイヤーの信頼度序列・偽装カバレッジ禁止・アンチフレーク規則）は
> `docs/testing/testing-rules.md` が正。本スキルは手順（HOW）、testing-rules は判断基準（WHY/WHAT）。

## 呼び出しタイミング

このスキルは以下の状況で使う：

- Preview (Milkdown webview) のバグ修正依頼
- キー操作・カーソル挙動・レイアウトのバグ
- VS Code のタブ／エディタグループ／フォーカス管理のバグ（Preview⇔Raw 切替、複数ファイル操作など）
- 新機能追加

## 必須の順序

```
1. 失敗するテストを書く（test/browser/、test/suite/、または test/extension/raw/<category>.test.ts・test/extension/preview/<category>.test.ts）
2. テストが「失敗」することを確認
3. docs/specifications/ の仕様を更新
4. 実装を修正
5. テストが「成功」に変わることを確認
```

実装を先に書いてはいけない。

## テスト種別の選択

| 状況 | 使うテスト |
|---|---|
| キー操作・カーソル座標・DOM 依存（webview 内） | `test/browser/`（Playwright + Chromium。webview バンドルを単体で読み込むだけで、実 VS Code は起動しない） |
| 純関数・ロジック | `test/suite/` か `test/webview/`（jsdom） |
| jsdom では `endOfTextblock` 等が動かないバグ | 必ず `test/browser/` |
| **VS Code のタブ・エディタグループ・フォーカス・`vscode.window.tabGroups` 絡みのバグ**（例: Preview⇔Raw 切替で違うファイルにフォーカスが飛ぶ） | 必ず `test/extension/preview/<category>.test.ts`（例: `tabs-editors.test.ts`。Raw コマンド系は `test/extension/raw/<category>.test.ts`）（`@vscode/test-electron` で実 VS Code を起動）。`test/browser/` は webview 単体表示のみで実タブを持たないため、この種のバグは**原理的に再現できない**。 |

## test/extension/（実 VS Code 拡張ホスト）を使うとき

`npm test` の内部スクリプトが壊れていることがある（`out-test/runTest.js` を指すが実体は `out-test/test/runTest.js`）。動かない場合は手動で:

```bash
npx tsc -p tsconfig.test.json && node ./out-test/test/runTest.js
```

`test/runTest.ts` の `extensionDevelopmentPath = path.resolve(__dirname, '../../')` （プロジェクトルート）になっているか確認する。`tsconfig.test.json` の `outDir`/`include` 次第でコンパイル後の階層が変わるため、`../` の個数がズレると拡張機能自体がロードされず、**全コマンドが `command not found` で「全滅」する**（feature のバグではなく設定ミスなので、まずこれを疑う）。

テストは `test/suite/index.ts` の `glob('extension/**/*.test.js', ...)` が `test/extension/` 配下を拾う。VS Code は 1 回だけ起動され、その同じインスタンス内で全ファイルが連続実行される。`MOCHA_GREP='12\.'` 環境変数でテスト名の絞り込みができる。新しいシナリオは `test/extension/raw/<category>.test.ts` か `test/extension/preview/<category>.test.ts` のうち該当する症状カテゴリのファイルに `suite(...)` を追記する（カテゴリの判定基準は CLAUDE.md 参照。無ければ新規カテゴリファイルを追加する）。

### タブ・フォーカス系バグの再現のコツ

- 複数ファイルを開いて操作順（開いた順＝タブの左右の並び）を明示的に作る。
- 特定のタブへフォーカスを戻すときは **`vscode.commands.executeCommand('vscode.openWith', uri, viewType, vscode.ViewColumn.Active)` のように URI を明示するコマンドを使う**。`workbench.action.openEditorAtIndex` のようなインデックス指定コマンドは 0/1-based が不明瞭で、意図と違うタブを操作してしまう危険がある（実際にこれで一度誤検出した）。
- 操作直後に `assert` で前提条件（「本当に対象のタブがアクティブか」）を確認してから本題の操作に進む。前提が崩れていると、バグと無関係な失敗を「再現できた」と誤認する。
- 非同期処理間の `setTimeout` 待機を長く取りすぎると、VS Code 内部の状態が完全に安定してからテストするので、レース起因のバグが**再現しなくなる**。まず待機なし/短い待機で試し、それでも通ってしまうなら初めて長めの待機を足して原因を切り分ける。
- **フォーカス系の直し方の注意**: 「操作後にチェックして違ったら直す」方式は、VS Code 内部の非同期な状態確定（例: タブを閉じた後の「次にどれをアクティブにするか」の決定）が**チェック後に上書きしてくる**ことがあり、効かないことがある。有効なのは「危険な操作（アクティブなタブを閉じる等）の**前に**、望む状態（正しいタブへのフォーカス）を先に確定させる」という順序の入れ替え。VS Code は非アクティブなタブを閉じても自動フォーカス選択を発動しないため、レースそのものを構造的に消せる。

## バグ条件の特定

テストを書いても最初から通ってしまう場合は、バグの**正確な発火条件**が違う。確認すること：

- カーソル位置: 末尾 (`placeCursorAfterText`) vs 中間 vs 先頭
- 選択状態: 空カーソル vs テキスト選択 (`selectText`)
- ビューポート幅: 900px vs 400px（狭いパネル）
- 選択の種類: TextSelection vs CellSelection（テーブル）
- ブロック種別: 段落 vs リスト vs テーブルセル vs 見出し

バグを `selParentText === '期待外の値'` で AssertionError にして **必ず失敗を画面で確認してから** 実装を直す。

## 実行コマンド

```bash
# webview/DOM バグ（Playwright）
npm run test:browser 2>&1 | grep -E "passing|failing|テスト名"
npm run build:webview   # 実装修正後ビルド（webview 変更時は必須）

# タブ・フォーカス・エディタ管理バグ（実 VS Code 拡張ホスト）
npx tsc -p tsconfig.test.json && node ./out-test/test/runTest.js 2>&1 | grep -E "passing|failing|テスト名"
npm run build:host      # 実装修正後ビルド（src/preview/host, src/raw 等の変更時は必須）
```

## 主要ファイル

- `test/browser/previewBrowserHarness.ts` — テストハーネス（`openPreview`, `h.model()` 等）
- `test/extension/raw/` / `test/extension/preview/` — 実 VS Code 拡張ホストテスト（タブ・フォーカス・コマンド系。症状カテゴリ別にファイル分割済み。詳細は CLAUDE.md のディレクトリ構造節）
- `test/runTest.ts` — `@vscode/test-electron` の起動設定。`extensionDevelopmentPath` のパス階層に注意
- `src/preview/host/previewPanel.ts` — Preview⇔Raw 切替、タブ管理（`switchToRaw`/`switchToPreview`/`closeStaleTabs`）
- `src/preview/webview/blockPrefixEditPlugin.ts` — フォーカス展開プラグイン
- `src/preview/webview/previewKeymapPlugin.ts` — ⌥⌘ キーマップ
- `src/preview/webview/tableArrowKeymap.ts` — テーブル ↑/↓ 移動
- `docs/specifications/` — 各機能の仕様書
