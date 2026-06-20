/**
 * Utilities Index
 * 全てのユーティリティモジュールをエクスポート
 */

// パターン関連
export {
    patterns,
    getLineType,
    getMarkerInfo,
    extractNumberedList,
    extractCheckbox,
    extractHeading,
    isListItem,
    isSeparatorRow
} from './patterns';

// 文字幅関連
export {
    isZeroWidthCombining,
    isFullWidthCodePoint,
    isNarrowChar,
    isWideChar,
    getStringWidth,
    getDisplayWidthWithHeuristics,
    padCell
} from './width';

// テーブル関連
export {
    splitTableLine,
    getAllTableCells,
    getTableCellInfo,
    findTableBlock,
    parseTableRows,
    formatTableRow,
    calculateColumnWidths
} from './table';

// 目次関連
export {
    generateSlug,
    collectHeadings,
    collectHeadingsFromText,
    generateTableOfContents,
    findTocMarker,
    findTocSection
} from './toc';

// スラッシュコマンド関連
export {
    parseSlashCommandLine,
    parseHeadingSlashCommand,
    parseTableNormalizeSlashCommand,
    buildHeadingLine,
    createDefaultTableTemplate,
    expandShorthandHeading,
    buildCodeBlock,
    buildCallout,
    resolveCalloutType,
    resolveCodeLanguage
} from './slashCommands';
export type { CalloutType } from './slashCommands';

// リスト関連
export {
    getIndentString,
    getIndentLevel,
    createIndent,
    getListType,
    convertLineToType,
    getNextListNumber,
    toggleCheckboxState,
    calculateBlockRange,
    getListContinuationMarker
} from './list';

// 設定関連
export {
    getAdvancedBooleanSetting,
    getAdvancedOrLegacyBooleanSetting
} from './settings';

// インライン強調記法（太字・斜体・取り消し線・コード）関連
export { findInlineEmphasis } from './inlineEmphasis';
export type { InlineEmphasisMatch, InlineEmphasisType, OffsetRange } from './inlineEmphasis';
