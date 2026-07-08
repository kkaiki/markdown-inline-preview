/**
 * WebView 側エントリポイント。esbuild で media/milkdown.bundle.js にバンドルされる。
 */
import { Editor, rootCtx, defaultValueCtx, editorViewCtx, editorViewOptionsCtx, commandsCtx, remarkStringifyOptionsCtx, serializerCtx } from '@milkdown/kit/core';
import { commonmark, insertImageCommand, updateCodeBlockLanguageCommand } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { history } from '@milkdown/kit/plugin/history';
import { clipboard } from '@milkdown/kit/plugin/clipboard';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import { listItemBlockComponent, listItemBlockConfig } from '@milkdown/kit/component/list-item-block';
import mermaid from 'mermaid';

import type { EditorView } from '@milkdown/prose/view';
import { Selection } from '@milkdown/prose/state';
import { overrideHardbreakSerializer } from './hardbreakSerializer';
import { disableTextEscape } from './disableTextEscape';

import type { HostToWebviewMessage, PreviewSettings, ScrollAnchorPayload } from './types';
import { parseFrontmatterEntries } from '../../shared/markdown/frontmatter';
import { tightenListSpacing, stripPlaceholderLineBreaks, stripListItemPlaceholderBr, normalizePreviewMarkdown } from '../../shared/markdown/lineBreaks';

// Preview 本文と Git 差分の基準を同じ正規形に揃えるための共通正規化（shared に集約）。
const normalizeMarkdown = normalizePreviewMarkdown;
import {
    createScrollAnchor,
    headingMatchesScrollAnchor
} from '../../shared/structure/scrollAnchor';
import { scrollRatioFromPixels, pixelsFromScrollRatio, contentScrollHeight } from '../../shared/preview/scrollSync';
import { focusSyntaxPlugin, setFocusSyntaxEnabled } from './focusSyntaxPlugin';
import { createMarkerBackspacePlugin } from './markerBackspace';
import { createBlockPrefixEditPlugin, isBlockPrefixActive, setOnCollapseSync } from './blockPrefixEditPlugin';
import { createInlineMarkEditPlugin, isInlineMarkEditActive, setOnCollapseSync as setInlineMarkOnCollapseSync } from './inlineMarkEditPlugin';
import { createLineNumberGutterPlugin } from './lineNumberGutterPlugin';
import { createSlashMenuPlugin, PreviewSlashMenuController, setSlashMenuEnabled } from './previewSlashMenu';
import { createTableToolbarPlugin } from './tableToolbarPlugin';
import { createPreviewToolbarPlugin } from './previewToolbarPlugin';
import { createTableCellEnterPlugin } from './tableCellEnterPlugin';
import { createClipboardPlainTextPlugin } from './clipboardPlainTextPlugin';
import { createListMarkerDragFixPlugin } from './listMarkerDragFixPlugin';
import { createTableSelectionFixPlugin } from './tableSelectionFix';
import { createTableArrowKeymapPlugin } from './tableArrowKeymap';
import { createCodeBlockArrowKeymapPlugin } from './codeBlockArrowKeymap';
import { createPreviewKeymapPlugin, handleSelectAllCapture } from './previewKeymapPlugin';
import { classifyPreviewShortcut } from '../../shared/preview/previewShortcuts';
import { createCodeLanguagePlugin } from './codeLanguagePlugin';
import { createCodeHighlightPlugin } from './codeHighlightPlugin';
import { createMermaidDiagramPlugin, setMermaidEnabled } from './mermaidDiagramPlugin';
import { createMathDecorationPlugin, setMathEnabled } from './mathDecorationPlugin';
import { createImeEnterGuardPlugin } from './imeEnterGuard';
import { createCodeBlockTripleClickPlugin } from './codeBlockTripleClick';
import { createInlineMarkBackspacePlugin } from './inlineMarkBackspace';
import { createCodeBlockBackspacePlugin } from './codeBlockBackspace';
import { createCheckboxToggleKeymapPlugin } from './checkboxToggle';
import { createPreviewDiffPlugin, setDiffBase } from './previewDiffPlugin';
import { PreviewFindBar } from './previewFindBar';
import { setLanguage, t } from './i18n';
import { createImageCopyPlugin, writeDataUrlToClipboard } from './imageCopyPlugin';
import { imageIsolationPlugin } from './imageIsolationPlugin';
import { trailingNbspFixPlugin } from './trailingNbspFixPlugin';
import { applyExternalContent } from './applyExternalContent';
import { getPreviewCursorAnchor, applyPreviewCursorAnchor } from './cursorAnchor';
import type { CursorAnchor } from '../../shared/preview/cursorAnchor';
import { blankLineRemarkPlugin } from './blankLineRemarkPlugin';

