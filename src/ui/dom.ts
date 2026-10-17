import type { IconId } from '../data/content';

type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, unknown> | null;

/** Petit utilitaire de création d'éléments : h('div', { class: 'x', onclick }, enfants…) */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') {
        el.addEventListener(k.slice(2), v as EventListener);
      } else if (k === 'class') {
        el.className = String(v);
      } else if (k === 'html') {
        el.innerHTML = String(v);
      } else {
        el.setAttribute(k, v === true ? '' : String(v));
      }
    }
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'object' ? c : String(c));
  }
  return el;
}

const ICONS: Record<IconId, string> = {
  logo:
    '<rect width="9" height="9" fill="#fff"/><g fill="#1d2421"><rect y="2.8" width="9" height=".4"/><rect y="5.8" width="9" height=".4"/><rect x="2.8" width=".4" height="9"/><rect x="5.8" width=".4" height="9"/></g><rect x="3.2" y="6.2" width="2.6" height="2.8" fill="#f2c14e"/><rect width="9" height="9" fill="none" stroke="#1d2421" stroke-width=".6"/>',
  sort: '<rect x="1.5" y="4" width="13" height="9" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M1.5 4.5l6.5 4.5 6.5-4.5" fill="none" stroke="currentColor" stroke-width="1.4"/>',
  scale: '<rect x="2" y="9" width="12" height="5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M4 9V6h8v3M8 6V3" fill="none" stroke="currentColor" stroke-width="1.5"/>',
  bag: '<path d="M3 6h10l-1 8H4z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M6 6V4a2 2 0 0 1 4 0v2" fill="none" stroke="currentColor" stroke-width="1.5"/>',
  mail: '<path d="M2 3h12v8H6l-3 3v-3H2z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
  gear: '<circle cx="8" cy="8" r="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 1.5v2.5M8 12v2.5M1.5 8h2.5M12 8h2.5M3.4 3.4l1.8 1.8M10.8 10.8l1.8 1.8M3.4 12.6l1.8-1.8M10.8 5.2l1.8-1.8" stroke="currentColor" stroke-width="1.5"/>',
  lock: '<rect x="3" y="7" width="10" height="7" fill="currentColor"/><path d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  cup: '<path d="M3 5h8v5a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M11 6h1.5a1.5 1.5 0 0 1 0 3H11" fill="none" stroke="currentColor" stroke-width="1.5"/>',
};

export function icon(id: IconId, cls = 'ico'): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', id === 'logo' ? '0 0 9 9' : '0 0 16 16');
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICONS[id];
  return svg;
}

/** Fenêtre DeepOS 95 : barre de titre + corps. */
export function win(title: string, body: Node, opts: { cls?: string; onClose?: () => void } = {}): HTMLDivElement {
  return h(
    'div',
    { class: `win bv ${opts.cls ?? ''}` },
    h(
      'div',
      { class: 'tt' },
      h('span', null, title),
      opts.onClose ? h('span', { class: 'tb' }, h('button', { class: 'bv tbtn', 'aria-label': 'Fermer', onclick: opts.onClose }, '×')) : null,
    ),
    body,
  );
}

/** Texte flottant (+12) qui monte puis disparaît. */
export function floatText(parent: HTMLElement, text: string, x: number, y: number, cls = ''): void {
  const el = h('span', { class: `float ${cls}`, style: `left:${x}px;top:${y}px` }, text);
  parent.append(el);
  setTimeout(() => el.remove(), 900);
}

export function shake(el: HTMLElement): void {
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
}
