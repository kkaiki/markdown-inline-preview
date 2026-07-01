/**
 * Preview（WebView）内の検索／置換バー。`Cmd/Ctrl+F` で検索、`Cmd+Opt+F`（mac）/
 * `Ctrl+H`（Win・Linux）で置換行を開く。VS Code エディタの検索/置換ウィジェットに倣う。
 *
 * 一致箇所のハイライトは CSS Custom Highlight API（`CSS.highlights` + `::highlight()`）で行う。
 * DOM を書き換えないため ProseMirror エディタを壊さない。置換は DOM を直接いじらず、
 * 一致レンジを ProseMirror の位置に変換してトランザクションで書き換える（`posAtDOM`）。
 */
import type { EditorView } from '@milkdown/prose/view';
import { t } from './i18n';

// CSS Custom Highlight API（TS の lib に無い環境向けの最小宣言）
interface HighlightLike {
    // marker interface
    readonly size?: number;
}
interface HighlightCtor {
    new (...ranges: Range[]): HighlightLike;
}
interface HighlightRegistry {
    set(name: string, highlight: HighlightLike): void;
    delete(name: string): void;
}

function getHighlightApi(): { Ctor: HighlightCtor; registry: HighlightRegistry } | null {
    const ctor = (globalThis as unknown as { Highlight?: HighlightCtor }).Highlight;
    // `CSS` をベア参照すると、グローバルに存在しない環境（jsdom や CSS Custom Highlight API
    // 非対応の WebView）で ReferenceError を投げてしまい、せっかくの null フォールバックに
    // 到達できない。globalThis 経由で安全に取得し、未対応環境では静かに無効化する。
    const css = (globalThis as unknown as { CSS?: { highlights?: HighlightRegistry } }).CSS;
    const registry = css?.highlights;
    if (!ctor || !registry) return null;
    return { Ctor: ctor, registry };
}

/** ProseMirror へ置換を反映するために必要な、エディタビューを取得するコールバック。 */
export type GetEditorView = () => EditorView | null;

export class PreviewFindBar {
    private readonly root: HTMLElement;
    private readonly getView?: GetEditorView;
    private readonly bar: HTMLElement;
    private readonly toggleBtn: HTMLButtonElement;
    private readonly input: HTMLInputElement;
    private readonly replaceInput: HTMLInputElement;
    private readonly replaceRow: HTMLElement;
    private readonly replaceBtn: HTMLButtonElement;
    private readonly replaceAllBtn: HTMLButtonElement;
    private readonly countEl: HTMLElement;
    private ranges: Range[] = [];
    private index = 0;
    private visible = false;
    private expanded = false;

    constructor(root: HTMLElement, getView?: GetEditorView) {
        this.root = root;
        this.getView = getView;

        this.bar = document.createElement('div');
        this.bar.className = 'preview-find-bar';
        this.bar.hidden = true;

        // 置換行の開閉トグル（VS Code 同様、バー左端のシェブロン）
        this.toggleBtn = this.button('▸', 'Toggle Replace', () => this.toggleReplace());
        this.toggleBtn.classList.add('preview-find-toggle');

        this.input = document.createElement('input');
        this.input.type = 'text';
        this.input.className = 'preview-find-input';
        // placeholder は open() 時に t() で設定する（このインスタンスは言語確定前に
        // 生成されるため、コンストラクタで訳すと英語に固定されてしまう）。
        this.input.setAttribute('aria-label', 'Find in preview');

        this.countEl = document.createElement('span');
        this.countEl.className = 'preview-find-count';
        this.countEl.textContent = '0/0';

        const prev = this.button('↑', 'Previous match', () => this.prev());
        const next = this.button('↓', 'Next match', () => this.next());
        const close = this.button('✕', 'Close', () => this.close());

        const findRow = document.createElement('div');
        findRow.className = 'preview-find-row';
        findRow.append(this.input, this.countEl, prev, next, close);

        this.replaceInput = document.createElement('input');
        this.replaceInput.type = 'text';
        this.replaceInput.className = 'preview-find-input preview-replace-input';
        this.replaceInput.setAttribute('aria-label', 'Replace in preview');

        // ラベル文字列は open() で t() により設定する（言語確定前に生成されるため）。
        this.replaceBtn = this.button('', 'Replace', () => this.replaceCurrent());
        this.replaceBtn.classList.add('preview-find-text-button');
        this.replaceAllBtn = this.button('', 'Replace All', () => this.replaceAll());
        this.replaceAllBtn.classList.add('preview-find-text-button');

        this.replaceRow = document.createElement('div');
        this.replaceRow.className = 'preview-replace-row';
        this.replaceRow.hidden = true;
        this.replaceRow.append(this.replaceInput, this.replaceBtn, this.replaceAllBtn);

        const fields = document.createElement('div');
        fields.className = 'preview-find-fields';
        fields.append(findRow, this.replaceRow);

        this.bar.append(this.toggleBtn, fields);
        document.body.appendChild(this.bar);

        this.input.addEventListener('input', () => this.refresh());
        this.input.addEventListener('keydown', (e) => this.onFindKeydown(e));
        this.replaceInput.addEventListener('keydown', (e) => this.onReplaceKeydown(e));
    }