const vscodeApi = acquireVsCodeApi();
const root = document.getElementById('milkdown-root');
const frontmatterPanel = document.getElementById('frontmatter-panel');
const slashMenuEl = document.getElementById('slash-menu');

if (!root) {
    throw new Error('milkdown-root element not found');
}

const getEditorView = (): EditorView | null => {
    if (!editor) return null;
    let view: EditorView | null = null;
    editor.action((ctx) => { view = ctx.get(editorViewCtx); });
    return view;
};
const findBar = new PreviewFindBar(root, getEditorView);
document.addEventListener('keydown', (event) => {
    const shortcut = classifyPreviewShortcut(event);

    // Cmd/Ctrl+F: Preview 内検索
    if (shortcut?.kind === 'find') {
        event.preventDefault();
        event.stopPropagation();
        findBar.open();
        return;
    }

    // Cmd+Opt+F（mac）/ Ctrl+H（Win・Linux）: 検索＋置換
    if (shortcut?.kind === 'replace') {
        event.preventDefault();
        event.stopPropagation();
        findBar.open(true);
        return;
    }

    // Cmd/Ctrl+Shift+.: Raw（Markdown ソース）へ戻る。WebView 内には VS Code の
    // キーバインドが届かないため、ここで拾ってホストへトグルを依頼する。
    if (shortcut?.kind === 'toggleRaw') {
        event.preventDefault();
        event.stopPropagation();
        vscodeApi.postMessage({ type: 'toggleRaw' });
        return;
    }

    // Cmd/Ctrl+A: セル内容 → 行全体 → テーブル全体 → 文書全体 の段階選択。
    // capture フェーズで横取りして選択変更まで行い、stopPropagation で ProseMirror の
    // keydown 経路を止める。これには 2 つの理由がある:
    //  1. ProseMirror 標準（ブラウザ/Electron の native「Select All」）より先に処理する。
    //     プラグインの handleKeyDown は読み込み順により負けることがあり、その場合 native
    //     の全選択が先に走って段階選択（セル/行/表）が無視されてしまう。
    //  2. ここで処理したら同じ keydown を plugin の handleKeyDown へ流さない。両方走ると
    //     1 回の押下で 2 段階進んでしまう（capture=セル内容 → plugin=行 …）。
    // 段階選択ロジック自体は handleSelectAll に集約し、ここと plugin で共有する
    // （plugin 経路はテストが直接 view.dom に keydown を送って検証する）。
    if (shortcut?.kind === 'selectAll') {
        if (!editor) return;
        editor.action((ctx) => handleSelectAllCapture(ctx.get(editorViewCtx), ctx, event));
    }
}, true);

/**
 * 末尾ブロックより下の余白をダブルクリックしたら、文書末尾に空段落を追加して
 * そこへカーソルを移す。テーブルやコードブロックで終わっている文書でも、
 * その下に続きを書き始められるようにするため。
 */
function appendTrailingParagraph(view: EditorView): void {
    const { state } = view;
    const last = state.doc.lastChild;
    const alreadyEmpty = last?.type.name === 'paragraph' && last.content.size === 0;

    let tr = state.tr;
    if (!alreadyEmpty) {
        const paragraph = state.schema.nodes.paragraph.createAndFill();
        if (!paragraph) return;
        tr = tr.insert(state.doc.content.size, paragraph);
    }
    tr = tr.setSelection(Selection.atEnd(tr.doc)).scrollIntoView();
    view.dispatch(tr);
    view.focus();
}

root.addEventListener('dblclick', (event) => {
    if (!editor) return;
    editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        if (!view.editable) return;
        // ProseMirror の描画領域（.ProseMirror）の最終ブロックより下をクリックした時だけ。
        // 本文をダブルクリックした場合は ProseMirror の既定（単語選択など）に任せる。
        const lastBlock = view.dom.lastElementChild;
        const bottom = lastBlock
            ? lastBlock.getBoundingClientRect().bottom
            : view.dom.getBoundingClientRect().bottom;
        if (event.clientY <= bottom) return;
        appendTrailingParagraph(view);
    });
});

