# Weekly.md自動処理の実行フロー

## 概要
`@PeriodicNotes/Automation/weekly.md`を実行する際の具体的なファイル処理の流れ

## 3つの主要タスク

### タスク1: デイリーノートの準備 📓

#### 処理対象ファイルのパス
- **テンプレート**: `/Users/kaiki/Documents/memento_mori/PeriodicNotes/Templates/daily.md`
- **出力先**: `/Users/kaiki/Documents/memento_mori/PeriodicNotes/Daily/YYYY-MM-DD.md`
- **対象期間**: 本日から今週日曜日まで

#### 処理フロー
```bash
# 作業ディレクトリ
cd /Users/kaiki/Documents/memento_mori/PeriodicNotes/Daily

# 例: 2025-09-25（木）に実行した場合
# 作成されるファイル:
# - 2025-09-25.md (木)
# - 2025-09-26.md (金) 
# - 2025-09-27.md (土)
# - 2025-09-28.md (日)
```

#### ファイル作成ロジック
1. 対象日のファイルが存在しない → テンプレートをコピー
2. 対象日のファイルが存在する → 既存内容を保持しつつテンプレート構造をマージ

---

### タスク2: 週次開発レポートの作成 📝

#### 処理対象ファイルのパス
- **Git対象**: `/Users/kaiki/Documents/memento_mori/` (リポジトリ全体)
- **出力ファイル**: `/Users/kaiki/Documents/memento_mori/weekly_report.txt`
- **最終レポート**: 手動でAIツールへ入力後、任意の場所に保存

#### 処理フロー
```bash
# Step 1: Gitログをエクスポート
cd /Users/kaiki/Documents/memento_mori
git log --since="1 week ago" -p > weekly_report.txt

# Step 2: AIツールで処理（手動）
# weekly_report.txtの内容とプロンプトをAIツールへ入力
```

#### 取得されるデータ
- 先週1週間のコミット履歴
- 各コミットの差分（追加/削除された行）
- 変更されたファイルのパス

---

### タスク3: 週次活動時間の集計 (日曜実行) ⏳

#### 処理対象ファイルのパス
- **設定ファイル**: `/Users/kaiki/Documents/memento_mori/PeriodicNotes/Programing/.env`
- **Python仮想環境**: `/Users/kaiki/Documents/memento_mori/PeriodicNotes/Programing/.venv/`
- **実行スクリプト**: `/Users/kaiki/Documents/memento_mori/PeriodicNotes/Programing/google_calendar_to_notion_report.py`

#### 設定ファイル(.env)の内容
```env
# Google Calendar IDs
CALENDAR_ID_ARCHITECTURE=xxx@group.calendar.google.com
CALENDAR_ID_MEETING=xxx@group.calendar.google.com
CALENDAR_ID_STUDY=xxx@group.calendar.google.com
CALENDAR_ID_WORKOUT=xxx@group.calendar.google.com
CALENDAR_ID_READING=xxx@group.calendar.google.com
CALENDAR_ID_TOGGL=xxx@group.calendar.google.com
CALENDAR_ID_TIME_BOXING=xxx@group.calendar.google.com

# Notion API
NOTION_TOKEN=secret_xxx
NOTION_DATABASE_ID=xxx
```

#### 処理フロー
```python
# Step 1: 仮想環境の有効化
source ~/Documents/memento_mori/PeriodicNotes/Programing/.venv/bin/activate

# Step 2: スクリプト実行
python ~/Documents/memento_mori/PeriodicNotes/Programing/google_calendar_to_notion_report.py
```

#### データの流れ
1. **入力**: Google Calendar API
   - 期間: 先週月曜日 00:00 〜 日曜日 23:59
   - カレンダー: 複数のカレンダーIDから取得

2. **処理**: カテゴリマッピング
   ```python
   CATEGORY_MAPPING = {
       "仕事": [CALENDAR_ID_ARCHITECTURE, CALENDAR_ID_MEETING],
       "学習": [CALENDAR_ID_STUDY],
       "運動": [CALENDAR_ID_WORKOUT],
       "読書": [CALENDAR_ID_READING]
   }
   ```

3. **出力**: Notion API
   - ページタイトル: `Weekly Progress Report (2025-09-28)`
   - 内容: カテゴリ別活動時間のテーブル

---

## 実行タイミング

### 推奨スケジュール
- **タスク1 (デイリーノート準備)**: 毎週月曜日の朝
- **タスク2 (開発レポート)**: 毎週金曜日または月曜日
- **タスク3 (活動時間集計)**: 毎週日曜日の夜

### 自動化方法
```bash
# crontab設定例
# 毎週月曜日 朝9時にデイリーノート作成
0 9 * * 1 cd ~/Documents/memento_mori && python create_weekly_notes.py

# 毎週日曜日 夜11時に活動集計
0 23 * * 0 source ~/.venv/bin/activate && python google_calendar_to_notion_report.py
```

## エラーハンドリング

### タスク1のエラー
- テンプレートファイルが存在しない → エラーログ出力、処理中止
- 書き込み権限がない → エラーログ出力、該当ファイルスキップ

### タスク2のエラー
- Gitリポジトリでない → エラーメッセージ表示
- コミット履歴がない → 空のレポートファイル生成

### タスク3のエラー
- Google Calendar API認証失敗 → 認証フロー再実行
- Notion API接続失敗 → リトライ後、ローカルファイルに保存

## 関連ファイル構造
```
/Users/kaiki/Documents/memento_mori/
├── PeriodicNotes/
│   ├── Daily/
│   │   └── YYYY-MM-DD.md (デイリーノート)
│   ├── Templates/
│   │   └── daily.md (テンプレート)
│   ├── Automation/
│   │   ├── daily.md (日次処理仕様)
│   │   └── weekly.md (週次処理仕様)
│   └── Programing/
│       ├── .env (設定ファイル)
│       ├── .venv/ (Python仮想環境)
│       ├── google_calendar_to_notion_report.py
│       └── token.json (Google認証トークン)
└── weekly_report.txt (Gitログ出力)
```