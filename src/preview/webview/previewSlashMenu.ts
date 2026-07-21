import type { Editor } from '@milkdown/kit/core';
import { editorViewCtx } from '@milkdown/kit/core';
import { Slice } from '@milkdown/prose/model';
import type { Node as ProseNode } from '@milkdown/prose/model';
import type { EditorView } from '@milkdown/prose/view';
import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';
import { posToDOMRect } from '@milkdown/prose';
import { $prose } from '@milkdown/utils';
import { replaceRange, markdownToSlice } from '@milkdown/kit/utils';

import { filterSlashMenuItems, type SlashMenuItemDef } from '../../shared/slash/slashMenuItems';
import { t } from './i18n';
import { detectSlashMatch, type SlashMatch } from '../../shared/slash/slashMatch';
import { getSlashLineBlockRange } from '../../shared/slash/applyPreviewSlash';
import { virtualLineStart, splitAtPrecedingHardbreak } from './hardbreakLine';

/** table > table_header_row > table_header > paragraph > (content start) */
function findFirstTableCellPos(doc: ProseNode, from: number): number | null {
    let found = false;
    let tablePos = 0;
    doc.nodesBetween(from, doc.content.size, (node, pos) => {
        if (found) return false;
        if (node.type.name === 'table') {
            found = true;
            tablePos = pos;
            return false;
        }
        return true;
    });
    return found ? tablePos + 4 : null;
}

let menuEnabled = true;

export function setSlashMenuEnabled(value: boolean): void {
    menuEnabled = value;
}

/**
 * スラッシュメニューが開いているか（`previewKeymapPlugin.ts` から参照）。
 *
 * メニュー表示中は、Enter は「候補を確定する」操作として優先されるべきで、
 * `handleParagraphEnter`（通常段落での hardbreak 挿入）等の他の Enter ハンドラより
 * 先に横取りしてはいけない。`createPreviewKeymapPlugin` はメニュー本体
 * （`createSlashMenuPlugin`）より前に登録されているため、プラグイン登録順だけでは
 * メニュー側の `handleKeyDown` に Enter が届かない。
 */
let menuVisible = false;

export function isSlashMenuOpen(): boolean {
    return menuVisible;
}

export class PreviewSlashMenuController {
    private menuEl: HTMLElement;
    private editor: Editor | null = null;
    private selectedIndex = 0;
    private currentMatch: SlashMatch | null = null;
    private visible = false;

