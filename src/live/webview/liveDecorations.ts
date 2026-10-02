/**
 * Live モードの decoration ビルダ。
 *
 * 「生テキストに装飾を重ねるだけ」という Live モードの原則（requirements.md R1.1）を
 * 守るため、ここでは **ドキュメントを一切変更しない**。記法文字を消すのは
 * `Decoration.replace`、装飾は `Decoration.mark` / `Decoration.line` だけで行う。
 *
 * `atomicRanges` は使わない。カーソルは隠れた記法の上を1文字ずつ通過し、
 * 通過した瞬間に展開される（Obsidian 実測 §3.1・requirements.md R1.2）。
 *
 * decoration は **StateField** から供給する。表のようなブロックウィジェット
 * （`Decoration.replace({ block: true })`）は CodeMirror の制約で ViewPlugin からは
 * 供給できないため（"Block decorations may not be specified via plugins"）、
 * フォーカス状態も StateEffect で state に載せて一元化している。
 */
import { t } from './i18n';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { StateEffect, StateField, type EditorState, type Range } from '@codemirror/state';
import katex from 'katex';
import mermaid from 'mermaid';
import { scanSyntaxRanges, type SyntaxKind, type SyntaxRange } from '../shared/syntaxRanges';
import { isRevealed } from '../shared/revealScope';
import { parseTableCells } from '../shared/tableCells';
import { inlineSegments } from '../shared/inlineSegments';
import type { InlineHtml } from '../shared/inlineHtml';
import { cellsInRect, selectionToMarkdown, type CellPos } from '../shared/tableSelection';
import { normalizeWidths, resizeColumn } from '../shared/tableColumnWidths';
import { closeTableMenu, openTableMenu } from './liveTableMenu';

/** 収縮時に記法文字を DOM から消すための decoration（幅0の置換）。 */
const HIDE = Decoration.replace({});

/**
 * 収縮時のチェックボックス。実測どおり、"- [ ]" の5文字をこのウィジェットで置換する。
 * クリックするとソースの `[ ]` ⇄ `[x]` を書き換える（ドキュメントを直接編集する
 * 唯一の decoration なので、他の記法と混同しないこと）。
 */
class CheckboxWidget extends WidgetType {
    constructor(private readonly checked: boolean, private readonly pos: number) {
        super();
    }

    eq(other: CheckboxWidget): boolean {
        return other.checked === this.checked && other.pos === this.pos;
    }

    toDOM(view: EditorView): HTMLElement {
        const label = document.createElement('label');
        label.className = 'cm-live-task-label';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'cm-live-checkbox';
        input.checked = this.checked;
        input.addEventListener('mousedown', (e) => e.preventDefault());
        input.addEventListener('click', () => {
            const line = view.state.doc.lineAt(this.pos);
            const idx = line.text.indexOf('[');
            if (idx < 0) return;
            const at = line.from + idx + 1;
            view.dispatch({
                changes: { from: at, to: at + 1, insert: this.checked ? ' ' : 'x' },
                userEvent: 'input'
            });
        });
        label.appendChild(input);
        return label;
    }

    ignoreEvent(): boolean {
        return false;
    }
}

/** 水平線。行の内容（`---` など）を罫線に置き換える。 */
class HrWidget extends WidgetType {
    eq(): boolean {
        return true;
    }
    toDOM(): HTMLElement {
        const el = document.createElement('span');
        el.className = 'cm-live-hr';
        return el;
    }
}

/** KaTeX で数式を描画する。壊れた数式でも throw せずソースをそのまま出す。 */
function renderMath(source: string, displayMode: boolean): HTMLElement {
    const el = document.createElement('span');
    el.className = displayMode ? 'cm-live-math-block' : 'cm-live-math-inline';
    try {
        katex.render(source, el, { displayMode, throwOnError: false });
    } catch {
        el.textContent = source;
        el.classList.add('cm-live-math-error');
    }
    return el;
}

/** 数式（ブロック / インライン）。 */
class MathWidget extends WidgetType {
    constructor(private readonly source: string, private readonly display: boolean) {
        super();
    }
    eq(other: MathWidget): boolean {
        return other.source === this.source && other.display === this.display;
    }
    toDOM(): HTMLElement {
        return renderMath(this.source, this.display);
    }
}

/** 画像。読み込めなくてもレイアウトが崩れないよう alt を持たせる。 */
class ImageWidget extends WidgetType {
    constructor(private readonly src: string, private readonly alt: string) {
        super();
    }
    eq(other: ImageWidget): boolean {
        return other.src === this.src && other.alt === this.alt;
    }
    toDOM(): HTMLElement {
        const img = document.createElement('img');
        img.className = 'cm-live-image';
        img.src = this.src;
        img.alt = this.alt;
        return img;
    }
    ignoreEvent(): boolean {
        return false;
    }
}

