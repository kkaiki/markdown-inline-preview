# ベース刷新計画 — vscode-office (Vditor) 方式への段階移行

作成: 2026-07-21。
背景資料: [vscode-office-stability-analysis.md](vscode-office-stability-analysis.md)（2026-07-14 の調査メモ）。

## 1. 背景と目的

現行の Preview は Milkdown/ProseMirror の上に自作プラグイン約45本（`src/preview/webview/`、
計 9,300 行超）を積み上げた構成になっている。フォーカス展開・コードフェンス実テキスト化・
hardbreak 化・空行保持などの機能を追加するたびに **プラグイン間の相互作用が新しいバグ表面**
になり、「1つ直すと別のカテゴリが壊れる」回帰（直近では Enter hardbreak 化で 31 件のテストが
壊れた `hardbreak-line-markdown-conversion-fix.md`）が常態化している。

vscode-office（数百万インストール）の安定性の最大の源泉は、WYSIWYG Markdown 専用に長年
磨かれた **Vditor をリポジトリ内に vendoring し、エンジンのバグをその場で直せる**ことにある
（分析メモ §補足）。フォーカス展開・IME・リスト・テーブル編集といった「本プロジェクトが
プラグインで自作してきた領域」を、Vditor はエンジン内で一体として実装している。

**目的**: エディタエンジンを Vditor（IR モード）へ置き換えて自作プラグイン層を大幅に削り、
本プロジェクト固有の価値（行番号ガター・スラッシュメニュー・厳密な外部同期・4層テスト）だけを
独自実装として新ベースの上に移植する。

## 2. 方針決定

### 採用案: A. Vditor ベースへ移行（本計画）

- webview のエディタエンジンを Milkdown → Vditor IR モードへ全面置換。
- **ホスト側（`src/preview/host/`）は原則維持**。CustomTextEditorProvider・タブ管理
  （`previewTabs.ts` / `toggleDecision.ts`）・直列書き込み（`serialQueue.ts`）・
  エコー判定（`externalEcho.ts`）は Milkdown に依存しておらず、テストで仕様化済みの資産。
  vscode-office の「400ms debounce + 800ms 時刻窓」方式には**置き換えない**
  （分析メモ「取り入れるべきでないもの」のとおり、内容ベース判定の方がレースに強い）。
- vscode-office から取り入れるのは (1) Vditor エンジン + vendoring/patch 戦略、
  (2) 全メッセージハンドラの一律エラーバウンダリ、(3) Output チャンネルによる実行時ログ。

### 不採用案（記録のみ）

| 案 | 内容 | 不採用理由 |
| --- | --- | --- |
| B. Milkdown 維持 + 堅牢化 | エラーバウンダリ/Output だけ入れて現構成を続ける | プラグイン相互作用というバグ表面積の根本は残る。ユーザー判断で A を選択 |
| C. 他エンジン（Tiptap / Crepe / CodeMirror ライブプレビュー） | 別エンジンへ移行 | Tiptap は Markdown ネイティブでない。Crepe は Milkdown 系で問題が同型。CodeMirror 方式は WYSIWYG 度が下がる。vscode-office という「大規模実運用の先行事例」があるのは Vditor のみ |

### Vditor 採用の前提条件（Phase 0 の PoC で必ず検証）

1. **ラウンドトリップ安全性**: 開いただけ・1文字打っただけで無関係な行に diff が出ないこと
   （Vditor のシリアライザは Lute。空行・全角スペース・改行スタイルの保持を実コーパスで検証）。
2. **行番号ガターが実装可能**: Vditor IR の DOM から「ブロック → ソース行番号」の対応が
   取れること（後述 §5 Phase 0）。
3. **IME 安定性**: 日本語 IME 連続変換で重複・欠落が出ないこと（現行で未再現のまま残っている
   「IME 長文重複」報告への回答になるかの確認を兼ねる）。
4. **ライセンス/保守**: Vditor は MIT。upstream の保守が停滞してもリポジトリ内 vendoring で
   自力保守できる（vscode-office と同じ戦略）ことを許容する。

前提 1 か 2 が PoC で成立しない場合は**移行を中止**し、案 B（Milkdown 維持 + 堅牢化）へ
フォールバックする。この判断は Phase 0 終了時に必ず明示的に行う。

## 3. 到達目標のアーキテクチャ

