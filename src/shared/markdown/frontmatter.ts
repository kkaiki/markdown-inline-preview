export interface FrontmatterSplit {
    frontmatter: string | null;
    body: string;
}

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function splitFrontmatter(markdown: string): FrontmatterSplit {
    const match = markdown.match(FRONTMATTER_PATTERN);
    if (!match) return { frontmatter: null, body: markdown };
    return {
        frontmatter: match[1],
        body: markdown.slice(match[0].length)
    };
}

export function mergeFrontmatter(frontmatter: string | null, body: string): string {
    if (!frontmatter) return body;
    return `---\n${frontmatter.trimEnd()}\n---\n${body}`;
}

export function parseFrontmatterEntries(yaml: string): Array<{ key: string; value: string }> {
    const entries: Array<{ key: string; value: string }> = [];
    for (const line of yaml.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const colon = trimmed.indexOf(':');
        if (colon <= 0) continue;
        entries.push({
            key: trimmed.slice(0, colon).trim(),
            value: trimmed.slice(colon + 1).trim()
        });
    }
    return entries;
}
