import { MAILS, POSTES, TASKS, type StageId } from '../data/content';
import { fmt, fmtDuration, fmtRate } from '../engine/format';
import { autoRate, bottleneck, globalMult, incomeRate, perAction, promotionStatus, stageOf, unlockedChain } from '../engine/sim';
import { sfx } from '../audio/audio';
import { floatText, h, icon, win } from './dom';
import { gestionView, mailView } from './panels';
import { applyAudio, CdPlayer } from './radio';
import { TASK_VIEWS, type Ctx, type View } from './tasks';

export type ViewId = StageId | 'gestion' | 'mail';

interface Hooks {
  onPromote(): void;
  onSave(): void;
  onReset(): void;
}

const EXPRESS_MIN_S = 40;
const EXPRESS_MAX_S = 90;

export class Desk {
  private el!: HTMLElement;
  private body!: HTMLElement;
  private title!: HTMLElement;
  private credits!: HTMLElement;
  private rate!: HTMLElement;
  private boost!: HTMLElement;
  private chain!: HTMLElement;
  private bar!: HTMLElement;
  private clock!: HTMLElement;
  private fx!: HTMLElement;
  private dialogs!: HTMLElement;
  private startMenu!: HTMLElement;
  private view: View | null = null;
  private viewId: ViewId = 'tri';
  private barKey = '';
  private chainKey = '';
  private nextExpress = 0;
  private tray!: HTMLElement;
  private trayKey = '';
  private cd!: CdPlayer;
  private sfxItem!: HTMLButtonElement;
  private musicItem!: HTMLButtonElement;
  private shownCredits = 0;

  constructor(
    private root: HTMLElement,
    private ctx: Ctx,
    private hooks: Hooks,
  ) {}

  mount(): void {
    const s = this.ctx.s;
    const poste = POSTES[s.poste];
    this.title = h('span');
    this.credits = h('b');
    this.rate = h('span', { class: 'rate' });
    this.boost = h('span', { class: 'boost' });
    this.chain = h('div', { class: 'chain' });
    this.body = h('div', { class: 'win-body' });
    this.fx = h('div', { class: 'fx' });
    this.dialogs = h('div', { class: 'dialogs' });
    this.clock = h('span', { class: 'clock' });
    this.bar = h('div', { class: 'apps' });
    this.cd = new CdPlayer(this.ctx);
    this.tray = h('div', { class: 'tray' });
    this.startMenu = this.buildStartMenu();
    this.shownCredits = s.credits;

    const main = h(
      'div',
      { class: 'win bv main' },
      h('div', { class: 'tt' }, this.title, h('span', { class: 'tb' }, h('span', { class: 'bv tbtn' }, '_'), h('span', { class: 'bv tbtn' }, '□'))),
      h('div', { class: 'status' }, h('span', null, 'Crédits ', this.credits), this.rate, this.boost),
      this.chain,
      this.body,
    );

    const screens =
      poste.decor === 'p3'
        ? h(
            'div',
            { class: 'screens' },
            h('button', { class: 'bv', onclick: () => this.setView(this.lastTask()) }, 'Écran 1'),
            h('button', { class: 'bv', onclick: () => this.setView('gestion') }, 'Écran 2'),
            h('em', null, 'double écran'),
          )
        : null;

    const taskbar = h(
      'div',
      { class: 'taskbar bv' },
      h('button', { class: 'start bv', onclick: () => this.startMenu.toggleAttribute('hidden') }, icon('logo'), 'DeepCorp'),
      this.bar,
      this.tray,
    );

    this.el = h('div', { class: `desk ${poste.decor}` }, screens, main, taskbar, this.startMenu, this.cd.el, this.fx, this.dialogs);
    // petit clic sur les boutons d'interface ; les gestes de jeu ont leurs propres sons
    this.el.addEventListener('click', (e) => {
      const b = (e.target as Element).closest('button');
      if (b && !b.closest('.case, .tariff, .courier, .bagchip, .express')) sfx('click');
    });
    this.root.replaceChildren(this.el);
    this.setView(this.lastTask());
    this.nextExpress = this.ctx.now() + 20_000;
  }

  private lastTask(): StageId {
    const chain = unlockedChain(this.ctx.s);
    return chain[chain.length - 1];
  }

  setView(id: ViewId): void {
    this.view?.destroy?.();
    this.viewId = id;
    if (id === 'gestion') {
      this.view = gestionView(this.ctx, () => this.hooks.onPromote());
      this.title.textContent = 'Gestion du poste';
    } else if (id === 'mail') {
      this.view = mailView(this.ctx);
      this.title.textContent = 'Courrier interne';
    } else {
      this.view = TASK_VIEWS[id](this.ctx);
      this.title.textContent = `${TASKS[id].app} - Poste 117`;
    }
    this.body.replaceChildren(this.view.el);
    this.barKey = '';
    this.startMenu.hidden = true;
    this.view.update(this.ctx.now());
  }