```
src/preview/
├── host/                     # 【維持】previewPanel / serialQueue / externalEcho /
│   │                         #   previewTabs / toggleDecision / csp / localExport
│   └── output.ts             # 【新規】Output チャンネル + 共通エラーレポータ
├── webview-vditor/           # 【新規】Vditor ベースの webview
│   ├── vditorApp.ts          #   初期化・ホストとのメッセージ協調（プロトコルは現行互換）
│   ├── gutter/               #   行番号ガター（独自実装・最重要移植対象）
│   ├── slashMenu/            #   スラッシュメニュー（独自実装）
│   ├── findBar/              #   検索バー（独自移植）
│   └── ...                   #   その他 §4 の移植対象
├── webview/                  # 【当面併存 → Phase 5 で削除】現行 Milkdown 実装
└── third_party/vditor/       # 【新規】Vditor vendored コピー（upstream + 自前パッチ）
```

- **エンジン切替フラグ** `markdownInline.preview.engine: "milkdown" | "vditor"` を設け、
  移行期間中は両実装を併存させる。既定は当面 `milkdown` のまま、Phase 4 の audit 合格後に
  `vditor` へ反転、安定後に Milkdown 実装と依存を削除する。
- ホスト⇄webview のメッセージプロトコル（`init` / `change` / `external` / `scroll` /
  `cursorAnchor` / `toggleRaw` 等）は**現行のまま**とし、webview 側にアダプタを書く。
  これにより `test/extension/`（実 VS Code 層）のテストはエンジン非依存でそのまま効き続ける。
- vendoring は「まず npm の `vditor` + `patch-package`、パッチが3件を超えたら
  `third_party/vditor/` へフォークを取り込む」の2段構え（分析メモ §4 の運用ルールを適用）。

## 4. 機能インベントリ — 残す / エンジンに任せる / 独自実装で移植

現行 webview プラグイン全 45 本の仕分け。「Vditor 内蔵」は自作コードを**削除**できる領域。

### 4.1 Vditor 内蔵機能に置き換え（自作コード削除）

| 現行実装 | 置き換え |
| --- | --- |
| blockPrefixEditPlugin / focusSyntaxPlugin / inlineMarkEditPlugin / codeFenceEditPlugin / codeLanguagePlugin | IR モードのフォーカス時 Markdown 記法露出（エンジン中核機能） |
| markerBackspace / inlineMarkBackspace / codeBlockBackspace / imeEnterGuard / trailingNbspFixPlugin / listMarkerDragFixPlugin / tableSelectionFix / disableTextEscape | エンジン一体実装の編集系（個別回避策プラグインごと不要になる想定。PoC で確認） |
| codeHighlightPlugin | Vditor 内蔵 hljs |
| mathDecorationPlugin | Vditor 内蔵 KaTeX/MathJax |
| mermaidDiagramPlugin | Vditor 内蔵 mermaid |
| checkboxToggle / tableCellEnterPlugin / tableArrowKeymap | Vditor 内蔵のタスクリスト・テーブル編集（挙動差は PoC で洗い出し、足りない分のみ薄い keymap を追加） |
| hardbreakLine / hardbreakLineInputRules / blankLinePlaceholderSkip / blankLineRemarkPlugin / hardbreakSerializer | Lute のシリアライズ/パースに委譲（**空行保持のラウンドトリップは PoC 必須項目**） |

### 4.2 独自実装として移植（本プロジェクト固有の価値）

優先度順。各項目は既存の仕様書とテストを移植の受け入れ基準として使う。

