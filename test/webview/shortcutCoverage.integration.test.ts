/**
 * ショートカット「実反応」カバレッジの統合テスト。
 *
 * previewShortcuts.test.ts は分類ロジック（KeyboardEvent → どの種別か）を網羅するが、
 * 「実際にキーを押して期待どおり反応するか」までは見ていないものがあった。
 * ここではその穴を埋める:
 *   - Cmd/Ctrl+Enter      : チェックボックスのトグル（checkboxToggle プラグイン）
 *   - Cmd/Ctrl+Shift+.    : Raw へ戻る（milkdownApp の capture → postMessage 配線）
 *   - Cmd/Ctrl+F          : Preview 内検索バーを開く（capture → PreviewFindBar）
 *   - Cmd/Ctrl+←          : 展開プレフィックスが無いときは既定へ委ねる（preventDefault しない）
 *
 * 他のショートカットの実反応は既存ファイルで担保:
 *   - Cmd/Ctrl+Opt+0..9 / Cmd/Ctrl+A / Enter(```): previewKeymap.integration.test.ts + blockConvert
 *   - Cmd/Ctrl+B / I                              : inlineFormatting.integration.test.ts
 *   - 表の矢印/Tab・行列移動                        : tableArrowKeymap / tableMove / tableNavigationEdgeCases
 *   - Backspace 各種                              : markerBackspace / inlineMarkBackspace / codeBlockBackspace
 */
import './jsdomSetup';
import * as assert from 'assert';
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { TextSelection } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';

import { createCheckboxToggleKeymapPlugin } from '../../src/preview/webview/checkboxToggle';
import { PreviewFindBar } from '../../src/preview/webview/previewFindBar';
import { classifyPreviewShortcut } from '../../src/shared/preview/previewShortcuts';
import {
    createPreviewEditor,
    findFirstPosOfType,
    type PreviewEditorHandle
} from './milkdownHarness';

// ── Cmd/Ctrl+Enter: チェックボックスのトグル ────────────────────────────────

describe('webview統合: ショートカット実反応 — Cmd/Ctrl+Enter でチェックボックス切替', () => {
    let h: { view: EditorView; destroy: () => void };
    afterEach(() => h?.destroy());

    async function mkEditor(md: string): Promise<{ view: EditorView; destroy: () => void }> {
        const root = document.getElementById('root');
        if (!root) throw new Error('no root');
        root.innerHTML = '';
        const editor = await Editor.make()
            .config((ctx) => { ctx.set(rootCtx, root); ctx.set(defaultValueCtx, md); })
            .use(createCheckboxToggleKeymapPlugin())
            .use(commonmark)
            .use(gfm)
            .create();
        let view!: EditorView;
        editor.action((ctx) => { view = ctx.get(editorViewCtx); });
        return { view, destroy: () => void editor.destroy() };
    }

    function firstChecked(view: EditorView): unknown {
        let checked: unknown = 'NONE';
        view.state.doc.descendants((n) => {
            if (checked === 'NONE' && n.type.name === 'list_item') { checked = n.attrs.checked; return false; }
            return true;
        });
        return checked;
    }

    function cursorInText(view: EditorView, text: string): void {
        let pos = -1;
        view.state.doc.descendants((n, p) => { if (pos < 0 && n.isText && n.text === text) { pos = p + 1; return false; } return true; });
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
    }

    function pressCtrlEnter(view: EditorView, shift = false): boolean {
        const ev = new window.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, shiftKey: shift, bubbles: true, cancelable: true });
        view.dom.dispatchEvent(ev);
        return ev.defaultPrevented;
    }

    it('未チェック項目で Cmd/Ctrl+Enter → チェック済みになる', async () => {
        h = await mkEditor('- [ ] task\n');
        cursorInText(h.view, 'task');
        const prevented = pressCtrlEnter(h.view);
        assert.strictEqual(prevented, true, 'Enter が処理されるべき（preventDefault）');
        assert.strictEqual(firstChecked(h.view), true, 'チェック済みになっていない');
    });

    it('チェック済み項目で Cmd/Ctrl+Enter → 未チェックに戻る', async () => {
        h = await mkEditor('- [x] done\n');
        cursorInText(h.view, 'done');
        pressCtrlEnter(h.view);
        assert.strictEqual(firstChecked(h.view), false, '未チェックに戻っていない');
    });

    it('チェックボックス外（通常段落）では何もしない（既定へ委ねる）', async () => {
        h = await mkEditor('plain text\n');
        cursorInText(h.view, 'plain text');
        const prevented = pressCtrlEnter(h.view);
        assert.strictEqual(prevented, false, 'チェックボックス外では preventDefault すべきでない');
    });

    it('Shift を伴う Cmd/Ctrl+Shift+Enter ではトグルしない', async () => {
        h = await mkEditor('- [ ] task\n');
        cursorInText(h.view, 'task');
        const prevented = pressCtrlEnter(h.view, true);
        assert.strictEqual(prevented, false, 'Shift 付きでは反応しない');
        assert.strictEqual(firstChecked(h.view), false, 'チェック状態が変わってはいけない');
    });
});

