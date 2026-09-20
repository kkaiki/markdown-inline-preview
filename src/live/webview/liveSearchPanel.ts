/**
 * ⌘F 検索パネル。VS Code / Cursor の検索ウィジェットと同じ構成にした独自パネル
 * （@codemirror/search の既定パネルの置き換え）。
 *
 * 構成・仕様: docs/specifications/live-mode/find.md
 * 検索そのもの（一致の走査・置換・ハイライト）は @codemirror/search に任せ、
 * このファイルは DOM と、入力欄 ⇄ SearchQuery の同期だけを持つ。
 */
import { EditorSelection } from '@codemirror/state';
import { EditorView, runScopeHandlers, type Panel, type ViewUpdate } from '@codemirror/view';
import {
    SearchQuery,
    closeSearchPanel,
    findNext,
    findPrevious,
    getSearchQuery,
    replaceAll,
    replaceNext,
    setSearchQuery
} from '@codemirror/search';
import { t } from './i18n';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 16x16 の線画アイコン。`d` は path のデータ。 */
function icon(...paths: string[]): SVGElement {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('aria-hidden', 'true');
    for (const d of paths) {
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'currentColor');
        path.setAttribute('stroke-width', '1.4');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        svg.appendChild(path);
    }
    return svg;
}

function button(name: string, label: string, content: Node | string, cls = 'cm-find-button'): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.name = name;
    b.className = cls;
    b.setAttribute('aria-label', label);
    b.title = label;
    b.append(content);
    // クリックでエディタ・入力欄からフォーカスを奪わない（Enter 連打で続けて操作できるように）
    b.addEventListener('mousedown', (e) => e.preventDefault());
    return b;
}

function input(name: string, placeholder: string): HTMLInputElement {
    const el = document.createElement('input');
    el.type = 'text';
    el.name = name;
    el.placeholder = placeholder;
    el.setAttribute('aria-label', placeholder);
    el.spellcheck = false;
    el.autocomplete = 'off';
    el.className = 'cm-find-input';
    return el;
}

function div(cls: string, ...children: Node[]): HTMLDivElement {
    const d = document.createElement('div');
    d.className = cls;
    d.append(...children);
    return d;
}

const MAX_COUNT = 100000;

/** 一致の総数と、現在の選択が何番目の一致か（選択が一致でなければ null）。 */
export function countMatches(
    view: EditorView,
    query: SearchQuery
): { total: number; index: number | null } {
    if (!query.valid) return { total: 0, index: null };
    const sel = view.state.selection.main;
    let total = 0;
    let index: number | null = null;
    const cursor = query.getCursor(view.state);
    for (let r = cursor.next(); !r.done && total < MAX_COUNT; r = cursor.next()) {
        total++;
        if (r.value.from === sel.from && r.value.to === sel.to) index = total;
    }
    return { total, index };
}