| P | 機能 | 現行実装 | 移植方針 |
| --- | --- | --- | --- |
| P0 | 外部同期（Raw/AI/Git との厳密同期） | serialQueue / externalEcho / applyExternalContent | ホスト側は維持。webview 側は Vditor の `input` イベント→ `getValue()` → 現行 `change` メッセージへ変換。外部変更適用はカーソル保持付き `setValue` 差分適用を新規実装 |
| P0 | カーソルアンカー（Raw⇄Preview 位置維持） | cursorAnchor.ts（shared + webview） | shared 層のブロックセグメント計算は再利用。Vditor DOM ⇄ アンカーの変換のみ書き直し |
| P0 | 行番号ガター | lineNumberGutterPlugin（左に出る数字） | **完全独自実装**。Vditor IR はブロック要素ごとに DOM ノードを持つため、`getValue()` の再パース（現行と同じ remark ベースの `computeRealLineEntries` を流用可）で行番号を割り当て、各ブロックの `offsetTop` に合わせて絶対配置のガター列を描画する。現行の mdast 対応付けロジックは Milkdown 非依存なので大半を流用できる見込み |
| P1 | スラッシュメニュー | previewSlashMenu / slashMatch / applyPreviewSlash | Vditor の `hint` 拡張は使わず、現行の shared ロジック + 自前 DOM を移植（i18n・項目定義をそのまま活かす） |
| P1 | ツールバー | previewToolbarPlugin | Vditor 内蔵ツールバーは使わず現行 DOM を移植（見た目・設定連動を維持） |
| P1 | 検索バー | previewFindBar | 移植（DOM 検索なので依存が薄い） |
| P1 | メディア埋め込み（動画/音声/PDF） | imageMediaView / mediaKind / csp | 直近実装。mediaKind/csp はエンジン非依存でそのまま。描画フックのみ Vditor 向けに書き直し |
| P2 | 画像コピー / プレーンテキスト貼り付け | imageCopyPlugin / clipboardPlainTextPlugin | Vditor の既定挙動を確認してから差分のみ移植 |
| P2 | 空白文字マーカー（全角スペース等の可視化） | whitespaceMarkerPlugin | CSS + 装飾で移植 |
| P2 | Mermaid ノードラベルの直接編集 | mermaidNodeLabelEdit(or) | 独自機能として移植（複雑なので P2） |
| P2 | 行数/文字数ステータスバー | （未実装） | vscode-office から取り入れ（分析メモ §5、約30行） |

### 4.3 エンジン非依存でそのまま残る資産

- ホスト全体: previewPanel（メッセージ処理・タブ重複解消・default editor 跳ね返し）、
  markdownTransform、localExport、i18n、設定スキーマ。
- shared 層: cursorAnchor のセグメント計算、slash 定義、mediaKind、scrollSync 比率計算。
- テスト: `test/extension/`（実 VS Code 層）はほぼ全部、`test/suite/` の shared/純関数分。

## 5. フェーズ計画

### Phase 0 — PoC / Go・No-Go 判定（最重要）

ブランチ `poc/vditor-base` で使い捨て実装を作り、§2 の前提条件を検証する。

1. vscode-office を reference として shallow clone（`/tmp` 配下）し、Vditor 初期化・
   テーマ連動・webview glue の実装を写経ベースで把握する。
2. 最小 webview: Vditor IR で開く→編集→`getValue()`→現行 `change` プロトコルで保存、まで。
3. **ラウンドトリップ検証**: `test/` 配下の全 fixture + 実利用中の Obsidian ノート数十本で
   `load → getValue()` の no-op diff を機械判定するスクリプトを書く（成果物として
   `scripts/roundtrip-check.ts` を残し、以後の回帰テストにする）。
4. **ガター PoC**: 見出し/リスト/コードブロック/表を含む文書で、ブロック→行番号対応と
   `offsetTop` 描画が成立することを目視 + スクリーンショットで確認。
5. **IME 手動検証**: 日本語連続変換・長文入力（過去の未再現バグの再現手順）。
6. `getValue()` の毎キー呼び出しコストを 1万行文書で計測（>10ms なら短い debounce +
   blur/保存時 flush の設計に変更）。

**Exit 基準**: §2 の前提 1〜3 がすべて合格 → Go。1つでも不合格で回避策が Vditor パッチ
1〜2 件で収まらない → No-Go（案 B へフォールバック）。判定結果はこの md に追記する。

### Phase 1 — 基盤（フラグ併存・可視化）

- `markdownInline.preview.engine` 設定を追加し、previewPanel が webview バンドルを
  切り替えられるようにする（既定 `milkdown` のまま）。
- `src/preview/host/output.ts`: Output チャンネル + 共通エラーレポータ。全
  `onDidReceiveMessage` ハンドラと serialQueue の失敗経路を一律で包む
  （分析メモ §1・§2。**エンジンに関係なく現行構成にも効く**ので最初に入れる）。
- ビルド: `build:webview-vditor` を追加。Vditor は npm + patch-package で導入。

### Phase 2 — コア編集・同期のパリティ（P0）

- vditorApp.ts + プロトコルアダプタ実装。外部同期・カーソルアンカー・スクロール同期・
  設定反映（テーマ/フォント/編集可否）まで。
