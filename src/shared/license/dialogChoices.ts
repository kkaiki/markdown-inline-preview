/**
 * PRO+ の購入案内のダイアログのボタンの並びと、選んだボタンの解釈（`vscode` に依存しない純関数）。
 *
 * **どのダイアログにも「ライセンスキーを入力」を出す**。購入後に deep link で戻れなかった人が、
 * どの機能（Word・スライド・まとめて書き出し・PDF の体裁・PDF のクレジット行）から来ても、
 * その場でキーを貼れるようにするため。
 */

export interface LockedLabels {
    get: string;
    enterKey: string;
}

export type LockedChoice = 'upgrade' | 'enterKey' | 'continue' | 'cancel';

/** 機能のロック案内のボタン。「PRO+ なしで続ける」は、無くても使える機能（PDF の体裁）だけ。 */
export function lockedDialogButtons(labels: LockedLabels, continueLabel?: string): string[] {
    return continueLabel ? [labels.get, labels.enterKey, continueLabel] : [labels.get, labels.enterKey];
}

export function decideLockedChoice(
    choice: string | undefined,
    labels: LockedLabels,
    continueLabel?: string
): LockedChoice {
    if (choice === labels.get) return 'upgrade';
    if (choice === labels.enterKey) return 'enterKey';
    if (continueLabel && choice === continueLabel) return 'continue';
    return 'cancel'; // Esc・ダイアログを閉じた
}

export interface ExportPromptLabels {
    exportFree: string;
    upgrade: string;
    enterKey: string;
}

export type ExportPromptChoice = 'export' | 'upgrade' | 'enterKey' | 'cancel';

/** PDF を書き出す前の「クレジット行つきで出すか」の確認のボタン。 */
export function exportPromptButtons(labels: ExportPromptLabels): string[] {
    return [labels.exportFree, labels.upgrade, labels.enterKey];
}

export function decideExportPromptChoice(choice: string | undefined, labels: ExportPromptLabels): ExportPromptChoice {
    if (choice === labels.exportFree) return 'export';
    if (choice === labels.upgrade) return 'upgrade';
    if (choice === labels.enterKey) return 'enterKey';
    return 'cancel';
}
