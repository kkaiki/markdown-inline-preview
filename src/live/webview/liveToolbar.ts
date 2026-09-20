/**
 * Live モードの上部ツールバー。
 *
 * 既存 Preview のツールバーと同じ並び（モード切替 + ブロック変換 + インライン書式）にして、
 * 3モードで操作を揃える。モード切替は host へメッセージを投げて `vscode.openWith` させる。
 */
import type { EditorView } from '@codemirror/view';
import { t } from './i18n';
import type { NotionBlockAction } from '../../shared/notionBlockKeymap';
import type { InlineFormat } from '../../shared/inlineFormat';
import {
    BLOCK_SHORTCUTS,
    COMMAND_SHORTCUTS,
    INLINE_SHORTCUTS,
    formatShortcut,
    isMacPlatform,
    shortcutKeys,
    type ShortcutKeys
} from '../../shared/shortcutHints';
import {
    DEFAULT_ZOOM,
    ZOOM_LEVELS,
    formatZoom,
    readZoom,
    writeZoom,
    zoomIn,
    zoomOut
} from '../shared/liveZoom';

/** ツールバーのボタン定義。 */
interface ToolbarButton {
    /** 表示ラベル。 */
    label: string;
    /** 操作名（ホバーのチートシートと `aria-label` に出す）。**英語ソース**で書き、表示時に `t()` で訳す。 */
    name: string;
    /** ブロック変換なら種別。 */
    block?: NotionBlockAction;
    /** インライン書式なら書式の種類。 */
    format?: InlineFormat;
    /** モード切替なら遷移先。 */
    mode?: 'raw';
    /** その他のホスト側コマンド。 */
    command?: 'exportPdf';
}

const BUTTONS: ToolbarButton[] = [
    { label: 'H1', name: 'Heading 1', block: 'heading1' },
    { label: 'H2', name: 'Heading 2', block: 'heading2' },
    { label: 'H3', name: 'Heading 3', block: 'heading3' },
    { label: '☑', name: 'Checkbox', block: 'todo' },
    { label: '•', name: 'Bulleted list', block: 'bulletList' },
    { label: '1.', name: 'Numbered list', block: 'orderedList' },
    { label: '❝', name: 'Quote', block: 'blockquote' },
    { label: '▸', name: 'Toggle list', block: 'toggleList' },
    { label: 'B', name: 'Bold', format: 'bold' },
    { label: 'I', name: 'Italic', format: 'italic' },
    { label: 'U', name: 'Underline', format: 'underline' },
    { label: 'S', name: 'Strikethrough', format: 'strikethrough' },
    { label: '<>', name: 'Inline code', format: 'code' },
    { label: '🔗', name: 'Link', format: 'link' }
];

/*
 * PDF 書き出し自体は無料・無制限。ツールチップ名に "(free)" を付け、
 * クレジット行除去だけが有料であることをホバー時点で誤解なく伝える
 * （docs/specifications/live-mode/requirements.md §4.6.1）。
 */
/** スクロールする側の末尾に置く操作（固定はしない）。 */
const EXTRAS: ToolbarButton[] = [
    { label: 'PDF', name: 'Export to PDF (free)', command: 'exportPdf' }
];

/** 右端に固定するモード系。 */
const MODES: ToolbarButton[] = [
    { label: 'Raw', name: 'Open in Raw mode', mode: 'raw' }
];

/** ボタンに対応するショートカット（無い操作もある）。 */
function shortcutOf(b: ToolbarButton): ShortcutKeys | undefined {
    if (b.block) return BLOCK_SHORTCUTS[b.block];
    if (b.format) return INLINE_SHORTCUTS[b.format];
    if (b.mode === 'raw') return COMMAND_SHORTCUTS.switchRaw;
    return undefined;
}

export interface ToolbarHandlers {
    /** ブロック変換を当てる。 */
    applyBlock(view: EditorView, action: NotionBlockAction): void;
    /** 選択にインライン書式を当てる。 */
    applyInlineFormat(view: EditorView, format: InlineFormat): void;
    /** 別モードで開き直す。 */
    switchMode(mode: 'raw'): void;
    /** ホスト側のコマンドを実行する。 */
    runCommand(command: 'exportPdf'): void;
}

export interface ToolbarOptions {
    /** PDF ボタンの右上に PRO+ バッジを出す（クレジット行の除去が有料であることの示唆）。 */
    showProBadge?: boolean;
}