- 受け入れ基準: `test/extension/preview/` 全テストが `engine=vditor` でグリーン
  （テストランナーに engine 環境変数を足し、CI で両エンジン実行）。
- `test/browser/` に Vditor 用ハーネス `previewVditorHarness.ts` を追加し、
  external-sync / editing-core / ime カテゴリの主要シナリオから移植開始。

### Phase 3 — 独自機能の移植（P1 → P2）

§4.2 の表の順に 1 機能ずつ。**機能ごとに必ず**: 既存仕様書を新ベース向けに更新 →
browser テスト移植（失敗確認）→ 実装 → グリーン、の TDD ループ（CLAUDE.md のワークフロー）。
行番号ガターは仕様書 `blank-line-preservation.md` §6 の順序保証（番号が後退しない）を
そのまま受け入れ基準に含める。

### Phase 4 — テスト移行と audit

- `test/webview/`（jsdom + Milkdown 層）は Vditor が jsdom で動かない可能性が高いため、
  **純関数化できるものは `test/suite/` へ降ろし、DOM 依存のものは `test/browser/` へ上げる**
  （レイヤーの信頼度序列は testing-rules.md のとおり実ブラウザ優先なので、正味の退行ではない）。
- `npm run docs:test-catalog` 再生成、backlog / spec-test-coverage 更新。
- skill `preview-exploratory-audit` で実 VS Code / 実 Chromium の総当たり audit を実施し、
  現行実装との体感差（特にタブ・フォーカス・IME）を確認。

### Phase 5 — 切替と撤去

- 既定を `engine=vditor` に反転してリリース（バージョン 3.0.0）。1〜2 週間の実利用で
  問題がなければ: Milkdown webview 実装・関連プラグイン・依存パッケージ・旧テストを削除し、
  `webview-vditor/` を `webview/` にリネーム。engine フラグは1リリース残して撤去。

## 6. リスクと対策

| リスク | 影響 | 対策 |
| --- | --- | --- |
| Lute のシリアライズが現行と非互換（空行・エスケープ・リスト記号の揺れ） | 開いただけで diff が出て Git 運用を壊す（最悪級） | Phase 0 のラウンドトリップ機械検証を Go/No-Go 条件にする。揺れが既知パターンに収まるなら markdownTransform 層で正規化を挟む |
| 行番号ガターの精度が Vditor DOM で出ない | 主要独自機能の喪失 | Phase 0 で先に PoC。remark 再パース方式は維持できる見込みだが、ダメなら No-Go |
| Vditor の IME 挙動に別種のバグ | 移行の主目的（安定化）が達成できない | Phase 0 手動検証 + 既存 `test/browser/ime/` の CDP シナリオを移植して比較 |
| Vditor upstream の保守停滞 | 長期の脆弱性・VS Code API 追従 | vendoring 前提（vscode-office と同じ）。patch 3 件超で fork 取り込み |
| 併存期間の二重メンテ | 開発速度低下 | 併存中は Milkdown 側を**バグ修正凍結**（クラッシュ級のみ対応）にする |
| バンドルサイズ増（Vditor + Lute はかなり大きい） | 起動時間 | 現行 milkdown.bundle.js も 4.1MB あるため悪化幅は限定的。lazy load を検討 |
| undo 粒度・カーソル維持の劣化 | 体感品質 | serialQueue 方式を維持し debounce を最小化。Phase 2 の browser テストに undo シナリオを含める |

## 7. 進め方の約束事

- 全フェーズで CLAUDE.md の TDD ワークフローに従う（実装先行禁止）。
- 進捗と Go/No-Go 判定はこの md に追記していく（このファイルが移行の living document）。
- フェーズ末ごとにコミットを分け、`preview-usage-flow-test-backlog.md` に移植残を記録する。
- vscode-office のコードは MIT。写経・移植した箇所はファイルヘッダに出典を明記する。

## 8. マイルストーン目安

| フェーズ | 目安 |
| --- | --- |
| Phase 0 PoC + Go/No-Go | 2〜3 セッション |
| Phase 1 基盤 | 1 セッション |
| Phase 2 コアパリティ | 3〜5 セッション |
| Phase 3 独自機能移植 | 5〜8 セッション（機能単位で分割可能） |
| Phase 4 テスト移行 + audit | 2〜3 セッション |
| Phase 5 切替・撤去 | 1〜2 セッション |
