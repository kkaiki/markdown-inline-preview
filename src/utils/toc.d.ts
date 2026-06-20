/**
 * 目次（Table of Contents）ユーティリティ
 * 見出し収集、スラッグ生成、目次生成関連の関数
 */
import type { HeadingInfo, TocMarkerInfo, TocSection } from '../types';
interface DocumentLike {
    lineCount: number;
    lineAt(line: number): {
        text: string;
    };
}
/**
 * 見出しテキストからアンカーリンク用のスラッグを生成
 */
export declare function generateSlug(text: string): string;
/**
 * ドキュメント内の見出しを収集
 */
export declare function collectHeadings(document: DocumentLike): HeadingInfo[];
/**
 * テキストから見出しを収集（ドキュメントオブジェクトなしで使用）
 */
export declare function collectHeadingsFromText(text: string): HeadingInfo[];
/**
 * 目次テキストを生成
 */
export declare function generateTableOfContents(headings: HeadingInfo[], minLevel?: number, maxLevel?: number): string;
/**
 * 目次マーカーを検出
 */
export declare function findTocMarker(text: string): TocMarkerInfo;
/**
 * 目次セクションの範囲を検出
 */
export declare function findTocSection(document: DocumentLike): TocSection | null;
export {};
//# sourceMappingURL=toc.d.ts.map