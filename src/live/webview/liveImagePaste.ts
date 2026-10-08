/**
 * 画像の貼り付け（Live モード。requirements.md §2「画像の貼り付け」）。
 *
 * webview はファイルを書けないので、画像の中身（base64）を host へ送って md ファイルと同じ
 * ディレクトリに保存してもらう。返事（`imageSaved`）が来たら、貼った位置に `![](ファイル名)` を入れる。
 * 返事を待つ間に文書が変わっても位置がずれないよう、覚えた位置は変更のたびに写し直す。
 */
import { EditorView, type ViewUpdate } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { shouldPasteAsImage } from '../shared/imagePaste';

export interface PasteImageMessage {
    type: 'pasteImage';
    id: number;
    mime: string;
    name: string;
    /** 画像の中身（base64。data URI の頭は付けない）。 */
    data: string;
}

/** 貼った位置（返事待ち）。 */
const pending = new Map<number, { from: number; to: number }>();
let nextId = 1;

function readBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
            resolve(typeof reader.result === 'string' ? reader.result.replace(/^data:[^,]*,/, '') : '');
        reader.onerror = () => reject(reader.error ?? new Error('read failed'));
        reader.readAsDataURL(file);
    });
}

/** paste を受けて host へ保存を頼む拡張。`post` は host への送信。 */
export function liveImagePaste(post: (message: PasteImageMessage) => void): Extension {
    return [
        EditorView.domEventHandlers({
            paste(event, view) {
                const data = event.clipboardData;
                if (!data) return false;
                const files = Array.from(data.files).filter((f) => f.type.startsWith('image/'));
                if (!shouldPasteAsImage({ text: data.getData('text/plain'), imageTypes: files.map((f) => f.type) })) {
                    return false;
                }
                event.preventDefault();
                const file = files[0];
                const id = nextId++;
                const sel = view.state.selection.main;
                pending.set(id, { from: sel.from, to: sel.to });
                void readBase64(file).then(
                    (base64) => post({ type: 'pasteImage', id, mime: file.type, name: file.name, data: base64 }),
                    () => pending.delete(id)
                );
                return true;
            }
        }),
        EditorView.updateListener.of((u: ViewUpdate) => {
            if (!u.docChanged) return;
            for (const p of pending.values()) {
                p.from = u.changes.mapPos(p.from, -1);
                p.to = u.changes.mapPos(p.to, 1);
            }
        })
    ];
}

/** host が保存できたら、貼った位置に画像の記法を入れる。失敗（fileName 無し）なら位置を捨てるだけ。 */
export function insertSavedImage(view: EditorView, id: number, fileName: string | undefined): void {
    const at = pending.get(id);
    pending.delete(id);
    if (!at || !fileName) return;
    const insert = `![](${fileName})`;
    view.dispatch({
        changes: { from: at.from, to: at.to, insert },
        selection: { anchor: at.from + insert.length },
        userEvent: 'input.paste',
        scrollIntoView: true
    });
}
