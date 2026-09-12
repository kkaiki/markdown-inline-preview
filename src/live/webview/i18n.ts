/**
 * webview 側の翻訳関数。host から届いたロケール（`vscode.env.language`）を覚えておき、
 * UI 文字列を訳す。既定は英語（ソース文字列そのまま）。
 *
 * 辞書は `src/live/shared/webviewStrings.ts`。
 */
import { createTranslator, type Translate } from '../shared/webviewStrings';

let translate: Translate = createTranslator(undefined);

/** host の `init` で受け取ったロケールを反映する。 */
export function setWebviewLocale(locale: string | undefined): void {
    translate = createTranslator(locale);
}

/** 英語のソース文字列を、現在のロケールの文字列にする。 */
export function t(source: string): string {
    return translate(source);
}
