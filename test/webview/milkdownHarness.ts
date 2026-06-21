/**
 * テスト用の Milkdown エディタ生成ハーネス。
 * アプリ（milkdownApp.ts）と同じ commonmark + gfm プリセットに previewKeymapPlugin を
 * 載せた実エディタを jsdom 上で組み立て、EditorView / Ctrl への参照を返す。
 *
 * jsdomSetup を必ず先に評価させるため、本ファイルより前で import すること。
 */
import './jsdomSetup';

import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { TextSelection } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import type { Ctx } from '@milkdown/ctx';

import { createPreviewKeymapPlugin } from '../../src/preview/webview/previewKeymapPlugin';

export interface PreviewEditorHandle {
    editor: Editor;
    view: EditorView;
    ctx: Ctx;
    /** 現在の doc を JSON 化して返す（アサーション用）。 */
    docJSON(): unknown;
    /** doc 直下のブロック種別名の配列。 */
    topLevelTypes(): string[];
    /** 指定位置にカーソルを置く。 */
    setCursor(pos: number): void;
    /** KeyboardEvent を view.dom に送り、ProseMirror の handleKeyDown 経路を通す。 */
    pressKey(init: KeyInit): { defaultPrevented: boolean };
    destroy(): void;
}

export interface KeyInit {
    key?: string;
    code?: string;
    meta?: boolean;
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
}

export async function createPreviewEditor(markdown: string): Promise<PreviewEditorHandle> {
    const root = document.getElementById('root');
    if (!root) throw new Error('test root element not found');
    root.innerHTML = '';

    const editor = await Editor.make()
        .config((ctx) => {
            ctx.set(rootCtx, root);
            ctx.set(defaultValueCtx, markdown);
        })
        // previewKeymapPlugin を presets より前に入れて handleKeyDown を優先させる
        .use(createPreviewKeymapPlugin())
        .use(commonmark)
        .use(gfm)
        .create();

    let view!: EditorView;
    let ctx!: Ctx;
    editor.action((c) => {
        ctx = c;
        view = c.get(editorViewCtx);
    });

    return {
        editor,
        view,
        ctx,
        docJSON: () => view.state.doc.toJSON(),
        topLevelTypes: () => {
            const types: string[] = [];
            view.state.doc.forEach((n) => types.push(n.type.name));
            return types;
        },
        setCursor: (pos: number) => {
            const { state } = view;
            view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, pos)));
        },
        pressKey: (init: KeyInit) => {
            const event = new window.KeyboardEvent('keydown', {
                key: init.key ?? '',
                code: init.code ?? '',
                metaKey: init.meta ?? false,
                ctrlKey: init.ctrl ?? false,
                altKey: init.alt ?? false,
                shiftKey: init.shift ?? false,
                bubbles: true,
                cancelable: true
            });
            view.dom.dispatchEvent(event);
            return { defaultPrevented: event.defaultPrevented };
        },
        destroy: () => {
            void editor.destroy();
        }
    };
}

/** doc 内で最初に出現する指定タイプのノードの開始位置（中身の先頭）を返す。 */
export function findFirstPosOfType(handle: PreviewEditorHandle, typeName: string): number {
    let found = -1;
    handle.view.state.doc.descendants((node, pos) => {
        if (found >= 0) return false;
        if (node.type.name === typeName) {
            found = pos + 1;
            return false;
        }
        return true;
    });
    return found;
}
