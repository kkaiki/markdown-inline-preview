/**
 * Live モードの host ⇄ webview 差分同期に使う純ロジック。
 *
 * requirements.md R4.2 のとおり、Live モードは**文書全体の置き換えを絶対にしない**。
 * webview の編集は `{ from, to, insert }`（生テキストのオフセット基準）で host へ送り、
 * host 側でここの関数を使って VS Code の行/桁へ直してから `WorkspaceEdit` にする。
 *
 * 全体置換をすると Undo 履歴と Git 差分が壊れる。既存 Preview で
 * 「フォーカス展開しただけで差分ガターが変更扱いになる」不具合（63d6074）を
 * 踏んでいるため、Live モードでは同期の入口をこの1箇所に絞って固定する。
 */

/** ドキュメント上の差分（生テキストのオフセット基準）。 */
export interface DocChange {
    /** 置換対象の開始オフセット。 */
    from: number;
    /** 置換対象の終了オフセット（挿入だけなら from と同じ）。 */
    to: number;
    /** 差し込むテキスト（削除だけなら空文字）。 */
    insert: string;
}

/** VS Code の Position 相当（0 始まり）。 */
export interface Position {
    line: number;
    character: number;
}

/** VS Code の Range + 差し込みテキスト。 */
export interface RangeEdit {
    start: Position;
    end: Position;
    insert: string;
}

/**
 * 文字オフセットを行/桁へ変換する。
 * 改行は `\n` で数える（`\r\n` の `\r` は前の行の末尾文字として扱われるので、
 * 行数は1回しか増えない）。
 */
export function offsetToPosition(text: string, offset: number): Position {
    const clamped = Math.max(0, Math.min(offset, text.length));
    let line = 0;
    let lineStart = 0;
    for (let i = 0; i < clamped; i++) {
        if (text.charCodeAt(i) === 10 /* \n */) {
            line += 1;
            lineStart = i + 1;
        }
    }
    return { line, character: clamped - lineStart };
}

/** 差分を VS Code の Range へ変換する。 */
export function changeToRange(text: string, change: DocChange): RangeEdit {
    return {
        start: offsetToPosition(text, change.from),
        end: offsetToPosition(text, change.to),
        insert: change.insert
    };
}

/**
 * 複数の差分を「元テキストのオフセット基準」で適用する。
 * 呼び出し側が位置をずらして渡さなくて済むよう、後ろから順に適用する。
 */
export function applyChanges(text: string, changes: readonly DocChange[]): string {
    const sorted = [...changes].sort((a, b) => b.from - a.from);
    let out = text;
    for (const c of sorted) {
        out = out.slice(0, c.from) + c.insert + out.slice(c.to);
    }
    return out;
}

/**
 * エコーバック抑止。
 *
 * webview → host → （TextDocument 変更イベント）→ host → webview と戻ってくる自分の編集を
 * 二重適用しないよう、送信時に採番したリビジョンを控えておき、戻ってきたら1度だけ捨てる。
 * 外部（Raw モード・AI・Git 操作）由来の変更にはリビジョンが付かないので必ず適用する。
 */
export interface EchoGuard {
    /** ローカル編集を送る直前に呼ぶ。採番したリビジョンを返す。 */
    markLocal(): number;
    /** 戻ってきた変更を適用すべきか。`revision` が未定義なら外部由来。 */
    shouldApply(revision: number | undefined): boolean;
    /** 未確定のローカル編集数（デバッグ用）。 */
    pending(): number;
}

export function createEchoGuard(): EchoGuard {
    let next = 1;
    const outstanding = new Set<number>();
    return {
        markLocal(): number {
            const rev = next++;
            outstanding.add(rev);
            return rev;
        },
        shouldApply(revision: number | undefined): boolean {
            if (revision === undefined) return true;
            if (outstanding.has(revision)) {
                outstanding.delete(revision);
                return false;
            }
            return true;
        },
        pending(): number {
            return outstanding.size;
        }
    };
}
