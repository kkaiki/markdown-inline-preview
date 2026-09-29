/**
 * PDF 書き出しの描画スクリプト。印刷する Chrome の中で動く（`out/pdfRuntime.js`、IIFE）。
 *
 * `src/shared/pdfHtml.ts` が置き換えた要素を描く:
 *   - `.ipreview-math` / `.ipreview-math-display` → KaTeX（エディタと同じ `throwOnError: false`）
 *   - `pre > code.language-*` → highlight.js（Marp と同じ主要 37 言語。知らない言語は白黒のまま）
 *   - `.ipreview-mermaid` → Mermaid（`out/mermaid.min.js` が先に読み込まれていれば。エディタと同じ設定）
 * すべて終わったら `window.__ipreviewReady` を解決する。印刷側（chromePdf）はそれを待つ。
 * 仕様: docs/specifications/fixes/pdf-output-parity-fix.md
 */
import katex from 'katex';
import hljs from 'highlight.js/lib/core';
import lang_bash from 'highlight.js/lib/languages/bash';
import lang_c from 'highlight.js/lib/languages/c';
import lang_cpp from 'highlight.js/lib/languages/cpp';
import lang_csharp from 'highlight.js/lib/languages/csharp';
import lang_css from 'highlight.js/lib/languages/css';
import lang_diff from 'highlight.js/lib/languages/diff';
import lang_dockerfile from 'highlight.js/lib/languages/dockerfile';
import lang_go from 'highlight.js/lib/languages/go';
import lang_graphql from 'highlight.js/lib/languages/graphql';
import lang_ini from 'highlight.js/lib/languages/ini';
import lang_java from 'highlight.js/lib/languages/java';
import lang_javascript from 'highlight.js/lib/languages/javascript';
import lang_json from 'highlight.js/lib/languages/json';
import lang_kotlin from 'highlight.js/lib/languages/kotlin';
import lang_less from 'highlight.js/lib/languages/less';
import lang_lua from 'highlight.js/lib/languages/lua';
import lang_makefile from 'highlight.js/lib/languages/makefile';
import lang_markdown from 'highlight.js/lib/languages/markdown';
import lang_objectivec from 'highlight.js/lib/languages/objectivec';
import lang_perl from 'highlight.js/lib/languages/perl';
import lang_php from 'highlight.js/lib/languages/php';
import lang_php_template from 'highlight.js/lib/languages/php-template';
import lang_plaintext from 'highlight.js/lib/languages/plaintext';
import lang_python from 'highlight.js/lib/languages/python';
import lang_python_repl from 'highlight.js/lib/languages/python-repl';
import lang_r from 'highlight.js/lib/languages/r';
import lang_ruby from 'highlight.js/lib/languages/ruby';
import lang_rust from 'highlight.js/lib/languages/rust';
import lang_scss from 'highlight.js/lib/languages/scss';
import lang_shell from 'highlight.js/lib/languages/shell';
import lang_sql from 'highlight.js/lib/languages/sql';
import lang_swift from 'highlight.js/lib/languages/swift';
import lang_typescript from 'highlight.js/lib/languages/typescript';
import lang_vbnet from 'highlight.js/lib/languages/vbnet';
import lang_wasm from 'highlight.js/lib/languages/wasm';
import lang_xml from 'highlight.js/lib/languages/xml';
import lang_yaml from 'highlight.js/lib/languages/yaml';

// Marp（scripts/build-lazy-bundles.mjs の KEEP_LANGUAGES）と同じ主要 37 言語だけを入れる。ほかの言語は白黒のまま
const LANGUAGES = {
    'bash': lang_bash,
    'c': lang_c,
    'cpp': lang_cpp,
    'csharp': lang_csharp,
    'css': lang_css,
    'diff': lang_diff,
    'dockerfile': lang_dockerfile,
    'go': lang_go,
    'graphql': lang_graphql,
    'ini': lang_ini,
    'java': lang_java,
    'javascript': lang_javascript,
    'json': lang_json,
    'kotlin': lang_kotlin,
    'less': lang_less,
    'lua': lang_lua,
    'makefile': lang_makefile,
    'markdown': lang_markdown,
    'objectivec': lang_objectivec,
    'perl': lang_perl,
    'php': lang_php,
    'php-template': lang_php_template,
    'plaintext': lang_plaintext,
    'python': lang_python,
    'python-repl': lang_python_repl,
    'r': lang_r,
    'ruby': lang_ruby,
    'rust': lang_rust,
    'scss': lang_scss,
    'shell': lang_shell,
    'sql': lang_sql,
    'swift': lang_swift,
    'typescript': lang_typescript,
    'vbnet': lang_vbnet,
    'wasm': lang_wasm,
    'xml': lang_xml,
    'yaml': lang_yaml,
};
for (const [name, language] of Object.entries(LANGUAGES)) hljs.registerLanguage(name, language);

interface MermaidApi {
    initialize(config: Record<string, unknown>): void;
    render(id: string, source: string): Promise<{ svg: string }>;
}

declare global {
    interface Window {
        __ipreviewReady?: Promise<void>;
        mermaid?: MermaidApi;
    }
}

function renderMath(): void {
    for (const el of document.querySelectorAll<HTMLElement>('.ipreview-math')) {
        const tex = el.textContent ?? '';
        katex.render(tex, el, { displayMode: el.classList.contains('ipreview-math-display'), throwOnError: false });
    }
}

function highlightCode(): void {
    for (const code of document.querySelectorAll<HTMLElement>('pre > code[class*="language-"]')) {
        const language = /language-([\w+#-]+)/.exec(code.className)?.[1];
        if (!language || !hljs.getLanguage(language)) continue;
        code.innerHTML = hljs.highlight(code.textContent ?? '', { language, ignoreIllegals: true }).value;
        code.classList.add('hljs');
    }
}

async function renderMermaid(): Promise<void> {
    const nodes = [...document.querySelectorAll<HTMLElement>('.ipreview-mermaid')];
    const mermaid = window.mermaid;
    if (nodes.length === 0 || !mermaid) return;
    mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'strict' });
    let seq = 0;
    for (const el of nodes) {
        const source = el.textContent ?? '';
        try {
            const { svg } = await mermaid.render(`ipreview-mermaid-${++seq}`, source);
            el.innerHTML = svg;
        } catch {
            // 描けない図はソースを残す（黙って消さない）
            const pre = document.createElement('pre');
            pre.textContent = source;
            el.replaceWith(pre);
        }
    }
}

async function renderAll(): Promise<void> {
    renderMath();
    highlightCode();
    await renderMermaid();
    // KaTeX のフォントが読み込まれる前に印刷すると、数式が代替フォントで出る
    await document.fonts.ready;
}

window.__ipreviewReady = renderAll().catch(() => undefined);