const PROPORTIONAL_FONT_STACK =
    '-apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Yu Gothic UI", Meiryo, "Noto Sans JP", sans-serif';

const CHECK_ICON_SVG = '<svg viewBox="0 0 16 16"><path d="M3 8.3L6.2 11.5L13 4.5" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function renderListItemLabel({ label, listType, checked }: { label: string; listType: string; checked?: boolean }): string {
    if (checked === undefined || checked === null) {
        return listType === 'bullet' ? '•' : label;
    }
    return checked ? CHECK_ICON_SVG : '';
}


let editor: Editor | null = null;
let lastSyncedMarkdown: string | null = null;
let currentFrontmatter: string | null = null;
let currentSettings: PreviewSettings | null = null;
let scrollReportEnabled = false;
let isComposing = false;
let compositionBaseBlockText = '';
const slashMenuController = slashMenuEl ? new PreviewSlashMenuController(slashMenuEl) : null;
const slashMenuPlugin = slashMenuController ? createSlashMenuPlugin(slashMenuController) : null;

function debounce<T extends (...args: never[]) => void>(fn: T, wait: number): (...args: Parameters<T>) => void {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return (...args: Parameters<T>) => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => fn(...args), wait);
    };
}

// ズーム（拡大/縮小）。基準フォントサイズに倍率を掛けて適用し、webview state に保存する
// （その webview のリロードをまたいで維持される）。
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.1;

function readSavedZoom(): number {
    const state = vscodeApi.getState() as { zoom?: number } | undefined;
    const z = state?.zoom;
    return typeof z === 'number' && z >= ZOOM_MIN && z <= ZOOM_MAX ? z : 1;
}

let zoomFactor = readSavedZoom();

function applyZoom(): void {
    const base = currentSettings?.fontSize ?? 13;
    document.documentElement.style.setProperty('--preview-font-size', `${(base * zoomFactor).toFixed(2)}px`);
    const state = (vscodeApi.getState() as Record<string, unknown> | undefined) ?? {};
    vscodeApi.setState({ ...state, zoom: zoomFactor });
    // フォントサイズ（行高）が変わると必要な余白も変わるので再計算する。
    updateScrollBeyondPadding();
}

// 「最終行より下へのスクロール余白」。常に有効。最終行を画面最上部まで送れるよう、
// `ビューポート高 − 1行高` をコンテンツ下に確保する。従来の見た目の下余白 48px を
// 基準に、それを超える分だけを「追加余白」としてスクロール同期の比率計算から除外する。
const BASE_BOTTOM_PADDING = 48;
let scrollBeyondExtraPx = 0;

/** `.milkdown` の 1 行の高さ（px）。取得できなければフォントサイズ×1.6 で近似。 */
function previewLineHeightPx(): number {
    const el = root.querySelector('.milkdown');
    if (el) {
        const style = getComputedStyle(el);
        const lh = parseFloat(style.lineHeight);
        if (Number.isFinite(lh) && lh > 0) return lh;
        const fs = parseFloat(style.fontSize);
        if (Number.isFinite(fs) && fs > 0) return fs * 1.6;
    }
    return 24;
}

/** スクロール余白（padding-bottom）を「ビューポート高 − 1行」に更新する。 */
function updateScrollBeyondPadding(): void {
    const pad = Math.max(BASE_BOTTOM_PADDING, root.clientHeight - previewLineHeightPx());
    scrollBeyondExtraPx = pad - BASE_BOTTOM_PADDING;
    root.style.setProperty('--preview-scroll-beyond', `${pad}px`);
}

window.addEventListener('resize', debounce(updateScrollBeyondPadding, 100));

function setZoom(next: number): number {
    zoomFactor = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(next * 100) / 100));
    applyZoom();
    return Math.round(zoomFactor * 100);
}

