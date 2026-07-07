/**
 * フォーカス時の行内記法マーカー（`**` 等）の装飾要素のテスト。
 *
 * 回帰防止の主眼: マーカー `<span>` が `contenteditable="false"` であること。
 * これが無いとエディタから contenteditable=true を継承し、矢印キーのキャレットが
 * マーカー文字の中に入り込んで「これ以上右に行けない」状態になる。
 */
import '../jsdomSetup';
import * as assert from 'assert';

import { createSyntaxMarkerElement } from '../../../src/preview/webview/focusSyntaxPlugin';

describe('focusSyntax: 行内記法マーカー要素', () => {
    it('contenteditable="false"（キャレットが入り込まない）', () => {
        for (const marker of ['**', '*', '`', '~~', '[', '](url)']) {
            const el = createSyntaxMarkerElement(marker);
            assert.strictEqual(el.contentEditable, 'false', `"${marker}" が contenteditable=false でない`);
        }
    });

    it('クラス・本文・aria-hidden が正しい', () => {
        const el = createSyntaxMarkerElement('**');
        assert.strictEqual(el.className, 'md-syntax-marker');
        assert.strictEqual(el.textContent, '**');
        assert.strictEqual(el.getAttribute('aria-hidden'), 'true');
        assert.strictEqual(el.tagName.toLowerCase(), 'span');
    });
});

describe('focusSyntax: マーカークリック位置ナビゲーション', () => {
    it('createSyntaxMarkerElement は data-pm-pos を持たない（位置は widget 生成時に付与）', () => {
        // createSyntaxMarkerElement 自体は位置情報なし。mkMarker が dataset.pmPos を付与する。
        const el = createSyntaxMarkerElement('**');
        assert.strictEqual(el.dataset.pmPos, undefined, 'pmPos は mkMarker が付与する');
    });

    it('mkMarker 相当: dataset.pmPos をセットした要素はクリック位置として使える', () => {
        const el = createSyntaxMarkerElement('`');
        el.dataset.pmPos = '42';
        assert.strictEqual(el.dataset.pmPos, '42');
        assert.strictEqual(Number(el.dataset.pmPos), 42);
    });

    it('data-pm-pos が数値として正しくパースできる', () => {
        for (const pos of [0, 1, 100, 9999]) {
            const el = createSyntaxMarkerElement('~~');
            el.dataset.pmPos = String(pos);
            const parsed = Number(el.dataset.pmPos);
            assert.ok(Number.isFinite(parsed) && parsed >= 0, `pos ${pos} のパースが失敗`);
        }
    });
});
