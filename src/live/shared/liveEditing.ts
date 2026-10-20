/**
 * Live モードの編集ロジック（CodeMirror に依存しない純関数）。
 *
 * Obsidian 実測（obsidian-observed-spec.md §4.1・§3.3）に一致させてある。
 * 既存 Preview / Raw モードの smartEnter とは**要件が違う**ので流用しないこと:
 *   - 見出しの行末で Enter しても "# " を引き継がない
 *   - チェック済み項目の行末で Enter しても新項目は未チェック
 *   - 行頭付近の Backspace は記法解除しない（＝ここに Backspace の処理は無い）
 */

/** 行頭のプレフィックス（リスト・チェックボックス・引用）の解析結果。 */
export interface LinePrefix {
    kind: 'bullet' | 'ordered' | 'task' | 'quote' | 'none';
    /** インデント文字列（空白 / タブ）。 */
    indent: string;
    /** マーカー文字列（"- " や "1. " や "- [ ] " など、後ろの空白を含む）。 */
    marker: string;
    /** 本文が始まる桁。 */
    contentStart: number;
    /** ネストの深さ（1 始まり）。 */
    level: number;
    /** 番号リストの番号。 */
    ordinal?: number;
    /** チェックボックスの状態。 */
    checked?: boolean;
}

const NONE: LinePrefix = { kind: 'none', indent: '', marker: '', contentStart: 0, level: 0 };

/** インデント文字列から階層を求める（タブ1つ = 1段、空白2つ = 1段）。 */
export function indentLevel(indent: string): number {
    let tabs = 0;
    let spaces = 0;
    for (const ch of indent) {
        if (ch === '\t') tabs += 1;
        else spaces += 1;
    }
    return 1 + tabs + Math.floor(spaces / 2);
}

/**
 * 行頭のリスト系プレフィックスを解析する。引用は `parseQuotePrefix` で別に扱う。
 */
export function parseLinePrefix(line: string): LinePrefix {
    const task = /^([ \t]*)([-*+]) \[([ xX])\] /.exec(line);
    if (task) {
        const marker = task[0].slice(task[1].length);
        return {
            kind: 'task',
            indent: task[1],
            marker,
            contentStart: task[0].length,
            level: indentLevel(task[1]),
            checked: task[3] !== ' '
        };
    }
    const bullet = /^([ \t]*)([-*+]) /.exec(line);
    if (bullet) {
        return {
            kind: 'bullet',
            indent: bullet[1],
            marker: `${bullet[2]} `,
            contentStart: bullet[0].length,
            level: indentLevel(bullet[1])
        };
    }
    const ordered = /^([ \t]*)(\d+)([.)]) /.exec(line);
    if (ordered) {
        return {
            kind: 'ordered',
            indent: ordered[1],
            marker: `${ordered[2]}${ordered[3]} `,
            contentStart: ordered[0].length,
            level: indentLevel(ordered[1]),
            ordinal: Number(ordered[2])
        };
    }
    return NONE;
}

/** 引用プレフィックス（"> " の連なり）を解析する。無ければ null。 */
export function parseQuotePrefix(line: string): { prefix: string; level: number } | null {
    const m = /^(>\s?)+/.exec(line);
    if (!m) return null;
    const prefix = m[0];
    const level = (prefix.match(/>/g) ?? []).length;
    return { prefix, level };
}

/** Enter を押したときにどう編集するか。 */
export interface EnterResult {
    /** 挿入する文字列。 */
    insert: string;
    /**
     * ここから（行内の桁）カーソル位置までを削除する。null なら削除しない。
     * 空のマーカーだけの行で Enter したときに「マーカーを消して行は増やさない」ために使う。
     */
    deleteFrom: number | null;
}

/**
 * Enter の挙動を解決する。`null` を返したら CodeMirror の既定の Enter に委ねる。
 *
 * @param line カーソルのある行のテキスト
 * @param col 行内のカーソル位置
 */
