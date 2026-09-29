/**
 * ライセンス関連のコマンドと deep link ハンドラ。
 *
 * 導線は 3 本:
 *   1. 購入（ブラウザで Checkout → deep link で戻る）
 *   2. ライセンスキーの手入力（deep link が届かない環境のフォールバック。**必ず残す**）
 *   3. 購入の復元（Google ログイン。別 PC・再インストール）
 *
 * URI スキームは `vscode.env.uriScheme` から取る。`vscode://` と決め打つと
 * Cursor / VSCodium / Insiders で「買ったのに戻ってこない」事故になる。
 */

import * as vscode from 'vscode';
import {
    buildPurchaseUrl,
    buildRestoreUrl,
    parseActivationUri
} from '../shared/license/activationUri';
import { fetchEntitlement } from '../shared/license/client';
import { applyEntitlementOutcome } from '../shared/license/refresh';
import { needsTokenRefresh, shouldShowProBadge, MONETIZATION_ENABLED } from '../shared/license/entitlement';
import { verifyLicenseToken } from '../shared/license/token';
import { LICENSE_PUBLIC_KEYS } from './publicKey';
import { LicenseStore } from './licenseStore';
import { httpJson } from './httpJson';

/**
 * 既定のライセンスサーバー。Cloud Run の既定ドメイン（独自ドメインは取らない）。
 * GCP プロジェクト `ipreview-license` / asia-northeast1。
 */
const DEFAULT_BASE_URL = 'https://ipreview-license-949936782482.asia-northeast1.run.app';

/**
 * サーバーの URL は設定で上書きできるようにしておく。
 * Cloud Run の URL は移設で変わりうるので、定数だけにすると
 * 古いバージョンの拡張が恒久的に繋がらなくなる。
 */
function baseUrl(): string {
    const configured = vscode.workspace
        .getConfiguration('markdownInline')
        .get<string>('license.serverUrl', '')
        .trim();
    return configured || DEFAULT_BASE_URL;
}

/** 購入・復元 URL に付ける使い捨て値。 */
function newNonce(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Remote / Codespaces でも戻れるように `asExternalUri` を通す。
 * ローカルではそのまま返る。
 */
async function openInBrowser(url: string): Promise<void> {
    const external = await vscode.env.asExternalUri(vscode.Uri.parse(url));
    await vscode.env.openExternal(external);
}

/** 受け取ったトークンを検証して保存する。戻り値は成功したか。 */
async function acceptToken(store: LicenseStore, token: string): Promise<boolean> {
    const result = verifyLicenseToken(token, LICENSE_PUBLIC_KEYS, Math.floor(Date.now() / 1000));
    if (!result.ok) {
        void vscode.window.showErrorMessage(
            vscode.l10n.t('This license could not be verified ({0}).', result.reason)
        );
        return false;
    }

    await store.storeToken(token);
    void vscode.window.showInformationMessage(
        vscode.l10n.t('Thank you. Exported PDFs no longer include the credit line.')
    );
    return true;
}

/** ライセンスキーをサーバーで償還してトークンを保存する。 */
async function redeemKey(store: LicenseStore, key: string): Promise<void> {
    const outcome = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: vscode.l10n.t('Checking license…') },
        () => fetchEntitlement({ baseUrl: baseUrl(), licenseKey: key }, httpJson)
    );

    const decision = applyEntitlementOutcome(outcome, await store.getToken());

    switch (decision.action) {
        case 'store':
            await store.storeLicenseKey(key);
            await acceptToken(store, decision.token);
            return;

        case 'clear':
            await store.clearToken();
            void vscode.window.showWarningMessage(
                vscode.l10n.t('No purchase was found for this license key.')
            );
            return;

        case 'keep':
            void vscode.window.showErrorMessage(
                decision.notify === 'invalid-key'
                    ? vscode.l10n.t('That license key was not accepted. Please check it and try again.')
                    : vscode.l10n.t('Could not reach the license server. Please try again later.')
            );
            return;
    }
}

/**
 * 保存済みキーで静かにトークンを取り直す。
 * **失敗しても何も表示しない**（起動時やバックグラウンドで走るため）。
 */
