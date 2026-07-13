# TypeScript 7.0 移行計画書

作成日: 2026-07-13
対象: markdown-inline-preview (VS Code 拡張)
現状: TypeScript 5.9.3 / Node 20 (CI) / tsc emit + esbuild バンドルの併用構成

## 1. TypeScript 7.0 の概要

- 2026-07-08 に GA。コンパイラと language service が Go にフルポートされたネイティブ実装(Project Corsa)。
- ビルド速度は通常 8〜12 倍。npm パッケージ名 (`typescript`)・バイナリ名 (`tsc`) は従来どおり。
- JS emit / declaration emit ともにポート完了済みで、本プロジェクトの `outDir` ベースのビルドはそのまま動く。
- **Compiler API (Strada API) は 7.0 に存在しない**。新 API は 7.1 で提供予定。API 依存ツール向けに `@typescript/typescript6`(6.0 API + `tsc6` を再エクスポート)が提供されている。

## 2. 本プロジェクトへの影響分析

### 2.1 ブロッカー: typescript-eslint

- 現在 `@typescript-eslint/*` 8.61.1 / `eslint` 10.5.0 を使用。`lint:error` が `vscode:prepublish` に組み込まれておりリリースブロッカーになりうる。
- typescript-eslint の対応レンジは `>=4.8.4 <6.1.0`。**TypeScript 7 は未サポート**(公式対応は API が載る 7.1 待ちの見込み)。
- 回避策: `npm install -D typescript-6@npm:@typescript/typescript6` のようなエイリアスで 6.0 API を併存させる方法が案内されているが、peerDependencies 解決の調整が必要で `npm ci` が壊れる報告もある。

### 2.2 tsconfig の非互換(ハードエラーになるもの)

| 設定                                         | 該当ファイル                                                          | 対応                                        |
| ------------------------------------------ | --------------------------------------------------------------- | ----------------------------------------- |
| `moduleResolution: "node"` (=node10) → エラー | tsconfig.json / tsconfig.test.json / tsconfig.browser-test.json | `"node16"` へ変更(CommonJS 拡張なので node16 が適切) |
| `types` のデフォルトが `[]` に変更                   | tsconfig.json(types 未指定)                                        | `"types": ["node", "vscode"]` を明示         |
| `rootDir` デフォルト変更                          | tsconfig.browser-test.json は明示済み、他は要確認                          | 各 tsconfig で明示済みなら影響なし                    |

問題ない設定: `module: "commonjs"` は引き続き有効。`target: ES2020`(ES5 のみ廃止)、`esModuleInterop: true`、`strict: true` はすべて新デフォルトと整合。webview 系 tsconfig は既に `moduleResolution: "bundler"` で影響なし。

### 2.3 影響が小さいもの

- src / test / build.ts に `import ts from 'typescript'` の直接利用はなし(Compiler API 依存は eslint 経由のみ)。
- esbuild / tsx は独自トランスパイラなので TS 本体のバージョンに依存しない。
- `@types/node ^16` は Node 20 実行環境と乖離しているので、この機会に `^20` へ更新推奨(必須ではない)。

## 3. 移行ステップ

### Phase 1: TypeScript 6.x へ中間アップグレード(いつでも実施可)

TS6 は 7 の破壊的変更を deprecation 警告として表示するため、まず 6.x で警告をゼロにする。

1. `npm install -D typescript@6`
2. 全 tsconfig の `moduleResolution: "node"` → `"node16"` に変更
   - node16 化で相対 import の拡張子要求などは **CommonJS +** **`module: commonjs`** **の組では発生しない**が、`exports` フィールドを持つ依存(marked v18, mermaid v11 など)の型解決が変わる可能性あり。`npm run compile` で全量確認。
3. tsconfig.json に `"types": ["node", "vscode"]` を明示(test 系は明示済み)
4. `npm run compile && npm run lint:error && npm run test:all` で回帰確認
5. この時点で一度リリースし、安定を確認

### Phase 2: TypeScript 7.0 本体へ移行

前提: Phase 1 完了 + lint 問題の解決方針決定(下記 4 章)。

