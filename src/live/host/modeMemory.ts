/**
 * ファイル単位のモード記憶と、タブの重複防止。
 *
 * ユーザー指示（2026-08-05）:
 *   「デフォルトで開くときに live にしたときは、そのあとは live で開き、
 *    raw にどこかでしたものがあれば、それは以降は raw で開き続ける」
 *
 * つまり記憶は**グローバルではなくファイルごと**。あるファイルを Raw にしても、
 * 他のファイルは既定（Live）のまま開く。
 *
 * `vscode` に依存しない純ロジックだけをここに置く（テスト容易性のため）。
 */
import { LIVE_VIEW_TYPE, TEXT_EDITOR_VIEW_TYPE, type LiveMode } from './defaultEditorAssociation';

/** 記憶の上限。際限なく増えないよう、古いものから捨てる。 */
export const MODE_MEMORY_LIMIT = 200;

/** URI 文字列 → モード。 */
export type ModeMemory = Record<string, LiveMode>;

/** そのファイルに記憶があれば返す。 */
export function fileMode(memory: ModeMemory, uri: string): LiveMode | undefined {
    return memory[uri];
}

/** そのファイルのモードを覚える（元のオブジェクトは変更しない）。 */
export function rememberFileMode(memory: ModeMemory, uri: string, mode: LiveMode): ModeMemory {
    const next: ModeMemory = { ...memory };
    // 上書き時も「最後に使った」順を保つため、いったん消してから入れ直す
    delete next[uri];
    next[uri] = mode;
    const keys = Object.keys(next);
    if (keys.length > MODE_MEMORY_LIMIT) {
        for (const k of keys.slice(0, keys.length - MODE_MEMORY_LIMIT)) delete next[k];
    }
    return next;
}

/** そのファイルの記憶を消す。 */
export function forgetFileMode(memory: ModeMemory, uri: string): ModeMemory {
    const next = { ...memory };
    delete next[uri];
    return next;
}

/** タブの最小情報（`vscode.Tab` から詰め替える）。 */
export interface TabLike {
    uri: string;
    /** Custom editor なら viewType。素のテキストエディタなら undefined。 */
    viewType?: string;
}

/**
 * `uri` を `mode` で開くときに閉じるべきタブの index を返す。
 *
 * 同じファイルが Raw タブと Live タブで二重に開かれないようにするためのもの。
 * 他拡張のビューア（未知の viewType）は触らない。
 */
export function tabsToClose(tabs: readonly TabLike[], uri: string, mode: LiveMode): number[] {
    const opposite = mode === 'live' ? TEXT_EDITOR_VIEW_TYPE : LIVE_VIEW_TYPE;
    const out: number[] = [];
    tabs.forEach((tab, i) => {
        if (tab.uri !== uri) return;
        const viewType = tab.viewType ?? TEXT_EDITOR_VIEW_TYPE;
        if (viewType === opposite) out.push(i);
    });
    return out;
}
