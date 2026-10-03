/**
 * ライセンストークン（Ed25519 署名）の検証。
 *
 * 拡張は**公開鍵しか持たない**。サーバーが落ちていても、オフラインでも、`exp` までは
 * 購入者としてふるまえる必要があるため、判定は完全にローカルの純関数で行う。
 * PDF 書き出しの直前にネットワークへ出ないのはこのため（出力を待たせない）。
 *
 * トークン形式（JWT に似せているが header は持たない）:
 *
 *     base64url(JSON.stringify(claims)) + "." + base64url(ed25519Signature)
 *
 * 署名対象は **左側の base64url 文字列を ASCII バイト列にしたもの**。
 * この規約はライセンスサーバーと共有するので、`encodeClaims` / `assembleToken` を
 * export してテストからも同じ手順で組み立てられるようにしてある。
 *
 * VS Code API には依存しないが Node の `crypto` は使う。webview バンドル
 * (`src/live/webview/liveApp.ts` 起点) からは import しないこと。
 */

import { createPublicKey, verify as cryptoVerify, type KeyObject } from 'crypto';

/** 現在サポートするトークンのバージョン。 */
export const LICENSE_TOKEN_VERSION = 1;

/** PDF のクレジット行を消す権利。 */
export const FEATURE_PDF_NO_CREDIT = 'pdf-nocredit';
export const FEATURE_PDF_STYLING = 'pdf-styling';
export const FEATURE_DOCX_EXPORT = 'docx-export';
export const FEATURE_BATCH_EXPORT = 'batch-export';
export const FEATURE_MARP_EXPORT = 'marp-export';

/**
 * PRO+（買い切り ¥150 / $1）で解放される機能。サーバー
 * （ipreview-license/lib/licenseToken.ts の同名定数）と同じ文字列・同じ並びにする契約。
 */
export const PRO_PLUS_FEATURES: readonly string[] = [
    FEATURE_PDF_NO_CREDIT,
    FEATURE_PDF_STYLING,
    FEATURE_DOCX_EXPORT,
    FEATURE_BATCH_EXPORT,
    FEATURE_MARP_EXPORT
];

/**
 * 端末の時計がサーバーより進んでいても弾かないための許容幅。
 * これを超えて `iat` が未来のトークンは異常値として拒否する。
 */
const CLOCK_SKEW_TOLERANCE_SEC = 2 * 86_400;

export interface LicenseClaims {
    /** トークン形式のバージョン */
    v: number;
    /** サーバー側のユーザー ID */
    sub: string;
    /** 購入時のメールアドレス（アカウント表示用） */
    email: string;
    /** 解放されている機能 */
    features: string[];
    /** 発行時刻（UNIX 秒） */
    iat: number;
    /** 失効時刻（UNIX 秒）。通常は発行から 30 日 */
    exp: number;
}

export type LicenseVerifyFailure =
    | 'malformed'
    | 'bad-signature'
    | 'unsupported-version'
    | 'not-yet-valid'
    | 'expired';

export type LicenseVerifyResult =
    | { ok: true; claims: LicenseClaims }
    | { ok: false; reason: LicenseVerifyFailure };

/** claims を署名対象の base64url 文字列にする（サーバーと共有する規約）。 */
export function encodeClaims(claims: LicenseClaims): string {
    return Buffer.from(JSON.stringify(claims), 'utf-8').toString('base64url');
}

/** 署名済みトークンの文字列を組み立てる。 */
export function assembleToken(payloadB64: string, signatureB64: string): string {
    return `${payloadB64}.${signatureB64}`;
}

/** base64url の payload を claims に戻す。形が違えば null。 */
function decodeClaims(payloadB64: string): LicenseClaims | null {
    let json: string;
    try {
        const buf = Buffer.from(payloadB64, 'base64url');
        if (buf.length === 0) return null;
        json = buf.toString('utf-8');
    } catch {
        return null;
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch {
        return null;
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

    const c = parsed as Record<string, unknown>;
    if (typeof c['v'] !== 'number') return null;
    if (typeof c['sub'] !== 'string' || typeof c['email'] !== 'string') return null;
    if (typeof c['iat'] !== 'number' || typeof c['exp'] !== 'number') return null;
    if (!Array.isArray(c['features']) || c['features'].some((f) => typeof f !== 'string')) return null;

    return {
        v: c['v'],
        sub: c['sub'],
        email: c['email'],
        features: c['features'] as string[],
        iat: c['iat'],
        exp: c['exp']
    };
}

/**
 * 登録済みの公開鍵のどれか 1 つで署名が検証できれば true。
 * 鍵ローテーション中は新旧 2 本を並べておけば、どちらで署名されたトークンも通る。
 * 壊れた PEM が混ざっていても、その鍵を飛ばして次を試す。
 */
function verifySignature(payloadB64: string, signatureB64: string, publicKeysPem: string[]): boolean {
    let signature: Buffer;
    try {
        signature = Buffer.from(signatureB64, 'base64url');
    } catch {
        return false;
    }
    if (signature.length === 0) return false;

    const data = Buffer.from(payloadB64, 'ascii');

    for (const pem of publicKeysPem) {
        let key: KeyObject;
        try {
            key = createPublicKey(pem);
        } catch {
            continue; // 壊れた鍵は無視して次へ
        }
        try {
            // Ed25519 はアルゴリズム引数に null を渡す
            if (cryptoVerify(null, data, key, signature)) return true;
        } catch {
            continue; // 鍵種別違い・署名長違いなど
        }
    }
    return false;
}

/**
 * トークンを検証する。
 *
 * 検証順は「構造 → 署名 → 意味」。署名を確かめる前に claims の中身で分岐しない
 * （中身を信用してよいのは署名が通ってから）。
 *
 * @param nowSec 現在時刻（UNIX 秒）。テストのために引数で受け取る
 */
export function verifyLicenseToken(
    token: string,
    publicKeysPem: string[],
    nowSec: number
): LicenseVerifyResult {
    const parts = token.split('.');
    if (parts.length !== 2 || parts[0] === '' || parts[1] === '') {
        return { ok: false, reason: 'malformed' };
    }
    const [payloadB64, signatureB64] = parts;

    const claims = decodeClaims(payloadB64);
    if (!claims) return { ok: false, reason: 'malformed' };

    if (!verifySignature(payloadB64, signatureB64, publicKeysPem)) {
        return { ok: false, reason: 'bad-signature' };
    }

    if (claims.v !== LICENSE_TOKEN_VERSION) {
        return { ok: false, reason: 'unsupported-version' };
    }
    if (claims.iat > nowSec + CLOCK_SKEW_TOLERANCE_SEC) {
        return { ok: false, reason: 'not-yet-valid' };
    }
    if (claims.exp < nowSec) {
        return { ok: false, reason: 'expired' };
    }

    return { ok: true, claims };
}

/** 検証に成功したトークンが指定の機能を含むか。失敗した結果は常に false。 */
export function hasFeature(result: LicenseVerifyResult, feature: string): boolean {
    return result.ok && result.claims.features.includes(feature);
}

/**
 * 失敗結果への絞り込み。
 *
 * `strictNullChecks` が無効な tsconfig（`tsconfig.test.json`）では `if (!result.ok)` による
 * 判別可能ユニオンの絞り込みが効かないため、型述語として明示する。
 */
export function isLicenseFailure(
    result: LicenseVerifyResult
): result is { ok: false; reason: LicenseVerifyFailure } {
    return !result.ok;
}