  private buildStartMenu(): HTMLElement {
    this.sfxItem = h('button', {
      onclick: () => {
        this.ctx.s.settings.sfx = !this.ctx.s.settings.sfx;
        applyAudio(this.ctx.s);
        this.ctx.acted();
      },
    });
    this.musicItem = h('button', {
      onclick: () => {
        this.ctx.s.settings.music = !this.ctx.s.settings.music;
        applyAudio(this.ctx.s);
        this.ctx.acted();
      },
    });
    const confirm = h('button', { class: 'danger', hidden: true, onclick: () => this.hooks.onReset() }, 'Confirmer : tout effacer');
    return h(
      'div',
      { class: 'startmenu bv', hidden: true },
      h('div', { class: 'sm-side' }, 'DeepOS 95'),
      h(
        'div',
        { class: 'sm-items' },
        h('button', { onclick: () => this.setView('gestion') }, 'Gestion du poste'),
        h('button', { onclick: () => this.setView('mail') }, 'Courrier interne'),
        this.sfxItem,
        this.musicItem,
        h('button', { onclick: () => (this.hooks.onSave(), (this.startMenu.hidden = true)) }, 'Enregistrer'),
        h('button', { onclick: () => confirm.toggleAttribute('hidden') }, 'Recommencer depuis le début…'),
        confirm,
      ),
    );
  }

  private renderBar(): void {
    const s = this.ctx.s;
    const unread = s.mails.filter((m) => !m.read).length;
    const promoReady = !!promotionStatus(s)?.ready && !s.demoDone;
    const key = [this.viewId, unlockedChain(s).map((id) => stageOf(s, id)).join(','), unread, promoReady].join('|');
    if (key === this.barKey) return;
    this.barKey = key;
    const btn = (id: ViewId, ico: Parameters<typeof icon>[0], label: string, badge?: string) =>
      h('button', { class: `app bv ${this.viewId === id ? 'on' : ''}`, 'aria-label': label, onclick: () => this.setView(id) }, icon(ico), badge ? h('span', { class: 'badge' }, badge) : null);
    this.bar.replaceChildren(
      ...unlockedChain(s).map((id) => {
        const b = btn(id, TASKS[id].icon, TASKS[id].name);
        if (stageOf(s, id) !== 'manuel') b.append(h('span', { class: 'dot', 'data-stage': stageOf(s, id) }));
        return b;
      }),
      btn('mail', 'mail', 'Courrier interne', unread ? String(unread) : undefined),
      btn('gestion', 'gear', 'Gestion', promoReady ? '!' : undefined),
    );
  }

  private renderChain(): void {
    const s = this.ctx.s;
    const chain = unlockedChain(s);
    const slow = bottleneck(s);
    const parts: HTMLElement[] = [];
    chain.forEach((id, i) => {
      if (i > 0) parts.push(h('span', { class: 'arrow' }, '→', h('small', null, fmt(s.buffers[chain[i - 1]]))));
      const r = autoRate(s, id, true);
      parts.push(
        h(
          'button',
          { class: `stage ${id === slow ? 'slow' : ''} ${this.viewId === id ? 'on' : ''}`, onclick: () => this.setView(id) },
          h('b', null, TASKS[id].name),
          h('small', null, r > 0 ? `${fmtRate(r)}/s` : 'manuel'),
        ),
      );
    });
    const key = parts.map((p) => p.textContent).join('|') + slow + this.viewId;
    if (key === this.chainKey) return;
    this.chainKey = key;
    // une seule étape : pas de chaîne à montrer
    this.chain.hidden = chain.length < 2;
    this.chain.replaceChildren(...parts);
    this.chain.title = slow ? `L'étape ${TASKS[slow].name} ralentit la chaîne` : '';
  }

