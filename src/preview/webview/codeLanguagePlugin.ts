/**
 * コードブロックの右上に言語選択ドロップダウンを表示するプラグイン。
 *
 * `code_block` ノードの `language` 属性を `<select>` で編集できるようにする。
 * 重い CodeMirror ベースのコンポーネントは使わず、widget decoration で実装する。
 */
import { commandsCtx, editorViewCtx } from '@milkdown/kit/core';
import type { Ctx } from '@milkdown/ctx';
import { updateCodeBlockLanguageCommand } from '@milkdown/kit/preset/commonmark';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import type { EditorView } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';

// hljs で扱える主要言語（ドロップダウンの選択肢）
const LANGUAGES = [
    '', 'bash', 'shell', 'c', 'cpp', 'csharp', 'css', 'diff', 'go', 'graphql',
    'html', 'java', 'javascript', 'json', 'kotlin', 'lua', 'markdown', 'php',
    'python', 'ruby', 'rust', 'scss', 'sql', 'swift', 'typescript', 'yaml',
    'mermaid', 'plaintext'
];

function buildSelect(view: EditorView, getPos: () => number, language: string): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'code-lang-select';
    wrapper.contentEditable = 'false';

    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Code block language');

    const options = LANGUAGES.includes(language) ? LANGUAGES : [language, ...LANGUAGES];
    for (const lang of options) {
        const opt = document.createElement('option');
        opt.value = lang;
        opt.textContent = lang === '' ? 'plain' : lang;
        if (lang === language) opt.selected = true;
        select.appendChild(opt);
    }

    // クリックでエディタのフォーカス/選択を奪わないようにする
    select.addEventListener('mousedown', (e) => e.stopPropagation());
    select.addEventListener('change', () => {
        onChangeLanguage(view, getPos(), select.value);
    });

    wrapper.appendChild(select);
    return wrapper;
}

let ctxRef: Ctx | null = null;

function onChangeLanguage(view: EditorView, pos: number, language: string): void {
    if (!ctxRef) return;
    ctxRef.get(commandsCtx).call(updateCodeBlockLanguageCommand.key, { pos, language });
    requestAnimationFrame(() => ctxRef?.get(editorViewCtx).focus());
}

export function createCodeLanguagePlugin() {
    return $prose((ctx) => {
        ctxRef = ctx;
        return new Plugin({
            key: new PluginKey('codeLanguageSelect'),
            props: {
                decorations(state) {
                    const view = ctxRef?.get(editorViewCtx);
                    if (!view || !view.editable) return DecorationSet.empty;

                    const decorations: Decoration[] = [];
                    state.doc.descendants((node, pos) => {
                        if (node.type.name !== 'code_block') return;
                        const language = typeof node.attrs.language === 'string' ? node.attrs.language : '';
                        decorations.push(
                            Decoration.widget(pos + 1, () => buildSelect(view, () => pos, language), {
                                side: -1,
                                key: `code-lang-${pos}-${language}`,
                                ignoreSelection: true
                            })
                        );
                    });
                    return DecorationSet.create(state.doc, decorations);
                }
            }
        });
    });
}