1. `npm install -D typescript@7`
2. `npx tsc --noEmit` を各 tsconfig(無印 / test / webview / webview-test / browser-test)で実行し、残エラーをトリアージ
3. `npm run compile` で emit 出力(out/, out-test/)が TS6 時と同一挙動か確認(declaration / sourceMap を含む)
4. テストスイート全実行:
   - `nvm use 20` のうえで `npm run test:unit`(jsdom 制約)
   - `ELECTRON_RUN_AS_NODE` を unset して `npm run test`(VS Code extension test)
   - `npm run test:browser`
5. CI (ci.yml / publish.yml) の動作確認。Node 20 のままで問題なし
6. VS Code / Cursor 側の TypeScript language service がネイティブ版に切り替わることを確認(体感速度向上のみで挙動差はないはず)

### Phase 3: typescript-eslint の正式対応後の後始末(7.1 リリース後)

1. typescript-eslint が TS7 対応版(新 API 対応)をリリースしたら `@typescript-eslint/*` を更新
2. 併存させていた `@typescript/typescript6` エイリアスを削除
3. `npm run lint:error` が TS7 単体で通ることを確認

## 4. lint ブロッカーの選択肢(Phase 2 の前提判断)

| 案                           | 内容                                                                 | メリット           | デメリット                             |
| --------------------------- | ------------------------------------------------------------------ | -------------- | --------------------------------- |
| **A. 7.1 まで待つ(推奨)**         | Phase 1 だけ先に実施し、TS7 化は typescript-eslint 対応後                       | 構成がシンプル、リスク最小  | ビルド高速化の恩恵が数ヶ月遅れる                  |
| B. typescript6 エイリアス併存      | `tsc` は 7、eslint には `@typescript/typescript6` を食わせる                | 今すぐ 8〜12x の恩恵  | package.json が複雑化、npm ci トラブル報告あり |
| C. 6 を本体に、native-preview 併用 | `typescript@6` のまま `@typescript/native-preview` の `tsgo` でビルドだけ高速化 | lint 無傷でビルド高速化 | ビルドスクリプト書き換え、preview 品質           |

推奨は **A**。本プロジェクトのビルド時間は大規模モノレポほど深刻ではなく、lint がリリースフローに直結しているため、typescript-eslint の正式対応を待つのが最も安全。Phase 1(TS6 化 + tsconfig 整理)だけ先行しておけば、7.1 対応後の移行は `npm install -D typescript@7` とバージョン更新だけで済む見込み。

## 5. リスクと検証観点

- **emit 差分**: ネイティブ emitter の出力が JS レベルで微妙に異なる可能性。移行前後の out/ を diff して確認するのが確実(`git diff --no-index`)。
- **node16 解決による型エラー**: marked / mermaid / katex / @milkdown の型解決パスが変わりうる。コンパイルエラーとして顕在化するので Phase 1 で吸収。
- **template literal type の Unicode 挙動変更**(サロゲートペアをコードポイント単位で扱う): 型レベル文字列操作をしていなければ影響なし。本プロジェクトは該当コードなしの見込みだが、絵文字を扱う markdown パーサ部の型は念のため確認。
- **vsce パッケージング**: `vscode:prepublish` が lint → compile → build.ts の順で走るため、Phase 2 実施時は `vsce package` のドライランまで検証すること。

## 6. 参考リンク

- [Announcing TypeScript 7.0 (Microsoft DevBlogs)](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)
- [TypeScript 7.0 RC (Microsoft DevBlogs)](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0-rc/)
- [typescript-eslint TS 7.0 対応 issue #12518](https://github.com/typescript-eslint/typescript-eslint/issues/12518)
- [typescript-eslint がサポートする TS バージョン](https://typescript-eslint.io/users/dependency-versions/)
- [TypeScript 7.0 GA 移行プレイブック (digitalapplied)](https://www.digitalapplied.com/blog/typescript-7-0-ga-native-compiler-migration-playbook-2026)
- [Visual Studio Magazine: TS 7.0 RC 解説](https://visualstudiomagazine.com/articles/2026/06/22/typescript-7-0-rc-moves-microsofts-go-rewrite-into-the-mainline-compiler.aspx)
