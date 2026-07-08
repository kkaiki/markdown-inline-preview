/**
 * `updateMermaidNodeLabel`（純関数）: Mermaid ソーステキスト中の、指定ノード ID の
 * ラベル文字列だけを書き換える。Preview 上で図のノードラベルをダブルクリック編集
 * したときに、ソースの ```mermaid コードブロックへ反映するために使う。
 * 図のレイアウト（座標）は Mermaid が自動計算するため保存できない・しない。
 * 対応するのは「ラベル文字列の書き換え」のみ（ノード/エッジの追加・削除・付け替えは対象外）。
 */
import * as assert from 'assert';
import { updateMermaidNodeLabel } from '../../../../src/preview/webview/mermaidNodeLabelEdit';

describe('updateMermaidNodeLabel', () => {
    it('ラベルの無い（ID がそのままラベルになっている）ノードに角括弧ラベルを付与する', () => {
        const source = 'graph TD;\nA-->B;\n';
        const result = updateMermaidNodeLabel(source, 'A', 'Start');
        assert.strictEqual(result, 'graph TD;\nA[Start]-->B;\n');
    });

    it('既存の角括弧ラベルを新しいテキストに置き換える（形状は維持）', () => {
        const source = 'graph TD;\nA[Old]-->B;\n';
        const result = updateMermaidNodeLabel(source, 'A', 'New');
        assert.strictEqual(result, 'graph TD;\nA[New]-->B;\n');
    });

    it('丸括弧（角丸）ノードの形状を維持したままラベルを置き換える', () => {
        const source = 'graph TD;\nA(Old)-->B;\n';
        const result = updateMermaidNodeLabel(source, 'A', 'New');
        assert.strictEqual(result, 'graph TD;\nA(New)-->B;\n');
    });

    it('波括弧（ひし形）ノードの形状を維持したままラベルを置き換える', () => {
        const source = 'graph TD;\nA{Old}-->B;\n';
        const result = updateMermaidNodeLabel(source, 'A', 'New');
        assert.strictEqual(result, 'graph TD;\nA{New}-->B;\n');
    });

    it('同じ ID が複数箇所に出現しても最初の宣言（形状/ラベルを持つ箇所）だけを書き換える', () => {
        const source = 'graph TD;\nA[Old]-->B;\nA-->C;\n';
        const result = updateMermaidNodeLabel(source, 'A', 'New');
        assert.strictEqual(result, 'graph TD;\nA[New]-->B;\nA-->C;\n');
    });

    it('存在しないノード ID を指定した場合はソースをそのまま返す', () => {
        const source = 'graph TD;\nA-->B;\n';
        const result = updateMermaidNodeLabel(source, 'Z', 'New');
        assert.strictEqual(result, source);
    });
});
