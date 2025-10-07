# Daily.md自動処理の実行フロー

## 概要
`@PeriodicNotes/Automation/daily.md`を実行する際の具体的なファイル処理の流れ

## 処理対象ファイルのパス

### 1. 入力ファイル（処理元）
- **パス**: `/Users/kaiki/Documents/memento_mori/PeriodicNotes/Daily/YYYY-MM-DD.md`
- **例**: `/Users/kaiki/Documents/memento_mori/PeriodicNotes/Daily/2025-09-24.md`
- **条件**: 今日（2025-09-25）より前の日付のファイルすべて

### 2. 出力ファイル（処理先）
- **パス**: `/Users/kaiki/Documents/memento_mori/PeriodicNotes/Daily/YYYY-MM-(DD+1).md`
- **例**: `/Users/kaiki/Documents/memento_mori/PeriodicNotes/Daily/2025-09-25.md`
- **説明**: 処理元の翌日のファイル（存在しない場合は新規作成）

### 3. 設定ファイル
- **パス**: `/Users/kaiki/Documents/memento_mori/PeriodicNotes/Programing/.env`
- **内容**: 
  - `CALENDAR_ID_TOGGL`: 実績登録用カレンダーID
  - `CALENDAR_ID_TIME_BOXING`: タイムボックス予定用カレンダーID
  - Notion API関連の設定

## 処理フローの詳細

### ステップ1: ファイルの特定
```bash
# 作業ディレクトリ
cd /Users/kaiki/Documents/memento_mori/PeriodicNotes/Daily

# 処理対象ファイルの検索
ls -la *.md | grep -E "2025-09-(19|20|21|22|23|24)\.md"
```

### ステップ2: Google Calendar連携
1. **実績登録**
   - 読み込み: `2025-09-24.md`の「⏰ タイムボックス」セクションのテーブル
   - 書き込み: Google Calendar (`CALENDAR_ID_TOGGL`)
   
2. **予定取得**
   - 読み込み: Google Calendar (`CALENDAR_ID_TIME_BOXING`)
   - 書き込み: `2025-09-24.md`の「⏰ タイムボックス」セクション（更新）

### ステップ3: タスクの移行
処理対象ファイル: `2025-09-24.md` → `2025-09-25.md`

#### 完了タスクの集約
- **読み込み元**: `2025-09-24.md`の全セクション
- **書き込み先**: `2025-09-24.md`の`## ✅ 実行したタスク`セクション（新規作成）
- **対象**: `- [x]`で始まるすべての行とその子タスク

#### 未完了タスクの移行
| 移行元セクション（2025-09-24.md） | 移行先セクション（2025-09-25.md） |
|---|---|
| `## 今日のタスク` | `## 今週のタスク` |
| `## 今週のタスク` | `## 今週のタスク` |
| `## 今日の最優先事項 (Top 2 + α)` | （移行しない・削除） |
| `## ✡️ 仕事振り返り（YWT）` | `## ✡️ 仕事振り返り（YWT）`（特別ルール適用） |
| その他のセクション | 同名セクション（なければ作成） |

#### 特別ルール: 仕事振り返り（YWT）セクション
```
処理前（2025-09-24.md）:
## ✡️ 仕事振り返り（YWT）
task
- [ ] 自動スコアリング        → 移行する
  - [x] アルゴリズムテスト    → 親が未完了なので移行する
  - [ ] bigquery処理          → 移行する
- [x] ドキュメント更新        → 完了なので移行しない
  - [ ] README修正            → 親が完了なので移行しない

処理後（2025-09-25.md）:
## ✡️ 仕事振り返り（YWT）
task
- [ ] 自動スコアリング
  - [x] アルゴリズムテスト
  - [ ] bigquery処理
```

### ステップ4: Notion連携
- **読み込み**: `2025-09-24.md`（完了タスクのみ抽出）
- **API呼び出し**: Notion API
- **書き込み先**: Notionデータベース内の2025-09-24ページ

### ステップ5: ファイルの最終処理
1. **整形処理**（`2025-09-25.md`）
   - マークダウン記法の修正（`-` → `- `）
   - 重複セクションの統合
   - インデントのタブ統一
   - テーブル前の空行追加

2. **削除処理**
   - **削除対象**: `/Users/kaiki/Documents/memento_mori/PeriodicNotes/Daily/2025-09-24.md`
   - **条件**: すべての処理が正常完了した場合のみ

## 使用されるPythonスクリプト（推定）
```
/Users/kaiki/Documents/memento_mori/PeriodicNotes/Programing/
├── process_daily_notes_improved_v2.py  # メイン処理スクリプト
├── google_calendar_util.py             # Google Calendar連携
├── sync_daily_notes_to_calendar.py     # カレンダー同期
└── google_calendar_to_notion_report.py # Notion連携
```

## エラー時の挙動
- エラーが発生した場合、元ファイル（`2025-09-24.md`）は**削除されない**
- 部分的な変更も**ロールバック**される
- エラーログが`process_daily_notes.log`に記録される

## 実行コマンド例
```bash
# シェルスクリプト経由での実行
./run_daily_processor_improved.sh

# または直接Python実行
python process_daily_notes_improved_v2.py
```