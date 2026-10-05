/**
 * リストのインデント（Tab / Shift+Tab）の幅の決め方。Raw と Live で共通。
 *
 * 設定 `markdownInline.indentation`:
 *   - `default` … 従来どおり（Raw は半角スペース 2 つ、Live はタブ 1 文字）。既存の見た目を変えない
 *   - `editor`  … VS Code の `editor.tabSize` / `editor.insertSpaces` に従う（GitHub イシュー #3 の要望）
 */

export type IndentationMode = 'default' | 'editor';

/** インデントの 1 単位（挿入する文字列）と、タブの見た目の幅。 */
export interface IndentStyle {
    unit: string;
    tabSize: number;
}

/** VS Code の `TextEditorOptions` / 設定値の形（文字列や未指定もありうる）。 */
export interface EditorIndentOptions {
    tabSize?: number | string;
    insertSpaces?: boolean | string;
}

export const LEGACY_RAW_INDENT: IndentStyle = { unit: '  ', tabSize: 2 };
export const LEGACY_LIVE_INDENT: IndentStyle = { unit: '\t', tabSize: 4 };

const DEFAULT_TAB_SIZE = 4;

function normalizeTabSize(value: number | string | undefined): number {
    const n = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseInt(value, 10) : NaN;
    if (!Number.isFinite(n)) return DEFAULT_TAB_SIZE; // "auto" や未指定
    return Math.min(8, Math.max(1, Math.trunc(n)));
}

function normalizeInsertSpaces(value: boolean | string | undefined): boolean {
    if (typeof value === 'boolean') return value;
    return value !== 'false'; // "auto" や未指定は、VS Code の既定（スペース）
}

/** 設定に応じたインデントの 1 単位。`legacy` は `default` のときの従来の値。 */
export function resolveIndentStyle(
    mode: IndentationMode,
    options: EditorIndentOptions | undefined,
    legacy: IndentStyle
): IndentStyle {
    if (mode !== 'editor') return legacy;
    const tabSize = normalizeTabSize(options?.tabSize);
    const insertSpaces = normalizeInsertSpaces(options?.insertSpaces);
    return { unit: insertSpaces ? ' '.repeat(tabSize) : '\t', tabSize };
}

/** 行頭にインデントを 1 単位足す。 */
export function indentLine(line: string, style: IndentStyle): string {
    return style.unit + line;
}

/** 行頭のインデントを 1 単位減らす（タブが先ならタブ 1 つ、スペースなら tabSize 個まで）。 */
export function outdentLine(line: string, style: IndentStyle): string {
    if (line.startsWith('\t')) return line.slice(1);
    const spaces = /^ */.exec(line)?.[0].length ?? 0;
    return line.slice(Math.min(spaces, style.tabSize));
}
