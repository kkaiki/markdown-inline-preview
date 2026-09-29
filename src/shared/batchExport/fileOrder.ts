/**
 * まとめて書き出し: 対象ファイルの絞り込みと並べ順（純関数）。
 * 仕様: docs/private/specifications/pro-batch-export.md §3.1・§4.2
 */
import * as path from 'path';

export const MARKDOWN_FILE = /\.(md|markdown)$/i;

/** 書き出し対象から外すフォルダ（依存物・Git の中身） */
const EXCLUDED_DIRS = new Set(['node_modules', '.git']);

/** 自然順（"2-intro" < "10-intro"）。表示言語で順番が変わらないよう 'en' 固定。 */
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** パス区切りごとに比べる。同じ階層ではファイルをフォルダより前に置く（README → 各章）。 */
export function compareNaturalPath(a: string, b: string): number {
    const as = a.split(/[\\/]/);
    const bs = b.split(/[\\/]/);
    for (let i = 0; i < Math.min(as.length, bs.length); i++) {
        const aIsFile = i === as.length - 1;
        const bIsFile = i === bs.length - 1;
        if (aIsFile !== bIsFile) return aIsFile ? -1 : 1;
        const c = collator.compare(as[i], bs[i]);
        if (c !== 0) return c;
    }
    return as.length - bs.length;
}

/** .md / .markdown だけを残し、重複と除外フォルダ配下を除いて、root からの相対パスの自然順に並べる。 */
export function selectMarkdownFiles(files: readonly string[], root: string): string[] {
    const rels = new Set<string>();
    for (const file of files) {
        if (!MARKDOWN_FILE.test(file)) continue;
        const rel = path.relative(root, path.resolve(file));
        if (rel.split(/[\\/]/).slice(0, -1).some((dir) => EXCLUDED_DIRS.has(dir))) continue;
        rels.add(rel);
    }
    return [...rels].sort(compareNaturalPath).map((rel) => path.join(root, rel));
}

/**
 * 複数選択の基準フォルダ（出力先を「フォルダを選ぶ」にしたとき、ここからの相対構成で置く）。
 * フォルダはそのもの、ファイルはその親を候補にし、全部に共通する一番深いフォルダを返す。
 */
export function commonDirectory(paths: readonly string[], folders: readonly string[]): string {
    const folderSet = new Set(folders.map((f) => path.resolve(f)));
    const dirs = paths.map((p) => {
        const abs = path.resolve(p);
        return folderSet.has(abs) ? abs : path.dirname(abs);
    });
    // パス区切りごとに比べる（文字列の前方一致だと docs と docs2 を取り違える）
    const split = dirs.map((d) => d.split(path.sep));
    const common: string[] = [];
    for (let i = 0; i < split[0].length; i++) {
        const part = split[0][i];
        if (!split.every((s) => s[i] === part)) break;
        common.push(part);
    }
    return common.join(path.sep) || path.sep;
}
