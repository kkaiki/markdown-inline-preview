import type { ScrollAnchor } from '../../shared/structure/scrollAnchor';

export type ScrollAnchorPayload = ScrollAnchor;

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
}

export type WebviewToHostMessage =
    | { type: 'ready' }
    | { type: 'change'; markdown: string }
    | { type: 'scroll'; ratio: number; anchor?: ScrollAnchorPayload }
    | { type: 'openLink'; href: string }
    | { type: 'insertImage'; dataUrl: string; name: string }
    | { type: 'exportRequest' };

export type HostToWebviewMessage =
    | {
          type: 'init';
          markdown: string;
          settings: PreviewSettings;
          scrollRatio?: number;
          scrollAnchor?: ScrollAnchorPayload;
          frontmatter?: string | null;
          baseMarkdown?: string | null;
      }
    | { type: 'update'; markdown: string; frontmatter?: string | null; baseMarkdown?: string | null }
    | { type: 'settings'; settings: PreviewSettings }
    | { type: 'imageInserted'; src: string }
    | { type: 'baseMarkdown'; baseMarkdown: string | null };
