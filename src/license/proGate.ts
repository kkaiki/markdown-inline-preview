/**
 * PRO+ の機能がロック中（販売中・未購入）のときに出す購入案内。
 *
 * 使えるかどうかの判定は純関数 `proFeatureAccess`（src/shared/license/entitlement.ts）。
 * ここは「ロック中」と判定されたあとのモーダルだけを担う
 * （docs/private/specifications/pro-export-pdf-onetime.md §1「未購入のとき」）。
 */
import * as vscode from 'vscode';
import { lockedDialogButtons, decideLockedChoice } from '../shared/license/dialogChoices';

/** `upgrade` は購入ページを開き、`enterKey` はキーの入力を出した。どちらも今回の操作は行わない。 */
export type ProLockedDecision = 'upgrade' | 'enterKey' | 'continue' | 'cancel';

/**
 * 「{機能} は PRO+ の機能です」を出す。
 * ボタンは「購入」「ライセンスキーを入力」。`continueLabel` を渡すと「PRO+ なしで続ける」も足す
 * （PDF の体裁のように、無しでも書き出せる機能用）。**どの機能でもキー入力を出す**。
 */
export async function showProLockedDialog(featureLabel: string, continueLabel?: string): Promise<ProLockedDecision> {
    const labels = { get: vscode.l10n.t('Get PRO+'), enterKey: vscode.l10n.t('Enter license key') };

    const choice = await vscode.window.showInformationMessage(
        vscode.l10n.t('{0} is a PRO+ feature.', featureLabel),
        {
            modal: true,
            detail: vscode.l10n.t(
                'PRO+ is a one-time purchase (¥150 / $1) with no subscription. It removes the PDF credit line and adds PDF layout options, Word (.docx) export, batch export and Marp slide export. Purchases are not refundable, so please try the free PDF export first.'
            )
        },
        ...lockedDialogButtons(labels, continueLabel)
    );

    const decision = decideLockedChoice(choice, labels, continueLabel);
    if (decision === 'upgrade') await vscode.commands.executeCommand('markdownInline.upgradeToPro');
    if (decision === 'enterKey') await vscode.commands.executeCommand('markdownInline.enterLicenseKey');
    return decision;
}
