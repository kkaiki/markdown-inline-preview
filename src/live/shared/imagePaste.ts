/**
 * Live モードの画像の貼り付け（純関数）。requirements.md §2「手元の画像」/「画像の貼り付け」。
 *
 * 保存は host が md ファイルと同じディレクトリに行う。ここは「画像として扱うか」と
 * 「保存するファイル名」だけを決める。
 */

const EXTENSIONS: Record<string, string> = {
    'image/png': 'png',
    'image/gif': 'gif',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/bmp': 'bmp'
};

/** 画像の MIME から拡張子を決める。画像でなければ null。 */
export function imageExtension(mime: string): string | null {
    return EXTENSIONS[mime.toLowerCase()] ?? null;
}

/**
 * 保存するファイル名。元の名前（ファイルをコピーして貼ったとき）があればそれを、無ければ `image` を使い、
 * 拡張子は MIME に合わせる。Markdown のリンクが壊れないよう、空白・括弧・パス区切りは `-` にする。
 * 同じ名前があれば `-1`, `-2` … と連番にする（VS Code 標準の貼り付けと同じ）。
 */
export function pickImageFileName(name: string | undefined, ext: string, exists: (n: string) => boolean): string {
    const file = (name ?? '').split(/[\\/]/).pop() ?? '';
    const stem = file
        .replace(/\.[^.]*$/, '')
        .replace(/[\s()[\]<>#?%]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^[-.]+|-+$/g, '');
    const base = stem || 'image';
    let candidate = `${base}.${ext}`;
    for (let i = 1; exists(candidate); i++) candidate = `${base}-${i}.${ext}`;
    return candidate;
}

/**
 * 画像として貼るか。文字も入っていれば文字として貼る
 * （Excel・スプレッドシートの範囲は表の文字と一緒に画像も入るため。表への変換を優先する）。
 */
export function shouldPasteAsImage(clip: { text: string; imageTypes: string[] }): boolean {
    return clip.text.trim() === '' && clip.imageTypes.some((t) => imageExtension(t) !== null);
}
