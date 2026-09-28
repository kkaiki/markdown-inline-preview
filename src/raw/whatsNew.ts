import * as vscode from 'vscode';
import { shouldShowProBadge, MONETIZATION_ENABLED } from '../shared/license/entitlement';
import type { LicenseVerifyResult } from '../shared/license/token';

/**
 * 更新時に「What's New」通知を出す。
 *
 * VS Code/Cursor は拡張を自動・無音で更新するため、新機能はユーザーに気づかれにくい。
 * 起動時に前回起動時のバージョン（globalState）と現バージョンを比べ、上がっていれば
 * 1 度だけ通知し、CHANGELOG / Walkthrough へ誘導する。
 *
 * 未購入かつ販売中のときは、これに「PDF のクレジット行を消す」への導線も添える
 * （ユーザー要望 2026-09-28: What's New から Pro への導線）。
 */
const LAST_VERSION_KEY = 'ipreview.lastVersion';

function parseVersion(v: string): number[] {
    return v.split('.').map(n => parseInt(n, 10) || 0);
}

/** a < b なら true（セマンティックな数値比較。プレリリース表記は無視）。 */
function isOlder(a: string, b: string): boolean {
    const pa = parseVersion(a);
    const pb = parseVersion(b);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
        const x = pa[i] ?? 0;
        const y = pb[i] ?? 0;
        if (x !== y) return x < y;
    }
    return false;
}

/** ライセンス状態を読む窓口。`context.secrets` に依存させないため、必要最小限の形にしている。 */
export interface LicenseStoreLike {
    verify(): Promise<LicenseVerifyResult>;
}

export function showWhatsNewIfUpdated(context: vscode.ExtensionContext, licenseStore?: LicenseStoreLike): void {
    const current = String(context.extension.packageJSON.version ?? '');
    if (!current) return;

    const previous = context.globalState.get<string>(LAST_VERSION_KEY);
    // 現バージョンを記録（次回比較用）。通知を出す/出さないに関わらず更新する。
    void context.globalState.update(LAST_VERSION_KEY, current);

    // 初回インストール（previous 無し）は通知しない（うるさいだけ）。
    if (!previous) return;
    if (!isOlder(previous, current)) return;

    void (async () => {
        const license = (await licenseStore?.verify().catch(() => undefined)) ?? { ok: false, reason: 'malformed' };
        const offerPro = shouldShowProBadge({ license, monetizationEnabled: MONETIZATION_ENABLED });

        const changelog = vscode.l10n.t('Release notes');
        const walkthrough = vscode.l10n.t('Getting started');
        const removeCredit = vscode.l10n.t('Remove PDF credit line');
        const buttons = offerPro ? [changelog, walkthrough, removeCredit] : [changelog, walkthrough];

        const choice = await vscode.window.showInformationMessage(
            vscode.l10n.t("iPreview has been updated to v{0}. Check out what's new.", current),
            ...buttons
        );

        if (choice === changelog) {
            openChangelog(context);
        } else if (choice === walkthrough) {
            void vscode.commands.executeCommand(
                'workbench.action.openWalkthrough',
                `${context.extension.id}#ipreview.gettingStarted`,
                false
            );
        } else if (offerPro && choice === removeCredit) {
            void vscode.commands.executeCommand('markdownInline.upgradeToPro');
        }
    })();
}

function openChangelog(context: vscode.ExtensionContext): void {
    const uri = vscode.Uri.joinPath(context.extensionUri, 'CHANGELOG.md');
    // Markdown のプレビューで開く（読みやすさ優先）。失敗時は通常のエディタで開く。
    void vscode.commands.executeCommand('markdown.showPreview', uri).then(undefined, () => {
        void vscode.window.showTextDocument(uri);
    });
}