function applySettingsToDom(settings: PreviewSettings): void {
    currentSettings = settings;
    document.body.classList.toggle('theme-light', settings.theme === 'light');
    document.body.classList.toggle('theme-dark', settings.theme === 'dark');
    // 既定は等幅エディタフォントではなく、CJK を含む比例フォント。等幅だと
    // ASCII と日本語でフォールバックが分かれ、太さ（＝色）が不揃いに見えるため。
    document.documentElement.style.setProperty(
        '--preview-font-family',
        settings.fontFamily || PROPORTIONAL_FONT_STACK
    );
    applyZoom();
    document.documentElement.style.setProperty(
        '--preview-max-width',
        settings.maxWidth > 0 ? `${settings.maxWidth}px` : 'none'
    );
    scrollReportEnabled = !!settings.syncScroll;

    if (frontmatterPanel) {
        frontmatterPanel.hidden = !settings.showFrontmatter;
    }

    setFocusSyntaxEnabled(settings.showFocusSyntax);
    setSlashMenuEnabled(settings.enableSlashMenu);
    setMermaidEnabled(settings.enableMermaid);
    setMathEnabled(settings.enableMath);
    if (!settings.enableSlashMenu) {
        slashMenuController?.hide();
    }

    // 各ブロック左の行番号ガターの表示/非表示（CSS の body.show-line-numbers で制御）。
    document.body.classList.toggle('show-line-numbers', settings.showLineNumbers);

    mermaid.initialize({
        startOnLoad: false,
        theme: settings.theme === 'dark' ? 'dark' : 'default',
        securityLevel: 'strict'
    });
}

function renderFrontmatterPanel(yaml: string | null | undefined): void {
    if (!frontmatterPanel) return;
    if (!yaml || !currentSettings?.showFrontmatter) {
        frontmatterPanel.innerHTML = '';
        frontmatterPanel.hidden = true;
        return;
    }

    frontmatterPanel.hidden = false;
    const rows = parseFrontmatterEntries(yaml)
        .map(({ key, value }) => `<div class="fm-row"><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd></div>`)
        .join('');
    frontmatterPanel.innerHTML = `<dl class="fm-list">${rows}</dl>`;
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// コードのシンタックスハイライト・Mermaid 図・KaTeX 数式は、すべてデコレーション
// プラグイン（codeHighlightPlugin / mermaidDiagramPlugin / mathDecorationPlugin）が
// 描画する。DOM を直接書き換える後処理は ProseMirror の MutationObserver に
// 巻き戻されるため存在しない。

function handlePreviewLinkClick(event: Event): boolean {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return false;
    const anchor = target.closest('a');
    if (!anchor) return false;

    const href = anchor.getAttribute('href');
    if (!href) return false;

    event.preventDefault();
    event.stopPropagation();
    vscodeApi.postMessage({ type: 'openLink', href });
    return true;
}

function sendImageFile(file: File): void {
    const reader = new FileReader();
    reader.onload = () => {
        if (typeof reader.result === 'string') {
            vscodeApi.postMessage({ type: 'insertImage', dataUrl: reader.result, name: file.name || 'image' });
        }
    };
    reader.readAsDataURL(file);
}

/** ペースト/ドロップに画像があればホストへ送って保存し、true（処理済み）を返す。 */
function handleImageDataTransfer(data: DataTransfer | null): boolean {
    if (!data) return false;
    const items = Array.from(data.items ?? []);
    const imageItem = items.find((item) => item.kind === 'file' && item.type.startsWith('image/'));
    if (imageItem) {
        const file = imageItem.getAsFile();
        if (file) {
            sendImageFile(file);
            return true;
        }
    }
    const file = Array.from(data.files ?? []).find((f) => f.type.startsWith('image/'));
    if (file) {
        sendImageFile(file);
        return true;
    }
    return false;
}

function insertImageSrc(src: string): void {
    if (!editor) return;
    editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const { state } = view;
        const { $from } = state.selection;
        const parent = $from.parent;
        const { paragraph } = state.schema.nodes;
        const imageType = state.schema.nodes['image'];

        // 画像ノードを生成できない場合はコマンドにフォールバック
        if (!imageType || !paragraph) {
            ctx.get(commandsCtx).call(insertImageCommand.key, { src });
            return;
        }

        const imageNode = imageType.create({ src });

        // 現在の段落にテキスト（画像以外の内容）が含まれるか確認
        const parentHasText = parent.type === paragraph &&
            Array.from({ length: parent.childCount }, (_, i) => parent.child(i))
                .some(c => c.type.name !== 'image');

        let tr = state.tr;
        if (parentHasText) {
            // テキストがある段落の後ろに画像専用の新段落を挿入
            const afterPara = $from.after($from.depth);
            tr = tr.insert(afterPara, paragraph.create(null, imageNode));
        } else {
            // 画像のみ or 空の段落ならカーソル位置に挿入
            tr = tr.insert($from.pos, imageNode);
        }
        view.dispatch(tr);
    });
}

