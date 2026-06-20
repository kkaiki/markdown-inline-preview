/**
 * インライン強調記法（太字・斜体・取り消し線・インラインコード）の検出
 *
 * CommonMark の完全な実装ではなく、ライブプレビュー用の隠蔽表示に必要な
 * 範囲（マーカー位置・内容位置）を1行単位で軽量に検出するための簡易実装。
 */

export type InlineEmphasisType = 'bold' | 'italic' | 'strikethrough' | 'code';

export interface OffsetRange {
    start: number;
    end: number;
}

export interface InlineEmphasisMatch {
    type: InlineEmphasisType;
    markerStart: OffsetRange;
    markerEnd: OffsetRange;
    contentStart: number;
    contentEnd: number;
}

function isEscaped(original: string, index: number): boolean {
    return index > 0 && original[index - 1] === '\\';
}

function extractAndMask(
    masked: string,
    original: string,
    regex: RegExp,
    type: InlineEmphasisType,
    markerLen: number,
    results: InlineEmphasisMatch[]
): string {
    const workingChars = masked.split('');
    regex.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = regex.exec(masked)) !== null) {
        const fullStart = match.index;
        const fullEnd = match.index + match[0].length;

        if (isEscaped(original, fullStart)) {
            regex.lastIndex = fullStart + 1;
            continue;
        }

        results.push({
            type,
            markerStart: { start: fullStart, end: fullStart + markerLen },
            markerEnd: { start: fullEnd - markerLen, end: fullEnd },
            contentStart: fullStart + markerLen,
            contentEnd: fullEnd - markerLen
        });

        for (let i = fullStart; i < fullEnd; i++) {
            workingChars[i] = '\0';
        }
    }

    return workingChars.join('');
}

/**
 * 1行のテキストから太字・斜体・取り消し線・インラインコードの範囲を検出する。
 * コード > 取り消し線 > 太字(**, __) > 斜体(*, _) の順に検出し、
 * 確定した範囲は次のパスから見えないようにマスクすることで、
 * 例えば `**bold**` の外側を斜体と誤認したり、コード内の `**` を
 * 太字と誤認したりするのを防ぐ。
 */
export function findInlineEmphasis(lineText: string): InlineEmphasisMatch[] {
    const results: InlineEmphasisMatch[] = [];
    let masked = lineText;

    masked = extractAndMask(masked, lineText, /`(?!`)((?:(?!`).)+?)`/g, 'code', 1, results);
    masked = extractAndMask(masked, lineText, /~~(?!\s)((?:(?!~~).)+?)(?<!\s)~~/g, 'strikethrough', 2, results);
    masked = extractAndMask(masked, lineText, /\*\*(?!\s)((?:(?!\*\*).)+?)(?<!\s)\*\*/g, 'bold', 2, results);
    masked = extractAndMask(masked, lineText, /(?<![\w\\])__(?!\s)((?:(?!__).)+?)(?<!\s)__(?!\w)/g, 'bold', 2, results);
    masked = extractAndMask(masked, lineText, /\*(?!\s)((?:(?!\*).)+?)(?<!\s)\*/g, 'italic', 1, results);
    extractAndMask(masked, lineText, /(?<![\w\\])_(?!\s)((?:(?!_).)+?)(?<!\s)_(?!\w)/g, 'italic', 1, results);

    results.sort((a, b) => a.markerStart.start - b.markerStart.start);
    return results;
}
