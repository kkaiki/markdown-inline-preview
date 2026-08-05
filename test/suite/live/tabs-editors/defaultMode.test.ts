/**
 * 「次に Markdown を開くモード」の決定（純関数）。
 *
 * ユーザー指示（2026-08-05）:
 *   「最初のデフォルトは live、その後は raw の時は raw などのようにする」
 * つまり **初回は Live**、以後は**直前に使ったモードに追従**する。
 */
import * as assert from 'assert';
import {
    computeEditorAssociations,
    editorAssociationsEqual,
    resolveDefaultOpenMode
} from '../../../../src/live/host/defaultEditorAssociation';

describe('Live モード: 次に開くモードの決定', () => {
    it('記憶が無ければ Live（初回の既定）', () => {
        assert.strictEqual(resolveDefaultOpenMode({}), 'live');
    });

    it('直前が Raw なら Raw で開く', () => {
        assert.strictEqual(resolveDefaultOpenMode({ remembered: 'raw' }), 'raw');
    });

    it('直前が Live なら Live で開く', () => {
        assert.strictEqual(resolveDefaultOpenMode({ remembered: 'live' }), 'live');
    });

    it('記憶より設定が優先されることはない（記憶が最優先）', () => {
        assert.strictEqual(resolveDefaultOpenMode({ remembered: 'raw', defaultMode: 'live' }), 'raw');
    });

    it('記憶が無いときは設定に従う', () => {
        assert.strictEqual(resolveDefaultOpenMode({ defaultMode: 'raw' }), 'raw');
    });

    it('設定が未知の値でも Live に丸める', () => {
        assert.strictEqual(resolveDefaultOpenMode({ defaultMode: 'preview' }), 'live');
    });
});

describe('Live モード: 既定エディタの関連付け', () => {
    it('Live のときは *.md を Live の viewType に向ける', () => {
        const next = computeEditorAssociations(undefined, 'live');
        assert.strictEqual(next['*.md'], 'ipreview.live');
        assert.strictEqual(next['*.markdown'], 'ipreview.live');
    });

    it('Raw のときは標準テキストエディタに向ける', () => {
        const next = computeEditorAssociations(undefined, 'raw');
        assert.strictEqual(next['*.md'], 'default');
    });

    it('制御 OFF のときは自分が書いた値だけ取り除く', () => {
        const next = computeEditorAssociations({ '*.md': 'ipreview.live', '*.txt': 'other' }, null);
        assert.strictEqual(next['*.md'], undefined);
        assert.strictEqual(next['*.txt'], 'other', '他拡張向けの設定は残す');
    });

    it('ユーザーが他拡張のビューアへ向けている設定は上書きしない', () => {
        const next = computeEditorAssociations({ '*.md': 'cweijan.markdownViewer' }, null);
        assert.strictEqual(next['*.md'], 'cweijan.markdownViewer');
    });

    it('同じ内容なら書き戻し不要と判定する', () => {
        assert.strictEqual(editorAssociationsEqual({ '*.md': 'default' }, { '*.md': 'default' }), true);
        assert.strictEqual(editorAssociationsEqual({ '*.md': 'default' }, { '*.md': 'ipreview.live' }), false);
    });
});
