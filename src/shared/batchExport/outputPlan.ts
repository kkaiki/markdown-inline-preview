/**
 * まとめて書き出し: 出力先の計画（純関数。ファイルの有無は呼び出し側が調べて `existing` で渡す）。
 * 仕様: docs/private/specifications/pro-batch-export.md §4.3
 */
import * as path from 'path';
import { MARKDOWN_FILE } from './fileOrder';

export type OutputMode = 'beside' | 'folder';
export type OverwritePolicy = 'overwrite' | 'skip' | 'rename';

export interface PlanOptions {
    /** 相対構造の基準（選んだフォルダ。複数選択なら共通の親） */
    root: string;
    /** beside: 各 .md の隣 / folder: outDir に root からの構成を保って置く */
    mode: OutputMode;
    outDir?: string;
    /** '.pdf' など */
    ext: string;
    overwrite: OverwritePolicy;
    /** すでにあるファイル（絶対パス） */
    existing: ReadonlySet<string>;
}

export interface PlannedOutput {
    src: string;
    out: string;
    action: 'write' | 'skip';
}

/** `a.pdf` → `a (2).pdf`, `a (3).pdf` … と空いている名前を探す */
function nextFreeName(out: string, ext: string, taken: (p: string) => boolean): string {
    const base = out.slice(0, -ext.length);
    let n = 2;
    while (taken(`${base} (${n})${ext}`)) n++;
    return `${base} (${n})${ext}`;
}

export function planOutputs(files: readonly string[], options: PlanOptions): PlannedOutput[] {
    const { root, mode, ext, overwrite, existing } = options;
    const planned = new Set<string>();
    const takenByAny = (p: string) => planned.has(p) || existing.has(p);
    return files.map((src) => {
        const stem = mode === 'folder'
            ? path.join(options.outDir ?? root, path.relative(root, src))
            : src;
        let out = stem.replace(MARKDOWN_FILE, '') + ext;
        let action: PlannedOutput['action'] = 'write';
        if (planned.has(out)) {
            // 同じバッチ内の衝突（a.md と a.markdown）は、上書き方針に関係なく別名にする
            out = nextFreeName(out, ext, takenByAny);
        } else if (existing.has(out)) {
            if (overwrite === 'skip') action = 'skip';
            else if (overwrite === 'rename') out = nextFreeName(out, ext, takenByAny);
        }
        planned.add(out);
        return { src, out, action };
    });
}
