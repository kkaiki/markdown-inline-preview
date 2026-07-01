# markdown-inline-preview — Claude 作業ガイド

## TDD ワークフロー（必須）

このプロジェクトでの実装変更は **必ずこの順序** で行う：

```
1. 失敗するテストを書く
2. テストを実行して「失敗」を確認する
3. 仕様（docs/specifications/）を更新する
4. 実装を修正する
5. テストが「成功」に変わることを確認する
```

> **絶対にやってはいけないこと**: 実装を先に書き、後からテストを書く。

このワークフローの詳細版（テスト種別の選び方、VS Code 拡張ホスト統合テストの手順、タブ・フォーカス系バグの再現のコツなど）は skill `tdd-browser-preview` にまとめてある: `~/.claude/skills/tdd-browser-preview/SKILL.md`

---

## テスト体系

| コマンド | 対象 | 特徴 |
|---|---|---|
| `npm run test:unit` | `test/suite/*.test.ts`, `test/webview/*.test.ts` | jsdom 上でのユニット・純関数テスト。高速（数秒）。 |
| `npm run test:browser` | `test/browser/*.test.ts` | **実 Chromium** での統合テスト。UI バグの最終判定。 |
| `npm run test:all` | 全テスト | CI 相当。 |

### どちらのテストを書くか

- **純関数・ロジック** → `test/suite/` か `test/webview/`（jsdom）
- **キー操作・カーソル位置・DOM レイアウト依存バグ** → `test/browser/`（Playwright + 実ブラウザ）
- **jsdom では再現できないバグ**（カーソル座標、`endOfTextblock`、`view.domAtPos` など）は必ず `test/browser/`

---

## バグ修正の具体的な手順

### 1. 失敗テストを書く

```typescript
it('バグ名: 期待する動作の説明', async function () {
    if (!browser) { this.skip(); return; }
    h = await openPreview(browser, 'マークダウン内容\n', 'TAIL');

    // バグを起こす操作
    await h.placeCursorAfterText('対象テキスト');
    await h.press('ArrowDown');

    const m = await h.model();
    assert.ok(
        m.selParentText !== '期待外の値',
        `バグ内容: selParentText="${m.selParentText}"`
    );
});
```

### 2. 失敗を確認してから実装を変える

```bash
npm run test:browser 2>&1 | grep -E "passing|failing|バグ名"
# → 1 failing と表示されることを確認
```

失敗が確認できたら実装を直す。

### 3. 成功を確認する

```bash
npm run test:browser 2>&1 | grep -E "passing|failing"
# → 全て passing になることを確認
```

---

## ブラウザテストの道具箱

### PreviewHandle の主なメソッド

```typescript
h.placeCursorAfterText(text)  // テキスト末尾にカーソル
h.selectText(text)             // テキストを選択状態にする
h.press('ArrowDown')           // キー操作
h.model()                      // 現在のモデル状態を取得
  // → { outline, text, selFrom, selTo, selParentText }
h.lastChangeMarkdown()         // ホストへ送信された最後の markdown
```

### バグ再現のヒント

| バグの状況 | テストでの再現方法 |
|---|---|
| テキスト末尾以外にカーソル | `page.evaluate` で `TextSelection.create(doc, pos)` |
| テキスト選択状態（ハイライト） | `h.selectText('テキスト')` |
| 狭いビューポート | `h.page.setViewportSize({ width: 400, height: 700 })` |
| カーソルがセルの先頭 | `descendants` でテキストノードの `pos + 1` を取得 |

---

## アーキテクチャ早見表

| ファイル | 役割 |
|---|---|
| `src/preview/webview/milkdownApp.ts` | Milkdown エディタの初期化・プラグイン登録 |
| `src/preview/webview/blockPrefixEditPlugin.ts` | Typora 風フォーカス展開（`## `, `- ` 等の挿入/削除） |
| `src/preview/webview/previewKeymapPlugin.ts` | ⌥⌘1-6 等の Preview 内キーマップ |
| `src/preview/webview/previewToolbarPlugin.ts` | 上部ツールバーの DOM + クリック処理 |
| `src/preview/webview/tableArrowKeymap.ts` | テーブルセル内 ↑/↓ の列保持移動 |
| `src/raw/activate.ts` | Raw モード（CodeMirror）の有効化 |
| `test/browser/previewBrowserHarness.ts` | ブラウザテスト共通ハーネス |

---

## ビルド

```bash
npm run build:webview          # webview バンドルのみ（テスト前に必要）
npx tsc --noEmit               # 型チェックのみ
npm run compile                # 全ビルド（CI 相当）
```

webview 側のファイル（`src/preview/webview/`）を変更したら必ず `build:webview` してからテスト。
