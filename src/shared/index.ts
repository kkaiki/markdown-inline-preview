/**
 * Shared pure logic (runtime-agnostic)
 */

export {
    patterns,
    getLineType,
    getMarkerInfo,
    extractNumberedList,
    extractCheckbox,
    extractHeading,
    isListItem,
    isSeparatorRow
} from './markdown/patterns';

export { generateSlug } from './markdown/slug';
export { splitFrontmatter, mergeFrontmatter, parseFrontmatterEntries } from './markdown/frontmatter';
export type { FrontmatterSplit } from './markdown/frontmatter';
export { findInlineEmphasis } from './markdown/inlineEmphasis';
export type { InlineEmphasisMatch, InlineEmphasisType, OffsetRange } from './markdown/inlineEmphasis';

export {
    collectHeadings,
    collectHeadingsFromText
} from './structure/toc';

export {
    createScrollAnchor,
    findScrollAnchor,
    findLineBySlug,
    headingMatchesScrollAnchor
} from './structure/scrollAnchor';
export type { ScrollAnchor } from './structure/scrollAnchor';

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
} from './structure/list';

export {
    splitTableLine,
    getAllTableCells,
    getTableCellInfo,
    findTableBlock,
    parseTableRows,
    formatTableRow,
    calculateColumnWidths
} from './table/table';

export {
    isZeroWidthCombining,
    isFullWidthCodePoint,
    isNarrowChar,
    isWideChar,
    getStringWidth,
    getDisplayWidthWithHeuristics,
    padCell
} from './table/width';

export {
    parseTableCells,
    wrapCell,
    formatWrappedTableRow
} from './table/tableWrap';

export { SLASH_MENU_ITEMS, filterSlashMenuItems } from './slash/slashMenuItems';
export type { SlashMenuItemDef } from './slash/slashMenuItems';
export { detectSlashMatch } from './slash/slashMatch';
export type { SlashMatch } from './slash/slashMatch';