/** コールアウト。`> [!note] 見出し` + 続く `>` 行をボックスとして描く。 */
class CalloutWidget extends WidgetType {
    constructor(private readonly type: string, private readonly source: string) {
        super();
    }
    eq(other: CalloutWidget): boolean {
        return other.type === this.type && other.source === this.source;
    }
    toDOM(): HTMLElement {
        const box = document.createElement('div');
        box.className = `cm-live-callout cm-live-callout-${this.type}`;
        const lines = this.source.split('\n').map((l) => l.replace(/^>\s?/, ''));
        const head = document.createElement('div');
        head.className = 'cm-live-callout-title';
        head.textContent = lines[0].replace(/^\[![A-Za-z-]+\]\s*/, '') || this.type.toUpperCase();
        box.appendChild(head);
        const body = lines.slice(1).filter((l) => l.trim() !== '');
        if (body.length > 0) {
            const p = document.createElement('div');
            p.className = 'cm-live-callout-body';
            p.textContent = body.join('\n');
            box.appendChild(p);
        }
        return box;
    }
    ignoreEvent(): boolean {
        return false;
    }
}

/**
 * mermaid 図。コードのソースは常に見せたまま、その**下に描画結果**を出す
 * （ユーザー指示 2026-08-05: 「mermaid だけはその下に preview で見やすくなるように」）。
 * 数式ブロックと同じ見せ方。
 */
let mermaidReady = false;
let mermaidSeq = 0;

class MermaidWidget extends WidgetType {
    constructor(private readonly source: string) {
        super();
    }
    eq(other: MermaidWidget): boolean {
        return other.source === this.source;
    }
    toDOM(): HTMLElement {
        const box = document.createElement('div');
        box.className = 'cm-live-mermaid';
        if (!mermaidReady) {
            mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'strict' });
            mermaidReady = true;
        }
        const id = `cm-live-mermaid-${++mermaidSeq}`;
        mermaid
            .render(id, this.source)
            .then(({ svg }) => {
                box.innerHTML = svg;
            })
            .catch((err: unknown) => {
                // 図が壊れていてもエディタは壊さない。理由だけ出す。
                box.classList.add('cm-live-mermaid-error');
                box.textContent = err instanceof Error ? err.message : String(err);
            });
        return box;
    }
    ignoreEvent(): boolean {
        return false;
    }
}

/** 収縮時のコードフェンス開始行に出す言語ラベル。 */
class FenceLangWidget extends WidgetType {
    constructor(private readonly info: string) {
        super();
    }
    eq(other: FenceLangWidget): boolean {
        return other.info === this.info;
    }
    toDOM(): HTMLElement {
        const el = document.createElement('span');
        el.className = 'cm-live-fence-lang';
        el.textContent = this.info;
        return el;
    }
}

/**
 * 開いているあいだだけ覚える列幅（文書内の表の並び順がキー）。
 *
 * パイプ記法に列幅の表現は無いので Markdown には書かない（ユーザー指示 2026-09-12:
 * 「一時的にでいいので開いている間 列の幅を調整できるように」）。タブを閉じれば消える。
 */
const columnWidthMemory = new Map<number, number[]>();

/** ヘッダー行のセル（列の実体）。 */
function headerCells(wrap: HTMLElement): HTMLElement[] {
    return [...wrap.querySelectorAll<HTMLElement>('thead th')];
}

/** 今の列幅（記憶があればそれを、無ければ実測を使う）。 */
function currentColumnWidths(wrap: HTMLElement, index: number): number[] {
    const measured = headerCells(wrap).map((th) => th.getBoundingClientRect().width);
    return normalizeWidths(columnWidthMemory.get(index), measured);
}

/** 列幅を `<colgroup>` に反映する（セルの中身を触らないので編集と干渉しない）。 */
function applyColumnWidths(wrap: HTMLElement, widths: readonly number[]): void {
    const table = wrap.querySelector<HTMLElement>('table');
    const cols = [...wrap.querySelectorAll<HTMLElement>('colgroup col')];
    if (!table || cols.length === 0) return;
    table.style.tableLayout = 'fixed';
    table.style.width = `${widths.reduce((a, b) => a + b, 0)}px`;
    cols.forEach((col, i) => {
        if (widths[i] !== undefined) col.style.width = `${widths[i]}px`;
    });
}

/** つまみを列の境界へ置き直す（描画後・スクロール後・幅変更後に呼ぶ）。 */
function layoutColumnResizers(wrap: HTMLElement): void {
    const table = wrap.querySelector<HTMLElement>('table');
    const layer = wrap.querySelector<HTMLElement>('.cm-live-col-resizers');
    if (!table || !layer) return;
    const cells = headerCells(wrap);
    const handles = [...layer.querySelectorAll<HTMLElement>('.cm-live-col-resize')];
    cells.forEach((th, i) => {
        const handle = handles[i];
        if (!handle) return;
        handle.style.left = `${th.offsetLeft + th.offsetWidth}px`;
        handle.style.top = `${table.offsetTop}px`;
        handle.style.height = `${table.offsetHeight}px`;
    });
}