export async function refreshLicenseQuietly(store: LicenseStore): Promise<void> {
    const current = await store.verify();
    if (!needsTokenRefresh(current, Math.floor(Date.now() / 1000))) return;

    const key = await store.getLicenseKey();
    if (!key) return; // キーを持っていなければ取り直しようがない

    try {
        const outcome = await fetchEntitlement({ baseUrl: baseUrl(), licenseKey: key }, httpJson);
        const decision = applyEntitlementOutcome(outcome, await store.getToken());

        if (decision.action === 'store') await store.storeToken(decision.token);
        if (decision.action === 'clear') await store.clearToken();
        // keep のときは何もしない（オフライン・障害）
    } catch {
        // 静かな更新なので握り潰す。exp まではローカル判定で Pro のまま。
    }
}

/**
 * 未購入かつ販売中のときだけ出す「PRO+」ステータスバー項目。
 * クリックで購入ページを開く（`markdownInline.upgradeToPro` と同じ導線）。
 */
function createProStatusBarItem(): vscode.StatusBarItem {
    const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 0);
    item.name = vscode.l10n.t('iPreview Pro');
    item.text = '$(star-full) PRO+';
    item.tooltip = vscode.l10n.t('PDF export is free. Click to remove the credit line (one-time purchase).');
    item.command = 'markdownInline.upgradeToPro';
    item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    return item;
}

export function registerLicenseCommands(context: vscode.ExtensionContext): LicenseStore {
    const store = new LicenseStore(context.secrets);
    const statusBarItem = createProStatusBarItem();

    /** ステータスバーの表示・非表示を、保存済みトークンから再評価する。 */
    const refreshStatusBar = async (): Promise<void> => {
        const license = await store.verify();
        if (shouldShowProBadge({ license, monetizationEnabled: MONETIZATION_ENABLED })) {
            statusBarItem.show();
        } else {
            statusBarItem.hide();
        }
    };

    const openPurchasePage = async (): Promise<void> => {
        await openInBrowser(
            buildPurchaseUrl({
                baseUrl: baseUrl(),
                nonce: newNonce(),
                uriScheme: vscode.env.uriScheme,
                language: vscode.env.language
            })
        );
    };

    context.subscriptions.push(
        statusBarItem,

        vscode.commands.registerCommand('markdownInline.removePdfCredit', openPurchasePage),

        // ステータスバー・What's New・書き出し前の確認ダイアログなど、
        // 「Pro を示唆する入り口」はどれもこのコマンドへ揃える（購入ページは removePdfCredit と同じ）。
        vscode.commands.registerCommand('markdownInline.upgradeToPro', openPurchasePage),

        vscode.commands.registerCommand('markdownInline.enterLicenseKey', async () => {
            const key = await vscode.window.showInputBox({
                title: vscode.l10n.t('Enter License Key'),
                prompt: vscode.l10n.t('Paste the license key shown after your purchase.'),
                placeHolder: 'IPVW-XXXX-XXXX-XXXX',
                ignoreFocusOut: true
            });
            if (!key?.trim()) return;
            await redeemKey(store, key.trim());
            // PRO+ のコマンド（Marp 書き出しなど）は販売開始後だけコマンドパレットに出す
    void vscode.commands.executeCommand('setContext', 'markdownInline.proPlusOnSale', MONETIZATION_ENABLED);
    void refreshStatusBar();
        }),

        vscode.commands.registerCommand('markdownInline.restorePurchase', async () => {
            await openInBrowser(
                buildRestoreUrl({
                    baseUrl: baseUrl(),
                    nonce: newNonce(),
                    uriScheme: vscode.env.uriScheme
                })
            );
        }),

        vscode.window.registerUriHandler({
            handleUri(uri) {
                const parsed = parseActivationUri({ path: uri.path, query: uri.query });
                if (!parsed) return; // 知らない deep link は黙って無視する
                void acceptToken(store, parsed.token).then(() => refreshStatusBar());
            }
        }),

        // 返金（トークン削除）・別コマンドからの償還など、どの経路の変化も拾う。
        context.secrets.onDidChange(() => void refreshStatusBar())
    );

    void refreshStatusBar();
    // 起動時に一度だけ静かに更新する。失敗しても何も起きない。
    void refreshLicenseQuietly(store).then(() => refreshStatusBar());

    return store;
}
