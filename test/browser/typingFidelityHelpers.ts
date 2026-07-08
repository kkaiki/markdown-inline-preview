/**
 * 「タイプ中の各時点」を厳密一致（`assert.strictEqual`）で検証するための共通ヘルパー。
 *
 * 既存のテスト（basicOperations/editingOperations 等）は最終結果の構造を `includes` で
 * 見ているだけで、途中経過や 1 文字単位の過不足は検出できない。ここでは 1 打鍵
 * （または IME の 1 確定）ごとに doc 全体のテキストを期待値と突き合わせ、崩れた瞬間の
 * キーストロークを特定できるようにする。
 */
import * as assert from 'assert';
import type { CDPSession } from 'playwright';
import type { PreviewHandle } from './previewBrowserHarness';

/**
 * `text` を 1 文字（Unicode コードポイント単位。サロゲートペアの絵文字も 1 文字として
 * 扱う）ずつタイプし、打つたびに `getSnapshot()` の結果を `expectedAt(typedSoFar)` の
 * 返り値と厳密一致で比較する。
 *
 * @param expectedAt 「ここまで typed した文字列」を受け取り、そのステップで doc 全体が
 *   こうなっているべき、という期待値（doc 全体のテキスト）を返す関数。
 */
export async function typeCharByCharExact(
    h: PreviewHandle,
    text: string,
    getSnapshot: () => Promise<string>,
    expectedAt: (typedSoFar: string) => string
): Promise<void> {
    const chars = Array.from(text);
    let typedSoFar = '';
    let index = 0;
    for (const ch of chars) {
        index++;
        await h.type(ch);
        typedSoFar += ch;
        const expected = expectedAt(typedSoFar);
        const actual = await getSnapshot();
        assert.strictEqual(
            actual,
            expected,
            `${index}文字目 "${ch}" を打った直後に不一致\n期待: ${JSON.stringify(expected)}\n実際: ${JSON.stringify(actual)}`
        );
    }
}

/** CDP で 1 回分の IME 変換確定をエミュレートする（`imeSequentialConversionDuplication.test.ts` と同じ手順）。 */
export async function imeCommit(handle: PreviewHandle, text: string): Promise<void> {
    const client: CDPSession = await handle.page.context().newCDPSession(handle.page);
    await client.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length });
    await handle.page.waitForTimeout(80);
    await client.send('Input.insertText', { text });
    await handle.page.waitForTimeout(120);
    await client.detach();
}

/**
 * `segments` を 1 セグメントずつ IME 確定し、確定するたびに `getSnapshot()` の結果を
 * `expectedAt(committedSoFar)` の返り値と厳密一致で比較する。
 */
export async function commitByCommitExact(
    h: PreviewHandle,
    segments: string[],
    getSnapshot: () => Promise<string>,
    expectedAt: (committedSoFar: string) => string
): Promise<void> {
    let committedSoFar = '';
    let index = 0;
    for (const seg of segments) {
        index++;
        await imeCommit(h, seg);
        committedSoFar += seg;
        const expected = expectedAt(committedSoFar);
        const actual = await getSnapshot();
        assert.strictEqual(
            actual,
            expected,
            `${index}回目の確定 "${seg}" の直後に不一致\n期待: ${JSON.stringify(expected)}\n実際: ${JSON.stringify(actual)}`
        );
    }
}