/**
 * 列の境界に「つまみ」を置いてドラッグで幅を変えられるようにする。
 *
 * セルは contenteditable で、フォーカスのたびに中身を作り直す（生 Markdown ⇄ 描画）ため、
 * つまみはセルの中ではなく表の上に重ねたレイヤーに置く。
 */
function attachColumnResizers(wrap: HTMLElement, index: number): void {
    const layer = document.createElement('div');
    layer.className = 'cm-live-col-resizers';
    layer.contentEditable = 'false';
    for (let i = 0; i < headerCells(wrap).length; i++) {
        const handle = document.createElement('span');
        handle.className = 'cm-live-col-resize';
        handle.dataset.col = String(i);
        handle.setAttribute('role', 'separator');
        handle.setAttribute('aria-label', t('Resize column'));
        handle.setAttribute('aria-orientation', 'vertical');
        layer.appendChild(handle);
    }
    wrap.appendChild(layer);

    layer.addEventListener('pointerdown', (e) => {
        const handle = (e.target as HTMLElement).closest<HTMLElement>('.cm-live-col-resize');
        if (!handle) return;
        // セルへフォーカスが移ったり、CodeMirror が選択を作ったりしないようにする
        e.preventDefault();
        e.stopPropagation();

        const col = Number(handle.dataset.col ?? '0');
        const start = e.clientX;
        const base = currentColumnWidths(wrap, index);
        handle.dataset.dragging = '1';
        handle.setPointerCapture(e.pointerId);

        const move = (ev: PointerEvent): void => {
            const next = resizeColumn(base, col, ev.clientX - start);
            columnWidthMemory.set(index, next);
            applyColumnWidths(wrap, next);
            layoutColumnResizers(wrap);
        };
        const up = (): void => {
            handle.dataset.dragging = '0';
            handle.removeEventListener('pointermove', move);
            layoutColumnResizers(wrap);
        };
        handle.addEventListener('pointermove', move);
        handle.addEventListener('pointerup', up, { once: true });
        handle.addEventListener('pointercancel', up, { once: true });
    });

    wrap.addEventListener('scroll', () => layoutColumnResizers(wrap));
    requestAnimationFrame(() => layoutColumnResizers(wrap));
}

/**
 * 表。パイプ記法のブロックを実 `<table>` として描画し、**セルの中で直接編集**できるようにする。
 *
 * Obsidian 実測（§2.8）どおり、カーソルが表の中にあっても生のパイプ記法へは戻さない
 * （never スコープ）。セルは `contenteditable` にして、入力を CodeMirror の差分へ
 * 変換する。セルの範囲は `parseTableCells` が返すソースの実オフセットを使うので、
 * 入力が隣のセルへ入ることはない。
 */
class TableWidget extends WidgetType {
    constructor(
        private readonly source: string,
        private readonly from: number,
        /** 文書内で何番目の表か（列幅の記憶キー）。 */
        private readonly index: number
    ) {
        super();
    }

    eq(other: TableWidget): boolean {
        return other.source === this.source && other.from === this.from && other.index === this.index;
    }

    toDOM(view: EditorView): HTMLElement {
        const wrap = document.createElement('div');
        wrap.className = 'cm-live-table-wrap';
        const table = document.createElement('table');
        table.className = 'cm-live-table';
        const thead = document.createElement('thead');
        const tbody = document.createElement('tbody');

        parseTableCells(this.source, this.from).forEach((row, rowIndex) => {
            const tr = document.createElement('tr');
            row.cells.forEach((cell, colIndex) => {
                const td = document.createElement(row.isHeader ? 'th' : 'td');
                td.contentEditable = 'true';
                td.spellcheck = false;
                td.dataset.from = String(cell.from);
                td.dataset.to = String(cell.to);
                td.dataset.row = String(rowIndex);
                td.dataset.col = String(colIndex);
                renderCell(td, cell.text);
                if (cell.align) td.style.textAlign = cell.align;
                tr.appendChild(td);
            });
            (row.isHeader ? thead : tbody).appendChild(tr);
        });
        const colgroup = document.createElement('colgroup');
        const columnCount = thead.rows[0]?.cells.length ?? tbody.rows[0]?.cells.length ?? 0;
        for (let i = 0; i < columnCount; i++) colgroup.appendChild(document.createElement('col'));
        table.appendChild(colgroup);
        table.appendChild(thead);
        table.appendChild(tbody);
        wrap.appendChild(table);

        // 列幅つまみ（一時的な列幅調整）。記憶があれば先に当てる。
        attachColumnResizers(wrap, this.index);
        const remembered = columnWidthMemory.get(this.index);
        if (remembered) {
            applyColumnWidths(wrap, remembered);
            requestAnimationFrame(() => layoutColumnResizers(wrap));
        }

        attachRangeSelection(wrap, view);
        wrap.addEventListener('input', () => this.onInput(wrap, view));
        wrap.addEventListener('keydown', (e) => this.onKeyDown(e, wrap, view));
        wrap.addEventListener('contextmenu', (e) => this.onContextMenu(e, wrap, view));
        /*
         * フォーカスしたセルだけ生の Markdown に戻して編集させ、外れたら描画に戻す。
         * 記法の展開/収縮と同じ考え方をセル単位でやっている。
         */
        wrap.addEventListener('focusin', (e) => {
            const cell = (e.target as HTMLElement).closest<HTMLElement>('[contenteditable="true"]');
            if (!cell || cell.dataset.editing === '1') return;
            cell.dataset.editing = '1';
            cell.textContent = rawOf(view, cell);
            placeCaretAtEnd(cell);
        });
        wrap.addEventListener('focusout', (e) => {
            const cell = (e.target as HTMLElement).closest<HTMLElement>('[contenteditable="true"]');
            if (!cell) return;
            cell.dataset.editing = '0';
            renderCell(cell, rawOf(view, cell));
        });
        return wrap;
    }

