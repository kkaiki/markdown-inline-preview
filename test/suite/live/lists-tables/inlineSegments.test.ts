/**
 * 表のセルなど「1行ぶんのインライン記法をレンダリングする」ための分割（純関数）。
 *
 * 表はウィジェットとして描画するため、セルの中身は CodeMirror の decoration が
 * 効かない。そのままだと `**太字**` がセルに生のまま出てしまう（2026-08-05 の
 * ユーザー報告）。ここで「表示する文字」と「その装飾クラス」に分割して、
 * ウィジェット側が同じ見た目を再現できるようにする。
 */
import * as assert from 'assert';
import { inlineSegments } from '../../../../src/live/shared/inlineSegments';

describe('Live モード: インライン記法の分割', () => {
    it('装飾が無ければ1つのセグメントになる', () => {
        assert.deepStrictEqual(inlineSegments('ただの文字'), [{ text: 'ただの文字', classes: '' }]);
    });

    it('太字はマーカーを落として装飾クラスを付ける', () => {
        assert.deepStrictEqual(inlineSegments('**太字**'), [{ text: '太字', classes: 'cm-live-strong' }]);
    });

    it('前後に地の文があっても分割できる', () => {
        assert.deepStrictEqual(inlineSegments('a **b** c'), [
            { text: 'a ', classes: '' },
            { text: 'b', classes: 'cm-live-strong' },
            { text: ' c', classes: '' }
        ]);
    });

    it('斜体・取り消し線・インラインコードも扱える', () => {
        assert.deepStrictEqual(inlineSegments('*i*'), [{ text: 'i', classes: 'cm-live-em' }]);
        assert.deepStrictEqual(inlineSegments('~~s~~'), [{ text: 's', classes: 'cm-live-strike' }]);
        assert.deepStrictEqual(inlineSegments('`c`'), [{ text: 'c', classes: 'cm-live-code' }]);
    });

    it('リンクは表示テキストだけ残す', () => {
        assert.deepStrictEqual(inlineSegments('[表示](https://e.com)'), [
            { text: '表示', classes: 'cm-live-link' }
        ]);
    });

    it('複数の記法が並んでも順序どおりに分割する', () => {
        assert.deepStrictEqual(inlineSegments('**a** と `b`'), [
            { text: 'a', classes: 'cm-live-strong' },
            { text: ' と ', classes: '' },
            { text: 'b', classes: 'cm-live-code' }
        ]);
    });

    it('閉じていない記法はそのまま文字として残す', () => {
        assert.deepStrictEqual(inlineSegments('**閉じない'), [{ text: '**閉じない', classes: '' }]);
    });

    it('空文字は空配列', () => {
        assert.deepStrictEqual(inlineSegments(''), []);
    });

    it('セグメントを繋ぐと記法文字を除いた表示テキストになる', () => {
        const src = 'x **太字** と *斜体* と `code`';
        const shown = inlineSegments(src).map((s) => s.text).join('');
        assert.strictEqual(shown, 'x 太字 と 斜体 と code');
    });
});
