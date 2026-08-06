/**
 * Live モードの上部ツールバー。
 *
 * 既存 Preview のツールバーと同じ並び（モード切替 + ブロック変換 + インライン書式）にして、
 * 3モードで操作を揃える。モード切替は host へメッセージを投げて `vscode.openWith` させる。
 */
import type { EditorView } from '@codemirror/view';
import type { NotionBlockAction } from '../../shared/notionBlockKeymap';

/** ツールバーのボタン定義。 */
interface ToolbarButton {
    /** 表示ラベル。 */
    label: string;
    /** ツールチップ。 */
    title: string;
    /** ブロック変換なら種別。 */
    block?: NotionBlockAction;
    /** インライン書式なら囲む記号。 */
    wrap?: string;
    /** モード切替なら遷移先。 */
    mode?: 'raw';
    /** その他のホスト側コマンド。 */
    command?: 'exportPdf';
}

const BUTTONS: ToolbarButton[] = [
    { label: 'H1', title: '見出し1 (⌥⌘1)', block: 'heading1' },
    { label: 'H2', title: '見出し2 (⌥⌘2)', block: 'heading2' },
    { label: 'H3', title: '見出し3 (⌥⌘3)', block: 'heading3' },
    { label: '☑', title: 'チェックボックス (⌥⌘4)', block: 'todo' },
    { label: '•', title: '箇条書き (⌥⌘5)', block: 'bulletList' },
    { label: '1.', title: '番号リスト (⌥⌘6)', block: 'orderedList' },
    { label: '❝', title: '引用 (⌥⌘9)', block: 'blockquote' },
    { label: 'B', title: '太字 (⌘B)', wrap: '**' },
    { label: 'I', title: '斜体 (⌘I)', wrap: '*' },
    { label: '<>', title: 'インラインコード', wrap: '`' }
];

const MODES: ToolbarButton[] = [
    { label: 'PDF', title: 'PDF に書き出す', command: 'exportPdf' },
    { label: 'Raw', title: 'Raw モードで開く', mode: 'raw' }
];

export interface ToolbarHandlers {
    /** ブロック変換を当てる。 */
    applyBlock(view: EditorView, action: NotionBlockAction): void;
    /** 選択を記号で囲む。 */
    wrapInline(view: EditorView, marker: string): void;
    /** 別モードで開き直す。 */
    switchMode(mode: 'raw'): void;
    /** ホスト側のコマンドを実行する。 */
    runCommand(command: 'exportPdf'): void;
}

/** ツールバーの DOM を作って `parent` の先頭に差し込む。 */
export function mountLiveToolbar(parent: HTMLElement, view: EditorView, handlers: ToolbarHandlers): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'cm-live-toolbar';

    const left = document.createElement('div');
    left.className = 'cm-live-toolbar-group';
    for (const b of BUTTONS) {
        left.appendChild(makeButton(b, view, handlers));
    }

    const right = document.createElement('div');
    right.className = 'cm-live-toolbar-group cm-live-toolbar-modes';
    const live = document.createElement('span');
    live.className = 'cm-live-toolbar-current';
    live.textContent = 'Live';
    right.appendChild(live);
    for (const b of MODES) {
        right.appendChild(makeButton(b, view, handlers));
    }

    bar.appendChild(left);
    bar.appendChild(right);
    parent.insertBefore(bar, parent.firstChild);
    return bar;
}

function makeButton(b: ToolbarButton, view: EditorView, handlers: ToolbarHandlers): HTMLButtonElement {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'cm-live-toolbar-button';
    el.textContent = b.label;
    el.title = b.title;
    // ボタンを押してもエディタのフォーカス・選択を失わないようにする
    el.addEventListener('mousedown', (e) => e.preventDefault());
    el.addEventListener('click', () => {
        if (b.command) handlers.runCommand(b.command);
        else if (b.mode) handlers.switchMode(b.mode);
        else if (b.block) handlers.applyBlock(view, b.block);
        else if (b.wrap) handlers.wrapInline(view, b.wrap);
        view.focus();
    });
    return el;
}
