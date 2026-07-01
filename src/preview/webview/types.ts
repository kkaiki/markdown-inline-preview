import type { ScrollAnchor } from '../../shared/structure/scrollAnchor';
import type { CursorAnchor } from '../../shared/preview/cursorAnchor';

export type ScrollAnchorPayload = ScrollAnchor;
export type { CursorAnchor };

export interface PreviewSettings {
    theme: 'light' | 'dark';
    fontFamily: string;
    fontSize: number;
    maxWidth: number;
    editable: boolean;
    syncScroll: boolean;
    enableMath: boolean;
    enableMermaid: boolean;
    showFrontmatter: boolean;
    enableTransitions: boolean;
    showFocusSyntax: boolean;
    enableSlashMenu: boolean;
    showToolbar: boolean;
    toolbarShowShortcuts: boolean;
    /** 各ブロックの左に「ソース Markdown の開始行番号」を表示する。 */
    showLineNumbers: boolean;
    /** VS Code の表示言語（`vscode.env.language`、例: "en", "ja"）。WebView 内 UI の言語切替に使う。 */
    language: string;
}

export type WebviewToHostMessage =
    | { type: 'ready' }
    | { type: 'change'; markdown: string }
    | { type: 'scroll'; ratio: number; anchor?: ScrollAnchorPayload }
    | { type: 'cursor'; anchor: CursorAnchor }
    | { type: 'openLink'; href: string }
    | { type: 'insertImage'; dataUrl: string; name: string }
    | { type: 'exportRequest' }
    | { type: 'toggleRaw' }
    /** Preview 内の画像を実体データとしてクリップボードにコピーする要求。
     *  `src` は Milkdown が持つ画像ノードの src 属性値（vscode-webview-resource:// or data:）。
     *  Host 側がファイルを読んで imageCopied メッセージで dataUrl を返す。 */
    | { type: 'copyImageRequest'; src: string };

export type HostToWebviewMessage =
    | {
          type: 'init';
          markdown: string;
          settings: PreviewSettings;
          scrollRatio?: number;
          scrollAnchor?: ScrollAnchorPayload;
          cursorAnchor?: CursorAnchor;
          frontmatter?: string | null;
          baseMarkdown?: string | null;
      }
    | { type: 'update'; markdown: string; frontmatter?: string | null; baseMarkdown?: string | null }
    | { type: 'settings'; settings: PreviewSettings }
    | { type: 'imageInserted'; src: string }
    | { type: 'baseMarkdown'; baseMarkdown: string | null }
    /** Host がファイルを読んで返す画像データ（data:image/... URL）。
     *  WebView 側の Clipboard API で書き込む。エラー時は dataUrl が null。 */
    | { type: 'imageCopied'; dataUrl: string | null };