/** ツールバーの DOM を作って `parent` の先頭に差し込む。 */
export function mountLiveToolbar(
    parent: HTMLElement,
    view: EditorView,
    handlers: ToolbarHandlers,
    options: ToolbarOptions = {}
): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'cm-live-toolbar';

    const tip = makeShortcutTip(bar, view);

    const left = document.createElement('div');
    left.className = 'cm-live-toolbar-group';
    for (const b of BUTTONS) {
        left.appendChild(makeButton(b, view, handlers, tip));
    }

    /*
     * はみ出しはツールバー自身の横スクロールで見せる（ユーザー指示 2026-09-12:
     * 「画面内に収まるようにして横スクロールにできない？ 今は画面が拡張してしまっています」）。
     * 書式ボタンと拡大率はこの中（＝スクロールする側）。
     * ホバー時のチートシートは切れないよう、スクロール領域の**外側**（bar 直下）に置く。
     */
    const scroll = document.createElement('div');
    scroll.className = 'cm-live-toolbar-scroll';
    scroll.appendChild(left);
    const extras = document.createElement('div');
    extras.className = 'cm-live-toolbar-group';
    extras.appendChild(makeZoomControl(view, tip));
    for (const b of EXTRAS) {
        extras.appendChild(makeButton(b, view, handlers, tip, options));
    }
    scroll.appendChild(extras);
    bar.appendChild(scroll);

    /*
     * モード系（Raw / Live）はスクロール領域の外に置き、幅が狭くても**常に右端**へ残す
     * （ユーザー指示 2026-09-12:「pdf raw live の並びにしてほしい」
     * 「raw live はずっと右に固定で表示されるようにしてほしい」
     * 「pdf の部分は固定しなくていいです」）。PDF はスクロールする側の末尾。
     */
    const modes = document.createElement('div');
    modes.className = 'cm-live-toolbar-group cm-live-toolbar-modes';
    for (const b of MODES) {
        modes.appendChild(makeButton(b, view, handlers, tip));
    }
    const live = document.createElement('span');
    live.className = 'cm-live-toolbar-current';
    live.textContent = 'Live';
    modes.appendChild(live);
    bar.appendChild(modes);

    parent.insertBefore(bar, parent.firstChild);
    return bar;
}

/** ホバー中のボタンに出す「操作名 + ショートカットキー」。 */
interface ShortcutTip {
    /** ボタンにホバー表示を紐付ける（`aria-label` などの属性も付ける）。 */
    attach(el: HTMLElement, name: string, keys?: ShortcutKeys): void;
    /** 表示を消す。 */
    hide(): void;
}

/** ツールチップが出るまでの待ち時間（ms）。マウスが通り過ぎるだけでは出さない。 */
const TIP_DELAY = 60;
/** ツールチップと画面端の最小の隙間（px）。 */
const TIP_MARGIN = 4;

/**
 * ショートカットのチートシート用ツールチップを1つ作り、ボタンに紐付ける口を返す。
 *
 * OS 標準の `title` は出るまで 1〜2 秒かかり「どのキーか」をすぐ確認できないので使わない
 * （docs/specifications/live-mode/requirements.md §4.6.1）。
 */
function makeShortcutTip(bar: HTMLElement, view: EditorView): ShortcutTip {
    const mac = isMacPlatform(navigator.platform || navigator.userAgent);

    const tip = document.createElement('div');
    tip.className = 'cm-live-toolbar-tip';
    tip.setAttribute('role', 'tooltip');
    tip.hidden = true;
    const nameEl = document.createElement('span');
    nameEl.className = 'cm-live-toolbar-tip-name';
    const keysEl = document.createElement('span');
    keysEl.className = 'cm-live-toolbar-tip-keys';
    tip.appendChild(nameEl);
    tip.appendChild(keysEl);
    bar.appendChild(tip);

    let timer: number | undefined;

    const hide = (): void => {
        if (timer !== undefined) {
            window.clearTimeout(timer);
            timer = undefined;
        }
        tip.hidden = true;
    };

    const show = (target: HTMLElement, name: string, keys: string[]): void => {
        nameEl.textContent = name;
        keysEl.textContent = '';
        for (const k of keys) {
            const kbd = document.createElement('kbd');
            kbd.textContent = k;
            keysEl.appendChild(kbd);
        }
        // 幅が要るので先に出してから位置を決める
        tip.hidden = false;
        const anchor = target.getBoundingClientRect();
        const base = bar.getBoundingClientRect();
        const width = tip.offsetWidth;
        const max = document.documentElement.clientWidth - width - TIP_MARGIN;
        const left = Math.min(Math.max(anchor.left + anchor.width / 2 - width / 2, TIP_MARGIN), Math.max(max, TIP_MARGIN));
        tip.style.left = `${left - base.left}px`;
        tip.style.top = `${anchor.bottom - base.top + 6}px`;
    };

    bar.addEventListener('mouseleave', hide);
    // エディタを触ったら（クリック・入力）残さない
    view.dom.addEventListener('mousedown', hide);
    view.dom.addEventListener('keydown', hide);

    return {
        attach(el, name, keys) {
            const list = shortcutKeys(keys, mac);
            el.setAttribute('aria-label', name);
            if (list.length > 0) el.setAttribute('aria-keyshortcuts', formatShortcut(keys, mac));

            const open = (): void => {
                if (!tip.hidden) {
                    show(el, name, list); // すでに出ているときは待たずに差し替える
                    return;
                }
                if (timer !== undefined) window.clearTimeout(timer);
                timer = window.setTimeout(() => {
                    timer = undefined;
                    show(el, name, list);
                }, TIP_DELAY);
            };

            el.addEventListener('mouseenter', open);
            el.addEventListener('focus', open);
            el.addEventListener('mouseleave', hide);
            el.addEventListener('blur', hide);
            el.addEventListener('click', hide);
        },
        hide
    };
}

