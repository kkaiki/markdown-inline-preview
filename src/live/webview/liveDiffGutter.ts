/**
 * Git HEAD との差分を左ガターに表示する（Phase 6b）。
 *
 * 見やすさを優先し、VS Code / GitHub と同じ配色の縦バーで示す:
 *   追加 = 緑 / 変更 = 青 / 削除 = 赤い三角（削除された位置の境界に出す）
 *
 * 重要な不変条件: **記法の展開/収縮ではドキュメントが変わらない**ので、
 * カーソルを動かしただけで差分が変化してはならない（requirements.md 受け入れ基準 #9）。
 * そのため差分は「HEAD 本文」と「ドキュメント本文」だけから決まるようにしてある。
 */
import { GutterMarker, gutter, type BlockInfo, type EditorView } from '@codemirror/view';
import { StateEffect, StateField, type EditorState } from '@codemirror/state';
import { computeLineDiff, type LineDiffResult } from '../shared/lineDiff';

/** host から受け取った HEAD 本文をセットする Effect。null は git 管理外。 */
export const setDiffBase = StateEffect.define<string | null>();

/** HEAD 本文（差分の基準）。undefined は「まだ受け取っていない」。 */
export const diffBaseField = StateField.define<string | null | undefined>({
    create: () => undefined,
    update(value, tr) {
        for (const e of tr.effects) if (e.is(setDiffBase)) return e.value;
        return value;
    }
});

/** 差分結果。基準かドキュメントが変わったときだけ計算し直す。 */
export const diffField = StateField.define<LineDiffResult | null>({
    create: (state) => recompute(state),
    update(value, tr) {
        if (tr.docChanged || tr.effects.some((e) => e.is(setDiffBase))) return recompute(tr.state);
        return value;
    }
});

function recompute(state: EditorState): LineDiffResult | null {
    const base = state.field(diffBaseField, false);
    if (base === undefined) return null; // 基準未受信のあいだは何も出さない
    return computeLineDiff(base, state.doc.toString());
}

/**
 * 差分バー。どのソース行の差分かを `data-line` に持たせる
 * （マーカーが付いた行にしかガター要素は作られないため、テストと調査で必要になる）。
 */
class DiffMarker extends GutterMarker {
    constructor(
        private readonly kind: 'added' | 'modified' | 'deleted',
        private readonly deletedBefore: boolean,
        private readonly line: number
    ) {
        super();
    }

    eq(other: DiffMarker): boolean {
        return (
            other.kind === this.kind && other.deletedBefore === this.deletedBefore && other.line === this.line
        );
    }

    toDOM(): HTMLElement {
        const el = document.createElement('div');
        el.className = `cm-live-diff cm-live-diff-${this.kind}`;
        if (this.deletedBefore) el.classList.add('cm-live-diff-deleted-before');
        el.dataset.line = String(this.line);
        el.title =
            this.kind === 'added' ? '追加された行' : this.kind === 'modified' ? '変更された行' : '前の行が削除されている';
        return el;
    }
}

function markerFor(view: EditorView, block: BlockInfo): GutterMarker | null {
    const diff = view.state.field(diffField, false);
    if (!diff) return null;
    const lineNumber = view.state.doc.lineAt(block.from).number;
    const index = lineNumber - 1;
    const status = diff.statuses[index];
    const deletedBefore = (diff.deletionsBefore[index] ?? 0) > 0;
    if (status === 'added' || status === 'modified') return new DiffMarker(status, deletedBefore, lineNumber);
    if (deletedBefore) return new DiffMarker('deleted', true, lineNumber);
    return null;
}

export const liveDiffGutter = gutter({
    class: 'cm-live-diff-gutter',
    lineMarker: markerFor,
    // 畳まれたブロックにも、その先頭行の差分状態を出す。
    // 幅0の追加ウィジェット（数式プレビュー等）は行を持たないので出さない。
    widgetMarker: (view, _widget, block) => (block.length === 0 ? null : markerFor(view, block)),
    /*
     * CodeMirror のガターは「文書変更・ビューポート変更」でしか marker を計算し直さない。
     * HEAD 本文は StateEffect で後から届くので、これを明示しないと
     * 差分バーが一切描画されない（2026-08-05 に実際に踏んだ）。
     */
    lineMarkerChange: (update) =>
        update.startState.field(diffField, false) !== update.state.field(diffField, false)
});
