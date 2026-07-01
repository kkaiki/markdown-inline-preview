/**
 * Notion 風ブロック変換（Cmd/Ctrl+Opt+数字）の未カバー分の統合テスト。
 *
 * previewKeymap.integration.test.ts では 1/5/6/8/9 を検証済み。
 * ここでは残りの 2(H2) / 3(H3) / 4(todo) / 0(段落へ戻す) と、
 * 見出しレベルの上書き・解除トグルを補完する。
 */
import './jsdomSetup';
import * as assert from 'assert';

import {
    createPreviewEditor,
    findFirstPosOfType,
    type PreviewEditorHandle
} from './milkdownHarness';

/** 最初の見出しノードの level を返す（無ければ null）。 */
function firstHeadingLevel(h: PreviewEditorHandle): number | null {
    let level: number | null = null;
    h.view.state.doc.descendants((node) => {
        if (level === null && node.type.name === 'heading') { level = node.attrs.level as number; return false; }
        return true;
    });
    return level;
}

/** 最初の list_item の checked 属性。 */
function firstListItemChecked(h: PreviewEditorHandle): unknown {
    let checked: unknown = 'NONE';
    h.view.state.doc.descendants((node) => {
        if (checked === 'NONE' && node.type.name === 'list_item') { checked = node.attrs.checked; return false; }
        return true;
    });
    return checked;
}

describe('webview統合: ブロック変換 残りのキー (2/3/4/0) とトグル', () => {
    let h: PreviewEditorHandle;
    afterEach(() => h?.destroy());

    async function setupParagraph(text = 'hello world\n'): Promise<void> {
        h = await createPreviewEditor(text);
        h.setCursor(findFirstPosOfType(h, 'paragraph'));
    }

    it('Cmd+Opt+2 で段落→見出し H2', async () => {
        await setupParagraph();
        const res = h.pressKey({ code: 'Digit2', key: '2', meta: true, alt: true });
        assert.strictEqual(res.defaultPrevented, true);
        assert.strictEqual(firstHeadingLevel(h), 2, `H2 になっていない: level=${firstHeadingLevel(h)}`);
    });

    it('Cmd+Opt+3 で段落→見出し H3', async () => {
        await setupParagraph();
        h.pressKey({ code: 'Digit3', key: '3', meta: true, alt: true });
        assert.strictEqual(firstHeadingLevel(h), 3, `H3 になっていない: level=${firstHeadingLevel(h)}`);
    });

    it('Cmd+Opt+4 で段落→タスクリスト（未チェック）', async () => {
        await setupParagraph();
        h.pressKey({ code: 'Digit4', key: '4', meta: true, alt: true });
        assert.ok(h.topLevelTypes().includes('bullet_list'), `リストになっていない: ${h.topLevelTypes().join(', ')}`);
        assert.strictEqual(firstListItemChecked(h), false, 'タスク項目（checked=false）になっていない');
    });

    it('H2 で Cmd+Opt+1 → H1 に上書きされる', async () => {
        await setupParagraph();
        h.pressKey({ code: 'Digit2', key: '2', meta: true, alt: true }); // H2
        assert.strictEqual(firstHeadingLevel(h), 2);
        h.setCursor(findFirstPosOfType(h, 'heading'));
        h.pressKey({ code: 'Digit1', key: '1', meta: true, alt: true }); // H1
        assert.strictEqual(firstHeadingLevel(h), 1, 'H1 に上書きされていない');
    });

    it('Cmd+Opt+0 で見出し→段落に戻る', async () => {
        await setupParagraph();
        h.pressKey({ code: 'Digit2', key: '2', meta: true, alt: true }); // H2
        assert.strictEqual(firstHeadingLevel(h), 2, '前提: H2');
        h.setCursor(findFirstPosOfType(h, 'heading'));
        h.pressKey({ code: 'Digit0', key: '0', meta: true, alt: true }); // → 段落
        assert.strictEqual(firstHeadingLevel(h), null, '見出しが残っている');
        assert.ok(h.topLevelTypes().includes('paragraph'), '段落になっていない');
    });

    it('Cmd+Opt+0 で箇条書き→段落に戻る', async () => {
        h = await createPreviewEditor('- item\n');
        h.setCursor(findFirstPosOfType(h, 'paragraph'));
        h.pressKey({ code: 'Digit0', key: '0', meta: true, alt: true });
        assert.ok(!h.topLevelTypes().includes('bullet_list'), 'リストが解除されていない');
        assert.ok(h.topLevelTypes().includes('paragraph'), '段落になっていない');
    });

    it('同じ見出しレベルを再度押すと段落に戻る（トグル）', async () => {
        await setupParagraph();
        h.pressKey({ code: 'Digit1', key: '1', meta: true, alt: true }); // → H1
        assert.strictEqual(firstHeadingLevel(h), 1, '前提: H1');
        h.setCursor(findFirstPosOfType(h, 'heading'));
        h.pressKey({ code: 'Digit1', key: '1', meta: true, alt: true }); // 同じ → 段落へ
        assert.strictEqual(firstHeadingLevel(h), null, 'トグルで段落に戻っていない');
    });
});