export function resolveEnter(line: string, col: number): EnterResult | null {
    const quote = parseQuotePrefix(line);
    if (quote) {
        const body = line.slice(quote.prefix.length);
        if (col < quote.prefix.length) return null;
        if (body.trim() === '') return { insert: '', deleteFrom: 0 };
        return { insert: `\n${quote.prefix}`, deleteFrom: null };
    }

    const p = parseLinePrefix(line);
    if (p.kind === 'none') return null;
    // マーカーの内側（"- " の途中など）では既定に委ねる。
    if (col < p.contentStart) return null;

    // マーカーだけで本文が無い行 → マーカーを消して行は増やさない
    if (line.slice(p.contentStart).trim() === '') {
        return { insert: '', deleteFrom: 0 };
    }

    if (p.kind === 'ordered') {
        const next = (p.ordinal ?? 0) + 1;
        const sep = p.marker.trimEnd().slice(-1);
        return { insert: `\n${p.indent}${next}${sep} `, deleteFrom: null };
    }
    if (p.kind === 'task') {
        // 実測: チェック済みの項目から続けても、新しい項目は必ず未チェック
        const bulletChar = p.marker[0];
        return { insert: `\n${p.indent}${bulletChar} [ ] `, deleteFrom: null };
    }
    return { insert: `\n${p.indent}${p.marker}`, deleteFrom: null };
}

/**
 * Home を押したときの移動先の桁を返す。
 *
 * 実測どおり、2段階（本文先頭 → 行頭）になるのは**リスト系だけ**。
 * 見出し・引用・素の段落は素直に行頭へ行く。
 */
export function resolveSmartHome(line: string, col: number): number {
    const p = parseLinePrefix(line);
    if (p.kind === 'none' || p.kind === 'quote') return 0;
    return col > p.contentStart ? p.contentStart : 0;
}

/** コードフェンスの Enter を解決した結果。 */
export interface FenceEnterResult {
    /** カーソル位置に挿入する文字列。 */
    insert: string;
    /** 挿入後、挿入開始位置から何文字進んだ所へカーソルを置くか。 */
    cursorDelta: number;
}

/**
 * 「閉じていない開始フェンスの行末」で Enter したときに、本文行と閉じフェンスを補う。
 *
 * ユーザー報告（2026-08-05）:「``` ``` この中にカーソルを入れることができない」。
 * 本文行が無いとカーソルを置く場所そのものが無いので、Obsidian と同じく
 * `\n\n<閉じフェンス>` を補って本文行へカーソルを置く。
 *
 * `null` を返したら既定の Enter に委ねる。
 */
export function resolveFenceEnter(doc: string, pos: number): FenceEnterResult | null {
    const lineStart = doc.lastIndexOf('\n', Math.max(0, pos - 1)) + 1;
    const nl = doc.indexOf('\n', pos);
    const lineEnd = nl === -1 ? doc.length : nl;
    if (pos !== lineEnd) return null; // 行末でなければ普通の改行

    const line = doc.slice(lineStart, lineEnd);
    const m = /^\s*(`{3,}|~{3,})/.exec(line);
    if (!m) return null;
    const marker = m[1];

    // この行より前に開いたままのフェンスがあるなら、この行は「閉じフェンス」なので補わない
    let open: string | null = null;
    let offset = 0;
    for (const l of doc.split('\n')) {
        if (offset >= lineStart) break;
        const f = /^\s*(`{3,}|~{3,})/.exec(l);
        if (f) open = open === null ? f[1][0] : f[1][0] === open ? null : open;
        offset += l.length + 1;
    }
    if (open !== null) return null;

    // この行より後ろに、同じ記号の閉じフェンスがあるなら既に閉じている
    const after = doc.slice(lineEnd + 1).split('\n');
    for (const l of after) {
        const f = /^\s*(`{3,}|~{3,})\s*$/.exec(l);
        if (f && f[1][0] === marker[0]) return null;
        if (/^\s*(`{3,}|~{3,})/.test(l)) break;
    }

    return { insert: `\n\n${marker}`, cursorDelta: 1 };
}

