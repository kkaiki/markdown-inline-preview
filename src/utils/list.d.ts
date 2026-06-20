/**
 * リスト操作ユーティリティ
 * 番号付きリスト、箇条書き、チェックボックスの操作関連関数
 */
import type { ListType, ConvertType, BlockRange } from '../types';
import { extractNumberedList, extractCheckbox, isListItem } from './patterns';
/**
 * インデント文字列を取得
 */
export declare function getIndentString(line: string): string;
/**
 * インデントレベルを計算
 * タブは1レベル、スペースは2つで1レベル
 */
export declare function getIndentLevel(indentStr: string): number;
/**
 * 指定レベルのインデント文字列を生成
 */
export declare function createIndent(level: number, useTabs?: boolean): string;
/**
 * 行のリストタイプを判定
 */
export declare function getListType(line: string): ListType;
/**
 * 行をリストタイプに変換
 */
export declare function convertLineToType(line: string, targetType: ConvertType): string;
/**
 * 番号付きリストの次の番号を生成
 */
export declare function getNextListNumber(currentNumber: number, delimiter?: string): string;
/**
 * チェックボックスの状態をトグル
 */
export declare function toggleCheckboxState(line: string): string;
/**
 * ブロック（子要素を含む）の範囲を計算
 */
export declare function calculateBlockRange(lines: string[], startLine: number): BlockRange;
/**
 * リスト継続のマーカーを生成
 */
export declare function getListContinuationMarker(line: string): string | null;
export { isListItem, extractNumberedList, extractCheckbox };
//# sourceMappingURL=list.d.ts.map