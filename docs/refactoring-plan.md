# リファクタリング実施計画

**作成日**: 2026-01-14
**対象プロジェクト**: markdown-inline-preview

---

## Phase 1: テスト拡充 ✅ 完了

### 実施内容
- テストケースを39件から100件に拡充
- 機能カバレッジを30%から65%に向上

### 追加したテストファイル

| ファイル　　　　　　　　　　| テスト数 | カバー機能　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　 |
| -----------------------------| ----------| ----------------------------------------------------------------------------------------------|
| `tableFormatting.test.js`　 | 23件　　 | splitTableLine, isSeparatorRow, getDisplayWidthWithHeuristics, padCell, isFullWidthCodePoint |
| `tableOfContents.test.js`　 | 18件　　 | generateSlug, collectHeadings, generateTableOfContents　　　　　　　　　　　　　　　　　　　 |
| `smartNavigation.test.js`　 | 17件　　 | getMarkerEndPosition, smartMoveLeft/Right, getTableCellInfo拡張　　　　　　　　　　　　　　　|
| `lineMoveAndIndent.test.js` | 32件　　 | getIndentLevel, isListItem, extractListNumber, getLineType, ブロック移動ロジック　　　　　　 |

---

## Phase 2: 正規表現パターンの共通化 ✅ 完了

### 目的
- 重複コードの削除（OOAO原則への準拠）
- バグの一元管理
- 保守性向上

### 対象パターン

```javascript
// 現状: 5箇所以上で重複
const headingMatch = text.match(/^(#{1,6}\s+)/);
const checkboxMatch = text.match(/^(\s*-\s\[[\sx]?\]\s*)/i);
const numberedMatch = text.match(/^(\s*\d+\.\s+)/);
const bulletMatch = text.match(/^(\s*[-*+]\s+)/);
```

### 実装計画

1. `src/utils/patterns.js` を作成
2. 正規表現パターンを定数として定義
3. パターンマッチング用ヘルパー関数を作成
4. 既存コードを新モジュールを使用するよう更新
5. テストを追加・更新

### 成果物

```
src/utils/
└── patterns.js  # 正規表現パターン定義
```

---

## Phase 3: ヘルパー関数のモジュール分割 ✅ 完了

### 目的
- 単一責任原則（SOLID-S）への準拠
- テスト容易性の向上
- コードの再利用性向上

### 実装計画

1. `src/utils/` ディレクトリにヘルパー関数を分割:

```
src/utils/
├── patterns.js      # Phase 2で作成
├── width.js         # 文字幅計算（getDisplayWidthWithHeuristics等）
├── table.js         # テーブル操作（splitTableLine, isSeparatorRow等）
├── list.js          # リスト操作（getIndentLevel, extractListNumber等）
└── toc.js           # 目次関連（generateSlug, collectHeadings等）
```

2. 各モジュールのエクスポート形式を統一
3. 既存コードを新モジュールを使用するよう更新
4. テストをモジュール単位に整理

---

## Phase 4: コマンドハンドラの分割 ✅ 完了

### 目的
- registerCommands関数の800行を分割
- 機能ごとの独立性を確保
- 保守性向上

### 実施内容

1. `src/commands/` ディレクトリを作成し、以下のモジュールに分割:

```
src/commands/
├── index.js           # コマンド登録のエントリーポイント (125行)
├── list.js            # リスト操作コマンド (92行)
├── table.js           # テーブル操作コマンド (75行)
├── navigation.js      # ナビゲーションコマンド (350行)
└── toc.js             # 目次コマンド (32行)
```

2. メインファイルのサイズ削減:
   - **Before**: 3,250行
   - **After**: 2,444行
   - **削減**: 806行 (約25%)

3. コマンドハンドラファクトリパターンの導入:
   - 各コマンドモジュールが `createXxxHandler(handlers)` 関数を提供
   - メインファイルからハンドラ関数を注入する形式

4. テスト: 413件全てパス

---

## Phase 5: 装飾機能の分割

### 目的
- 装飾関連コードの独立化
- 視覚的カスタマイズの容易化

### 実装計画

1. `src/decorations/` ディレクトリを作成:

```
src/decorations/
├── index.js          # 装飾管理
├── heading.js        # 見出し装飾
├── codeBlock.js      # コードブロック装飾
├── checkbox.js       # チェックボックス装飾
└── horizontalRule.js # 水平線装飾
```

---

## Phase 6: グローバル状態の整理

### 目的
- テスト容易性の向上
- 競合状態のリスク軽減

### 実装計画

1. コンテキストオブジェクトの導入:
```javascript
// src/context.js
class ExtensionContext {
    constructor() {
        this.decorations = {};
        this.timers = {};
        this.state = {
            currentEditingLine: -1,
            isDragging: false
        };
    }
}
```

2. グローバル変数を段階的にコンテキストへ移行
3. 依存注入パターンの導入

---

## Phase 7: TypeScript移行

### 目的
- 型安全性の向上
- IDEの補完・リファクタリング支援の強化
- バグの早期発見
- ドキュメントとしての型定義

### 実装計画

1. TypeScript環境のセットアップ:
```bash
npm install --save-dev typescript @types/vscode @types/node
```

2. `tsconfig.json` の作成:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./out",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "out"]
}
```

3. 移行順序:
   - Step 1: ユーティリティモジュール（`src/utils/`）から開始
   - Step 2: 型定義ファイル（`src/types/`）を作成
   - Step 3: コマンドハンドラ（`src/commands/`）を移行
   - Step 4: 装飾機能（`src/decorations/`）を移行
   - Step 5: メインエントリポイント（`src/extension.ts`）を移行

4. 型定義の例:
```typescript
// src/types/index.ts
export interface TableCellInfo {
    isTable: boolean;
    cellStart: number;
    cellEnd: number;
    cellContentStart: number;
    cellContentEnd: number;
    cellIndex: number;
    allCells: CellBoundary[];
}

export interface CellBoundary {
    start: number;
    end: number;
    contentStart: number;
    contentEnd: number;
    index: number;
}

export interface HeadingInfo {
    level: number;
    text: string;
    line: number;
}

export interface MarkerInfo {
    contentStart: number;
    hasMarker: boolean;
    markerType: 'heading' | 'checkbox' | 'numbered' | 'bullet' | 'quote' | 'codeblock' | null;
}
```

5. ビルドスクリプトの更新:
```json
{
  "scripts": {
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./",
    "lint": "eslint src --ext ts"
  }
}
```

### 成果物
```
src/
├── types/
│   └── index.ts          # 型定義
├── utils/
│   ├── patterns.ts
│   ├── width.ts
│   ├── table.ts
│   ├── toc.ts
│   ├── list.ts
│   └── index.ts
├── commands/
│   └── *.ts
├── decorations/
│   └── *.ts
└── extension.ts          # メインエントリポイント
```

---

## 実施スケジュール

| Phase | 優先度 | 依存関係 |
|-------|--------|----------|
| Phase 1 | ✅完了 | - |
| Phase 2 | ✅完了 | Phase 1 |
| Phase 3 | ✅完了 | Phase 2 |
| Phase 4 | ✅完了 | Phase 3 |
| Phase 5 | 中 | Phase 4 |
| Phase 6 | 低 | Phase 4, 5 |
| Phase 7 | 低 | Phase 6 |

---

## 注意事項

- 各Phaseの完了後にテストを実行して動作確認
- VS Code統合テスト（`npm test`）は各Phase完了時に実行
- 破壊的変更がある場合はバージョン番号を更新

---

*このドキュメントは実施状況に応じて更新されます。*
