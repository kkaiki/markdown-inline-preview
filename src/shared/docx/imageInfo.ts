/**
 * 画像の先頭のバイト列から種類と大きさ（px）を読む（依存なし・VS Code 非依存）。
 * Word 書き出しで画像を埋め込むときの縮小計算に使う。知らない形式は undefined（埋め込まない）。
 */
export type ImageType = 'png' | 'jpg' | 'gif' | 'bmp';

export function imageInfo(b: Uint8Array): { type: ImageType; width: number; height: number } | undefined {
    const u32 = (o: number): number => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
    const u16be = (o: number): number => (b[o] << 8) | b[o + 1];
    const u16le = (o: number): number => b[o] | (b[o + 1] << 8);

    if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
        return { type: 'png', width: u32(16), height: u32(20) };
    }
    if (b.length > 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) {
        return { type: 'gif', width: u16le(6), height: u16le(8) };
    }
    if (b.length > 26 && b[0] === 0x42 && b[1] === 0x4d) {
        return { type: 'bmp', width: u16le(18), height: Math.abs(u16le(22)) };
    }
    if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
        // JPEG: SOFn マーカー（C0〜CF のうち DHT・JPG・DAC を除く）に高さ・幅がある
        let o = 2;
        while (o + 8 < b.length) {
            if (b[o] !== 0xff) { o++; continue; }
            const marker = b[o + 1];
            if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
                return { type: 'jpg', height: u16be(o + 5), width: u16be(o + 7) };
            }
            o += 2 + u16be(o + 2);
        }
    }
    return undefined;
}
