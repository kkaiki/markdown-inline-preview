/**
 * 購入・復元の URL 組み立てと、ブラウザから戻ってくる deep link の解釈（純関数）。
 *
 * **URI スキームをハードコードしない**のが要点。`vscode://` と決め打つと Cursor /
 * VSCodium / VS Code Insiders でアクティベートが届かず、購入したのに解放されない事故になる。
 * 呼び出し側が `vscode.env.uriScheme` を渡し、ここはそれを組み立てるだけにする。
 *
 * deep link は外部から来る文字列なので、想定した path / query 以外は必ず null を返す。
 */

import { randomBytes } from 'crypto';

/** `package.json` の `publisher`.`name`。deep link のホスト部になる。 */
export const EXTENSION_ID = 'markdown-inline-preview.markdown-inline-preview';

/** 末尾スラッシュの有無によらず `<base>/<path>` を組む。 */
function joinUrl(baseUrl: string, path: string): URL {
    return new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
}

export interface PurchaseUrlOptions {
    /** ライセンスサーバーのベース URL */
    baseUrl: string;
    /** 拡張が発行した使い捨て値。購入完了をこのセッションに結び付ける */
    nonce: string;
    /** `vscode.env.uriScheme`（vscode / cursor / vscode-insiders / vscodium …） */
    uriScheme: string;
    /** `vscode.env.language`。購入ページの言語と既定通貨の判定に使う */
    language: string;
}

/**
 * 購入の入口の URL。ブラウザで開く。
 * `/buy` ではなくホームページ（`/`）を開く。`/buy` は未ログインだと Google ログインへ直送するので、
 * 開いた直後にログインを求められてしまう。ホームの購入ボタンを押して初めてログインに進む。
 * nonce と uri_scheme はホームが購入ボタンへ引き継ぐ。
 */
export function buildPurchaseUrl(options: PurchaseUrlOptions): string {
    const url = joinUrl(options.baseUrl, '');
    url.searchParams.set('nonce', options.nonce);
    url.searchParams.set('uri_scheme', options.uriScheme);
    url.searchParams.set('lang', options.language);
    return url.toString();
}

export interface RestoreUrlOptions {
    baseUrl: string;
    nonce: string;
    uriScheme: string;
}

/** 購入の復元（別 PC・再インストール）のための URL。Google ログインを経由する。 */
export function buildRestoreUrl(options: RestoreUrlOptions): string {
    const url = joinUrl(options.baseUrl, 'activate');
    url.searchParams.set('nonce', options.nonce);
    url.searchParams.set('uri_scheme', options.uriScheme);
    url.searchParams.set('restore', '1');
    return url.toString();
}

/**
 * サーバーがブラウザから拡張へ戻すための deep link。
 * サーバー側の実装と食い違わないよう、組み立ての定義をここに置いて共有する。
 */
export function buildActivationRedirect(options: { uriScheme: string; token: string; key?: string }): string {
    const base = `${options.uriScheme}://${EXTENSION_ID}/activate?token=${encodeURIComponent(options.token)}`;
    // key は 30 日後の静かな更新に要る（トークンだけでは取り直せない）
    return options.key ? `${base}&key=${encodeURIComponent(options.key)}` : base;
}

/** `IPVW-XXXX-XXXX-XXXX`（サーバーの `isLicenseKeyShape` と同じ形）。 */
const LICENSE_KEY_SHAPE = /^IPVW(-[0-9A-F]{4}){3}$/;

/**
 * 購入・復元 URL に付ける使い捨て値。128bit の暗号論的乱数。
 * nonce だけで購入のライセンスキーが見えるページがあるので、推測できる値にしてはいけない。
 */
export function generateNonce(random: (size: number) => Buffer = randomBytes): string {
    return random(16).toString('base64url');
}

/**
 * `vscode.window.registerUriHandler` が受け取った URI を解釈する。
 * `/activate?token=…` 以外は null（無視する）。
 */
export function parseActivationUri(uri: { path: string; query: string }): { token: string; key?: string } | null {
    if (uri.path.replace(/^\/+/, '') !== 'activate') return null;

    const params = new URLSearchParams(uri.query);
    const token = params.get('token');
    if (!token) return null;

    const key = params.get('key');
    // 形の違う key は捨てる（外から来る文字列を SecretStorage に入れない）
    return key && LICENSE_KEY_SHAPE.test(key) ? { token, key } : { token };
}