    /**
     * 自分のセル編集で起きた更新なら DOM を作り直さない（キャレットが飛ぶため）。
     * オフセットだけ新しいソース基準へ振り直す。
     */
    updateDOM(dom: HTMLElement, _view: EditorView): boolean {
        if (dom.dataset.selfEdit !== '1') return false;
        dom.dataset.selfEdit = '0';
        const cells = editableCells(dom);
        const fresh = parseTableCells(this.source, this.from).flatMap((r) => r.cells);
        if (cells.length !== fresh.length) return false;
        cells.forEach((el, i) => {
            el.dataset.from = String(fresh[i].from);
            el.dataset.to = String(fresh[i].to);
        });
        return true;
    }

    /** セルの中のイベントは CodeMirror に渡さず、ウィジェット側で処理する。 */
    ignoreEvent(): boolean {
        return true;
    }

    /** ウィジェットが捨てられたら、開きっぱなしのメニューも閉じる（body に出しているため）。 */
    destroy(): void {
        closeTableMenu();
    }

    /**
     * セルの右クリックで行・列の操作メニューを出す（requirements.md §2.7.2）。
     * 表は畳んだまま編集するので、行や列の増減はここが唯一の入口になる。
     */
    private onContextMenu(e: MouseEvent, wrap: HTMLElement, view: EditorView): void {
        const cell = (e.target as HTMLElement | null)?.closest<HTMLElement>(
            '[contenteditable="true"]'
        );
        if (!cell) return;
        e.preventDefault();
        openTableMenu(e, {
            source: this.source,
            from: this.from,
            target: { row: Number(cell.dataset.row), col: Number(cell.dataset.col) },
            view,
            wrap
        });
    }

    private onInput(wrap: HTMLElement, view: EditorView): void {
        const cell = document.activeElement as HTMLElement | null;
        if (!cell || !wrap.contains(cell) || cell.contentEditable !== 'true') return;
        const from = Number(cell.dataset.from);
        const to = Number(cell.dataset.to);
        if (!Number.isFinite(from) || !Number.isFinite(to)) return;

        // パイプと改行はセルに入れられない（表のソースが壊れるため）
        const raw = cell.textContent ?? '';
        const text = raw.replace(/[|\n]/g, '');
        if (text !== raw) {
            cell.textContent = text;
            placeCaretAtEnd(cell);
        }
        wrap.dataset.selfEdit = '1';
        view.dispatch({ changes: { from, to, insert: text }, userEvent: 'input' });
    }

    private onKeyDown(e: KeyboardEvent, wrap: HTMLElement, view: EditorView): void {
        if ((e.metaKey || e.ctrlKey) && (e.key === 'a' || e.key === 'A')) {
            // セル → その行 → 表全体 → 文書全体、と押すたびに広げる
            e.preventDefault();
            selectAllStepInTable(wrap, view, this.from, this.source);
            return;
        }
        if (e.key === 'Enter') {
            // セル内に改行は入れない（表を壊す）
            e.preventDefault();
            return;
        }
        if (e.key === 'Tab') {
            e.preventDefault();
            const cells = editableCells(wrap);
            const i = cells.indexOf(document.activeElement as HTMLElement);
            if (i < 0) return;
            const next = e.shiftKey ? i - 1 : i + 1;
            const target = cells[next];
            if (target) {
                target.focus();
                placeCaretAtEnd(target);
            }
            return;
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            view.focus();
        }
    }
}