// 差分基準（Git HEAD 本文）。エディタ作成前に届くこともあるので保留しておく。
let pendingDiffBase: string | null | undefined;

function applyDiffBase(baseMarkdown: string | null): void {
    if (!editor) {
        pendingDiffBase = baseMarkdown;
        return;
    }
    // 基準（HEAD 本文）を本文ドキュメントと同じ正規形にしてから比較する。揃えないと
    // Raw では無変更なのに Preview のガターだけ「変更（青）」に見える（表セルの `<br>` 等）。
    const normalizedBase = baseMarkdown === null ? null : normalizeMarkdown(baseMarkdown);
    editor.action((ctx) => setDiffBase(ctx, normalizedBase));
}

/** 選択テキストがある状態で URL を貼ると、その選択をリンクにする（テキストは保持）。 */
function handleUrlPaste(view: EditorView, data: DataTransfer | null): boolean {
    if (!data) return false;
    const text = data.getData('text/plain').trim();
    if (!/^https?:\/\/\S+$/i.test(text) || /\s/.test(text)) return false;

    const { state } = view;
    const { from, to, empty } = state.selection;
    if (empty) return false;

    const linkType = state.schema.marks.link;
    if (!linkType) return false;

    view.dispatch(state.tr.addMark(from, to, linkType.create({ href: text })));
    return true;
}

function setEditable(editable: boolean): void {
    if (!editor) return;
    editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        view.setProps({ editable: () => editable });
    });
}

function postChange(markdown: string): void {
    // ファイルに書く形（テーブルセル内改行は `<br>` のまま）。
    // 段落間の空行は詰めない（ユーザーが入れた空行を保持する）。リストだけ tight 化。
    // remark-preserve-empty-line が空項目を <br /> として直列化するので除去する。
    const fileMarkdown = stripListItemPlaceholderBr(
        stripPlaceholderLineBreaks(tightenListSpacing(markdown))
    );
    // 重複判定は取り込み時と同じ正規形（セル内改行は `&#10;`）で行う。こうしないと
    // ホストからのエコーバック（`<br>`）を正規化した結果と食い違い、無駄な再描画になる。
    const canonical = normalizeMarkdown(markdown);
    if (canonical === lastSyncedMarkdown) return;
    lastSyncedMarkdown = canonical;
    vscodeApi.postMessage({ type: 'change', markdown: fileMarkdown });
}

function activeBlockText(view: EditorView): string {
    const { $from } = view.state.selection;
    for (let depth = $from.depth; depth >= 0; depth--) {
        const node = $from.node(depth);
        if (node.isBlock) return node.textContent;
    }
    return '';
}


