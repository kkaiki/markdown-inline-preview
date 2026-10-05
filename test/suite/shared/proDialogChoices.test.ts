/**
 * PRO+ の購入案内のダイアログ（Word・スライド・まとめて書き出し・PDF の体裁・PDF のクレジット行）は、
 * **どれも「ライセンスキーを入力」を選べる**（`src/shared/license/dialogChoices.ts`）。
 *
 * 購入したあと deep link で戻れなかった人が、どの機能から来ても、その場でキーを貼れるようにする
 * （2026-10-05: Word には出るが PDF には出ない、と指摘された）。
 */
import * as assert from 'assert';
import {
    lockedDialogButtons,
    decideLockedChoice,
    exportPromptButtons,
    decideExportPromptChoice
} from '../../../src/shared/license/dialogChoices';

const LABELS = { get: 'Get PRO+', enterKey: 'Enter license key' };
const EXPORT_LABELS = {
    exportFree: 'Export with credit line (free)',
    upgrade: 'Remove credit line (one-time purchase)',
    enterKey: 'Enter license key'
};

describe('PRO+ の購入案内: ライセンスキーを入力できる', () => {
    describe('機能のロック案内（Word・スライド・まとめて書き出し・PDF の体裁）', () => {
        it('「PRO+ なしで続ける」が無い機能（Word など）: 購入とキー入力の 2 つ', () => {
            assert.deepStrictEqual(lockedDialogButtons(LABELS), ['Get PRO+', 'Enter license key']);
        });

        it('「PRO+ なしで続ける」がある機能（PDF の体裁）でも、キー入力が出る: 購入・キー入力・続ける', () => {
            assert.deepStrictEqual(lockedDialogButtons(LABELS, 'Export without layout options'), [
                'Get PRO+',
                'Enter license key',
                'Export without layout options'
            ]);
        });

        it('選んだボタンを意図に直す', () => {
            const cont = 'Export without layout options';
            assert.strictEqual(decideLockedChoice('Get PRO+', LABELS, cont), 'upgrade');
            assert.strictEqual(decideLockedChoice('Enter license key', LABELS, cont), 'enterKey');
            assert.strictEqual(decideLockedChoice(cont, LABELS, cont), 'continue');
            assert.strictEqual(decideLockedChoice(undefined, LABELS, cont), 'cancel');
            assert.strictEqual(decideLockedChoice('Enter license key', LABELS), 'enterKey');
        });
    });

    describe('PDF のクレジット行の確認（書き出しの前）', () => {
        it('無料で出す・購入して消す・ライセンスキーを入力、の 3 つ', () => {
            assert.deepStrictEqual(exportPromptButtons(EXPORT_LABELS), [
                'Export with credit line (free)',
                'Remove credit line (one-time purchase)',
                'Enter license key'
            ]);
        });

        it('選んだボタンを意図に直す（閉じたら cancel）', () => {
            assert.strictEqual(decideExportPromptChoice('Export with credit line (free)', EXPORT_LABELS), 'export');
            assert.strictEqual(decideExportPromptChoice('Remove credit line (one-time purchase)', EXPORT_LABELS), 'upgrade');
            assert.strictEqual(decideExportPromptChoice('Enter license key', EXPORT_LABELS), 'enterKey');
            assert.strictEqual(decideExportPromptChoice(undefined, EXPORT_LABELS), 'cancel');
        });
    });
});