/**
 * セルをまたぐ範囲選択を付ける。
 *
 * セルは個別の contenteditable なので、ブラウザの選択は1セルで止まる。
 * ドラッグ（と Shift+クリック）でアンカー〜フォーカスの矩形を持ち、
 * 選択セルにクラスを付けてハイライトし、コピーはタブ/改行区切りで書き出す。
 */
function attachRangeSelection(wrap: HTMLElement, view: EditorView): void {
    let anchor: CellPos | null = null;
    let dragging = false;

    const cellAt = (target: EventTarget | null): HTMLElement | null =>
        (target as HTMLElement | null)?.closest<HTMLElement>('[contenteditable="true"]') ?? null;

    const posOf = (cell: HTMLElement): CellPos => ({
        row: Number(cell.dataset.row),
        col: Number(cell.dataset.col)
    });

    const clear = (): void => {
        for (const el of wrap.querySelectorAll('.cm-live-cell-selected')) {
            el.classList.remove('cm-live-cell-selected');
        }
    };

    const highlight = (focus: CellPos): void => {
        clear();
        if (!anchor) return;
        const cells = cellsInRect(anchor, focus);
        if (cells.length <= 1) return; // 単一セルは通常のテキスト選択に任せる
        for (const c of cells) {
            wrap
                .querySelector(`[data-row="${c.row}"][data-col="${c.col}"]`)
                ?.classList.add('cm-live-cell-selected');
        }
    };

    wrap.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; // 右クリックはメニュー用。選択は動かさない
        const cell = cellAt(e.target);
        if (!cell) return;
        if (e.shiftKey && anchor) {
            e.preventDefault();
            highlight(posOf(cell));
            return;
        }
        anchor = posOf(cell);
        dragging = true;
        clear();
    });

    wrap.addEventListener('mouseover', (e) => {
        // ウィジェットは作り直されるので window へリスナーを足さない（漏れる）。
        // ボタンが離されていたらドラッグ終了とみなす。
        if (e.buttons === 0) dragging = false;
        if (!dragging) return;
        const cell = cellAt(e.target);
        if (!cell) return;
        const focus = posOf(cell);
        if (anchor && (focus.row !== anchor.row || focus.col !== anchor.col)) {
            // セルをまたいだ時点で、崩れたブラウザ選択は捨てて矩形選択に切り替える
            window.getSelection()?.removeAllRanges();
        }
        highlight(focus);
    });

    wrap.addEventListener('mouseup', () => {
        dragging = false;
    });

    wrap.addEventListener('copy', (e) => {
        const selected = [...wrap.querySelectorAll<HTMLElement>('.cm-live-cell-selected')];
        if (selected.length === 0) return; // 単一セルは既定のコピーに任せる
        const rows: string[][] = [];
        for (const el of wrap.querySelectorAll<HTMLElement>('[contenteditable="true"]')) {
            const r = Number(el.dataset.row);
            const c = Number(el.dataset.col);
            rows[r] = rows[r] ?? [];
            // 描画後の文字ではなくソースの生 Markdown を載せる（requirements.md §4.5）。
            // textContent だと装飾のあるセルは記法が落ち、フォーカス中のセルだけ生のまま残る。
            rows[r][c] = rawOf(view, el);
        }
        const cells = selected.map(posOf);
        e.clipboardData?.setData('text/plain', selectionToMarkdown(rows, cells));
        e.preventDefault();
    });

    wrap.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') clear();
    });
}

/** セルのソース範囲から生テキストを取り出す。 */
function rawOf(view: EditorView, cell: HTMLElement): string {
    const from = Number(cell.dataset.from);
    const to = Number(cell.dataset.to);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return cell.textContent ?? '';
    return view.state.doc.sliceString(from, to);
}

/** セルにインライン記法を描画する（記法文字は隠す）。 */
function renderCell(cell: HTMLElement, raw: string): void {
    cell.textContent = '';
    for (const seg of inlineSegments(raw)) {
        let node: Node;
        if (seg.classes === '') {
            node = document.createTextNode(seg.text);
        } else {
            const span = document.createElement('span');
            span.className = seg.classes;
            span.textContent = seg.text;
            node = span;
        }
        // インライン HTML は内側から順に包む（タグ名・style は許可リストで無害化済み）
        for (const h of [...(seg.html ?? [])].reverse()) {
            const el = createHtmlElement(h);
            el.appendChild(node);
            node = el;
        }
        cell.appendChild(node);
    }
}

/** インライン HTML の要素を作る。属性は style だけ（無害化済み）を付ける。 */
function createHtmlElement(h: InlineHtml): HTMLElement {
    const el = document.createElement(h.tag);
    el.className = 'cm-live-html';
    if (h.style) el.setAttribute('style', h.style);
    return el;
}