    constructor(menuEl: HTMLElement) {
        this.menuEl = menuEl;
        this.menuEl.addEventListener('mousedown', (event: MouseEvent) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) return;
            const item = target.closest<HTMLElement>('[data-slash-id]');
            if (!item) return;
            event.preventDefault();
            const id = item.dataset.slashId;
            const def = filterSlashMenuItems('').find((entry) => entry.id === id);
            if (def) this.applyItem(def);
        });
    }

    bindEditor(editor: Editor): void {
        this.editor = editor;
    }

    update(view: EditorView): void {
        if (!menuEnabled || !view.editable) {
            this.hide();
            return;
        }

        const match = detectSlashMatch(view);
        if (!match) {
            this.hide();
            return;
        }

        this.currentMatch = match;
        const items = filterSlashMenuItems(match.query);
        if (items.length === 0) {
            this.hide();
            return;
        }

        if (this.selectedIndex >= items.length) {
            this.selectedIndex = 0;
        }

        this.renderItems(items);
        this.positionMenu(view, match.to);
        this.show();
    }

    handleKeyDown(view: EditorView, event: KeyboardEvent): boolean {
        if (!this.visible) return false;

        const items = filterSlashMenuItems(this.currentMatch?.query ?? '');
        if (items.length === 0) return false;

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            this.selectedIndex = (this.selectedIndex + 1) % items.length;
            this.renderItems(items);
            return true;
        }
        if (event.key === 'ArrowUp') {
            event.preventDefault();
            this.selectedIndex = (this.selectedIndex - 1 + items.length) % items.length;
            this.renderItems(items);
            return true;
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
            event.preventDefault();
            this.applyItem(items[this.selectedIndex]);
            return true;
        }
        if (event.key === 'Escape') {
            event.preventDefault();
            this.hide();
            return true;
        }
        return false;
    }

    private renderItems(items: SlashMenuItemDef[]): void {
        this.menuEl.innerHTML = items
            .map((item, index) => {
                const selected = index === this.selectedIndex ? ' is-selected' : '';
                return `<button type="button" class="slash-menu-item${selected}" data-slash-id="${item.id}" role="option" aria-selected="${index === this.selectedIndex}">
  <span class="slash-menu-label">/${item.label}</span>
  <span class="slash-menu-detail">${escapeHtml(t(item.detail))}</span>
</button>`;
            })
            .join('');
    }

    private positionMenu(view: EditorView, pos: number): void {
        const rect = posToDOMRect(view, pos, pos);
        this.menuEl.style.left = `${rect.left}px`;
        this.menuEl.style.top = `${rect.bottom + 4}px`;
    }

    private applyItem(item: SlashMenuItemDef): void {
        if (!this.editor || !this.currentMatch) return;
        const markdown = item.previewMarkdown;
        const match = this.currentMatch;

        this.editor.action((ctx) => {
            const view = ctx.get(editorViewCtx);
            let state = view.state;
            let $from = state.selection.$from;

            // Enter \u3067\u4f5c\u3089\u308c\u305f hardbreak \u306e\u7d9a\u304d\u306b "/" \u3092\u66f8\u3044\u3066\u3044\u308b\u5834\u5408\u3001\u307e\u305a\u305d\u306e hardbreak \u3092
            // \u53d6\u308a\u9664\u3044\u3066\u672c\u7269\u306e\u6bb5\u843d\u5206\u5272\u306b\u3057\u3066\u304b\u3089\u7d9a\u884c\u3059\u308b\uff08\u305d\u3046\u3057\u306a\u3044\u3068 getSlashLineBlockRange \u304c
            // \u6bb5\u843d\u5168\u4f53\uff1dhardbreak \u3088\u308a\u524d\u306e\u30c6\u30ad\u30b9\u30c8\u307e\u3067\u542b\u3081\u3066\u7f6e\u63db\u3057\u3066\u3057\u307e\u3046\uff09\u3002
            if (virtualLineStart($from) > $from.start()) {
                splitAtPrecedingHardbreak(view, $from.pos);
                state = view.state;
                $from = state.selection.$from;
            }

            const lineText = $from.parent.textBetween(0, $from.parent.content.size, undefined, '\ufffc');
            const isSlashOnlyLine = lineText.trimStart().startsWith('/');

            if (isSlashOnlyLine) {
                const { from, to } = getSlashLineBlockRange($from);
                // `## ` や `- [ ] ` のような「本文が空のブロック」はそのままパースすると
                // 空スライス（見出しごと消えて隣のブロックに入力が流れる）や literal な
                // `[ ]` テキスト（空タスク項目は GFM としてパースされない）になる。
                // 末尾スペースで終わる（＝本文を続けて書く）項目にはプレースホルダー文字を
                // 足してパースし、置換後にその 1 文字を削除した位置へカーソルを置く。
                // 詳細: docs/specifications/preview-slash-empty-block-fix.md
                const PLACEHOLDER = '⁠'; // word joiner（本文に現れない不可視文字）
                const needsPlaceholder = markdown.endsWith(' ');
                const rawSlice = markdownToSlice(needsPlaceholder ? markdown + PLACEHOLDER : markdown)(ctx);
                // markdownToSlice は open な Slice（openStart/openEnd > 0）を返すことがあり、
                // そのまま replace するとブロックのラッパー（bullet_list 等）が剥がされて
                // 中身のテキストだけが元の段落へ流し込まれてしまう。ここはトップレベル
                // ブロックの置換なので、深さ 0 に閉じてブロックごと入れる。
                const slice = new Slice(rawSlice.content, 0, 0);
                let tr = state.tr.replace(from, to, slice);
                if (needsPlaceholder) {
                    let phPos = -1;
                    tr.doc.nodesBetween(
                        from,
                        Math.min(from + slice.size + 2, tr.doc.content.size),
                        (node, pos) => {
                            if (phPos >= 0) return false;
                            if (node.isText && typeof node.text === 'string' && node.text.includes(PLACEHOLDER)) {
                                phPos = pos + node.text.indexOf(PLACEHOLDER);
                                return false;
                            }
                            return true;
                        }
                    );
                    if (phPos >= 0) {
                        tr = tr.delete(phPos, phPos + 1);
                        tr = tr.setSelection(TextSelection.create(tr.doc, phPos));
                    }
                } else if (item.id === 'table') {
                    const firstCellPos = findFirstTableCellPos(tr.doc, from);
                    if (firstCellPos !== null) {
                        tr = tr.setSelection(TextSelection.create(tr.doc, firstCellPos));
                    }
                }
                view.dispatch(tr.scrollIntoView());
            } else {
                replaceRange(markdown, { from: match.from, to: match.to })(ctx);
            }

            view.focus();
        });
        this.hide();
    }

    private show(): void {
        this.visible = true;
        menuVisible = true;
        this.menuEl.hidden = false;
        this.menuEl.dataset.show = 'true';
    }

    hide(): void {
        this.visible = false;
        menuVisible = false;
        this.menuEl.hidden = true;
        this.menuEl.dataset.show = 'false';
        this.selectedIndex = 0;
        this.currentMatch = null;
    }
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function createSlashMenuPlugin(controller: PreviewSlashMenuController) {
    return $prose(() => {
        return new Plugin({
            key: new PluginKey('previewSlashMenu'),
            view(view) {
                return {
                    update: () => controller.update(view),
                    destroy: () => controller.hide()
                };
            },
            props: {
                handleKeyDown(view, event) {
                    return controller.handleKeyDown(view, event);
                },
                handleDOMEvents: {
                    blur: () => {
                        controller.hide();
                        return false;
                    }
                }
            }
        });
    });
}
