/**
 * Slash command utilities
 * Markdown内の `/command` 行を解析するための関数群
 */

export interface ParsedSlashCommand {
    command: string;
    argsText: string;
    args: string[];
}

export interface ParsedHeadingSlashCommand {
    level: number;
    title: string;
}

/**
 * スラッシュコマンド行を解析する
 */
export function parseSlashCommandLine(lineText: string): ParsedSlashCommand | null {
    const trimmedEnd = lineText.replace(/\s+$/, '');
    if (!trimmedEnd.startsWith('/')) {
        return null;
    }

    const match = trimmedEnd.match(/^\/(\S+)(?:\s+(.*))?$/);
    if (!match) {
        return null;
    }

    const command = match[1];
    const argsText = match[2] ? match[2].trim() : '';
    const args = argsText ? argsText.split(/\s+/) : [];

    return { command, argsText, args };
}

/**
 * heading スラッシュコマンドを解析する
 */
export function parseHeadingSlashCommand(argsText: string): ParsedHeadingSlashCommand | null {
    const trimmed = argsText.trim();
    if (!trimmed) {
        return { level: 1, title: '' };
    }

    const match = trimmed.match(/^(\d+)(?:\s+(.*))?$/);
    if (!match) {
        return null;
    }

    const level = parseInt(match[1], 10);
    if (!Number.isInteger(level) || level < 1 || level > 6) {
        return null;
    }

    return {
        level,
        title: match[2] ? match[2].trim() : ''
    };
}

/**
 * table normalize スラッシュコマンドを解析する
 */
export function parseTableNormalizeSlashCommand(argsText: string): boolean | null {
    const trimmed = argsText.trim();
    if (!trimmed) {
        return null;
    }

    const match = trimmed.match(/^(?:normalize|normilize)\s+(on|off)$/i);
    if (!match) {
        return null;
    }

    return match[1].toLowerCase() === 'on';
}

/**
 * 見出し行を生成する
 */
export function buildHeadingLine(level: number, title = ''): string {
    const safeLevel = Math.min(6, Math.max(1, Math.floor(level)));
    return `${'#'.repeat(safeLevel)} ${title}`;
}

/**
 * /h1〜/h6 の省略形を /heading N に展開する（前処理）
 */
export function expandShorthandHeading(line: string): string {
    const m = line.match(/^\/h([1-6])$/i);
    return m ? `/heading ${m[1]}` : line;
}

/**
 * コードブロックのテンプレート行を生成する
 */
export function buildCodeBlock(language = ''): string[] {
    const fence = language ? '```' + language : '```';
    return [fence, '', '```'];
}

export type CalloutType = 'note' | 'warning' | 'danger' | 'info';

const CALLOUT_EMOJIS: Record<CalloutType, string> = {
    note:    '💡',
    warning: '⚠️',
    danger:  '🚨',
    info:    'ℹ️',
};

const CALLOUT_ALIASES: Record<string, CalloutType> = {
    warn:  'warning',
    error: 'danger',
    tip:   'info',
};

/**
 * callout の種別文字列を正規化する
 */
export function resolveCalloutType(raw: string): CalloutType {
    const lower = raw.toLowerCase();
    if (lower in CALLOUT_EMOJIS) return lower as CalloutType;
    return CALLOUT_ALIASES[lower] ?? 'note';
}

/**
 * callout ブロックのプレフィックス文字列を返す
 */
export function buildCallout(type: CalloutType = 'note'): string {
    return `> ${CALLOUT_EMOJIS[type]} `;
}

const CODE_LANG_ALIASES: Record<string, string> = {
    sh:  'bash',
    js:  'javascript',
    ts:  'typescript',
    py:  'python',
    yml: 'yaml',
    rs:  'rust',
};

/**
 * 言語識別子のエイリアスを正規名に展開する
 */
export function resolveCodeLanguage(lang: string): string {
    const lower = lang.toLowerCase().trim();
    return CODE_LANG_ALIASES[lower] ?? lower;
}

/**
 * デフォルトの Markdown テーブルテンプレートを生成する
 */
export function createDefaultTableTemplate(columnCount = 2): string[] {
    const width = Math.max(2, Math.floor(columnCount) || 2);
    const headers: string[] = [];
    const separators: string[] = [];
    const emptyCells: string[] = [];

    for (let i = 0; i < width; i++) {
        headers.push('');
        separators.push('---');
        emptyCells.push('');
    }

    return [
        `| ${headers.join(' | ')} |`,
        `| ${separators.join(' | ')} |`,
        `| ${emptyCells.join(' | ')} |`
    ];
}
