# Mermaid 図のノードラベルをプレビュー上で直接編集する

## 背景（ユーザー要望）

「Mermaidについて、プレビューのところでも、編集できるようにして欲しいです」— 現状、
`mermaidDiagramPlugin.ts` が描画する図（SVG）は `contentEditable=false` の読み取り専用
ウィジェットで、編集するには直上の ` ```mermaid ` ソースコードブロック（テキスト）を
直接書き換える必要があった。

## スコープ

Mermaid の標準構文には**ノードの座標（レイアウト）を保存する仕組みが無く**、レイアウトは
常に Mermaid が自動計算する。そのため「図をドラッグしてノードを自由配置する」編集は
ソースへ反映しようがなく、対応不可能。

ユーザーに確認の上、対応範囲を以下に絞った:

- ✅ **ノードラベルのダブルクリック編集**: SVG 上のノードをダブルクリックするとインライン
  入力欄が現れ、確定するとソースの対応ノードのラベル文字列だけが書き換わる。
- ❌ ノード/エッジの座標のドラッグ変更（Mermaid 構文で表現不可能）
- ❌ ノード/エッジの追加・削除・接続変更（GUI での構造編集。将来検討の余地はあるが今回は対象外）

## 実装

### 1. 純関数: `updateMermaidNodeLabel` / `extractNodeIdFromSvgElementId`（`src/preview/webview/mermaidNodeLabelEdit.ts`）

DOM に依存しない純粋なテキスト処理のみをこのファイルに置く（jsdom 無しの
`test/suite` レイヤーで検証するため）。DOM/ProseMirror への配線は
`src/preview/webview/mermaidNodeLabelEditor.ts`（`attachMermaidNodeLabelEditing`）に分離する。

`updateMermaidNodeLabel(source: string, nodeId: string, newLabel: string): string`

Mermaid ソーステキスト中の指定ノード ID の宣言を探し、ラベル文字列だけを書き換える。

- 既にラベル/形状を持つ宣言（`id[label]` / `id(label)` / `id{label}`）が見つかれば、
  その**形状を維持したまま**ラベル部分だけを置換する。
- ラベルの無いベアノード（`A-->B` のように ID 自体がラベルとして描画されているもの）は、
  最初の出現に `[label]` を付与する。
- 同じ ID が複数箇所に出現しても、最初の宣言だけを書き換える（Mermaid ではノードの
  形状/ラベル宣言は通常 1 箇所のみ）。
- 未対応の形状（`(())`, `[[]]`, `>]` 等）や、指定 ID が見つからない場合はソースを
  変更せずそのまま返す（no-op）。

### 2. UI: `mermaidNodeLabelEditor.ts`（`mermaidDiagramPlugin.ts` から配線）

Mermaid が生成する SVG では、各ノードのグループ要素の `id` 属性が
`${renderId}-flowchart-${nodeId}-${index}` という形式になっている
（`renderId` は `mermaid.render()` 呼び出し時に自前で採番した ID）。この命名規則を使い、
クリックされた `.node` 要素の `id` からソース側のノード ID を逆算する。

1. `.mermaid-diagram` widget div に `dblclick` リスナーを 1 つ委譲登録する。
2. クリック対象が `.node` 要素（`event.target.closest('.node')`）なら、その `id` 属性から
   ノード ID を抽出し、`.nodeLabel` 要素から現在のラベルテキストを読む。
3. `<input class="mermaid-node-label-editor">` をノードの `foreignObject` 位置に重ねて
   表示し、現在のラベルを入れてフォーカスする。
   - 対象の widget div は `contentEditable="false"` だが、`<input>` はブラウザネイティブの
     編集要素であり、祖先の `contentEditable` の影響を受けずに通常どおり入力・フォーカス
     できる。
4. `Enter` またはフォーカスアウト（値が変わっていれば）で確定: `updateMermaidNodeLabel`
   で新しいソーステキストを組み立て、対応する code_block ノードの範囲を
   `view.dispatch(view.state.tr.insertText(newSource, contentStart, contentEnd))` で
   置き換える。
   - code_block ノードの位置は、widget の `toDOM(view, getPos)` に渡される `getPos()`
     を**クリック時に呼び出して**取得する（widget 作成時点でクロージャに固定した位置を
     使うと、無関係な編集でドキュメント位置がずれた際に誤動作する）。`getPos()` は
     widget 自身の位置（= code_block ノードの直後）を返すため、
     `view.state.doc.resolve(getPos() - 1)` から祖先を辿って `code_block` ノードの
     開始/終了位置を求める。
5. `Escape` でキャンセル: 入力欄を破棄するのみ（ソースは変更しない）。

ソーステキストが変わると `mermaidDiagramPlugin.ts` の `buildDecorations` が
（`tr.docChanged` により）再実行され、decoration の `key`（ソーステキストから作る）が
変わるため、既存の非同期再描画パイプライン（`scheduleRender` → `mermaid.render` →
`refreshLiveElements`）がそのまま新しいラベルで図を再描画する。追加の手動再描画処理は
不要。

## テスト

- `test/suite/preview/rendering/mermaidNodeLabelEdit.test.ts`: `updateMermaidNodeLabel`
  の純関数テスト（形状維持・ベアノードへのラベル付与・未知 ID の no-op など）。
- `test/browser/rendering/mermaidNodeLabelEdit.test.ts`: 実 Chromium でのダブルクリック
  →入力欄表示→確定→ソース反映／図の再描画、および Escape キャンセルの回帰テスト。
