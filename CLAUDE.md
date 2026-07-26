# markdown-inline-preview — Claude 作業ガイド

## TDD ワークフロー（必須）

このプロジェクトでの実装変更は **必ずこの順序** で行う：

```
1. 失敗するテストを書く
2. テストを実行して「失敗」を確認する
3. 仕様（機能仕様は `docs/specifications/`、バグ修正は `docs/specifications/fixes/`）を更新する
4. 実装を修正する
5. テストが「成功」に変わることを確認する
```

> **絶対にやってはいけないこと**: 実装を先に書き、後からテストを書く。

このワークフローの詳細版（テスト種別の選び方、VS Code 拡張ホスト統合テストの手順、タブ・フォーカス系バグの再現のコツ、バグ修正の具体的な手順、ブラウザテストの道具箱など）は skill `tdd-browser-preview` にまとめてある: `.claude/skills/tdd-browser-preview/SKILL.md`（プロジェクトローカル）

「この症状を直したい」ではなく「まだ何が壊れているか分からないので網羅的に調べたい」という
探索的な監査（audit）は skill `preview-exploratory-audit` を使う:
`.claude/skills/preview-exploratory-audit/SKILL.md`（プロジェクトローカル）。実 VS Code / 実
Chromium を実際に起動してカテゴリ横断でシナリオを総当たりし、見つけたバグ疑いは
`tdd-browser-preview` の TDD ループへ引き継ぐ。

---

## テスト体系

> **原則は [docs/testing/testing-rules.md](docs/testing/testing-rules.md)（テストの掟）が正**。
> レイヤーの信頼度序列（実 VS Code が主軸・下位レイヤーは代替にならない）、
> 偽装カバレッジの禁止、アンチフレーク規則、新テスト追加チェックリストはそちらを参照。

| コマンド | 対象 | 特徴 |
|---|---|---|
| `npm run test:unit` | `test/suite/**/*.test.ts`, `test/webview/**/*.test.ts` | jsdom 上でのユニット・純関数テスト。高速（数秒）。 |
| `npm run test:browser` | `test/browser/**/*.test.ts` | **実 Chromium** での統合テスト。UI バグの最終判定。 |
| `npm run test:all` | 全テスト | CI 相当。 |
| `npm run test` | `test/extension/**/*.test.ts` | **実 VS Code**（拡張ホスト）での統合テスト。コマンド・タブ・フォーカス・設定連携。**VS Code は 1 回だけ起動し、その同じインスタンス内で全ファイルを連続実行する**。`MOCHA_GREP='12\.'` で絞り込み可。 |

### ディレクトリ構造（レイヤー × 症状カテゴリで分類）

置き場所は2つの質問で決まる: **(1) レイヤー**（実行環境。下記4層。実行コマンド・速度が違うので混ぜられない）、
**(2) カテゴリ**（症状/機能。全レイヤー共通の語彙だが、中身が無いカテゴリはそのレイヤーに作らない）。
詳細な判定基準・全ファイルの移行マッピングは
`docs/testing/test-directory-design.md` を参照。

```
test/
├── extension/              # 実 VS Code（1回起動で全部実行）
│   ├── raw/                #   lists-tables / navigation / editing-core / shortcuts / settings / external-sync
│   ├── preview/             #   tabs-editors / settings / external-sync / lists-tables
│   └── helpers.ts          #   共通ヘルパー
├── browser/                # 実 Chromium — すべて Preview（webview の実 DOM/キー入力）
│   └── cursor-focus/ focus-expand/ shortcuts/ editing-core/ lists-tables/ external-sync/ rendering/ ime/ usage-flows/
├── webview/                # jsdom + Milkdown 実エディタ — すべて Preview
│   └── cursor-focus/ focus-expand/ shortcuts/ editing-core/ lists-tables/ external-sync/ rendering/
└── suite/                  # jsdom 純関数
    ├── preview/            #   cursor-focus / shortcuts / tabs-editors / external-sync / rendering
    ├── raw/                #   navigation / lists-tables / rendering
    ├── shared/             #   両モード共通（markdown・table・設定等。カテゴリ分割しない）
    └── index.ts            #   実 VS Code テストの Mocha エントリ（テストではない）
```

カテゴリの判定基準（このテストが失敗したときユーザーが体感する症状）:

| カテゴリ | 症状 |
|---|---|
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

分類に迷ったら「ユーザーが最初に気づく症状」を優先する（例: チェックボックス変換の
「カーソル飛び」は `cursor-focus`、「変換ルール自体」は `lists-tables`）。

### どちらのテストを書くか

- **純関数・ロジック** → `test/suite/{preview,raw,shared}/<category>/` か `test/webview/<category>/`（jsdom）
- **キー操作・カーソル位置・DOM レイアウト依存バグ** → `test/browser/<category>/`（Playwright + 実ブラウザ）
- **jsdom では再現できないバグ**（カーソル座標、`endOfTextblock`、`view.domAtPos` など）は必ず `test/browser/`
- **VS Code のタブ・フォーカス・コマンド・設定連携** → `test/extension/raw/` または `test/extension/preview/` 配下の該当カテゴリ（実 VS Code。`npx tsc -p tsconfig.test.json && node ./out-test/test/runTest.js` で実行）

---

## テストカタログ（必須の運用ルール）

全テストのタイトルは `docs/testing/preview-test-catalog.md` に**ユースケース一覧（生きた仕様書）**として自動集約される。

```bash
npm run docs:test-catalog   # カタログ md を再生成
```

- **テストを追加・改名・削除したら、必ず `npm run docs:test-catalog` を実行して再生成し、コミットに含める。**
- カタログは自動生成なので**手で編集しない**（編集しても次の生成で消える）。
- カタログに反映されるのはテストのタイトルなので、**タイトルは「この操作をしたら、こう動く」という仕様文**として書く。
  - 良い例: `チェック済み項目で Enter すると新しい項目は未チェックで始まる`
  - 悪い例: `checkbox test 3`
- ファイル冒頭の `/** ... */` コメントもカタログに説明として載る。新しいテストファイルには必ず「何を・なぜ・どの層で」検証するかを書く。
- まだテスト化していないユースケースの候補は `docs/testing/preview-usage-flow-test-backlog.md` に追記し、テスト化したらバックログから消してカタログ（＝実テスト）へ移す。
- 仕様書（機能仕様・fix 仕様）を追加・変更したら `docs/testing/spec-test-coverage.md` の対応表も更新する（どの仕様がどのテストで担保されるかを常に見えるようにする）。

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
