# テストディレクトリ

ユニットテストと VS Code 統合テストのソースです。ビルド後は `out-test/` に出力されます。

## 構成

```
test/
├── extension.test.ts    # VS Code 統合テスト（Electron ランナー）
├── runTest.ts             # @vscode/test-electron 起動
└── suite/
    ├── index.ts           # Mocha ランナー（統合テスト用）
    └── *.test.ts          # ユニットテスト（約 490+ ケース）
```

## 実行

```bash
npm install
npm run compile          # out/ + out-test/ を生成

# ユニットテスト（推奨・CI 向け）
npm run test:unit

# 統合テスト（VS Code Electron が必要）
npm test

# 両方
npm run test:all
```

特定のスイートのみ:

```bash
npm run test:unit -- --grep "slashMenuItems"
```

## テストの追加

1. `test/suite/<feature>.test.ts` を追加（`src/` の純粋関数を import）
2. `npm run compile` で `out-test/test/suite/` に出力されることを確認
3. `npm run test:unit` で実行

統合テストは `test/extension.test.ts` に `test()` ブロックを追加。

## テスト方針

| 種別 | 場所 | 実行 |
|------|------|------|
| ユニット | `test/suite/*.test.ts` | `npm run test:unit`（CI 推奨） |
| 統合 | `test/extension.test.ts` | `npm test`（VS Code Electron 必要） |
| 手動 | `docs/examples/test-*.md` | エディタで確認 |

`advanced.*` 設定を追加する場合は `core/markdownInlineSettings.ts` のユニットテストと、該当する統合テストを追加する。