async function createEditor(markdown: string, settings: PreviewSettings): Promise<void> {
    const initialMarkdown = normalizeMarkdown(markdown);
    lastSyncedMarkdown = initialMarkdown;
    // ツールバー等を組む前に表示言語を反映する（t() の結果が確定するように）。
    setLanguage(settings.language);
    setFocusSyntaxEnabled(settings.showFocusSyntax);
    setSlashMenuEnabled(settings.enableSlashMenu);

    const builder = Editor.make()
        .config((ctx) => {
            ctx.set(rootCtx, root);
            ctx.set(defaultValueCtx, initialMarkdown);
            ctx.update(editorViewOptionsCtx, (prev) => ({
                ...prev,
                editable: () => settings.editable,
                handleDOMEvents: {
                    click: (_view, event) => handlePreviewLinkClick(event),
                    compositionstart: (view) => {
                        isComposing = true;
                        compositionBaseBlockText = activeBlockText(view);
                        return false;
                    },
                    compositionend: () => {
                        isComposing = false;
                        compositionBaseBlockText = '';
                        return false;
                    },
                    paste: (view, event) => {
                        if (handleImageDataTransfer(event.clipboardData)) {
                            event.preventDefault();
                            return true;
                        }
                        if (handleUrlPaste(view, event.clipboardData)) {
                            event.preventDefault();
                            return true;
                        }
                        return false;
                    },
                    drop: (_view, event) => {
                        if (handleImageDataTransfer(event.dataTransfer)) {
                            event.preventDefault();
                            return true;
                        }
                        return false;
                    }
                }
            }));
            ctx.get(listenerCtx).markdownUpdated((_ctx, nextMarkdown) => {
                // blockPrefixEditPlugin 展開中はプレフィックスが二重直列化（`## ## Hello`）
                // されるため、カーソルがブロックを抜けて折りたたみが完了するまで同期を抑制する。
                if (isBlockPrefixActive() || isInlineMarkEditActive()) return;
                postChange(nextMarkdown);
            });
            ctx.set(listItemBlockConfig.key, { renderLabel: renderListItemLabel });
            // リスト記号を `*` ではなく `-` にする（チェックボックスを含む全箇条書き）
            ctx.update(remarkStringifyOptionsCtx, (prev) => ({ ...prev, bullet: '-' }));
            overrideHardbreakSerializer(ctx);
            disableTextEscape(ctx);
        })
        // Keymap overrides must come before the presets so their handleKeyDown
        // runs ahead of the base/gfm keymaps (Cmd+A, Cmd+Opt+N, Enter-in-cell).
        // imeEnterGuard は IME 確定 Enter を他の Enter ハンドラより先に握りつぶす
        // 必要があるため、最初に登録する。
        .use(createImeEnterGuardPlugin())
        .use(createPreviewKeymapPlugin())
        .use(createCodeBlockTripleClickPlugin())
        .use(createInlineMarkBackspacePlugin())
        .use(createCodeBlockBackspacePlugin())
        .use(createCheckboxToggleKeymapPlugin())
        .use(createTableCellEnterPlugin())
        .use(createTableSelectionFixPlugin())
        .use(createTableArrowKeymapPlugin())
        .use(createCodeBlockArrowKeymapPlugin())
        .use(commonmark)
        // commonmark プリセットの `commands` 配列に含まれていないため、明示的に
        // 使わないと commandsCtx に一切登録されず、呼び出すと例外になる
        // （code-fence-language-focus-edit-fix.md で発見。既存の言語ドロップダウンも
        // 同じ理由で元から機能していなかった）。
        .use(updateCodeBlockLanguageCommand)
        .use(gfm)
        .use(blankLineRemarkPlugin)
        .use(history)
        // 画像ノード選択時の Cmd+C / 右クリック「Copy Image」を処理する。
        // clipboard プラグインより前に登録して、画像 NodeSelection では優先して処理する。
        .use(createImageCopyPlugin({
            postMessage: (msg) => vscodeApi.postMessage(msg)
        }))
        // 画像とテキストの混在を防ぐ。文書変更後に混在段落を自動分離する。
        .use(imageIsolationPlugin)
        // ブロック末尾に紛れ込んだ NBSP（ブラウザの行末スペース代替措置由来）を
        // 通常スペースへ正規化する（trailing-space-nbsp-corruption-fix.md）。
        .use(trailingNbspFixPlugin)
        // コピー時、表セルの改行を保存用 markdown の `<br>` のまま漏らさず、実際の
        // 改行として渡す。clipboard プラグインより前に登録し、someProp の先勝ちで上書きする。
        .use(createClipboardPlainTextPlugin())
        // 貼り付け/コピーを Markdown ベースにする。これが無いと Preview への貼り付けが
        // ProseMirror 既定（HTML/プレーンテキスト）任せになり、Raw と違って構造が崩れる。
        .use(clipboard)
        .use(listener)
        .use(listItemBlockComponent)
        .use(createListMarkerDragFixPlugin())
        .use(createTableToolbarPlugin())
        .use(createCodeLanguagePlugin())
        .use(createCodeHighlightPlugin())
        .use(createMermaidDiagramPlugin())
        .use(createMathDecorationPlugin())
        .use(createPreviewDiffPlugin())
        .use(focusSyntaxPlugin)
        .use(createMarkerBackspacePlugin())
        .use(createBlockPrefixEditPlugin())
        .use(createInlineMarkEditPlugin())
        .use(createLineNumberGutterPlugin());

    if (settings.showToolbar) {
        const isMac = /mac/i.test(navigator.platform || navigator.userAgent || '');
        builder.use(
            createPreviewToolbarPlugin({
                isMac,
                showShortcuts: settings.toolbarShowShortcuts,
                onExport: () => vscodeApi.postMessage({ type: 'exportRequest' }),
                onToggleRaw: () => vscodeApi.postMessage({ type: 'toggleRaw' }),
                onZoomIn: () => setZoom(zoomFactor + ZOOM_STEP),
                onZoomOut: () => setZoom(zoomFactor - ZOOM_STEP),
                onZoomReset: () => setZoom(1),
                initialZoom: Math.round(zoomFactor * 100)
            })
        );
    }

    if (slashMenuPlugin) {
        builder.use(slashMenuPlugin);
    }

    editor = await builder.create();
    // blockPrefixEditPlugin の collapse（addToHistory: false）は Milkdown の
    // markdownUpdated リスナーから完全に見えない（同リスナーは addToHistory:false の
    // transaction を無視するため）。collapse のたびに現在の doc を明示的に再シリアライズ
    // して postChange することで、リスナー側の取りこぼしに依存せず常に最新内容を
    // ホストへ届ける（詳細: docs/specifications/collapse-markdown-sync-fix.md）。
    setOnCollapseSync(() => {
        if (!editor) return;
        editor.action((ctx) => {
            const serialize = ctx.get(serializerCtx);
            const view = ctx.get(editorViewCtx);
            postChange(serialize(view.state.doc));
        });
    });
    setInlineMarkOnCollapseSync(() => {
        if (!editor) return;
        editor.action((ctx) => {
            const serialize = ctx.get(serializerCtx);
            const view = ctx.get(editorViewCtx);
            postChange(serialize(view.state.doc));
        });
    });
    // テスト専用シーム: 事前に window.__IPREVIEW_TEST_HOOK__ が定義されている場合のみ
    // EditorView を渡す。本番（実 VS Code）では未定義なので何もしない。
    // 実ブラウザ回帰テスト（test/browser）がドキュメントモデル/選択を読むために使う。
    const testHook = (globalThis as unknown as { __IPREVIEW_TEST_HOOK__?: (view: unknown) => void }).__IPREVIEW_TEST_HOOK__;
    if (typeof testHook === 'function') {
        editor.action((ctx) => testHook(ctx.get(editorViewCtx)));
    }
    slashMenuController?.bindEditor(editor);

    if (pendingDiffBase !== undefined) {
        applyDiffBase(pendingDiffBase);
        pendingDiffBase = undefined;
    }

    // `.milkdown` が生成され実際の行高が取れるようになったので、スクロール余白を確定する。
    updateScrollBeyondPadding();
}

