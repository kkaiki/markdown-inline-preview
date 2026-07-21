---
name: preview-exploratory-audit
description: "markdown-inline-preview の未発見バグを狩るための、網羅的な探索調査（audit）スキル。実VS Code拡張ホスト・実Chromiumを実際に起動して操作し、症状カテゴリ横断でシナリオを総当たりし、エラー・タブ増殖・カーソル/フォーカス異常が起きないかを確認する。特定の既知バグを直す作業（それは tdd-browser-preview skill が担当）ではなく、『何がまだ壊れているか分からない状態から壊れている箇所を見つけ出す』ときに使う。ユーザーが「網羅的に調査して」「VS Codeを開いて操作して確認して」「一通り動かしてバグがないか見て」「監査して」「audit」のように言ったら、このプロジェクトでは必ずこのスキルを使う。"
---

# Preview 探索的監査（Exploratory Audit）

## これは何のためのスキルか

`tdd-browser-preview` skill は「この症状のバグを直す」という**答えが分かっている状態**での
TDD ワークフローを担う。対してこのスキルは、**まだ何が壊れているか分からない状態**から
壊れている箇所そのものを見つけ出すための探索調査（audit）を担う。

過去に一度、3エージョントによる `src/` ⇄ `test/` 突き合わせ監査（2026-07-07、
`docs/specifications/preview-usage-flow-test-backlog.md` §4）を実施し、実際にいくつもの
実バグ（タブ増殖のレースコンディション、カーソル飛びなど）を発見・修正できた実績がある。
このスキルはその手順を再利用可能な形にしたもの。

**なぜ「実際に VS Code / Chromium を起動して操作する」ことにこだわるか**:
このプロジェクトでこれまで実際にユーザーを苦しめてきたバグ（タブ複製・フォーカス飛び・
カーソルズレ・IME破壊）は、すべて実環境でしか再現しなかった（`docs/testing-rules.md` 原則1）。
静的なコード読解だけでは「ありそうな不整合」の仮説止まりになり、実際に発火するかは
分からない。したがって監査の最終工程は必ず実 VS Code 拡張ホスト（`test/extension/`）または
実 Chromium（`test/browser/`）を起動してシナリオを実行することで締める。

## 監査の2段構え

### 段階A: 静的ギャップ発見（何を操作すべきかの候補出し）

各症状カテゴリ（下記の表）について、対応する `src/` の実装ファイルと、
`docs/specifications/preview-test-catalog.md` に載っている既存テストタイトルを突き合わせ、
「実装には分岐があるのにテストタイトルが触れていない」組み合わせを洗い出す。
過去の `*-fix.md`（`docs/specifications/` 配下）の再現条件も、現行テストが実際に
その条件をカバーしているか読み直す（似た条件で別バグを見つけた `webview-disposed-race-fix.md`
のような前例がある）。

このカテゴリ数（cursor-focus / focus-expand / lists-tables / editing-core / external-sync /
rendering / ime / navigation / tabs-editors / settings / usage-flows）は多いため、
カテゴリ単位で並列にサブエージェントへ委譲するとよい（前回の監査も3並列で行った）。
各サブエージェントには「このカテゴリの `src/` ファイル一覧」「該当する既存テストタイトル」
「該当する `*-fix.md`」を渡し、「テストされていない分岐・組み合わせ」をリストアップさせる。

### 段階B: 実機での総当たり操作（実際に手を動かす段階。ここが本体）

段階Aで出た候補、および下記チェックリストの操作を、実際に

- `test/extension/` 相当の操作（`npx tsc -p tsconfig.test.json && node ./out-test/test/runTest.js`
  で実 VS Code を起動し、`vscode.commands.executeCommand` / `vscode.window.tabGroups` 等の
  実 API で操作する。GUI をマウスで叩くわけではないが、実プロセスとして本物の VS Code が
  起動し本物のコマンド実行・タブ管理・保存が走る）
- `test/browser/` 相当の操作（`npm run test:browser`。Playwright + 実 Chromium で
  webview の実 DOM に実クリック・実キー入力を送る）

のどちらか（バグの性質に応じて `tdd-browser-preview` の「テスト種別の選択」表を参照）で
実際に走らせて確認する。これは一時的な使い捨てスクリプトで構わない
（`test/extension/preview/_audit-scratch.test.ts` のように一時ファイルとして書き、
監査が終わったら消すか、価値があるものだけ本採用のテストとして残す）。