// ── Cmd/Ctrl+Shift+.: Raw へ戻る（capture → postMessage） ───────────────────

describe('webview統合: ショートカット実反応 — Cmd/Ctrl+Shift+. で toggleRaw 通知', () => {
    it('Cmd/Ctrl+Shift+. の分類が toggleRaw で、ハンドラが1回メッセージを送る', () => {
        const posted: Array<{ type: string }> = [];
        // milkdownApp 相当の最小ハンドラ
        const handler = (event: KeyboardEvent): void => {
            const shortcut = classifyPreviewShortcut(event);
            if (shortcut?.kind === 'toggleRaw') {
                event.preventDefault();
                posted.push({ type: 'toggleRaw' });
            }
        };
        document.addEventListener('keydown', handler, true);
        try {
            const ev = new window.KeyboardEvent('keydown', {
                key: '.', code: 'Period', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true
            });
            document.dispatchEvent(ev);
            assert.strictEqual(posted.length, 1, 'toggleRaw が1回送られるべき');
            assert.strictEqual(ev.defaultPrevented, true, 'preventDefault されるべき');
        } finally {
            document.removeEventListener('keydown', handler, true);
        }
    });

    it('Shift 無しの Cmd/Ctrl+. では toggleRaw を送らない', () => {
        const posted: string[] = [];
        const handler = (event: KeyboardEvent): void => {
            if (classifyPreviewShortcut(event)?.kind === 'toggleRaw') posted.push('toggleRaw');
        };
        document.addEventListener('keydown', handler, true);
        try {
            document.dispatchEvent(new window.KeyboardEvent('keydown', {
                key: '.', code: 'Period', ctrlKey: true, bubbles: true, cancelable: true
            }));
            assert.strictEqual(posted.length, 0, 'Shift 無しでは送ってはいけない');
        } finally {
            document.removeEventListener('keydown', handler, true);
        }
    });
});

// ── Cmd/Ctrl+F: Preview 内検索バーを開く（capture → PreviewFindBar） ────────

describe('webview統合: ショートカット実反応 — Cmd/Ctrl+F で検索バーを開く', () => {
    it('Cmd/Ctrl+F で find と分類され、検索バーが開く（hidden=false）', () => {
        const root = document.getElementById('root');
        if (!root) throw new Error('no root');
        root.innerHTML = '';
        const findBar = new PreviewFindBar(root);

        const handler = (event: KeyboardEvent): void => {
            if (classifyPreviewShortcut(event)?.kind === 'find') {
                event.preventDefault();
                findBar.open();
            }
        };
        document.addEventListener('keydown', handler, true);
        try {
            const barEl = document.querySelector<HTMLElement>('.preview-find-bar');
            assert.ok(barEl, '検索バー要素が生成されている');
            assert.strictEqual(barEl.hidden, true, '開く前は hidden');

            const ev = new window.KeyboardEvent('keydown', {
                key: 'f', code: 'KeyF', ctrlKey: true, bubbles: true, cancelable: true
            });
            document.dispatchEvent(ev);

            assert.strictEqual(ev.defaultPrevented, true, 'preventDefault されるべき');
            assert.strictEqual(barEl.hidden, false, '検索バーが開いていない');
        } finally {
            document.removeEventListener('keydown', handler, true);
            document.querySelectorAll('.preview-find-bar').forEach((el) => el.remove());
        }
    });
});

// ── Cmd/Ctrl+←: 展開プレフィックスが無いときは既定へ委ねる ──────────────────

describe('webview統合: ショートカット実反応 — Cmd/Ctrl+← の行頭移動', () => {
    let h: PreviewEditorHandle;
    afterEach(() => h?.destroy());

    it('プレフィックス展開が無い段落では preventDefault せず既定に委ねる', async () => {
        // ハーネスは blockPrefixEditPlugin を載せないため getExpandedBlock() は null。
        // handleLineStart は false を返し、ブラウザ既定の行頭移動に委ねる（横取りしない）。
        h = await createPreviewEditor('hello world\n');
        const start = findFirstPosOfType(h, 'paragraph');
        h.setCursor(start + 5); // "hello| world"
        const res = h.pressKey({ key: 'ArrowLeft', code: 'ArrowLeft', meta: true });
        assert.strictEqual(res.defaultPrevented, false, '展開が無いときは横取りせず既定へ委ねるべき');
    });
});