  private express(now: number): void {
    if (now < this.nextExpress) return;
    this.nextExpress = now + (EXPRESS_MIN_S + Math.random() * (EXPRESS_MAX_S - EXPRESS_MIN_S)) * 1000;
    if (this.fx.querySelector('.express')) return;
    const top = 70 + Math.random() * 40;
    const el = h('button', { class: 'express', style: `top:${top}%` }, icon('bag'), 'Colis express');
    el.addEventListener('click', () => {
      const s = this.ctx.s;
      const t = this.ctx.now();
      const roll = Math.random();
      const r = el.getBoundingClientRect();
      const a = this.fx.getBoundingClientRect();
      let text: string;
      if (roll < 0.12) {
        s.frenzyUntil = t + 30_000;
        text = 'Visite du directeur : ×7 pendant 30 s';
      } else if (roll < 0.45) {
        s.cafes += 1;
        text = '+1 café';
      } else {
        const chain = unlockedChain(s);
        const gain = Math.max(25, incomeRate(s, t) * 45, perAction(s, chain[0]) * 20);
        s.credits += gain;
        s.earnedTotal += gain;
        text = `+${fmt(gain)} crédits`;
      }
      floatText(this.fx, text, r.left - a.left + r.width / 2, r.top - a.top, 'big');
      sfx('bell');
      el.remove();
      this.ctx.acted();
    });
    el.addEventListener('animationend', () => el.remove());
    this.fx.append(el);
  }

  private renderTray(): void {
    const s = this.ctx.s;
    const muted = !s.settings.sfx && !s.settings.music;
    const key = `${s.radio.device}|${muted}`;
    this.sfxItem.textContent = `Bruitages : ${s.settings.sfx ? 'activés' : 'coupés'}`;
    this.musicItem.textContent = `Musique : ${s.settings.music ? 'activée' : 'coupée'}`;
    if (key === this.trayKey) return;
    this.trayKey = key;
    const speaker = h(
      'button',
      {
        class: `trayicon ${muted ? 'muted' : ''}`,
        'aria-label': muted ? 'Activer le son' : 'Couper le son',
        onclick: () => {
          const on = !s.settings.sfx && !s.settings.music;
          s.settings.sfx = on;
          s.settings.music = on;
          applyAudio(s);
          this.ctx.acted();
        },
      },
      icon('speaker'),
    );
    const cdBtn = s.radio.device
      ? h('button', { class: 'trayicon', 'aria-label': 'Lecteur CD', onclick: () => (this.cd.el.toggleAttribute('hidden'), this.cd.sync()) }, icon('cd'))
      : null;
    this.tray.replaceChildren(...[cdBtn, speaker, this.clock].filter((x): x is HTMLElement => !!x));
  }

  update(now: number): void {
    const s = this.ctx.s;
    // le compteur roule vers la vraie valeur au lieu de sauter
    const diff = s.credits - this.shownCredits;
    this.shownCredits = Math.abs(diff) < 1 ? s.credits : this.shownCredits + diff * 0.25;
    this.credits.textContent = fmt(this.shownCredits);
    const inc = incomeRate(s, now);
    this.rate.textContent = inc > 0 ? `+${fmtRate(inc)}/s` : '';
    const boosts: string[] = [];
    if (s.cafeUntil > now) boosts.push(`Café ×2 · ${fmtDuration((s.cafeUntil - now) / 1000)}`);
    if (s.frenzyUntil > now) boosts.push(`Directeur ×7 · ${Math.ceil((s.frenzyUntil - now) / 1000)} s`);
    this.boost.textContent = boosts.join(' · ');
    this.boost.hidden = boosts.length === 0 && globalMult(s, now) === 1;
    this.clock.textContent = new Date(now).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    this.renderBar();
    this.renderChain();
    this.renderTray();
    if (!this.cd.el.hidden) this.cd.sync();
    this.view?.update(now);
    this.express(now);
  }

  /** Fenêtre modale DeepOS. Renvoie une fonction pour la fermer. */
  dialog(title: string, body: Node, buttons: { label: string; primary?: boolean; onClick: (close: () => void) => void }[]): () => void {
    const close = () => wrap.remove();
    const row = h('div', { class: 'row end' }, ...buttons.map((b) => h('button', { class: `bv btn ${b.primary ? 'primary' : ''}`, onclick: () => b.onClick(close) }, b.label)));
    const wrap = h('div', { class: 'modal' }, win(title, h('div', { class: 'dlg-body' }, body, row), { cls: 'dlg' }));
    this.dialogs.append(wrap);
    return close;
  }

  notifyMail(ids: string[]): void {
    if (ids.length) sfx('notify');
    for (const id of ids) {
      const m = MAILS.find((x) => x.id === id);
      if (!m || id === 'bienvenue') continue;
      const toast = h('button', { class: 'toast bv', onclick: () => (toast.remove(), this.setView('mail')) }, icon('mail'), h('span', null, h('b', null, m.from), h('br'), m.subject));
      this.fx.append(toast);
      setTimeout(() => toast.remove(), 5000);
    }
  }

  get element(): HTMLElement {
    return this.el;
  }
}