    private onFindKeydown(e: KeyboardEvent): void {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) this.prev();
            else this.next();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            this.close();
        }
    }

    private onReplaceKeydown(e: KeyboardEvent): void {
        if (e.key === 'Enter') {
            e.preventDefault();
            // VS Code に倣い、Cmd/Ctrl+Enter で全置換、単独 Enter で現在の一致を置換。
            if (e.metaKey || e.ctrlKey) this.replaceAll();
            else this.replaceCurrent();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            this.close();
        }
    }

    private button(label: string, title: string, onClick: () => void): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = label;
        btn.title = title;
        btn.setAttribute('aria-label', title);
        btn.className = 'preview-find-button';
        btn.addEventListener('mousedown', (e) => e.preventDefault());
        btn.addEventListener('click', onClick);
        return btn;
    }

    toggle(): void {
        if (this.visible) this.close();
        else this.open();
    }

    /** 検索バーを開く。`withReplace=true` なら置換行を展開して置換入力にフォーカスする。 */
    open(withReplace = false): void {
        this.visible = true;
        this.bar.hidden = false;
        this.input.setAttribute('placeholder', t('Find'));
        this.replaceInput.setAttribute('placeholder', t('Replace'));
        this.replaceBtn.textContent = t('Replace');
        this.replaceBtn.title = t('Replace');
        this.replaceBtn.setAttribute('aria-label', t('Replace'));
        this.replaceAllBtn.textContent = t('Replace All');
        this.replaceAllBtn.title = t('Replace All');
        this.replaceAllBtn.setAttribute('aria-label', t('Replace All'));
        if (withReplace) this.setExpanded(true);
        this.updateReplaceEnabled();
        if (withReplace) {
            this.replaceInput.focus();
            this.replaceInput.select();
        } else {
            this.input.focus();
            this.input.select();
        }
        this.refresh();
    }

    close(): void {
        this.visible = false;
        this.bar.hidden = true;
        this.clearHighlights();
        // フォーカスをエディタへ戻す（検索バーの input に残さない）。
        this.getView?.()?.focus();
    }

    private toggleReplace(): void {
        this.setExpanded(!this.expanded);
        if (this.expanded) this.replaceInput.focus();
        else this.input.focus();
    }

    private setExpanded(expanded: boolean): void {
        this.expanded = expanded;
        this.replaceRow.hidden = !expanded;
        this.toggleBtn.textContent = expanded ? '▾' : '▸';
        this.bar.classList.toggle('preview-find-bar--expanded', expanded);
    }

    private refresh(): void {
        this.recompute(0);
    }

    /** クエリで再走査し、`index` を `desiredIndex`（範囲内にクランプ）へ合わせる。 */
    private recompute(desiredIndex: number): void {
        const query = this.input.value;
        this.ranges = query ? this.collect(query) : [];
        this.index = this.ranges.length > 0
            ? Math.min(Math.max(desiredIndex, 0), this.ranges.length - 1)
            : 0;
        this.applyHighlights();
        this.updateCount();
        this.updateReplaceEnabled();
        if (this.ranges.length > 0) this.scrollToCurrent();
    }

    private collect(query: string): Range[] {
        const ranges: Range[] = [];
        const needle = query.toLowerCase();
        const walker = document.createTreeWalker(this.root, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node) {
            const text = node.nodeValue ?? '';
            const hay = text.toLowerCase();
            let from = hay.indexOf(needle);
            while (from !== -1) {
                const range = document.createRange();
                range.setStart(node, from);
                range.setEnd(node, from + query.length);
                ranges.push(range);
                from = hay.indexOf(needle, from + query.length);
            }
            node = walker.nextNode();
        }
        return ranges;
    }

    private applyHighlights(): void {
        const api = getHighlightApi();
        if (!api) return;
        if (this.ranges.length === 0) {
            this.clearHighlights();
            return;
        }
        api.registry.set('preview-find', new api.Ctor(...this.ranges));
        this.applyCurrent();
    }

    private applyCurrent(): void {
        const api = getHighlightApi();
        if (!api) return;
        const current = this.ranges[this.index];
        if (current) api.registry.set('preview-find-current', new api.Ctor(current));
        else api.registry.delete('preview-find-current');
    }

    private clearHighlights(): void {
        const api = getHighlightApi();
        if (!api) return;
        api.registry.delete('preview-find');
        api.registry.delete('preview-find-current');
    }

    next(): void {
        if (this.ranges.length === 0) return;
        this.index = (this.index + 1) % this.ranges.length;
        this.applyCurrent();
        this.updateCount();
        this.scrollToCurrent();
    }

    prev(): void {
        if (this.ranges.length === 0) return;
        this.index = (this.index - 1 + this.ranges.length) % this.ranges.length;
        this.applyCurrent();
        this.updateCount();
        this.scrollToCurrent();
    }

    /** 現在の一致を 1 件だけ置換し、次の一致へ進む（VS Code の Replace と同じ）。 */
    private replaceCurrent(): void {
        const view = this.getView?.();
        if (!view || !view.editable || this.ranges.length === 0) return;
        const pos = this.rangeToPos(view, this.ranges[this.index]);
        if (!pos) return;
        const replacement = this.replaceInput.value;
        view.dispatch(view.state.tr.insertText(replacement, pos.from, pos.to));
        // ProseMirror は dispatch で同期的に DOM を更新するので、ここで再走査すると
        // 置換後の状態が反映される。index は据え置く＝置換後に次の一致が現れる。
        this.recompute(this.index);
        this.input.focus();
    }

    /** すべての一致を置換する。位置ずれを避けるため文末側から 1 トランザクションで適用。 */
    private replaceAll(): void {
        const view = this.getView?.();
        if (!view || !view.editable || this.ranges.length === 0) return;
        const replacement = this.replaceInput.value;
        const positions = this.ranges
            .map((r) => this.rangeToPos(view, r))
            .filter((p): p is { from: number; to: number } => p !== null)
            // 後ろ（文末側）から適用すれば、前方の位置はドキュメント変更の影響を受けない。
            .sort((a, b) => b.from - a.from);
        if (positions.length === 0) return;
        let tr = view.state.tr;
        for (const { from, to } of positions) {
            tr = tr.insertText(replacement, from, to);
        }
        view.dispatch(tr);
        this.recompute(0);
        this.input.focus();
    }

    /** 一致 DOM レンジを ProseMirror のドキュメント位置 [from, to] に変換する。 */
    private rangeToPos(view: EditorView, range: Range | undefined): { from: number; to: number } | null {
        if (!range) return null;
        try {
            const from = view.posAtDOM(range.startContainer, range.startOffset);
            const to = view.posAtDOM(range.endContainer, range.endOffset);
            if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return null;
            return { from, to };
        } catch {
            // 一致が編集領域外（ウィジェット装飾など）にある場合は posAtDOM が投げうる。
            return null;
        }
    }

    private updateReplaceEnabled(): void {
        const view = this.getView?.();
        const editable = !!view && view.editable;
        const hasMatch = this.ranges.length > 0;
        this.replaceBtn.disabled = !editable || !hasMatch;
        this.replaceAllBtn.disabled = !editable || !hasMatch;
    }

    private scrollToCurrent(): void {
        const range = this.ranges[this.index];
        const el = range?.startContainer.parentElement;
        el?.scrollIntoView({ block: 'center', behavior: 'auto' });
    }

    private updateCount(): void {
        this.countEl.textContent = this.ranges.length > 0
            ? `${this.index + 1}/${this.ranges.length}`
            : '0/0';
    }
}
