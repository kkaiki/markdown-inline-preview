# Preview ⇄ Raw スクロール位置同期 仕様

最終更新: 2026-06-22

Raw（テキストエディタ）と Preview（Milkdown WebView）を **トグルで切り替えた際に、画面のスクロール位置を引き継ぐ**機能の仕様。設定 `markdownInline.preview.syncScroll`（既定 `true`）で有効。

> 補足: Raw と Preview は同じ `.md` を表示する **排他的な 2 モード**（同時に並べて開く前提ではない）。したがって本機能は「切替の瞬間に位置を合わせる」ものであり、常時リアルタイム同期ではない。

---

## 1. 目的・背景

- Raw で下の方まで読み進めてから Preview に切り替えると、以前は **先頭（または最後にカーソルがあった行）** に戻ってしまい、読み位置を見失っていた。
- 原因: Raw→Preview の基準が **カーソル行**（`selection.active.line`）だった。マウスホイールでスクロールしてもカーソルは動かないため、スクロール位置が反映されなかった。
- 対策: 基準を **画面最上部の可視行**（`visibleRanges[0].start.line`）に変更し、双方向で位置を引き継ぐ。

---

## 2. 同期方式

位置は 2 段構えで合わせる。

1. **見出しアンカー（第一候補）**
   Markdown は「1 ソース行 = 1 表示行」ではない（空行の畳み込み・コードブロック・テーブル等）。そこで **最も近い見出し**を共通の目印にする。
   - Raw 側: `findScrollAnchor(document, topLine)` が最上部可視行の直上にある見出しを採用（`shared/structure/scrollAnchor`）。
   - Preview 側: 見出しテキストの **slug 一致**で対応する `h1`〜`h6` を探して `scrollIntoView`。
2. **スクロール比率（フォールバック）**
   見出しが無い／一致しない場合は `ratio = 位置 / 全体`（0〜1）で合わせる。
   - Raw: `topLine / lineCount`
   - Preview: `scrollTop / (scrollHeight - clientHeight)`

アンカーと比率は **両方**やり取りし、Preview 側はアンカーで合わせられなければ比率に自動フォールバックする。

---

## 3. 純粋計算（`shared/preview/scrollSync.ts`）

Raw は「行番号」、Preview は「ピクセル」で位置を持つため、`ratio`（0〜1）に正規化して受け渡す。VS Code / DOM 非依存の純関数として切り出し、単体テスト（`test/suite/scrollSync.test.ts`）で網羅する。

| 関数 | 用途 |
|------|------|
| `scrollRatioFromLine(topLine, lineCount)` | Raw: 行 → 比率（1 行以下は `undefined`） |
| `scrollRatioFromPixels(scrollTop, scrollHeight, clientHeight)` | Preview: px → 比率（0〜1 にクランプ） |
| `lineFromScrollRatio(ratio, lineCount)` | Raw: 比率 → 行（0〜lineCount-1 にクランプ） |
| `pixelsFromScrollRatio(ratio, scrollHeight, clientHeight)` | Preview: 比率 → px |
| `contentScrollHeight(scrollHeight, scrollBeyondPadding)` | Preview: scroll-beyond 余白を除いた実コンテンツ高 |

いずれも範囲外・NaN・分母 0 を安全に処理する。

### scroll beyond last line と比率計算

Preview は最終行を画面最上部まで送れるよう、コンテンツ下に「ビューポート高 − 1行」の余白を持つ（`--preview-scroll-beyond`）。この余白を `scrollHeight` にそのまま含めると、同じ本文位置でも比率が小さく出て**末尾付近で Raw⇄Preview がズレる**。そのため Preview 側の比率計算には必ず `contentScrollHeight(scrollHeight, 追加余白)` を渡し、**追加余白を除いた実コンテンツ高**で `scrollRatioFromPixels` / `pixelsFromScrollRatio` を呼ぶ。

---

## 4. メッセージ・プロトコル

### Raw → Preview（切替時）
`switchToPreview`（`preview/host/previewPanel.ts`）が、最上部可視行から `scrollAnchor`（見出しがあれば）と `scrollRatio`（常に）を確定し、WebView の `ready` 受信時に `init` メッセージへ載せる。

```
init { markdown, frontmatter, settings, scrollAnchor?, scrollRatio? }
```

WebView は描画後、`scrollAnchor` 優先で位置合わせ。見出しが見つからなければ `scrollRatio` で代替。

### Preview → Raw（切替時）
WebView はスクロールのたびに現在位置を通知する（150ms デバウンス）。

```
scroll { ratio, anchor? }
```

ホストは最後の値を保持し、`switchToRaw` で `revealAnchor`（slug→行）→ 失敗時は `revealRatio` で復元する。

---

## 5. エッジケース

- **1 行以下 / 空ファイル**: `scrollRatioFromLine` が `undefined`。同期しない（先頭表示）。
- **見出しが無いファイル**: 比率のみで同期。
- **見出しテキストを編集した直後**: slug が一致せず比率にフォールバック。
- **`syncScroll = false`**: 一切同期しない（常に先頭）。
- **スクロール不能（中身がビューより小さい）**: 比率 0。

---

## 6. テスト

- `test/suite/scrollSync.test.ts`: 純関数の境界値・クランプ・行↔比率の往復安定性。
- `test/suite/scrollAnchor.test.ts`: 見出しアンカーの探索・slug 復元（既存）。

ホスト/WebView の結線（`visibleRanges` 採用、メッセージ往復）は VS Code / DOM 依存のため、計算とアンカー選択を純関数へ寄せて単体テストで担保し、結線部分は薄く保つ方針。
