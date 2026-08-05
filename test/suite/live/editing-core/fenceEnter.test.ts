/**
 * コードフェンスの Enter（閉じフェンスの自動補完）の純関数テスト。
 *
 * ユーザー報告（2026-08-05）:「``` ``` この中にカーソルを入れることができない」。
 * 原因は「開始フェンスを打っても本文行が作られない」こと。Obsidian は
 * ` ```js ` + Enter で `\n\n``` ` を補い、本文行にカーソルを置く（実測 §2.7）。
 * ここでその補完を固定する。
 */
import * as assert from 'assert';
import { resolveFenceEnter } from '../../../../src/live/shared/liveEditing';

describe('Live モード: コードフェンスの Enter', () => {
    it('閉じていない開始フェンスの行末で Enter すると閉じフェンスを補う', () => {
        const doc = '```js';
        const r = resolveFenceEnter(doc, doc.length);
        assert.deepStrictEqual(r, { insert: '\n\n```', cursorDelta: 1 });
    });

    it('言語指定が無くても補う', () => {
        const doc = '```';
        assert.deepStrictEqual(resolveFenceEnter(doc, 3), { insert: '\n\n```', cursorDelta: 1 });
    });

    it('チルダフェンスは同じ記号で閉じる', () => {
        const doc = '~~~py';
        assert.strictEqual(resolveFenceEnter(doc, doc.length)?.insert, '\n\n~~~');
    });

    it('4連バッククォートも同じ長さで閉じる', () => {
        const doc = '````js';
        assert.strictEqual(resolveFenceEnter(doc, doc.length)?.insert, '\n\n````');
    });

    it('すでに閉じているフェンスでは補わない（既定の Enter に委ねる）', () => {
        const doc = '```js\n```';
        assert.strictEqual(resolveFenceEnter(doc, 5), null);
    });

    it('本文の途中では補わない', () => {
        const doc = '```js\nconst a = 1;\n```';
        assert.strictEqual(resolveFenceEnter(doc, doc.indexOf('const') + 3), null);
    });

    it('行末以外では補わない', () => {
        const doc = '```js';
        assert.strictEqual(resolveFenceEnter(doc, 2), null);
    });

    it('フェンスではない行では補わない', () => {
        assert.strictEqual(resolveFenceEnter('本文', 2), null);
    });

    it('後ろに別のフェンスがあっても、自分が閉じていなければ補う', () => {
        const doc = '```js\n\n```\n\n```py';
        assert.strictEqual(resolveFenceEnter(doc, doc.length)?.insert, '\n\n```');
    });
});