各操作のあとに例外・アサーション失敗・タブ数の想定外の増減・フォーカス位置のズレが
無いかを確認する。「クラッシュしない」だけでは不十分（`docs/testing-rules.md` ルール2-2）で、
**本来守られるべき性質**（内容が正しい・上書きされない・フォーカスが正しい・タブが1つのまま）
を具体的にアサートすること。

## カテゴリ別チェックリスト（症状ごとに何を総当たりするか）

網羅する軸は `tdd-browser-preview` の「バグ条件の特定」節にある観点
（カーソル位置・選択状態・ビューポート幅・ブロック種別）に加え、以下を優先的に組み合わせる:

| カテゴリ | 総当たりすべき操作・組み合わせの例 |
|---|---|
| `tabs-editors` | 複数ファイル（named / untitled 混在）を開いた状態での Preview⇔Raw 高速往復、サイドバーからの再オープンと `togglePreview` の同時実行、`openWith` の二重実行、非アクティブタブを閉じる操作の前後関係 |
| `cursor-focus` | クリック直後の矢印キー、コードブロック/テーブル/リスト境界をまたぐ移動、選択状態からの入力 |
| `focus-expand` | 見出し・箇条書き・blockquote・インラインマークそれぞれで、選択がある状態でのフォーカス展開/収縮（`inlineMarkEditPlugin` で見つかった `!selection.empty` 早期リターン系のバグが `blockPrefixEditPlugin` 等の兄弟コードにも潜んでいないか） |
| `external-sync` | 外部書き換えと Preview 側の keystroke-save のレース、dirty な Raw 編集の往復、untitled 文書の Preview 化 |
| `ime` | 日本語IME連続確定、確定直後の別操作との競合（既知の未再現ギャップがあるので `[[markdown-inline-preview-test-expansion]]` の open report を参照。実VS Code層・実Chromium層の両方を試したが未再現、というのが現状） |
| `lists-tables` | リスト種別混在、チェックボックスの高速反復、テーブルセル内の特殊記法 |
| `editing-core` | Enter/Backspace の境界（文書先頭・末尾・ブロック境界）、Undo/Redo との組み合わせ |
| `rendering` | 数式・Mermaid・画像・ハイライト・frontmatter の境界ケース（空・巨大・不正な入力） |
| `settings` | 設定変更直後の即時反映、VS Code本体設定との連動 |
| `navigation`（Raw） | スマート選択・行移動の境界 |
| `usage-flows` | 単一カテゴリに収まらない複合シナリオ（実際のユーザー操作シーケンスを再現） |

このチェックリストは網羅性を保証するものではなく出発点。段階Aで見つけた「未テストの分岐」を
最優先にし、このチェックリストは埋め合わせとして使う。

## 発見した候補の記録先

見つけたものは、種類に応じて `docs/specifications/preview-usage-flow-test-backlog.md` に
既存の書式（§4 のスタイル）で追記する:

- **実バグの疑いが強いもの** → 新しい日付見出しの下に「§4.1 実バグの疑いが強いもの」相当として追記
- **未テストの分岐・組み合わせ（バグかは未確認）** → 「§4.2」相当として追記
- **実際に動かしたが問題なし（仕様として固定してよいもの）** → その場でリグレッションテストとして
  `test/` 配下の正式な場所に残し、バックログには書かない（消化済みとして扱う。無バグは
  「調査が失敗した」ではなく良い結果 — `[[markdown-inline-preview-test-expansion]]` 参照）

`npm run docs:test-catalog` を忘れずに実行してカタログを再生成する。

## 「実バグの疑いが強いもの」への対応

このスキル自身はバグを直さない。段階Bで実バグの疑いが強いものを見つけたら、
それぞれについて `tdd-browser-preview` skill の TDD ワークフロー（失敗テスト作成 → 失敗確認 →
仕様更新 → 実装修正 → 成功確認）へ1件ずつ引き継ぐ。複数見つかった場合は、
バックログへの記録を先に済ませてから優先度順に1件ずつ着手する（並行して複数を直すと
どの修正がどのテストを直したか追えなくなる）。

## 実行コマンド早見表

```bash
# 静的ギャップ発見に使う参照ファイル
docs/specifications/preview-test-catalog.md          # 既存テストの一覧（生きた仕様書）
docs/specifications/preview-usage-flow-test-backlog.md  # 過去の監査結果・未消化ギャップ
docs/testing-rules.md                                 # レイヤー選択・アサーションの原則

# 実機での総当たり操作
npx tsc -p tsconfig.test.json && node ./out-test/test/runTest.js   # 実VS Code拡張ホスト
npm run test:browser                                                # 実Chromium
npm run docs:test-catalog                                           # カタログ再生成
```
