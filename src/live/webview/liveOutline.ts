/**
 * 目次ドロワー（Live モード。設計: docs/specifications/live-mode/outline-drawer-design.md）。
 *
 * 既定は閉じていて、ツールバー左端の ☰（またはコマンド）で開閉する。左に出し、幅が広ければ本文を押し出し、
 * 狭ければ本文に重ねる（どちらにするかは CSS のメディアクエリ）。中身は `buildOutline`（純関数）が決める。
 */
import { EditorView, type ViewUpdate } from '@codemirror/view';
import { EditorSelection, type Extension } from '@codemirror/state';
import { t } from './i18n';
import { buildOutline, currentOutlineIndex, type OutlineItem } from '../shared/outline';

/** 編集が止まってから目次を作り直すまでの待ち時間（ms）。 */
const REBUILD_DELAY = 300;
/** 重ね型（狭い画面）に切り替わる幅。CSS のメディアクエリと揃える。 */
const OVERLAY_BELOW = 900;

export interface OutlineDrawer {
    /** 開閉する（ツールバーの ☰・host のコマンドから呼ぶ）。 */
    toggle(): void;
    /** CodeMirror へ足す拡張（編集・スクロールに追従する）。 */
    extension: Extension;
}

/** ドロワーの DOM を `body` の先頭に作る。`view` は後から `attach` で渡す。 */
export function createOutlineDrawer(body: HTMLElement, getView: () => EditorView | null): OutlineDrawer {
    const drawer = document.createElement('nav');
    drawer.className = 'cm-live-outline';
    drawer.setAttribute('aria-label', t('Outline'));
    drawer.hidden = true;
    const list = document.createElement('ul');
    list.className = 'cm-live-outline-list';
    drawer.appendChild(list);
    body.insertBefore(drawer, body.firstChild);

    let items: OutlineItem[] = [];
    let current = -1;
    let timer: number | undefined;

    const setExpanded = (open: boolean): void => {
        drawer.hidden = !open;
        body.classList.toggle('cm-live-outline-open', open);
        document
            .querySelector('.cm-live-toolbar-button[data-outline="toggle"]')
            ?.setAttribute('aria-expanded', String(open));
    };

    const close = (): void => {
        setExpanded(false);
        getView()?.focus();
    };

    const jump = (item: OutlineItem): void => {
        const view = getView();
        if (!view) return;
        // 重ね型なら、本文を見られるように閉じる
        if (window.innerWidth < OVERLAY_BELOW) setExpanded(false);
        view.dispatch({
            selection: EditorSelection.cursor(item.to),
            effects: EditorView.scrollIntoView(item.to, { y: 'start', yMargin: 16 })
        });
        view.focus();
    };

    const markCurrent = (): void => {
        const view = getView();
        if (!view || drawer.hidden) return;
        const top = view.lineBlockAtHeight(view.scrollDOM.scrollTop + 8).from;
        const next = currentOutlineIndex(items, top);
        if (next === current) return;
        current = next;
        list.querySelectorAll('.cm-live-outline-item').forEach((el, i) => {
            if (i === current) {
                el.setAttribute('aria-current', 'true');
                (el as HTMLElement).scrollIntoView({ block: 'nearest' });
            } else {
                el.removeAttribute('aria-current');
            }
        });
    };

    const render = (): void => {
        const view = getView();
        if (!view) return;
        items = buildOutline(view.state.doc.toString());
        current = -1;
        list.textContent = '';
        if (items.length === 0) {
            const empty = document.createElement('li');
            empty.className = 'cm-live-outline-empty';
            empty.textContent = t('No headings');
            list.appendChild(empty);
            return;
        }
        items.forEach((item, i) => {
            const li = document.createElement('li');
            const a = document.createElement('button');
            a.type = 'button';
            a.className = `cm-live-outline-item cm-live-outline-h${item.level}`;
            a.textContent = item.text;
            a.addEventListener('mousedown', (e) => e.preventDefault()); // エディタの選択を先に崩さない
            a.addEventListener('click', () => jump(item));
            a.addEventListener('keydown', (e) => {
                const buttons = list.querySelectorAll<HTMLButtonElement>('.cm-live-outline-item');
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    buttons[Math.min(Math.max(i + (e.key === 'ArrowDown' ? 1 : -1), 0), buttons.length - 1)]?.focus();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    close();
                }
            });
            li.appendChild(a);
            list.appendChild(li);
        });
        markCurrent();
    };

    // 重ね型（狭い画面）のときだけ、目次の外を押したら閉じる。押し出し型は目次を見ながら書くので閉じない。
    // ☰ 自体は除く（ここで閉じたあとに ☰ の click で開き直してしまうため）。2026-10-19 ユーザー要望（案 A）
    document.addEventListener(
        'mousedown',
        (e) => {
            if (drawer.hidden || window.innerWidth >= OVERLAY_BELOW) return;
            const target = e.target as Element | null;
            if (!target || drawer.contains(target) || target.closest('[data-outline="toggle"]')) return;
            setExpanded(false);
        },
        true
    );

    const toggle = (): void => {
        const open = drawer.hidden;
        setExpanded(open);
        if (open) render();
    };

    const extension: Extension = [
        EditorView.updateListener.of((u: ViewUpdate) => {
            if (!u.docChanged || drawer.hidden) return;
            window.clearTimeout(timer);
            timer = window.setTimeout(render, REBUILD_DELAY);
        }),
        EditorView.domEventHandlers({
            scroll: () => {
                markCurrent();
            }
        })
    ];

    return { toggle, extension };
}
