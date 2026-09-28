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
import { search, searchKeymap } from '@codemirror/search';
import { createLiveSearchPanel } from './liveSearchPanel';
import { setWebviewLocale } from './i18n';
import { searchPhrases } from '../shared/webviewStrings';
import { indentUnit } from '@codemirror/language';
import {
    applyBlockActionToSelection,
    applyInlineFormatToSelection,
    lastLiveSelectAllRange,
    liveHostBridge,
    liveKeymap,
    liveSelectAll
} from './liveKeymap';
import { shouldIgnoreHostSelectAll } from '../shared/hostSelectAll';
import { liveSlashMenu } from './liveSlashMenu';
import { mountLiveToolbar } from './liveToolbar';
import { liveSpreadsheetPaste } from './liveSpreadsheetPaste';
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
    /** VS Code のロケール（`vscode.env.language`）。未指定なら英語。 */
    locale?: string;
    showLineNumbers?: boolean;
    showDiffGutter?: boolean;
    showToolbar?: boolean;
    enableSlashMenu?: boolean;
    /** PDF ボタンに PRO+ バッジを出すか（host が「販売中かつ未購入」のときだけ true にする）。 */
    showProBadge?: boolean;
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
    pushSent({ type: 'edit', changes, revision });
});

/** テスト用シーム（実 host が無いブラウザテストでも送信内容を検証できるようにする）。 */
function pushSent(message: unknown): void {
    const sent = (window as unknown as { __sent?: unknown[] }).__sent;
    if (!vscode && Array.isArray(sent)) sent.push(message);
}

/*
 * 組版（フォント・文字サイズ・色）は media/live-preview.css に一本化する。
 * ここで font-family / font-size を指定すると CodeMirror が生成するクラス付きの
 * ルールになり、スタイルシート側の指定を上書きしてしまう（2026-08-05 に踏んだ）。
 */
const theme = EditorView.theme({
    '&': { height: '100%' },
    '.cm-scroller': { overflow: 'auto' }
});

function extensions(settings: LiveSettings): Extension[] {
    return [
        // ⌘F 検索。ラベルはロケールに従う（docs/specifications/live-mode/find.md）
        EditorState.phrases.of(searchPhrases(settings.locale)),
        search({ top: true, createPanel: createLiveSearchPanel }),
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
        // Excel・スプレッドシートの範囲を貼ったら Markdown の表にする（無料・既定。requirements.md §2.7.3）
        liveSpreadsheetPaste,
        sendEdits,
        theme,
        // スラッシュコマンド（/ でメニュー）
        ...(settings.enableSlashMenu === false ? [] : [liveSlashMenu]),
        // Live モード固有のキーは既定より先に評価させる
        keymap.of(liveKeymap),
        // ⌘D は Notion 準拠の「ブロック複製」なので、検索側の「次の出現を選択」は使わない
        keymap.of(searchKeymap.filter((b) => b.key !== 'Mod-d')),
        // history は載せない（Undo は VS Code 側へ一本化する）
        keymap.of(defaultKeymap.filter((b) => b.key !== 'Mod-z' && b.key !== 'Mod-y'))
    ];
}

/** `document.execCommand` を横取り済みか（多重フック防止）。 */
let selectAllGuarded = false;

/**
 * host（VS Code / Cursor 本体）が送ってくる「すべて選択」を横取りする。
 *
 * 本体は webview にフォーカスがあるとき ⌘A を自分でも処理し、webview が
 * `preventDefault()` していても `execCommand('selectAll')` を送ってくる。放っておくと
 * 段階的な ⌘A の結果が毎回そのあとで文書全体へ上書きされる（実機で計測。
 * docs/specifications/live-mode/requirements.md §3.4.3）。
 *
 * webview 単体のブラウザテストには本体が居ないため、この経路は
 * `test/browser/live/shortcuts/selectAllSteps.test.ts` が execCommand を直接呼んで再現する。
 */
function guardHostSelectAll(): void {
    if (selectAllGuarded) return;
    selectAllGuarded = true;
    const original = document.execCommand.bind(document);
    document.execCommand = (command: string, showUI?: boolean, value?: string): boolean => {
        if (command === 'selectAll' && view) {
            /*
             * 表のセルの中は**表ウィジェット側**（selectAllStepInTable）が ⌘A を処理していて、
             * CodeMirror の選択は動かさない。ここで本体の selectAll を通すと CodeMirror 側の
             * 段階選択も走って段階が二重に進む（実機では 3回目に選択が文書全体へ化けた）。
             */
            const active = document.activeElement;
            if (active instanceof Element && active.closest('.cm-live-table-wrap')) return true;
            // 自分が設定した選択のままなら本体による上書きなので捨てる（段階選択の結果を守る）
            const sel = view.state.selection.main;
            if (shouldIgnoreHostSelectAll(lastLiveSelectAllRange(), { from: sel.from, to: sel.to })) {
                return true;
            }
            // メニューの「すべて選択」など単体で来たものは段階選択として扱う
            return liveSelectAll(view);
        }
        return original(command, showUI, value);
    };
}

function createEditor(text: string, settings: LiveSettings): void {
    // UI 文字列の言語はエディタのロケールに従う（既定は英語）
    setWebviewLocale(settings.locale);
    // ⌘⇧. で Raw へ戻す（keymap から host へ依頼するための受け口）
    liveHostBridge.switchMode = (mode) => {
        vscode?.postMessage({ type: 'switchMode', mode });
        pushSent({ type: 'switchMode', mode });
    };
    const parent = document.getElementById('live-root');
    if (!parent) throw new Error('#live-root not found');
    parent.innerHTML = '';
    const host = document.createElement('div');
    host.className = 'cm-live-editor-host';
    parent.appendChild(host);
    view = new EditorView({
        state: EditorState.create({ doc: text, extensions: extensions(settings) }),
        parent: host
    });
    if (settings.showToolbar !== false) {
        mountLiveToolbar(parent, view, {
            applyBlock: (v, action) => applyBlockActionToSelection(v, action),
            applyInlineFormat: (v, format) => {
                applyInlineFormatToSelection(v, format);
            },
            switchMode: (mode) => {
                vscode?.postMessage({ type: 'switchMode', mode });
                pushSent({ type: 'switchMode', mode });
            },
            runCommand: (command) => {
                vscode?.postMessage({ type: command });
                pushSent({ type: command });
            }
        }, { showProBadge: settings.showProBadge === true });
    }
    guardHostSelectAll();
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