/**
 * 表の中での ⌘A。押すたびに セル → その行 → 表全体 → 文書全体 と広げる。
 * 行以上へ広がったら CodeMirror 側の選択に切り替える（セルの外へ出るため）。
 */
function selectAllStepInTable(
    wrap: HTMLElement,
    view: EditorView,
    tableFrom: number,
    source: string
): void {
    const cell = document.activeElement as HTMLElement | null;
    const selectedRows = new Set(
        [...wrap.querySelectorAll<HTMLElement>('.cm-live-cell-selected')].map((e) => e.dataset.row)
    );
    const cells = editableCells(wrap);

    // 段階3 → 文書全体
    if (selectedRows.size > 1) {
        view.focus();
        view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
        return;
    }
    // 段階2 → 表全体
    if (selectedRows.size === 1) {
        for (const el of cells) el.classList.add('cm-live-cell-selected');
        return;
    }
    // 段階1 → セルの中身が既に全選択なら、その行へ
    const sel = window.getSelection();
    const cellFullySelected =
        cell !== null &&
        sel !== null &&
        sel.toString().length > 0 &&
        sel.toString() === (cell.textContent ?? '');
    if (cell && cellFullySelected) {
        sel?.removeAllRanges();
        for (const el of cells) {
            if (el.dataset.row === cell.dataset.row) el.classList.add('cm-live-cell-selected');
        }
        return;
    }
    // 最初は「そのセルを全部」
    if (cell) {
        const range = document.createRange();
        range.selectNodeContents(cell);
        sel?.removeAllRanges();
        sel?.addRange(range);
        return;
    }
    // セルにフォーカスが無ければ表全体をソース側で選ぶ
    view.focus();
    view.dispatch({ selection: { anchor: tableFrom, head: tableFrom + source.length } });
}

/** ウィジェット内の編集可能セル（DOM 順）。 */
function editableCells(wrap: HTMLElement): HTMLElement[] {
    return [...wrap.querySelectorAll<HTMLElement>('[contenteditable="true"]')];
}

/** 要素の末尾にキャレットを置く。 */
function placeCaretAtEnd(el: HTMLElement): void {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
}

/** 本文へ当てる装飾クラス。記法ごとに1つ。 */
const MARK_CLASS: Partial<Record<SyntaxKind, string>> = {
    listMarker: 'cm-live-bullet',
    orderedMarker: 'cm-live-ordered',
    quoteMarker: 'cm-live-quote-marker',
    strong: 'cm-live-strong',
    em: 'cm-live-em',
    strongEm: 'cm-live-strong cm-live-em',
    strike: 'cm-live-strike',
    highlight: 'cm-live-highlight',
    code: 'cm-live-code',
    link: 'cm-live-link',
    wikilink: 'cm-live-link',
    image: 'cm-live-link'
};

const MARK_DECO = new Map<string, Decoration>();
function markDeco(cls: string): Decoration {
    let d = MARK_DECO.get(cls);
    if (!d) {
        d = Decoration.mark({ class: cls });
        MARK_DECO.set(cls, d);
    }
    return d;
}

/**
 * インライン HTML の中身を、そのタグの要素で包む decoration。
 * タグ名・style は許可リストで無害化済み（inlineHtml.ts）。属性は style だけを付ける。
 */
const HTML_DECO = new Map<string, Decoration>();
function htmlDeco(h: InlineHtml): Decoration {
    const key = `${h.tag}\u0000${h.style}`;
    let d = HTML_DECO.get(key);
    if (!d) {
        d = Decoration.mark({
            tagName: h.tag,
            class: 'cm-live-html',
            attributes: h.style ? { style: h.style } : undefined
        });
        HTML_DECO.set(key, d);
    }
    return d;
}

const LINE_DECO = new Map<string, Decoration>();
function lineDeco(cls: string): Decoration {
    let d = LINE_DECO.get(cls);
    if (!d) {
        d = Decoration.line({ class: cls });
        LINE_DECO.set(cls, d);
    }
    return d;
}

/** エディタがフォーカスを持っているかを state に載せるための Effect。 */
export const setLiveFocus = StateEffect.define<boolean>();

/** IME 変換中かどうかを state に載せるための Effect。 */
export const setLiveComposing = StateEffect.define<boolean>();

/**
 * 直前の走査結果のキャッシュ。
 *
 * decoration は選択が動くたびに作り直す必要があるが、**走査（scanSyntaxRanges）は
 * 文書が変わったときだけでよい**。1万行のファイルでカーソルを動かすたびに
 * フルスキャンすると目に見えて重くなるため、ここでドキュメント文字列をキーに
 * キャッシュする（`test/browser/live/usage-flows/performance.test.ts` が退行を検出する）。
 */
let scanCache: { doc: string; ranges: SyntaxRange[] } | null = null;

