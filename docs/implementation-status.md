# 実装状況マトリクス

最終更新: 2026-06-20（v1.8.1）  
ユーザー向けの機能一覧は [inline-preview-features.md](./inline-preview-features.md) と [preview-features.md](./preview-features.md) を参照。

凡例: ✅ 完了 / 🟡 一部 / ❌ 未実装 / 📋 仕様のみ（将来）

---

## A. Preview / Raw トグル

### Phase 1 — MVP

| ID | 要件 | 状態 | 備考 |
|----|------|------|------|
| P1-01 | タイトルバー Preview / Raw 切替 | ✅ | 常に1ボタンのみ（切替先を表示） |
| P1-02 | CommonMark + GFM | ✅ | Milkdown |
| P1-03 | コードブロックシンタックスハイライト | ✅ | highlight.js common（主要言語網羅） |
| P1-04 | テーマ追従 | ✅ | `preview.theme: auto` |
| P1-05 | キーボードショートカット | ✅ | `Cmd+Shift+M` |
| P1-06 | Preview 内チェックボックス | ✅ | GFM + list-item-block → Raw へ保存 |

### Phase 2 — WYSIWYG

| ID | 要件 | 状態 |
|----|------|------|
| P2-01〜04 | Milkdown / 同期 / 循環防止 | ✅ |
| P2-05 | スクロール位置同期 | ✅ | 見出しアンカー優先、なければ行比率 |
| P2-06〜08 | 永続化 / Provider / Raw 表示 | ✅ |

### Phase 3 — 高度機能

| ID | 要件 | 状態 |
|----|------|------|
| P3-01 | フローティングツールバー | ❌ 削除 | スラッシュメニューで代替 |
| P3-02 | テーブルセル編集 | 🟡 | Milkdown 基本編集 |
| P3-03 | KaTeX 数式 | ✅ | `preview.enableMath` |
| P3-04 | Mermaid | ✅ | `preview.enableMermaid` |
| P3-05 | Frontmatter 表示 | ✅ | `preview.showFrontmatter` |
| P3-06 | リンク → VSCode ナビ | ✅ |
| P3-07 | 画像相対パス | ✅ |
| P3-08 | 切替フェード | ✅ | `preview.enableTransitions` |
| P3-09 | アクセシビリティ | 🟡 | toolbar / editor に aria-label |
| P3-10 | XSS サニタイズ | 🟡 | CSP + Milkdown |

---

## B. Raw モード

| 機能 | 状態 |
|------|------|
| リスト・テーブル・TOC・スラッシュ | ✅ |
| 見出し装飾 + カラースキーム | ✅ |
| チェックボックス CodeLens | ✅ |
| hideStrikethroughOnEdit | ✅ |
| 画像ホバー + 行内サムネイル | ✅ | `imagePreview.enabled` / `showThumbnail` |
| テーブル折り返し（ホバー + 行末プレビュー） | ✅ | `table.inlineWrap.enabled` |
| Sign-in / 同期 / CRDT | 📋 別プロジェクト |

---

## C. 残タスク

| 優先度 | 内容 |
|--------|------|
| 低 | Preview テーブル高度編集（行列追加 UI） |
| 低 | a11y 強化（キーボードツールバー操作） |
| 低 | 画像オーバーレイ（image-preview Phase 2） |
| 対象外 | Sign-in / CRDT |

---

## D. テスト

**v1.8.0 ユニットテスト: 475+ passing**（frontmatter, scrollAnchor, markdownAssets 含む）

| 領域 | ユニット | 統合 |
|------|---------|------|
| utils | ✅ | — |
| Preview / Milkdown | ❌ | ❌ |
