# テストディレクトリ

ユニットテストと VS Code 統合テストのソースです。ビルド後は `out-test/` に出力されます。

テストの**原則**（レイヤーの信頼度序列・偽装カバレッジ禁止・アンチフレーク・
新テスト追加チェックリスト）は [docs/testing-rules.md](../docs/testing-rules.md) が正。

全テストのタイトル一覧（ユースケースカタログ）は
[docs/specifications/preview-test-catalog.md](../docs/specifications/preview-test-catalog.md)
（`npm run docs:test-catalog` で自動生成）、仕様との対応は
[docs/specifications/spec-test-coverage.md](../docs/specifications/spec-test-coverage.md) を参照。

置き場所の設計思想（レイヤー × 症状カテゴリの2軸）の詳細は
[docs/specifications/test-directory-design.md](../docs/specifications/test-directory-design.md) を参照。

## 構成（レイヤー × 症状カテゴリで分類）

置き場所は2つの質問で決まる: **(1) どの実行環境が必要か**（レイヤー = 下記4層。実行コマンド・速度が違うので混ぜられない）、
**(2) どの症状/機能を守っているか**（カテゴリ = `cursor-focus` / `focus-expand` / `shortcuts` / `editing-core` /
`lists-tables` / `external-sync` / `rendering` / `ime` / `navigation` / `tabs-editors` / `settings` / `usage-flows`）。
カテゴリの語彙は全レイヤーで共通だが、中身が無いカテゴリはそのレイヤーに作らない
（例: `browser/navigation/` は Raw 固有カテゴリなので存在しない）。

```
test/
├── extension/                    # 実 VS Code（@vscode/test-electron）。raw/preview を分割
│   ├── raw/                      #   lists-tables / navigation / editing-core / shortcuts / settings / external-sync
│   ├── preview/                  #   tabs-editors / settings / external-sync
│   └── helpers.ts                #   共通ヘルパー
├── browser/                      # 実 Chromium（Playwright）— すべて Preview
│   ├── previewBrowserHarness.ts  #   共通ハーネス
│   ├── cursor-focus/ focus-expand/ shortcuts/ editing-core/
│   ├── lists-tables/ external-sync/ rendering/ ime/ usage-flows/
├── webview/                      # jsdom + Milkdown 実エディタ — すべて Preview
│   ├── jsdomSetup.ts / milkdownHarness.ts  # 共通ハーネス
│   ├── cursor-focus/ focus-expand/ shortcuts/ editing-core/
│   ├── lists-tables/ external-sync/ rendering/
└── suite/                        # jsdom 純関数ユニットテスト
    ├── preview/                  #   cursor-focus / shortcuts / tabs-editors / external-sync / rendering
    ├── raw/                      #   navigation / lists-tables / rendering
    ├── shared/                   #   両モード共通ロジック（カテゴリ分割しない）
    └── index.ts                  #   実 VS Code テストの Mocha エントリ（テストではない）
```

カテゴリの判定基準（このテストが失敗したときユーザーが体感する症状）:

| カテゴリ | 症状 |
| --- | --- |
| `cursor-focus` | カーソル・DOM フォーカスが意図しない場所へ移動する／選択が壊れる |
| `focus-expand` | Typora 風のプレフィックス展開/収縮（`## `, `- `, `> `）が壊れる |
| `shortcuts` | キーボードショートカット・スラッシュメニュー・ツールバーが効かない |
| `editing-core` | Enter・Backspace・分割/結合・Undo/Redo・インライン書式・直列化が壊れる |
| `lists-tables` | リスト・チェックボックス・テーブル固有の操作が壊れる |
| `external-sync` | 外部（Raw/AI/Git）との内容同期が壊れる（反映されない・diff 誤判定・スクロール同期） |
| `rendering` | 表示だけの問題（数式・Mermaid・画像・ハイライト・行番号・frontmatter・i18n） |
| `ime` | 日本語 IME（composition）が絡むと壊れる |
| `navigation`（Raw のみ） | カーソル移動・スマート選択・行移動が壊れる |
| `tabs-editors`（実 VS Code のみ） | タブが増殖する・別ファイルへフォーカスが移る |
| `settings` | 拡張設定が反映されない・VS Code 本体設定と連動しない |
| `usage-flows` | 単一症状に分類できない複合シナリオ |

## 実行

```bash
npm install
npm run compile          # out/ + out-test/ を生成

# ユニットテスト（suite/ + webview/。高速・CI 向け）
npm run test:unit

# 実 Chromium テスト（browser/）
npm run test:browser

# 実 VS Code 統合テスト（extension/）
# VS Code を 1 回だけ起動し、その同じインスタンス内で raw/preview の全テストを連続実行する
npm test
# または（compile 済みなら）
npx tsc -p tsconfig.test.json && node ./out-test/test/runTest.js

# 全部
npm run test:all
```

絞り込み:

```bash
npm run test:unit -- --grep "slashMenuItems"
MOCHA_GREP='12\.' node ./out-test/test/runTest.js   # 実 VS Code テストの絞り込み
HEADED=1 npm run test:browser                        # ブラウザを表示して目視
```

## テストの追加

1. 置き場所を選ぶ: まずレイヤー（実行環境）を CLAUDE.md「どちらのテストを書くか」で選び、
   次に上の判定基準表でカテゴリを選ぶ。迷ったら「ユーザーが最初に気づく症状」を優先する
   （例: チェックボックス変換の「カーソル飛び」は `cursor-focus`、「変換ルール自体」は `lists-tables`）
2. タイトルは「この操作をしたら、こう動く」という仕様文として書く
3. ファイル冒頭に `/** 何を・なぜ・どの層で検証するか */` を書く（カタログに載る）
4. 実行して通す
5. **`npm run docs:test-catalog` でカタログを再生成してコミットに含める**

`advanced.*` 設定を追加する場合は `core/markdownInlineSettings.ts` のユニットテストと、該当する統合テストを追加する。
