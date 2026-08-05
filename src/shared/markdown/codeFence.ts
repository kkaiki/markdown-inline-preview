/**
 * コードフェンス（`` ``` `` / `~~~`）に関する純関数。Preview（webview）と Extension Host の
 * 両方から使うため shared に置く。
 *
 * 背景: コードブロックの中へフェンス付きテキストを貼り付けると、内容は常にリテラルなので
 * `` ``` `` が本文として入り込む。保存時に remark が外側フェンスを内容を包める長さ
 * （4連バッククォート）へ広げるため、ファイルが「二重フェンス」になる。この状態になると
 * Preview 上でフェンス行が4本並んで見え、コードブロック内の Cmd+A にもフェンスが混ざる
 * （2026-07-27 ユーザー報告）。
 */

/**
 * 内容を包める最短のフェンス文字列を返す（mdast-util-to-markdown と同じ規則:
 * 内容に含まれる最長のバッククォート連 + 1、最低 3）。
 */
export function codeFenceMarker(content: string): string {
    let longest = 0;
    let current = 0;
    for (const ch of content) {
        if (ch === '`') {
            current += 1;
            if (current > longest) longest = current;
        } else {
            current = 0;
        }
    }
    return '`'.repeat(Math.max(3, longest + 1));
}

export interface UnwrappedFence {
    /** フェンスの中身（コード本体）。 */
    code: string;
    /** 情報文字列（言語）。無ければ空文字。 */
    language: string;
}

/**
 * テキスト全体が「単一の完結したフェンスコードブロック」なら、その中身と言語を返す。
 * そうでなければ null。
 *
 * 中身にさらに同じ長さ以上のフェンス行が含まれる場合（複数のコードブロックを一度に
 * コピーした・フェンスの使い方を説明している等）は、外側だけ剥がすと壊れるため null。
 */
export function unwrapFencedBlock(text: string): UnwrappedFence | null {
    const normalized = text.replace(/\r\n?/g, '\n').replace(/^\n+/, '').replace(/\n+$/, '');
    const match = /^(`{3,}|~{3,})([^\n`]*)\n?([\s\S]*?)\n?\1[`~]*[ \t]*$/.exec(normalized);
    if (!match) return null;

    const [, marker, info, code] = match;
    const fenceChar = marker[0];
    const innerFence = new RegExp(`^[ \\t]{0,3}\\${fenceChar}{${marker.length},}`, 'm');
    if (innerFence.test(code)) return null;

    return { code, language: info.trim() };
}

const FENCE_OPEN = /^([ \t]{0,3})(`{3,}|~{3,})(.*)$/;

/**
 * 二重フェンスになってしまった Markdown を修復する。
 *
 * 「コードブロックの中身がそれ自体で完結した1つのフェンスブロックになっている」場合だけ、
 * 内側のフェンス行を取り除いて1重に戻し、外側フェンスの長さも内容に合わせ直す。
 * 言語は外側にあれば外側を、無ければ内側を引き継ぐ。三重以上も1重になるまで繰り返す。
 *
 * 中身が「複数のフェンスブロックの例示」であるような正当なブロックは変更しない。
 */
export function repairNestedCodeFences(markdown: string): { markdown: string; fixed: number } {
    let current = markdown;
    let fixed = 0;

    // 三重以上の入れ子は1回のパスでは1段しか剥がせないため、変化が無くなるまで繰り返す。
    for (let pass = 0; pass < 10; pass++) {
        const result = repairOnce(current);
        if (result.fixed === 0) break;
        current = result.markdown;
        fixed += result.fixed;
    }

    return { markdown: current, fixed };
}

function repairOnce(markdown: string): { markdown: string; fixed: number } {
    const lines = markdown.split('\n');
    const out: string[] = [];
    let fixed = 0;
    let i = 0;

    while (i < lines.length) {
        const open = FENCE_OPEN.exec(lines[i]);
        if (!open) {
            out.push(lines[i]);
            i += 1;
            continue;
        }

        const [, indent, marker, info] = open;
        const closeIndex = findClosingFence(lines, i + 1, marker);
        if (closeIndex < 0) {
            // 閉じフェンスが無い（＝コードブロックではない）ので触らない。
            out.push(lines[i]);
            i += 1;
            continue;
        }

        const body = lines.slice(i + 1, closeIndex).join('\n');
        const inner = unwrapFencedBlock(body);
        if (inner) {
            const language = info.trim() !== '' ? info.trim() : inner.language;
            const newMarker = codeFenceMarker(inner.code);
            out.push(`${indent}${newMarker}${language}`);
            if (inner.code !== '') out.push(...inner.code.split('\n'));
            out.push(`${indent}${newMarker}`);
            fixed += 1;
        } else {
            out.push(...lines.slice(i, closeIndex + 1));
        }
        i = closeIndex + 1;
    }

    return { markdown: out.join('\n'), fixed };
}

/** `from` 行以降から、`marker` と同種・同長以上の閉じフェンス行を探す（無ければ -1）。 */
function findClosingFence(lines: string[], from: number, marker: string): number {
    const fenceChar = marker[0];
    const closing = new RegExp(`^[ \\t]{0,3}\\${fenceChar}{${marker.length},}[ \\t]*$`);
    for (let i = from; i < lines.length; i++) {
        if (closing.test(lines[i])) return i;
    }
    return -1;
}
