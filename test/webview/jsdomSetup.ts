/**
 * Milkdown / ProseMirror を Node 上で動かすための jsdom グローバル設定。
 * このモジュールを（Milkdown を読み込むより前に）import するだけで副作用として
 * 必要な window / document などのグローバルを用意する。
 *
 * 注意: このディレクトリ（test/webview）は tsc ではコンパイルせず、esbuild で
 * バンドルしてから mocha で実行する（@milkdown/* が ESM-only export のため）。
 */
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true
});

const g = globalThis as unknown as Record<string, unknown>;
const w = dom.window as unknown as Record<string, unknown>;

g.window = dom.window;
g.document = dom.window.document;
g.navigator = dom.window.navigator;
g.HTMLElement = dom.window.HTMLElement;
g.customElements = dom.window.customElements;
g.Node = dom.window.Node;
g.NodeFilter = dom.window.NodeFilter;
g.DOMParser = dom.window.DOMParser;
g.getComputedStyle = dom.window.getComputedStyle;
g.MutationObserver = dom.window.MutationObserver;
g.Event = dom.window.Event;
g.CustomEvent = dom.window.CustomEvent;
g.KeyboardEvent = dom.window.KeyboardEvent;
g.DOMException = dom.window.DOMException;

if (!w.matchMedia) {
    w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
}
g.matchMedia = w.matchMedia;

class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
}
g.ResizeObserver = ResizeObserverStub;
w.ResizeObserver = ResizeObserverStub;

// jsdom はレイアウトを持たないため getClientRects / getBoundingClientRect が未実装。
// ProseMirror の `scrollIntoView()`（座標計算）がこれらを呼んで例外を投げると、
// その例外がイベントリスナの外まで伝播して挙動を狂わせる（例: capture フェーズの
// keydown ハンドラが preventDefault/stopPropagation 前に中断され、plugin 経路が
// 二重発火する）。実ブラウザでは投げないので、ゼロ矩形を返すスタブで近似する。
const zeroRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON() { return {}; } });
const emptyRectList = () => Object.assign([], { item: () => null });
for (const proto of [dom.window.Element.prototype, dom.window.Range.prototype]) {
    const p = proto as unknown as Record<string, unknown>;
    if (typeof p.getClientRects !== 'function') p.getClientRects = emptyRectList;
    if (typeof p.getBoundingClientRect !== 'function') p.getBoundingClientRect = zeroRect;
}
// jsdom は scrollIntoView を実装しない。検索バーが一致箇所へスクロールしようとして
// 例外を投げないよう no-op で近似する（実ブラウザ/WebView では存在する）。
{
    const p = dom.window.Element.prototype as unknown as Record<string, unknown>;
    if (typeof p.scrollIntoView !== 'function') p.scrollIntoView = () => {};
}

g.addEventListener = dom.window.addEventListener.bind(dom.window);
g.removeEventListener = dom.window.removeEventListener.bind(dom.window);
g.dispatchEvent = dom.window.dispatchEvent.bind(dom.window);

// ProseMirror のクリップボード処理（copy/cut ハンドラ）は `window.` を付けない
// ベアな `getSelection()` をグローバル参照で呼ぶ。jsdom は window.getSelection を
// 持つがグローバルには公開されないため、明示的に橋渡ししないと copy/cut イベントで
// `ReferenceError: getSelection is not defined` がリスナ内で投げられる
// （テストは握りつぶされて通るが stderr を汚し、実経路を正しく検証できない）。
if (typeof dom.window.getSelection === 'function') {
    g.getSelection = dom.window.getSelection.bind(dom.window);
}
g.requestAnimationFrame = (cb: (t: number) => void) => dom.window.setTimeout(() => cb(Date.now()), 0);
g.cancelAnimationFrame = (id: number) => dom.window.clearTimeout(id);

export { dom };