/** `localStorage` を取り出す（webview の権限次第で例外になるので包む）。 */
function zoomStorage(): Storage | null {
    try {
        return window.localStorage ?? null;
    } catch {
        return null;
    }
}

/**
 * `−` / 拡大率 / `+` のズームコントロールを作る。
 *
 * 反映は `<html>` の CSS 変数 `--live-zoom` を書き換えるだけにして、
 * 実際の倍率の当て方（本文サイズと読み幅の両方に掛ける）は CSS 側に寄せる。
 */
function makeZoomControl(view: EditorView, tip: ShortcutTip): HTMLElement {
    const storage = zoomStorage();
    const wrap = document.createElement('div');
    wrap.className = 'cm-live-toolbar-group cm-live-toolbar-zoom';

    const out = document.createElement('button');
    out.type = 'button';
    out.className = 'cm-live-toolbar-button';
    out.dataset.zoom = 'out';
    out.textContent = '−';
    tip.attach(out, t('Zoom out'));

    const value = document.createElement('button');
    value.type = 'button';
    value.className = 'cm-live-toolbar-button cm-live-toolbar-zoom-value';
    tip.attach(value, t('Reset zoom to 100%'));

    const inc = document.createElement('button');
    inc.type = 'button';
    inc.className = 'cm-live-toolbar-button';
    inc.dataset.zoom = 'in';
    inc.textContent = '+';
    tip.attach(inc, t('Zoom in'));

    let zoom = readZoom(storage);

    const apply = (next: number, persist: boolean): void => {
        zoom = next;
        document.documentElement.style.setProperty('--live-zoom', String(zoom));
        value.textContent = formatZoom(zoom);
        out.disabled = zoom <= ZOOM_LEVELS[0];
        inc.disabled = zoom >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1];
        if (persist) writeZoom(storage, zoom);
    };

    for (const [el, next] of [
        [out, () => zoomOut(zoom)],
        [value, () => DEFAULT_ZOOM],
        [inc, () => zoomIn(zoom)]
    ] as [HTMLButtonElement, () => number][]) {
        // ボタンを押してもエディタのフォーカス・選択を失わないようにする
        el.addEventListener('mousedown', (e) => e.preventDefault());
        el.addEventListener('click', () => {
            apply(next(), true);
            view.focus();
        });
        wrap.appendChild(el);
    }

    apply(zoom, false);
    return wrap;
}

function makeButton(
    b: ToolbarButton,
    view: EditorView,
    handlers: ToolbarHandlers,
    tip: ShortcutTip,
    options: ToolbarOptions = {}
): HTMLButtonElement {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'cm-live-toolbar-button';
    el.textContent = b.label;
    // PDF の書き出し自体は無料。バッジは「クレジット行の除去が有料」の示唆で、ツールチップで併記する
    const pro = b.command === 'exportPdf' && options.showProBadge === true;
    if (pro) {
        el.classList.add('cm-live-toolbar-button-pro');
        const badge = document.createElement('span');
        badge.className = 'cm-live-toolbar-badge';
        badge.textContent = 'PRO+';
        badge.setAttribute('aria-hidden', 'true');
        el.appendChild(badge);
    }
    if (b.block) el.dataset.block = b.block;
    if (b.format) el.dataset.format = b.format;
    if (b.mode) el.dataset.mode = b.mode;
    if (b.command) el.dataset.command = b.command;
    tip.attach(el, t(pro ? 'Export to PDF (free; PRO+ removes the credit line)' : b.name), shortcutOf(b));
    // ボタンを押してもエディタのフォーカス・選択を失わないようにする
    el.addEventListener('mousedown', (e) => e.preventDefault());
    el.addEventListener('click', () => {
        if (b.command) handlers.runCommand(b.command);
        else if (b.mode) handlers.switchMode(b.mode);
        else if (b.block) handlers.applyBlock(view, b.block);
        else if (b.format) handlers.applyInlineFormat(view, b.format);
        view.focus();
    });
    return el;
}
