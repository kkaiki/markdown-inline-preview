/**
 * Preview（WebView）内の検索バー。`Cmd/Ctrl+F` で開く。
 *
 * CSS Custom Highlight API（`CSS.highlights` + `::highlight()`）で一致箇所を
 * ハイライトする。DOM を書き換えないため ProseMirror エディタを壊さない。
 */

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
    const registry = (CSS as unknown as { highlights?: HighlightRegistry }).highlights;
    if (!ctor || !registry) return null;
    return { Ctor: ctor, registry };
}

export class PreviewFindBar {
    private readonly root: HTMLElement;
    private readonly bar: HTMLElement;
    private readonly input: HTMLInputElement;
    private readonly countEl: HTMLElement;
    private ranges: Range[] = [];
    private index = 0;
    private visible = false;

    constructor(root: HTMLElement) {
        this.root = root;

        this.bar = document.createElement('div');
        this.bar.className = 'preview-find-bar';
        this.bar.hidden = true;

        this.input = document.createElement('input');
        this.input.type = 'text';
        this.input.className = 'preview-find-input';
        this.input.setAttribute('placeholder', '検索');
        this.input.setAttribute('aria-label', 'Find in preview');

        this.countEl = document.createElement('span');
        this.countEl.className = 'preview-find-count';
        this.countEl.textContent = '0/0';

        const prev = this.button('↑', 'Previous match', () => this.prev());
        const next = this.button('↓', 'Next match', () => this.next());
        const close = this.button('✕', 'Close', () => this.close());

        this.bar.append(this.input, this.countEl, prev, next, close);
        document.body.appendChild(this.bar);

        this.input.addEventListener('input', () => this.refresh());
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (e.shiftKey) this.prev();
                else this.next();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.close();
            }
        });
    }

    private button(label: string, title: string, onClick: () => void): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = label;
        btn.title = title;
        btn.className = 'preview-find-button';
        btn.addEventListener('mousedown', (e) => e.preventDefault());
        btn.addEventListener('click', onClick);
        return btn;
    }

    toggle(): void {
        if (this.visible) this.close();
        else this.open();
    }

    open(): void {
        this.visible = true;
        this.bar.hidden = false;
        this.input.focus();
        this.input.select();
        this.refresh();
    }

    close(): void {
        this.visible = false;
        this.bar.hidden = true;
        this.clearHighlights();
    }

    private refresh(): void {
        const query = this.input.value;
        this.ranges = query ? this.collect(query) : [];
        this.index = 0;
        this.applyHighlights();
        this.updateCount();
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