/** カーソル位置以降の最初の一致（無ければ先頭）を選択する。インクリメンタル検索用。 */
function selectNearestMatch(view: EditorView, query: SearchQuery): void {
    if (!query.valid) return;
    let r = query.getCursor(view.state, view.state.selection.main.from).next();
    if (r.done) r = query.getCursor(view.state).next();
    if (r.done) return;
    const { from, to } = r.value;
    view.dispatch({
        selection: EditorSelection.single(from, to),
        effects: EditorView.scrollIntoView(from, { y: 'nearest', yMargin: 60 }),
        userEvent: 'select.search'
    });
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export function createLiveSearchPanel(view: EditorView): Panel {
    let current = getSearchQuery(view.state);

    const toggleReplace = button(
        'toggleReplace',
        t('Toggle Replace'),
        icon('M4 6.5l4 4 4-4'),
        'cm-find-button cm-find-toggle-replace'
    );
    toggleReplace.setAttribute('aria-expanded', 'false');

    const searchField = input('search', t('Find'));
    searchField.setAttribute('main-field', 'true');
    const caseBtn = button('case', t('Match Case'), 'Aa', 'cm-find-button cm-find-option');
    const wordBtn = button('word', t('Match Whole Word'), 'ab', 'cm-find-button cm-find-option cm-find-option-word');
    const regexpBtn = button('regexp', t('Use Regular Expression'), '.*', 'cm-find-button cm-find-option');
    const countEl = document.createElement('span');
    countEl.className = 'cm-find-count';
    countEl.setAttribute('aria-live', 'polite');
    const prevBtn = button('prev', t('Previous Match'), icon('M8 12.5v-9', 'M4.5 7l3.5-3.5L11.5 7'));
    const nextBtn = button('next', t('Next Match'), icon('M8 3.5v9', 'M4.5 9l3.5 3.5L11.5 9'));
    const closeBtn = button('close', t('Close'), icon('M4 4l8 8', 'M12 4l-8 8'));

    const replaceField = input('replace', t('Replace'));
    const replaceBtn = button('replace', t('Replace'), icon('M3 5.5h7a3 3 0 010 6H6', 'M8 9.5l-2 2 2 2'));
    const replaceAllBtn = button(
        'replaceAll',
        t('Replace All'),
        icon('M3 3.5h6a2.5 2.5 0 010 5H6', 'M7.5 6.5l-2 2 2 2', 'M3 12.5h7')
    );

    const findRow = div(
        'cm-find-row',
        div('cm-find-field', searchField, div('cm-find-options', caseBtn, wordBtn, regexpBtn)),
        countEl,
        prevBtn,
        nextBtn,
        closeBtn
    );
    const replaceRow = div('cm-find-row cm-find-replace', div('cm-find-field', replaceField), replaceBtn, replaceAllBtn);
    replaceRow.hidden = true;

    const dom = div('cm-search cm-find-widget', toggleReplace, div('cm-find-rows', findRow, replaceRow));
    dom.setAttribute('role', 'search');

    const pressed = (b: HTMLButtonElement): boolean => b.getAttribute('aria-pressed') === 'true';
    const setPressed = (b: HTMLButtonElement, on: boolean): void => b.setAttribute('aria-pressed', String(on));

    function readQuery(): SearchQuery {
        return new SearchQuery({
            search: searchField.value,
            replace: replaceField.value,
            caseSensitive: pressed(caseBtn),
            regexp: pressed(regexpBtn),
            wholeWord: pressed(wordBtn),
            literal: current.literal
        });
    }

    function syncFields(q: SearchQuery): void {
        if (searchField.value !== q.search) searchField.value = q.search;
        if (replaceField.value !== q.replace) replaceField.value = q.replace;
        setPressed(caseBtn, q.caseSensitive);
        setPressed(regexpBtn, q.regexp);
        setPressed(wordBtn, q.wholeWord);
    }

    function refreshCount(): void {
        const q = getSearchQuery(view.state);
        const { total, index } = countMatches(view, q);
        if (total === 0) {
            countEl.textContent = t('No results');
            countEl.classList.add('cm-find-count-empty');
            return;
        }
        countEl.classList.remove('cm-find-count-empty');
        countEl.textContent = t('{0} of {1}')
            .replace('{0}', index === null ? '?' : String(index))
            .replace('{1}', String(total));
    }

    /** 入力欄の内容を SearchQuery として反映する。`reselect` なら最寄りの一致を選び直す。 */
    function commit(reselect: boolean): void {
        const q = readQuery();
        if (!q.eq(current)) {
            current = q;
            view.dispatch({ effects: setSearchQuery.of(q) });
        }
        if (reselect) selectNearestMatch(view, q);
        refreshCount();
    }

    function setReplaceOpen(open: boolean): void {
        replaceRow.hidden = !open;
        toggleReplace.setAttribute('aria-expanded', String(open));
        toggleReplace.classList.toggle('cm-find-toggle-open', open);
    }

    searchField.addEventListener('input', () => commit(true));
    replaceField.addEventListener('input', () => commit(false));
    for (const b of [caseBtn, wordBtn, regexpBtn]) {
        setPressed(b, false);
        b.addEventListener('click', () => {
            setPressed(b, !pressed(b));
            commit(true);
        });
    }
    toggleReplace.addEventListener('click', () => setReplaceOpen(replaceRow.hidden));
    prevBtn.addEventListener('click', () => {
        commit(false);
        findPrevious(view);
    });
    nextBtn.addEventListener('click', () => {
        commit(false);
        findNext(view);
    });
    closeBtn.addEventListener('click', () => closeSearchPanel(view));
    replaceBtn.addEventListener('click', () => {
        commit(false);
        replaceNext(view);
    });
    replaceAllBtn.addEventListener('click', () => {
        commit(false);
        replaceAll(view);
    });

    dom.addEventListener('keydown', (e: KeyboardEvent) => {
        // ⌘G / Esc / ⌘F など、検索用のキーマップ（scope: search-panel）へ回す
        if (runScopeHandlers(view, e, 'search-panel')) {
            e.preventDefault();
            return;
        }
        const target = e.target as HTMLElement;
        if (e.key === 'Enter' && !e.isComposing) {
            e.preventDefault();
            if (target === searchField) {
                commit(false);
                (e.shiftKey ? findPrevious : findNext)(view);
            } else if (target === replaceField) {
                commit(false);
                (e.metaKey || e.ctrlKey ? replaceAll : replaceNext)(view);
            }
            return;
        }
        // VS Code と同じ: ⌘⌥C / ⌘⌥W / ⌘⌥R（Windows・Linux は Alt+C / W / R）でオプションを切り替える
        const modified = e.altKey && (isMac ? e.metaKey : true);
        const optionByCode: Record<string, HTMLButtonElement> = { KeyC: caseBtn, KeyW: wordBtn, KeyR: regexpBtn };
        if (modified && optionByCode[e.code]) {
            e.preventDefault();
            const b = optionByCode[e.code];
            setPressed(b, !pressed(b));
            commit(true);
        }
    });

    syncFields(current);
    refreshCount();

    return {
        dom,
        top: true,
        mount() {
            searchField.select();
        },
        update(u: ViewUpdate) {
            const q = getSearchQuery(u.state);
            const external = !q.eq(current);
            if (external) {
                current = q;
                syncFields(q);
            }
            if (external || u.docChanged || u.selectionSet) refreshCount();
        }
    };
}