function applyExternalMarkdown(markdown: string): void {
    const next = normalizeMarkdown(markdown);
    if (!editor || next === lastSyncedMarkdown) return;
    const baseText = compositionBaseBlockText.trim();
    if (isComposing && baseText.length > 0 && !next.includes(baseText)) {
        return;
    }
    lastSyncedMarkdown = next;
    editor.action((ctx) => applyExternalContent(ctx, next));
}

/** アンカー見出しまでスクロール。一致する見出しが無ければ false（呼び出し側が比率で代替）。 */
function scrollToAnchor(anchor: ScrollAnchorPayload): boolean {
    const headings = root.querySelectorAll('h1,h2,h3,h4,h5,h6');
    for (const heading of headings) {
        const text = heading.textContent?.trim() ?? '';
        if (headingMatchesScrollAnchor(text, anchor)) {
            heading.scrollIntoView({ block: 'start', behavior: 'auto' });
            return true;
        }
    }
    return false;
}

function findVisibleAnchor(): ScrollAnchorPayload | undefined {
    const headings = Array.from(root.querySelectorAll('h1,h2,h3,h4,h5,h6'));
    if (headings.length === 0) return undefined;

    const rootTop = root.getBoundingClientRect().top;
    let candidate: Element | undefined;
    for (const heading of headings) {
        if (heading.getBoundingClientRect().top <= rootTop + 8) candidate = heading;
        else break;
    }
    const target = candidate ?? headings[0];
    const title = target.textContent?.trim() ?? '';
    if (!title) return undefined;
    return createScrollAnchor(title);
}

function isHostMessage(data: unknown): data is HostToWebviewMessage {
    return typeof data === 'object' && data !== null && 'type' in data;
}