/** リストの Enter の結果（`from`〜`to` を `insert` に置き換え、カーソルを `cursor` に置く）。 */
export interface ListEnterPlan {
    from: number;
    to: number;
    insert: string;
    cursor: number;
}

/**
 * リストの行で Enter したときの編集を、番号リストを整理した形で決める（ユーザー報告 2026-10-20）。
 *
 * - 行の途中で割るとき、後ろ半分が既にマーカー（`4. ` `- ` など）で始まっていれば、新しいマーカーを足さない
 *   （「3. …。4. …」の「4.」の手前で Enter して「4. 4. …」になるのを防ぐ）。割り目の前後の空白は捨てる。
 * - 番号リストなら、Enter のあとに続く同じ深さの項目を、手前の項目の次の番号から順に振り直す。
 *   子の項目（深いインデント）はまたぎ、空行や浅い行・別の種類の行で止める。
 *
 * それ以外（空の項目でマーカーを消す・行末で次の項目を足す・引用）は `resolveEnter` と同じ。
 * リストでも引用でもない行なら null（既定の Enter に任せる）。
 */
export function planListEnter(doc: string, pos: number): ListEnterPlan | null {
    const lineStart = doc.lastIndexOf('\n', pos - 1) + 1;
    const nl = doc.indexOf('\n', pos);
    const lineEnd = nl < 0 ? doc.length : nl;
    const line = doc.slice(lineStart, lineEnd);
    const col = pos - lineStart;

    const r = resolveEnter(line, col);
    if (!r) return null;
    if (r.deleteFrom !== null) {
        const from = lineStart + r.deleteFrom;
        return { from, to: pos, insert: r.insert, cursor: from + r.insert.length };
    }

    const p = parseQuotePrefix(line) ? NONE : parseLinePrefix(line);
    let cutFrom = pos;
    let cutTo = pos;
    let insert = r.insert;
    if (p.kind !== 'none') {
        const rest = line.slice(col);
        const lead = /^[ \t]*/.exec(rest)?.[0] ?? '';
        if (parseLinePrefix(rest.slice(lead.length)).kind !== 'none') {
            const trail = /[ \t]*$/.exec(line.slice(p.contentStart, col))?.[0] ?? '';
            cutFrom = pos - trail.length;
            cutTo = pos + lead.length;
            insert = `\n${p.indent}`;
        }
    }
    const cursor = cutFrom + insert.length;
    let next = doc.slice(0, cutFrom) + insert + doc.slice(cutTo);
    let regionEnd = cutFrom + insert.length; // 置き換える範囲の終わり（新しい文書での位置）

    if (p.kind === 'ordered') {
        const lines = next.split('\n');
        const origLine = doc.slice(0, lineStart).split('\n').length - 1;
        let expected = (p.ordinal ?? 0) + 1;
        let offset = next.split('\n').slice(0, origLine + 1).join('\n').length + 1;
        for (let i = origLine + 1; i < lines.length; i++) {
            const text = lines[i];
            if (text.trim() === '') break;
            const q = parseLinePrefix(text);
            const lead = /^[ \t]*/.exec(text)?.[0] ?? '';
            if (q.kind === 'ordered' && q.indent === p.indent) {
                const sep = q.marker.trimEnd().slice(-1);
                const fixed = `${q.indent}${expected}${sep} ${text.slice(q.contentStart)}`;
                lines[i] = fixed;
                expected += 1;
            } else if (lead.length <= p.indent.length) {
                break;
            }
            regionEnd = offset + lines[i].length;
            offset += lines[i].length + 1;
        }
        next = lines.join('\n');
    }

    const delta = next.length - doc.length;
    const to = Math.max(cutTo, regionEnd - delta);
    return { from: cutFrom, to, insert: next.slice(cutFrom, to + delta), cursor };
}
