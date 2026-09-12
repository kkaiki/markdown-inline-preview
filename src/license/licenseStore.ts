/**
 * ライセンス情報の保存と読み出し。
 *
 * トークンとライセンスキーは `context.secrets`（SecretStorage = OS のキーチェーンで暗号化）
 * に置く。`globalState` や設定ファイルは平文なので鍵類を置いてはいけない。
 *
 * 判定そのものは `src/shared/license/` の純関数が行う。ここは入出力だけ。
 */

import type * as vscode from 'vscode';
import { verifyLicenseToken, type LicenseVerifyResult } from '../shared/license/token';
import { LICENSE_PUBLIC_KEYS } from './publicKey';

const TOKEN_KEY = 'markdownInline.license.token';
const LICENSE_KEY = 'markdownInline.license.key';

export class LicenseStore {
    constructor(private readonly secrets: vscode.SecretStorage) {}

    async getToken(): Promise<string | undefined> {
        return this.secrets.get(TOKEN_KEY);
    }

    async storeToken(token: string): Promise<void> {
        await this.secrets.store(TOKEN_KEY, token);
    }

    async clearToken(): Promise<void> {
        await this.secrets.delete(TOKEN_KEY);
    }

    /** 静かな更新のために、償還に使ったキーを覚えておく。 */
    async getLicenseKey(): Promise<string | undefined> {
        return this.secrets.get(LICENSE_KEY);
    }

    async storeLicenseKey(key: string): Promise<void> {
        await this.secrets.store(LICENSE_KEY, key);
    }

    async clearAll(): Promise<void> {
        await this.secrets.delete(TOKEN_KEY);
        await this.secrets.delete(LICENSE_KEY);
    }

    /**
     * 保存済みトークンの検証結果。
     * トークンが無いときは `malformed`（＝「持っていない」も検証失敗の一種として扱う）。
     */
    async verify(nowSec: number = Math.floor(Date.now() / 1000)): Promise<LicenseVerifyResult> {
        const token = await this.getToken();
        if (!token) return { ok: false, reason: 'malformed' };
        return verifyLicenseToken(token, LICENSE_PUBLIC_KEYS, nowSec);
    }
}
