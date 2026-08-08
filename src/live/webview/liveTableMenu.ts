/**
 * 表セルの右クリックメニュー（requirements.md §2.7.2）。
 *
 * 表は畳んだまま編集するので、生のパイプ記法を書き足して行や列を増やすことができない。
 * その代わりの入口がこのメニュー。ソース変換そのものは `tableEdit.ts`（純関数）に
 * あり、ここは **DOM（メニューの生成・開閉）と CodeMirror への差分適用**だけを持つ。
 *
 * メニューは常に1つだけ（モジュール内のシングルトン）。ウィジェットは再生成されるので、
 * リスナーは開いている間だけ document に付け、閉じるときに必ず外す（漏らさない）。
 */
import type { EditorView } from '@codemirror/view';
import {
    applyTableCommand,
    tableDeletionRange,
    tableMenuItems,
    type TableCommand
} from '../shared/tableEdit';
import type { CellPos } from '../shared/tableSelection';

export interface TableMenuContext {
    /** 表ブロックのソース。 */
    source: string;
    /** 表ブロックの先頭オフセット。 */
    from: number;
    /** 右クリックされたセル。 */
    target: CellPos;
    view: EditorView;
    /** 表ウィジェットのルート要素（セルのハイライトに使う）。 */
    wrap: HTMLElement;
}

let openMenu: HTMLElement | null = null;
let detach: (() => void) | null = null;

/** 開いているメニューを閉じる。開いていなければ何もしない。 */
export function closeTableMenu(): void {
    detach?.();
    detach = null;
    openMenu?.remove();
    openMenu = null;
}

/** 選択ハイライトを消す。 */
function clearHighlight(wrap: HTMLElement): void {
    for (const el of wrap.querySelectorAll('.cm-live-cell-selected')) {
        el.classList.remove('cm-live-cell-selected');
    }
}

/** 行または列のセルをハイライトする（矩形選択と同じクラスなので ⌘C もそのまま効く）。 */
function highlightLine(wrap: HTMLElement, target: CellPos, kind: 'row' | 'col'): void {
    clearHighlight(wrap);
    const key = kind === 'row' ? 'row' : 'col';
    const value = String(kind === 'row' ? target.row : target.col);
    for (const el of wrap.querySelectorAll<HTMLElement>('[contenteditable="true"]')) {
        if (el.dataset[key] === value) el.classList.add('cm-live-cell-selected');
    }
    // セル内のキャレット選択が残っていると2種類の選択が同時に見えるので消す
    window.getSelection()?.removeAllRanges();
}

/** コマンドを実行する。 */
function run(command: TableCommand, ctx: TableMenuContext): void {
    if (command === 'selectRow') {
        highlightLine(ctx.wrap, ctx.target, 'row');
        return;
    }
    if (command === 'selectColumn') {
        highlightLine(ctx.wrap, ctx.target, 'col');
        return;
    }

    const next = applyTableCommand(ctx.source, ctx.target, command);
    if (next === null) return;

    const to = ctx.from + ctx.source.length;
    if (next === '') {
        // 表ブロックだけ消すと空行が2つ並ぶので、改行の扱いは純関数に任せる
        const range = tableDeletionRange(ctx.view.state.doc.toString(), ctx.from, to);
        ctx.view.dispatch({
            changes: { from: range.from, to: range.to, insert: '' },
            userEvent: 'delete'
        });
    } else {
        ctx.view.dispatch({
            changes: { from: ctx.from, to, insert: next },
            userEvent: 'input'
        });
    }
    ctx.view.focus();
}

/**
 * セルの右クリックでメニューを開く。
 * 画面からはみ出さないよう、右端・下端では内側へ寄せる。
 */
export function openTableMenu(event: MouseEvent, ctx: TableMenuContext): void {
    closeTableMenu();

    const menu = document.createElement('div');
    menu.className = 'cm-live-table-menu';
    menu.setAttribute('role', 'menu');

    for (const item of tableMenuItems(ctx.source, ctx.target)) {
        if (item.separatorBefore) {
            const sep = document.createElement('div');
            sep.className = 'cm-live-table-menu-sep';
            menu.appendChild(sep);
        }
        const el = document.createElement('div');
        el.className = 'cm-live-table-menu-item';
        el.setAttribute('role', 'menuitem');
        el.dataset.command = item.id;
        el.textContent = item.label;
        if (!item.enabled) el.setAttribute('aria-disabled', 'true');
        el.addEventListener('mousedown', (e) => e.preventDefault()); // セルのフォーカスを保つ
        el.addEventListener('click', () => {
            if (!item.enabled) return;
            closeTableMenu();
            run(item.id, ctx);
        });
        menu.appendChild(el);
    }

    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    const x = Math.min(event.clientX, Math.max(0, window.innerWidth - rect.width - 4));
    const y = Math.min(event.clientY, Math.max(0, window.innerHeight - rect.height - 4));
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    const onOutside = (e: MouseEvent): void => {
        if (!menu.contains(e.target as Node)) closeTableMenu();
    };
    const onKey = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') closeTableMenu();
    };
    document.addEventListener('mousedown', onOutside, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', closeTableMenu);
    detach = () => {
        document.removeEventListener('mousedown', onOutside, true);
        document.removeEventListener('keydown', onKey, true);
        window.removeEventListener('resize', closeTableMenu);
    };
    openMenu = menu;
}
