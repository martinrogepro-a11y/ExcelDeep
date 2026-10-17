import { isMusicPlaying, playMusic, setMusic, setSfx, sfx, stopMusic } from '../audio/audio';
import { DEVICES, TRACKS } from '../data/content';
import { fmt } from '../engine/format';
import { buyDevice, buyTrack } from '../engine/sim';
import type { GameState } from '../engine/state';
import { h } from './dom';
import type { Ctx } from './tasks';

/** Met le son en accord avec l'état : réglages, appareil, disque en cours. */
export function applyAudio(s: GameState): void {
  setSfx(s.settings.sfx);
  setMusic(s.settings.music);
  const track = TRACKS.find((t) => t.id === s.radio.current);
  if (s.radio.device && s.radio.playing && track && s.radio.owned.includes(track.id)) playMusic(track.style);
  else if (isMusicPlaying()) stopMusic();
}

/** Carte « Radio » du menu Gestion : acheter le lecteur, puis les disques. */
export function radioCard(ctx: Ctx): { el: HTMLElement; update(): void } {
  const s = ctx.s;
  const device = DEVICES.find((d) => d.id === 'cd')!;
  const updaters: (() => void)[] = [];
  const body: HTMLElement[] = [];
  if (!s.radio.device) {
    const btn = h('button', { class: 'bv btn small' }, fmt(device.cost));
    btn.addEventListener('click', () => {
      if (!buyDevice(ctx.s, 'cd')) return;
      sfx('cash');
      ctx.s.radio.playing = true;
      applyAudio(ctx.s);
      ctx.acted();
    });
    updaters.push(() => (btn.disabled = ctx.s.credits < device.cost));
    body.push(h('div', { class: 'supply' }, h('div', null, h('b', null, device.name), h('small', null, 'Livré avec un disque. Se pilote depuis la barre des tâches.')), btn));
  } else {
    for (const t of TRACKS.filter((x) => x.device === 'cd')) {
      const owned = s.radio.owned.includes(t.id);
      const btn = h('button', { class: 'bv btn small' }, owned ? 'Écouter' : fmt(t.cost));
      btn.addEventListener('click', () => {
        const st = ctx.s;
        if (!st.radio.owned.includes(t.id)) {
          if (!buyTrack(st, t.id)) return;
          sfx('cash');
        }
        st.radio.current = t.id;
        st.radio.playing = true;
        applyAudio(st);
        ctx.acted();
      });
      if (!owned) updaters.push(() => (btn.disabled = ctx.s.credits < t.cost));
      body.push(h('div', { class: 'supply' }, h('div', null, h('b', null, t.title), h('small', null, t.artist)), btn));
    }
  }
  return {
    el: h('section', { class: 'card' }, h('h3', null, 'Radio'), h('div', { class: 'supplies' }, ...body)),
    update: () => updaters.forEach((u) => u()),
  };
}

/** Petit lecteur CD qui s'ouvre au-dessus de la barre des tâches. */
export class CdPlayer {
  readonly el: HTMLElement;
  private lcd: HTMLElement;
  private disc: HTMLElement;
  private play: HTMLButtonElement;

  constructor(private ctx: Ctx) {
    this.lcd = h('div', { class: 'cd-lcd' }, h('span'));
    this.disc = h('div', { class: 'cd-disc' });
    const prev = h('button', { class: 'bv', 'aria-label': 'Disque précédent', onclick: () => this.skip(-1) }, '⏮');
    this.play = h('button', { class: 'bv', 'aria-label': 'Lecture ou pause', onclick: () => this.toggle() }, '⏯');
    const next = h('button', { class: 'bv', 'aria-label': 'Disque suivant', onclick: () => this.skip(1) }, '⏭');
    this.el = h(
      'div',
      { class: 'cdplayer bv', hidden: true },
      h('div', { class: 'cd-top' }, this.disc, this.lcd),
      h('div', { class: 'cd-btns' }, prev, this.play, next),
      h('p', { class: 'cd-note' }, 'D’autres disques dans Gestion › Radio.'),
    );
  }

  private owned(): string[] {
    return TRACKS.filter((t) => this.ctx.s.radio.owned.includes(t.id)).map((t) => t.id);
  }

  private toggle(): void {
    const r = this.ctx.s.radio;
    r.playing = !r.playing;
    r.current ??= this.owned()[0] ?? null;
    applyAudio(this.ctx.s);
    this.sync();
    this.ctx.acted();
  }

  private skip(dir: number): void {
    const list = this.owned();
    if (list.length === 0) return;
    const r = this.ctx.s.radio;
    const i = Math.max(0, list.indexOf(r.current ?? ''));
    r.current = list[(i + dir + list.length) % list.length];
    r.playing = true;
    applyAudio(this.ctx.s);
    this.sync();
    this.ctx.acted();
  }

  sync(): void {
    const r = this.ctx.s.radio;
    const t = TRACKS.find((x) => x.id === r.current);
    const text = t ? `${t.title} · ${t.artist}` : 'Aucun disque';
    const span = this.lcd.firstChild as HTMLElement;
    if (span.textContent !== text) span.textContent = text;
    this.disc.classList.toggle('spin', r.playing && !!t);
    this.play.textContent = r.playing ? '⏸' : '▶';
  }
}