const reportScroll = debounce(() => {
    if (!scrollReportEnabled) return;
    const ratio = scrollRatioFromPixels(
        root.scrollTop,
        contentScrollHeight(root.scrollHeight, scrollBeyondExtraPx),
        root.clientHeight
    );
    const anchor = findVisibleAnchor();
    vscodeApi.postMessage({ type: 'scroll', ratio, anchor });
}, 150);
root.addEventListener('scroll', reportScroll);

// カーソル位置を（Preview → Raw 用に）ホストへ報告する。選択が変わるたびに最新を送り、
// ホストは lastKnownCursor として保持して Raw に戻すときに使う。
const reportCursor = debounce(() => {
    if (!editor) return;
    let anchor: CursorAnchor | null = null;
    editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        if (view.hasFocus()) anchor = getPreviewCursorAnchor(view);
    });
    if (anchor) vscodeApi.postMessage({ type: 'cursor', anchor });
}, 150);
document.addEventListener('selectionchange', reportCursor);

function applyFadeIn(enabled: boolean): void {
    if (!enabled) return;
    document.body.classList.remove('preview-fade-in');
    void document.body.offsetWidth;
    document.body.classList.add('preview-fade-in');
}

window.addEventListener('message', (event: MessageEvent) => {
    const message = event.data;
    if (!isHostMessage(message)) return;

    if (message.type === 'init') {
        setLanguage(message.settings.language);
        applySettingsToDom(message.settings);
        currentFrontmatter = message.frontmatter ?? null;
        renderFrontmatterPanel(currentFrontmatter);
        void createEditor(message.markdown, message.settings).then(() => {
            const { settings, scrollAnchor, scrollRatio, cursorAnchor } = message;
            const applyRatio = (): void => {
                if (typeof scrollRatio === 'number') {
                    root.scrollTop = pixelsFromScrollRatio(
                        scrollRatio,
                        contentScrollHeight(root.scrollHeight, scrollBeyondExtraPx),
                        root.clientHeight
                    );
                }
            };
            if (settings.syncScroll && scrollAnchor) {
                // アンカー見出しが見つからなければ比率でフォールバック。
                requestAnimationFrame(() => {
                    if (!scrollToAnchor(scrollAnchor)) applyRatio();
                });
            } else if (settings.syncScroll && typeof scrollRatio === 'number') {
                requestAnimationFrame(applyRatio);
            }
            // カーソル位置の引き継ぎ（Raw → Preview）。スクロールより後に当て、カーソルへ寄せる。
            if (cursorAnchor && editor) {
                requestAnimationFrame(() => {
                    editor?.action((ctx) => applyPreviewCursorAnchor(ctx.get(editorViewCtx), cursorAnchor));
                });
            }
            applyFadeIn(settings.enableTransitions);
        }).catch((error: unknown) => {
            // エディタ生成に失敗しても真っ白にしない: 原因を表示し本文を素のテキストで出す
            const pre = document.createElement('pre');
            pre.style.whiteSpace = 'pre-wrap';
            pre.style.padding = '12px';
            pre.textContent =
                `${t('[Failed to initialize Preview. Please edit in Raw mode.]')}\n` +
                `${error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error)}\n\n` +
                message.markdown;
            root.replaceChildren(pre);
        });
        return;
    }
    if (message.type === 'update') {
        if (message.frontmatter !== undefined) {
            currentFrontmatter = message.frontmatter;
            renderFrontmatterPanel(currentFrontmatter);
        }
        applyExternalMarkdown(message.markdown);
        return;
    }
    if (message.type === 'settings') {
        setLanguage(message.settings.language);
        applySettingsToDom(message.settings);
        setEditable(message.settings.editable);
        renderFrontmatterPanel(currentFrontmatter);
        return;
    }
    if (message.type === 'imageInserted') {
        insertImageSrc(message.src);
        return;
    }
    if (message.type === 'imageCopied') {
        // Host がファイルを読んで返した dataUrl をクリップボードに書き込む。
        // null はファイル読み取り失敗（パス解決不能 / 権限なし等）→ 無視。
        if (message.dataUrl) {
            void writeDataUrlToClipboard(message.dataUrl);
        }
        return;
    }
    if (message.type === 'baseMarkdown') {
        applyDiffBase(message.baseMarkdown);
    }
});

vscodeApi.postMessage({ type: 'ready' });