function scanCached(doc: string): SyntaxRange[] {
    if (scanCache && scanCache.doc === doc) return scanCache.ranges;
    const ranges = scanSyntaxRanges(doc);
    scanCache = { doc, ranges };
    return ranges;
}

/** フォーカス状態（decoration の計算に必要なので state に持つ）。 */
export const liveFocusField = StateField.define<boolean>({
    create: () => false,
    update(value, tr) {
        for (const e of tr.effects) if (e.is(setLiveFocus)) return e.value;
        return value;
    }
});

/** IME 変換中かどうか（変換中は decoration を作り直さない）。 */
export const liveComposingField = StateField.define<boolean>({
    create: () => false,
    update(value, tr) {
        for (const e of tr.effects) if (e.is(setLiveComposing)) return e.value;
        return value;
    }
});

/**
 * ドキュメント全体を走査して decoration を組み立てる。
 *
 * ビューポート制限は Phase 6（パフォーマンス）で入れる。ブロックウィジェットを
 * 扱う都合で StateField 供給にしたため、ここでは view を参照しない。
 */
export function buildLiveDecorations(state: EditorState): DecorationSet {
    const doc = state.doc.toString();
    const ranges = scanCached(doc);
    const selections = state.selection.ranges.map((r) => ({ from: r.from, to: r.to }));
    const hasFocus = state.field(liveFocusField, false) ?? false;

    const decos: Range<Decoration>[] = [];
    // 表は「文書内で何番目か」を渡す（列幅の一時記憶のキーになる）
    let tableSeq = 0;
    for (const r of ranges) {
        pushRange(decos, r, selections, hasFocus, state, r.kind === 'table' ? tableSeq++ : -1);
    }
    // Decoration.set の第2引数 true で from / startSide 順にソートさせる。
    return Decoration.set(decos, true);
}

/** decoration を供給する StateField。 */
export const liveDecorationField = StateField.define<DecorationSet>({
    create: (state) => buildLiveDecorations(state),
    update(deco, tr) {
        // IME 変換中は作り直さない（未確定文字列の DOM を壊さないため）
        const composing = tr.state.field(liveComposingField, false);
        const composingEnded = tr.effects.some((e) => e.is(setLiveComposing) && !e.value);
        if (composing && !composingEnded) return deco.map(tr.changes);
        if (
            tr.docChanged ||
            tr.selection ||
            tr.effects.some((e) => e.is(setLiveFocus) || e.is(setLiveComposing))
        ) {
            return buildLiveDecorations(tr.state);
        }
        return deco.map(tr.changes);
    },
    provide: (f) => EditorView.decorations.from(f)
});

/** フォーカスの変化を state へ流し込む。 */
export const liveFocusWatcher = EditorView.updateListener.of((u) => {
    if (u.focusChanged) u.view.dispatch({ effects: setLiveFocus.of(u.view.hasFocus) });
});

/** IME の開始/終了を state へ流し込む。 */
export const liveCompositionWatcher = EditorView.domEventHandlers({
    compositionstart(_event, view) {
        view.dispatch({ effects: setLiveComposing.of(true) });
        return false;
    },
    compositionend(_event, view) {
        // 変換確定の反映が終わってから再計算させる
        setTimeout(() => view.dispatch({ effects: setLiveComposing.of(false) }), 0);
        return false;
    }
});

