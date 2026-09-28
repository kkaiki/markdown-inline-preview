/**
 * PRO+ の機能がロック中（販売中・未購入）のときに出す購入案内。
 *
 * 使えるかどうかの判定は純関数 `proFeatureAccess`（src/shared/license/entitlement.ts）。
 * ここは「ロック中」と判定されたあとのモーダルだけを担う
 * （docs/private/specifications/pro-export-pdf-onetime.md §1「未購入のとき」）。
 */
import * as vscode from 'vscode';

export type ProLockedDecision = 'upgrade' | 'continue' | 'cancel';

/**
 * 「{機能} は PRO+ の機能です」を出す。
 * `continueLabel` を渡すと「PRO+ なしで続ける」選択肢を足す（PDF の体裁のように、無しでも書き出せる機能用）。
 * 渡さないときは購入とライセンスキー入力だけ。
 */
export async function showProLockedDialog(featureLabel: string, continueLabel?: string): Promise<ProLockedDecision> {
    const getLabel = vscode.l10n.t('Get PRO+');
    const enterKeyLabel = vscode.l10n.t('Enter license key');
    const second = continueLabel ?? enterKeyLabel;

    const choice = await vscode.window.showInformationMessage(
        vscode.l10n.t('{0} is a PRO+ feature.', featureLabel),
        {
            modal: true,
            detail: vscode.l10n.t(
                'PRO+ is a one-time purchase (¥100 / $1 / €1) with no subscription. It removes the PDF credit line and adds PDF layout options, Word (.docx) export, batch export and Marp slide export.'
            )
        },
        getLabel,
        second
    );

    if (choice === getLabel) {
        await vscode.commands.executeCommand('markdownInline.upgradeToPro');
        return 'upgrade';
    }
    if (choice === second) {
        if (continueLabel) return 'continue';
        await vscode.commands.executeCommand('markdownInline.enterLicenseKey');
        return 'cancel';
    }
    return 'cancel';
}
