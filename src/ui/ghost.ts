import { h } from './dom';

export interface Token {
  cancelled: boolean;
}

export function wait(ms: number, token: Token): Promise<boolean> {
  return new Promise((resolve) => setTimeout(() => resolve(!token.cancelled), ms));
}

const ARROW =
  '<svg viewBox="0 0 12 19" width="18" height="28" aria-hidden="true"><path d="M1 1v15l4-4 3 6 2-1-3-6h5z" fill="#fff" stroke="#000" stroke-width="1.2" stroke-linejoin="round"/></svg>';

/** Curseur qui bouge tout seul : la macro, puis le subordonné en session distante. */
export class Ghost {
  readonly el: HTMLElement;
  private tag: HTMLElement;
  private x = 0;
  private y = 0;

  constructor(private layer: HTMLElement) {
    this.tag = h('span', { class: 'ghost-tag' });
    this.el = h('div', { class: 'ghost', hidden: true, html: ARROW });
    this.el.append(this.tag);
    layer.append(this.el);
  }

  owner(name: string, color: string): void {
    this.tag.textContent = name;
    this.tag.style.background = color;
  }

  show(): void {
    if (!this.el.hidden) return;
    const r = this.layer.getBoundingClientRect();
    this.place(r.width * 0.75, r.height * 0.85, 0);
    this.el.hidden = false;
  }

  hide(): void {
    this.el.hidden = true;
  }

  private place(x: number, y: number, ms: number): void {
    this.x = x;
    this.y = y;
    this.el.style.transition = ms ? `transform ${ms}ms cubic-bezier(.45,.05,.3,1)` : 'none';
    this.el.style.transform = `translate(${x}px, ${y}px)`;
  }

  /** Va au centre de l'élément, en coordonnées du calque. */
  async moveTo(target: Element, ms: number, token: Token): Promise<boolean> {
    const a = this.layer.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    this.place(b.left - a.left + b.width / 2, b.top - a.top + b.height / 2, ms);
    return wait(ms, token);
  }

  /** Position actuelle, pour faire suivre un objet tenu. */
  at(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }

  press(): void {
    this.el.classList.remove('press');
    void this.el.offsetWidth;
    this.el.classList.add('press');
  }
}

/**
 * Lance `step` en boucle quand le joueur ne touche plus l'écran depuis un moment.
 * Le premier contact reprend la main immédiatement.
 */
export function contemplation(
  layer: HTMLElement,
  opts: { canRun(): boolean; rate(): number; step(token: Token, cycle: number): Promise<void>; onStop(): void },
): { destroy(): void; touched(): void } {
  let lastTouch = performance.now();
  let token: Token | null = null;

  const stop = () => {
    if (!token) return;
    token.cancelled = true;
    token = null;
    opts.onStop();
  };
  const touched = () => {
    lastTouch = performance.now();
    stop();
  };
  layer.addEventListener('pointerdown', touched, { capture: true });

  const run = async (t: Token) => {
    while (!t.cancelled) {
      if (!opts.canRun()) {
        if (!(await wait(300, t))) return;
        continue;
      }
      const r = opts.rate();
      const cycle = Math.min(2400, Math.max(380, 1000 / Math.max(r, 0.01)));
      await opts.step(t, cycle);
    }
  };

  const timer = window.setInterval(() => {
    if (token || document.hidden || !layer.isConnected) return;
    if (performance.now() - lastTouch < 1600 || !opts.canRun()) return;
    token = { cancelled: false };
    void run(token);
  }, 250);

  return {
    touched,
    destroy() {
      clearInterval(timer);
      stop();
      layer.removeEventListener('pointerdown', touched, { capture: true });
    },
  };
}
