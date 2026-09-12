/**
 * Live モードの拡大率（ズーム）。
 *
 * ユーザー要望（2026-08-09）:「ここにプラスマイナスを入れて拡大率を入れられるようにして欲しい」。
 * 仕様は docs/specifications/live-mode/requirements.md §4.6.1「拡大率（ズーム）」。
 *
 * ここは**段階の計算と保存値の正規化だけ**を持つ純関数モジュール。DOM への反映
 * （`--live-zoom` を立てる）は `src/live/webview/liveToolbar.ts` が行う。
 */

/** 拡大率の段階（小さい順）。Chrome / VS Code のズーム段階に寄せてある。 */
export const ZOOM_LEVELS: readonly number[] = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];

/** 既定の拡大率（等倍）。 */
export const DEFAULT_ZOOM = 1;

/** 保存先のキー。 */
export const ZOOM_STORAGE_KEY = 'markdownInline.live.zoom';

/** localStorage のうち、この機能が使う分だけの型。 */
export interface ZoomStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

const MIN = ZOOM_LEVELS[0];
const MAX = ZOOM_LEVELS[ZOOM_LEVELS.length - 1];

/** 拡大率として使える値に丸める（段階には丸めない）。不正値は等倍に戻す。 */
export function clampZoom(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_ZOOM;
    return Math.min(MAX, Math.max(MIN, value));
}

/** 1段階上げる（上限では据え置き）。段階の途中の値なら「次に大きい段階」へ。 */
export function zoomIn(current: number): number {
    const z = clampZoom(current);
    return ZOOM_LEVELS.find((v) => v > z + 1e-9) ?? MAX;
}

/** 1段階下げる（下限では据え置き）。段階の途中の値なら「次に小さい段階」へ。 */
export function zoomOut(current: number): number {
    const z = clampZoom(current);
    const smaller = ZOOM_LEVELS.filter((v) => v < z - 1e-9);
    return smaller.length > 0 ? smaller[smaller.length - 1] : MIN;
}

/** 表示用のパーセント文字列。 */
export function formatZoom(zoom: number): string {
    return `${Math.round(clampZoom(zoom) * 100)}%`;
}

/** 保存された拡大率を読む（保存が無い・壊れている・読めない場合は等倍）。 */
export function readZoom(storage: ZoomStorage | null | undefined): number {
    try {
        const raw = storage?.getItem(ZOOM_STORAGE_KEY);
        if (raw === null || raw === undefined) return DEFAULT_ZOOM;
        const value = Number(raw);
        return Number.isFinite(value) && raw.trim() !== '' ? clampZoom(value) : DEFAULT_ZOOM;
    } catch {
        // localStorage が使えない環境（file:// で拒否される等）でも落とさない
        return DEFAULT_ZOOM;
    }
}

/** 拡大率を保存する（保存できなくても落とさない）。 */
export function writeZoom(storage: ZoomStorage | null | undefined, zoom: number): void {
    try {
        storage?.setItem(ZOOM_STORAGE_KEY, String(clampZoom(zoom)));
    } catch {
        // 保存できないだけなので握りつぶす（表示は当セッション内で保たれる）
    }
}
