/**
 * Live モード webview のエントリポイント。
 *
 * CodeMirror 6 を「生 Markdown を編集するエディタ」として立て、記法の表示だけを
 * decoration で差し替える（docs/specifications/live-mode/architecture.md）。
 * Markdown ⇄ 別モデルの往復変換は一切しない。
 *
 * host との通信:
 *   host → webview  { type: 'init',  text, settings }
 *                   { type: 'apply', changes, revision }
 *   webview → host  { type: 'ready' }
 *                   { type: 'edit',  changes, revision }
 *
 * Undo/Redo は VS Code 側へ一本化する（architecture.md §4）ため、CodeMirror の
 * history は載せない。
 */
import { EditorView, keymap, type ViewUpdate } from '@codemirror/view';
import { EditorState, type Extension } from '@codemirror/state';
import { defaultKeymap } from '@codemirror/commands';
import { indentUnit } from '@codemirror/language';
import { liveKeymap } from './liveKeymap';
import { liveLineNumbers } from './liveLineNumbers';
import { diffBaseField, diffField, liveDiffGutter, setDiffBase } from './liveDiffGutter';
import {
    liveCompositionWatcher,
    liveComposingField,
    liveDecorationField,
    liveFocusField,
    liveFocusWatcher
} from './liveDecorations';
import { createEchoGuard, type DocChange } from '../shared/documentSync';

interface VsCodeApi {
    postMessage(message: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

interface LiveSettings {
    showLineNumbers?: boolean;
    showDiffGutter?: boolean;
}

const vscode: VsCodeApi | null = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
const echo = createEchoGuard();

/** host 由来の変更を適用している間は true（その間の編集を host へ送り返さない）。 */
let applyingRemote = false;

let view: EditorView | null = null;

/** 編集を差分として host へ送る。 */
const sendEdits = EditorView.updateListener.of((u: ViewUpdate) => {
    if (!u.docChanged || applyingRemote) return;
    const changes: DocChange[] = [];
    u.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
        changes.push({ from: fromA, to: toA, insert: inserted.toString() });
    });
    if (changes.length === 0) return;
    const revision = echo.markLocal();
    vscode?.postMessage({ type: 'edit', changes, revision });
    // テスト用シーム（実 host が無いブラウザテストでも送信内容を検証できるようにする）
    const sent = (window as unknown as { __sent?: unknown[] }).__sent;
    if (!vscode && Array.isArray(sent)) sent.push({ type: 'edit', changes, revision });
});

const theme = EditorView.theme({
    '&': { height: '100%', fontSize: '14px' },
    '.cm-content': {
        fontFamily: 'var(--vscode-font-family, sans-serif)',
        caretColor: 'var(--vscode-editor-foreground, #ddd)'
    },
    '.cm-scroller': { overflow: 'auto' }
});

function extensions(settings: LiveSettings): Extension[] {
    return [
        // 行番号は視覚行に1対1で付く（畳まれたブロックは先頭のソース行番号だけが出る）
        ...(settings.showLineNumbers ? [liveLineNumbers] : []),
        // Git 差分ガター（基準は host から 'diffBase' で受け取る）
        diffBaseField,
        diffField,
        ...(settings.showDiffGutter === false ? [] : [liveDiffGutter]),
        EditorView.lineWrapping,
        // 実測どおり、インデントはタブ1文字（Obsidian の既定 useTab: true と同じ）
        indentUnit.of('\t'),
        // 記法の展開/収縮。ブロックウィジェット（表など）を扱うため StateField 供給にしている。
        liveFocusField,
        liveComposingField,
        liveDecorationField,
        liveFocusWatcher,
        liveCompositionWatcher,
        sendEdits,
        theme,
        // Live モード固有のキーは既定より先に評価させる
        keymap.of(liveKeymap),
        // history は載せない（Undo は VS Code 側へ一本化する）
        keymap.of(defaultKeymap.filter((b) => b.key !== 'Mod-z' && b.key !== 'Mod-y'))
    ];
}

function createEditor(text: string, settings: LiveSettings): void {
    const parent = document.getElementById('live-root');
    if (!parent) throw new Error('#live-root が見つかりません');
    parent.innerHTML = '';
    view = new EditorView({
        state: EditorState.create({ doc: text, extensions: extensions(settings) }),
        parent
    });
    (window as unknown as { __liveView: EditorView }).__liveView = view;
    // テスト用シーム: 差分の計算結果を覗けるようにする（描画されない原因の切り分け用）
    (window as unknown as { __liveDiff: () => unknown }).__liveDiff = () =>
        view ? view.state.field(diffField, false) : undefined;
}

/** host からの差分を適用する（自分が起点の編集は無視する）。 */
function applyRemote(changes: DocChange[], revision: number | undefined): void {
    if (!view) return;
    if (!echo.shouldApply(revision)) return;
    applyingRemote = true;
    try {
        view.dispatch({
            changes: changes.map((c) => ({ from: c.from, to: c.to, insert: c.insert }))
        });
    } finally {
        applyingRemote = false;
    }
}

window.addEventListener('message', (event: MessageEvent) => {
    const msg = event.data as {
        type?: string;
        text?: string | null;
        settings?: LiveSettings;
        changes?: DocChange[];
        revision?: number;
    };
    if (!msg || typeof msg.type !== 'string') return;
    switch (msg.type) {
        case 'init':
            createEditor(msg.text ?? '', msg.settings ?? {});
            break;
        case 'apply':
            applyRemote(msg.changes ?? [], msg.revision);
            break;
        case 'diffBase':
            view?.dispatch({ effects: setDiffBase.of(msg.text ?? null) });
            break;
        default:
            break;
    }
});

(window as unknown as { __liveReady: boolean }).__liveReady = true;
vscode?.postMessage({ type: 'ready' });
