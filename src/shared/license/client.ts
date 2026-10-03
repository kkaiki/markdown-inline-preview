/**
 * ライセンスサーバーへの問い合わせ（純関数 + 注入されたポート）。
 *
 * HTTP を直接叩かず `FetchJson` を受け取るのは 2 つの理由から:
 *   - VS Code 1.74 が同梱する Node 16 には global fetch が無い
 *     （実装は `src/license/httpJson.ts` が `https` モジュールで用意する）
 *   - サーバー障害・壊れたレスポンスの扱いを、実サーバー無しでテストしたい
 *
 * **「繋がらない」と「買っていない」を絶対に混同しない。** 混同すると、ネットワークが
 * 不安定なだけで購入者の PDF にクレジット行が戻ってしまう。判定できなかったときは
 * `unavailable` を返し、呼び出し側は**保存済みトークンをそのまま使い続ける**。
 */

export interface FetchJsonResponse {
    status: number;
    /** JSON として解釈できたときはその値。できなければ生の文字列 */
    body: unknown;
}

export type FetchJson = (
    url: string,
    init: { method: string; headers: Record<string, string>; body: string }
) => Promise<FetchJsonResponse>;

export type EntitlementOutcome =
    /** 権利がある。トークンを保存してよい */
    | { kind: 'entitled'; token: string }
    /** サーバーが「買っていない」と答えた。保存済みトークンは破棄してよい */
    | { kind: 'not-entitled' }
    /** キーの形が違う等。再試行しても無駄 */
    | { kind: 'invalid-request' }
    /** 判定できなかった。**保存済みトークンを維持する** */
    | { kind: 'unavailable' };

export interface EntitlementRequest {
    baseUrl: string;
    licenseKey: string;
}

export async function fetchEntitlement(
    request: EntitlementRequest,
    fetchJson: FetchJson
): Promise<EntitlementOutcome> {
    const base = request.baseUrl.endsWith('/') ? request.baseUrl.slice(0, -1) : request.baseUrl;

    let response: FetchJsonResponse;
    try {
        response = await fetchJson(`${base}/api/entitlement`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ licenseKey: request.licenseKey })
        });
    } catch {
        return { kind: 'unavailable' };
    }

    // 429 は混み合っているだけ。キーの問題ではないので、保存済みトークンを維持する。
    if (response.status === 429) return { kind: 'unavailable' };
    // 4xx は「こちらの送り方が悪い」。再試行しても直らないので区別する。
    if (response.status >= 400 && response.status < 500) return { kind: 'invalid-request' };
    if (response.status !== 200) return { kind: 'unavailable' };

    const body = response.body;
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        // プロキシの HTML エラーページなど
        return { kind: 'unavailable' };
    }

    const entitled = (body as Record<string, unknown>)['entitled'];
    if (typeof entitled !== 'boolean') return { kind: 'unavailable' };
    if (!entitled) return { kind: 'not-entitled' };

    const token = (body as Record<string, unknown>)['token'];
    // entitled: true なのにトークンが無い＝サーバーの不具合。誤って Pro 扱いにしない。
    if (typeof token !== 'string' || token === '') return { kind: 'unavailable' };

    return { kind: 'entitled', token };
}
