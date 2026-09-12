/**
 * `FetchJson` ポートの実装。
 *
 * **global fetch を使わない。** この拡張は `engines.vscode: ^1.74.0` を維持しており、
 * その頃の VS Code が同梱する Node 16 には global fetch が無い。ここで `https` を使うことで、
 * 古い VS Code の利用者を切り捨てずに済む（60k インストールの一部は古い環境にいる）。
 */

import * as https from 'https';
import { URL } from 'url';
import type { FetchJson, FetchJsonResponse } from '../shared/license/client';

/** 応答を待つ上限。購入・キー入力はユーザーが待っている場面なので短めにする。 */
const TIMEOUT_MS = 10_000;

export const httpJson: FetchJson = (url, init) =>
    new Promise<FetchJsonResponse>((resolve, reject) => {
        const target = new URL(url);
        if (target.protocol !== 'https:') {
            reject(new Error(`refusing non-https license endpoint: ${target.protocol}`));
            return;
        }

        const request = https.request(
            {
                hostname: target.hostname,
                port: target.port || 443,
                path: `${target.pathname}${target.search}`,
                method: init.method,
                headers: {
                    ...init.headers,
                    'Content-Length': Buffer.byteLength(init.body).toString()
                },
                timeout: TIMEOUT_MS
            },
            (response) => {
                const chunks: Buffer[] = [];
                response.on('data', (chunk: Buffer) => chunks.push(chunk));
                response.on('end', () => {
                    const text = Buffer.concat(chunks).toString('utf-8');
                    let body: unknown = text;
                    try {
                        body = JSON.parse(text);
                    } catch {
                        // JSON でなければ生の文字列のまま渡す。
                        // 呼び出し側（client.ts）が unavailable として扱う。
                    }
                    resolve({ status: response.statusCode ?? 0, body });
                });
            }
        );

        request.on('timeout', () => request.destroy(new Error('license request timed out')));
        request.on('error', reject);
        request.write(init.body);
        request.end();
    });
