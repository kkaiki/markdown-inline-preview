# ADR-0001: ヘキサゴナル（ポート&アダプタ）— `src/shared` を純粋コアとして固定する

- ステータス: Accepted
- 日付: 2026-06-22
- 関連: [architecture.md](../architecture.md)

## コンテキスト

本拡張は 1 パッケージ・**2 ランタイム**（Extension Host の Node 環境 / WebView のブラウザ環境）で動く。
両者は postMessage で通信し、Markdown 構造の操作ロジック（リスト・テーブル・見出し・スラッシュ・
TOC・パターン判定など）を共有したい。

実態として、その共有ロジックは `src/shared/` に集約されており、調査時点で次の性質を持っていた:

- `src/shared/**` から **`vscode` の直接 import は 0 件**（VS Code API 非依存）。
- `src/shared/**` から `src/raw` / `src/preview` への**逆依存は 0 件**。

つまり「フレームワーク非依存の中心（ヘキサゴン）」が既にほぼ成立している。一方で境界は
**暗黙**であり、命名・lint で守られていなかったため、将来うっかり `vscode` や Milkdown の実体を
`shared` に import して中心が汚染されるリスクがあった。

例外として、3 ファイルが ProseMirror の**型のみ**を参照していた:

- `src/shared/markdown/focusSyntaxHelpers.ts`（`Mark` / `Node` / `ResolvedPos`）
- `src/shared/slash/applyPreviewSlash.ts`（`ResolvedPos`）
- `src/shared/slash/slashMatch.ts`（`EditorView`）

これらの実利用元は `src/preview/webview/**` と `test/suite/**` のみ＝実質 WebView 専用である。

## 決定

ヘキサゴナル（ポート&アダプタ）の境界を**明示**し、機械的に強制する。

- **中心（ドメインコア）= `src/shared/**`**: フレームワーク非依存の純粋ロジック。
- **アダプタ**:
  - `src/raw/**` … VS Code TextEditor / Decoration / コマンド（VS Code 側アダプタ）
  - `src/preview/host/**` … WebView ホスト（CustomTextEditor、HTML、同期）
  - `src/preview/webview/**` … Milkdown/ProseMirror（WYSIWYG 側アダプタ）
- **合成ルート**: `src/raw/activate.ts`（依存を生成して各層へ注入する。既存の
  `setRawDecorationDeps` / `registerCommands(handlers)` 等の手動 DI を踏襲）。

### 境界の強制（eslint）

`eslint.config.js` に `src/shared/**` 限定の `@typescript-eslint/no-restricted-imports` を追加:

- **`vscode`（および `vscode/*`）**: 実体・型ともに**全面禁止**（現状 0 件なので厳格化）。
- **`@milkdown`（および `@milkdown/*` / `@milkdown/**`）**: **実体（runtime）の import は禁止**。
  ただし `allowTypeImports: true` で **`import type` のみ許可**。

> なぜ Milkdown は型のみ許可するか: 実行時結合（バンドル肥大・ランタイム依存）という最大の危険を
> 止めつつ、上記 3 ファイルの既存の型参照を壊さないため。型依存も「コアは UI フレームワークの
> 語彙すら知らない」という理想からは外れるが、当面は許容する妥協点とする。

## 結果

- `shared` への `vscode` 混入、および Milkdown 実体の混入は**ビルド時（lint）で失敗**する。
  退行を人手のレビューに頼らず防げる。
- 新規ファイルも同じ境界に自動的に従う。
- `npm run lint` がそのままゲートになる（`lint:error` は `--max-warnings 0`）。

## やらないこと（このADRの範囲外）

- 戦術的 DDD（Entity / Aggregate / Repository / Domain Event / DI コンテナ）は導入しない。
  本拡張はエディタツールであり、過剰な複雑さに見合う便益がない。

## Follow-up（任意）

1. **ProseMirror 型依存の解消**: 上記 3 ファイルを `src/preview/webview/` へ移設し、
   `@milkdown` の `allowTypeImports` 例外を撤廃して完全禁止にする。
2. **型の神ファイル分割**: `src/types/index.ts` が `vscode` 型と純粋型を混在させている。
   純粋型は `src/shared/` へ、`vscode` 型は `src/raw/` へ分割し、`shared` の型レベルの
   間接 vscode 依存も断つ。
3. **可変グローバルの注入化**: `src/core/runtime.ts` の `rawRuntime` シングルトンを合成ルートで
   生成して注入する形へ。