function pushRange(
    decos: Range<Decoration>[],
    r: SyntaxRange,
    selections: { from: number; to: number }[],
    hasFocus: boolean,
    state: EditorState,
    tableIndex: number
): void {
    if (r.kind === 'heading' && r.level) {
        const line = state.doc.lineAt(r.revealFrom);
        decos.push(lineDeco(`cm-live-heading cm-live-h${r.level}`).range(line.from));
    }

    if (r.kind === 'quoteMarker') {
        const line = state.doc.lineAt(r.revealFrom);
        // 引用の塊の最初/最後の行に角丸と余白を付けるため、境界を判定してクラスを足す
        const prev = line.number > 1 ? state.doc.line(line.number - 1).text : '';
        const next = line.number < state.doc.lines ? state.doc.line(line.number + 1).text : '';
        const edge =
            (/^>/.test(prev) ? '' : ' cm-live-quote-first') + (/^>/.test(next) ? '' : ' cm-live-quote-last');
        decos.push(
            lineDeco(`cm-live-quote cm-live-quote-${Math.min(r.level ?? 1, 3)}${edge}`).range(line.from)
        );
    }
    if (r.kind === 'listMarker' || r.kind === 'orderedMarker' || r.kind === 'task') {
        const line = state.doc.lineAt(r.revealFrom);
        // ネストの深さをクラスに出す（ソースのインデント幅だけでは視覚的に浅すぎるため）
        const level = Math.min(r.level ?? 1, 6);
        decos.push(lineDeco(`cm-live-list-line cm-live-list-level-${level}`).range(line.from));
    }

    if (r.kind === 'codeFence') {
        const first = state.doc.lineAt(r.revealFrom).number;
        const last = state.doc.lineAt(r.revealTo).number;
        for (let n = first; n <= last; n++) {
            // 角丸と枠線を付けるため、ブロックの最初/最後の行だけ別クラスにする
            const edge = n === first ? ' cm-live-code-first' : n === last ? ' cm-live-code-last' : '';
            decos.push(lineDeco(`cm-live-code-line${edge}`).range(state.doc.line(n).from));
        }
        if (r.info === 'mermaid' && last > first + 1) {
            // ソースはそのまま、下に図を出す
            const body = state.doc.sliceString(state.doc.line(first + 1).from, state.doc.line(last - 1).to);
            decos.push(
                Decoration.widget({ widget: new MermaidWidget(body), block: true, side: 1 }).range(r.revealTo)
            );
        }
    }

    const revealed = isRevealed(r, selections, hasFocus);
    if (r.kind === 'frontmatter') {
        const first = state.doc.lineAt(r.revealFrom).number;
        const last = state.doc.lineAt(r.revealTo).number;
        for (let n = first; n <= last; n++) {
            decos.push(lineDeco('cm-live-frontmatter').range(state.doc.line(n).from));
        }
        return;
    }
    if (!revealed && r.kind === 'horizontalRule') {
        decos.push(Decoration.replace({ widget: new HrWidget() }).range(r.revealFrom, r.revealTo));
        return;
    }
    if (r.kind === 'mathBlock') {
        // ソースは常に見せて（編集しやすさ優先）、その下に描画結果を併記する。
        const first = state.doc.lineAt(r.revealFrom).number;
        const last = state.doc.lineAt(r.revealTo).number;
        for (let n = first; n <= last; n++) {
            const edge = n === first ? ' cm-live-math-first' : n === last ? ' cm-live-math-last' : '';
            decos.push(lineDeco(`cm-live-math-line${edge}`).range(state.doc.line(n).from));
        }
        decos.push(
            Decoration.widget({ widget: new MathWidget(r.info ?? '', true), block: true, side: 1 }).range(
                r.revealTo
            )
        );
        return;
    }
    if (!revealed && r.kind === 'callout') {
        const source = state.doc.sliceString(r.revealFrom, r.revealTo);
        decos.push(
            Decoration.replace({ widget: new CalloutWidget(r.info ?? 'note', source), block: true }).range(
                r.revealFrom,
                r.revealTo
            )
        );
        return;
    }
    if (!revealed && r.kind === 'image' && r.info) {
        const alt = state.doc.sliceString(r.markFrom, r.markTo);
        decos.push(
            Decoration.replace({ widget: new ImageWidget(r.info, alt) }).range(r.revealFrom, r.revealTo)
        );
        return;
    }
    if (!revealed && r.kind === 'inlineMath') {
        decos.push(
            Decoration.replace({ widget: new MathWidget(r.info ?? '', false) }).range(r.revealFrom, r.revealTo)
        );
        return;
    }
    if (r.kind === 'table') {
        const source = state.doc.sliceString(r.revealFrom, r.revealTo);
        decos.push(
            Decoration.replace({ widget: new TableWidget(source, r.revealFrom, tableIndex), block: true }).range(
                r.revealFrom,
                r.revealTo
            )
        );
        return;
    }
    if (!revealed && r.kind === 'codeFence') {
        const [open, close] = r.hidden;
        if (open && open.to > open.from) {
            decos.push(
                r.info
                    ? Decoration.replace({ widget: new FenceLangWidget(r.info) }).range(open.from, open.to)
                    : HIDE.range(open.from, open.to)
            );
        }
        if (close && close.to > close.from) decos.push(HIDE.range(close.from, close.to));
        return;
    }
    if (!revealed) {
        if (r.kind === 'task') {
            const h = r.hidden[0];
            if (h && h.to > h.from) {
                decos.push(
                    Decoration.replace({ widget: new CheckboxWidget(r.checked === true, h.from) }).range(h.from, h.to)
                );
            }
        } else {
            for (const h of r.hidden) {
                if (h.to > h.from) decos.push(HIDE.range(h.from, h.to));
            }
        }
    }
    if (r.kind === 'task' && r.checked && r.markTo > r.markFrom) {
        decos.push(markDeco('cm-live-task-done').range(r.markFrom, r.markTo));
    }

    if (r.kind === 'html') {
        // 展開中は生のタグだけを見せる（style は当てない）
        if (!revealed && r.html && r.markTo > r.markFrom) decos.push(htmlDeco(r.html).range(r.markFrom, r.markTo));
        return;
    }

    const cls = MARK_CLASS[r.kind];
    if (cls && r.markTo > r.markFrom) {
        decos.push(markDeco(cls).range(r.markFrom, r.markTo));
    }
}
