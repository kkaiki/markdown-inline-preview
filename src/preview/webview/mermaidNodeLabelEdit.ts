/**
 * Preview 上で描画済み Mermaid 図のノードラベルをダブルクリック編集したときに、
 * ソースの ```mermaid コードブロック中の対応ノードのラベル文字列だけを書き換える
 * ための純粋なテキスト処理。DOM/ProseMirror への配線は `mermaidNodeLabelEditor.ts`
 * が担う（このファイルは DOM に依存しないので jsdom 無しの純関数テストで検証できる）。
 *
 * Mermaid の標準構文にはノードの座標（レイアウト）を保存する仕組みが無く、
 * レイアウトは常に Mermaid が自動計算するため、「図をドラッグして自由配置する」
 * 編集はソースへ反映しようがない。そのため対応範囲は「ノードラベルの文字列置換」
 * のみに絞る（ノード/エッジの追加・削除・接続変更は対象外）。
 *
 * 対応する形状: `[]`（角丸無し）, `()`（角丸）, `{}`（ひし形）, ラベル無し（ID がそのまま
 * ラベルとして描画されているベアノード）。その他の形状（`(())`, `[[]]`, `>]` 等）は
 * 未対応で、マッチしなければソースを変更せずそのまま返す。
 */

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function updateMermaidNodeLabel(source: string, nodeId: string, newLabel: string): string {
    const idPattern = escapeRegExp(nodeId);

    // 既にラベル/形状を持つノード宣言（id[label] / id(label) / id{label}）を探す。
    // 最初に見つかった宣言だけを書き換える（Mermaid ではノード宣言は通常 1 箇所）。
    const shapedRe = new RegExp(`\\b${idPattern}(\\[|\\(|\\{)([^[\\](){}]*)(\\]|\\)|\\})`);
    const shapedMatch = shapedRe.exec(source);
    if (shapedMatch) {
        const [full, open, , close] = shapedMatch;
        const start = shapedMatch.index;
        return source.slice(0, start) + nodeId + open + newLabel + close + source.slice(start + full.length);
    }

    // ラベル無し（ベアノード。ID 自体がラベルとして描画されている）の最初の出現に
    // 角括弧ラベルを付与する。
    const bareRe = new RegExp(`\\b${idPattern}\\b`);
    const bareMatch = bareRe.exec(source);
    if (!bareMatch) return source;
    const insertAt = bareMatch.index + nodeId.length;
    return source.slice(0, insertAt) + `[${newLabel}]` + source.slice(insertAt);
}

/**
 * Mermaid が生成する flowchart ノードの SVG 要素 id（例:
 * `mermaid-ab12c-flowchart-A-0`）から、ソース側のノード ID（`A`）を取り出す。
 * id の末尾は常に Mermaid が採番した `-<連番>` なので、末尾から剥がせば良い
 * （renderId・nodeId 自体にハイフンが含まれていても最後の `-\d+` だけを剥がすため頑健）。
 */
export function extractNodeIdFromSvgElementId(svgElementId: string): string | null {
    const match = /-flowchart-(.+)-\d+$/.exec(svgElementId);
    return match ? match[1] : null;
}
