# vscode-office 安定性分析 — 取り入れるべき点の調査メモ

作成: 2026-07-14。対象: [cweijan/vscode-office](https://github.com/cweijan/vscode-office)（MIT、2020, Weijan Chen）
調査方法: リポジトリを shallow clone し、`src/provider/markdownEditorProvider.ts`（509行）・
`src/common/handler.ts`・`resource/markdown/index.js`（webview glue）・`vditor/`・CI 設定を読み、
本プロジェクトの `src/preview/host/previewPanel.ts`・`externalEcho.ts`・`serialQueue.ts` と比較した。

## TL;DR

vscode-office の安定性は**テストによるものではない**（自動テストはほぼゼロ。CI はビルド確認のみ）。
安定の源泉は次の4つで、そのうち本プロジェクトに欠けているのは **(3) エラーの可視化** と
**(4) 実運用からのフィードバックループ**。同期ロジック自体はむしろ本プロジェクトの方が厳密。

1. **成熟したエディタエンジンの vendoring** — Vditor をリポジトリ内にフォークして直接パッチ
2. **粗いが単純な同期モデル** — 壊れにくい代わりに稀なレースでの取りこぼしは許容
3. **全メッセージハンドラの一律エラーバウンダリ + Output チャンネル** — 失敗が必ずユーザーとログに見える
4. **数百万インストール + テレメトリ** — 実世界の failure が高速に開発者へ届く

## 両者の同期アーキテクチャ比較

| 観点 | vscode-office | markdown-inline-preview |
| --- | --- | --- |
| エディタエンジン | Vditor（リポジトリ内に vendored、直接修正可能） | Milkdown/ProseMirror（npm 依存） |
| webview→document | `input()` → 400ms debounce → 全文 `WorkspaceEdit` | 1キー入力ごとに serialQueue で直列適用（`serialQueue.ts`） |
| エコー抑止 | `lastManualSaveTime` 800ms 窓 + 内容一致スキップ（粗い） | 内容ベースの3系統判定（`externalEcho.ts`、race を仕様化してテストあり） |
| pending 変更の flush | パネル dispose 時に明示 flush（400ms 以内の入力も保存される） | serialQueue が直列保証 + `pendingWebviewFlush`（タブ切替時） |
| 外部変更の webview 反映 | 内容一致ならスキップ、YAML frontmatter 編集中はスキップ | diff ベース同期 + defer 判定 |
| ハンドラのエラー処理 | **全ハンドラを try/catch で包み showErrorMessage + Output.debug** | `void promise`（fire-and-forget）。serialQueue は失敗を黙って握りつぶす |
| 実行時ログ | Output チャンネル（`common/Output.ts`） | なし（console のみ） |
| テレメトリ | あり（`telemetryService.ts`、view open・テーマ等） | なし |
| 自動テスト | 実質なし（perf 計測スクリプト2本のみ、CI から呼ばれない） | 4層（jsdom / jsdom+Milkdown / 実Chromium / 実VS Code）+ CI 実行 |

## 取り入れるべきもの（優先度順）

### 1. メッセージハンドラの一律エラーバウンダリ【最優先・実バグ級】

vscode-office の `Handler.on()` は全コールバックを try/catch で包み、失敗を
`vscode.window.showErrorMessage` + `Output.debug` に必ず流す。1つのハンドラの例外が
セッション全体を壊さず、かつ**失敗が絶対に黙殺されない**。

対して本プロジェクトの `previewPanel.ts` は:

- `onDidReceiveMessage` 内で `void enqueueWebviewChange(...)` と fire-and-forget
- `serialQueue.ts` は「キューを止めない」ために **失敗タスクのエラーを両側とも `undefined` に握りつぶす**

つまり書き込み（＝ユーザーの入力の保存）が失敗しても、ユーザーにも開発者にも何も見えない。
「入力したのに保存されていなかった」系の不具合が起きたとき、現状では痕跡が残らない。

**提案**: `serialQueue` の失敗握りつぶし箇所と `onDidReceiveMessage` の各 `void` 呼び出しに、
共通のエラーレポータ（`showErrorMessage` + 下記2の Output チャンネル）を挟む。

### 2. Output チャンネルによる実行時ログ

`vscode.window.createOutputChannel('Markdown Inline Preview')` を1本作り、
同期の defer 判定・エコー弾き・書き込み失敗など「後から調査したくなるイベント」を記録する。
vscode-office はテストが無い代わりにこれで実地デバッグを成立させている。
本プロジェクトはテストが厚い分、**テストで再現できない実環境固有の報告**（他拡張との干渉、
巨大ファイル、ネットワークドライブ等）への手段が今は無い。ユーザーに
「Output を貼ってください」と言えるようになるのが目的。

### 3. 書き込み経路の no-op ガードの明示化（軽微）

vscode-office の `updateTextDocument` は適用前に内容一致なら `applyEdit` 自体をスキップする
（document を dirty にしない・undo 履歴を汚さない）。本プロジェクトはエコー判定で大半カバー
されているはずだが、`applyMarkdownFromWebview` の適用直前にも同じガードがあるか確認し、
無ければ1行足す価値がある（コストゼロで undo 汚染とイベント連鎖を防ぐ）。

### 4. エンジンレベルのバグに対する「vendoring / patch」戦略の明文化

vscode-office の安定性の最大の源泉は、Vditor をリポジトリ内に持ち**エンジンのバグを
その場で直せる**こと。本プロジェクトは Milkdown/ProseMirror を npm で使っており、
エンジン起因のバグ（`endOfTextblock` 挙動など）はプラグインでの回避策を重ねる構図になっている。
すぐフォークする必要はないが、**回避策が3つ重なったら `patch-package` で本体に当てる**、
のような判断基準を `docs/developer/` に書いておくと、プラグイン層の複雑化を抑えられる。

### 5. ステータスバーの行数・文字数表示（小さな UX、任意）

vscode-office は Preview 表示中に `n 行 / m 文字` をステータスバーに出す（`updateCount`）。
Preview モードでは VS Code 標準の行数表示が効かないため、地味に有用。実装は30行程度。

## 取り入れるべきでないもの

- **`localResourceRoots` の全開放**: vscode-office は `/` と A:〜Z: 全ドライブを
  webview に開放している。利便性優先のセキュリティ妥協であり、真似しない。
- **800ms 時刻窓のエコー抑止**: 本プロジェクトの内容ベース判定（`externalEcho.ts`）の方が
  レースに強く、テストで仕様化もされている。時刻窓方式への置き換えは退行。
- **400ms debounce での全文書き込み**: undo 粒度が荒くなり、カーソル位置の維持が
  難しくなる。本プロジェクトの serialQueue 方式はまさにこの問題（書き込み競合による
  カーソル飛び）への対策として設計されている。
- **「テストを書かない」体制そのもの**: vscode-office はインストール数とテレメトリと
  高速リリースで代替しているが、本プロジェクトの規模ではテスト層の方が合理的。

## 補足: 「vscode-office の方が安定している」の解釈

体感の安定性差が出るとすれば、原因は同期ロジックの優劣ではなく:

1. **エンジンの成熟度** — Vditor は WYSIWYG markdown 専用に長年磨かれたモノリス。
   Milkdown はプラグイン合成型で、プラグイン間の相互作用が本質的にバグ表面積になる
   （本プロジェクトの `blockPrefixEditPlugin` ほか自作プラグイン群はその上に載っている）
2. **失敗の黙殺** — 上記1のとおり、本プロジェクトは失敗が見えない経路があるため、
   「たまに起きるが報告できない」不具合が体感を悪化させている可能性がある

したがって、まず 1（エラーバウンダリ）と 2（Output ログ）を入れて失敗を可視化してから、
エンジン起因の問題を 4 の patch 戦略で潰していく順序を推奨する。

## 次のアクション候補

- [ ] `serialQueue.ts` にエラーレポータ引数を追加し、失敗を Output + showErrorMessage へ（テスト込み）
- [ ] Output チャンネル導入（同期イベントの記録ポイントは `externalEcho.ts` の判定結果と `applyMarkdownFromWebview` の適用/defer/失敗）
- [ ] `applyMarkdownFromWebview` 適用直前の no-op ガード確認
- [ ] `docs/developer/` に Milkdown パッチ戦略（回避策3回ルール）を追記
- [ ] （任意）ステータスバー行数/文字数
