import { sfx, vibrate } from '../audio/audio';
import { ASSIST_LEVEL, BAG_SIZE, COURIERS, SENDERS, SORT_BINS, SORT_SERVICES, TARIFFS, TASKS, type StageId } from '../data/content';
import { fmt, fmtRate } from '../engine/format';
import { autoRate, comboLevel, isUnlocked, manualAction, missAction, stageOf } from '../engine/sim';
import type { GameState } from '../engine/state';
import { floatText, h, shake } from './dom';
import { Ghost, contemplation, wait, type Token } from './ghost';

export interface Ctx {
  s: GameState;
  now(): number;
  /** Appelé après chaque geste : mails, sauvegarde, rafraîchissement. */
  acted(): void;
}

export interface View {
  el: HTMLElement;
  update(now: number): void;
  destroy?(): void;
}

const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];

/** Montre ce qu'un geste a rapporté : des crédits, ou des unités passées à l'étape suivante. */
function reward(ctx: Ctx, layer: HTMLElement, x: number, y: number, before: number, units: number, unit: string): void {
  const gained = ctx.s.credits - before;
  floatText(layer, gained > 0 ? `+${fmt(gained)}` : `+${fmt(units)} ${unit}`, x, y);
}

function relPos(layer: HTMLElement, el: Element): { x: number; y: number } {
  const a = layer.getBoundingClientRect();
  const b = el.getBoundingClientRect();
  return { x: b.left - a.left + b.width / 2, y: b.top - a.top };
}

function retrigger(el: HTMLElement, cls: string): void {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

/** Fait voler une copie d'un élément vers une cible, puis la retire. */
function flyCopy(layer: HTMLElement, from: HTMLElement, to: Element, ms: number, cls = ''): void {
  const a = layer.getBoundingClientRect();
  const f = from.getBoundingClientRect();
  const t = to.getBoundingClientRect();
  const copy = from.cloneNode(true) as HTMLElement;
  copy.classList.add('flycopy');
  if (cls) copy.classList.add(cls);
  copy.removeAttribute('style');
  Object.assign(copy.style, {
    left: `${f.left - a.left}px`,
    top: `${f.top - a.top}px`,
    width: `${f.width}px`,
    height: `${f.height}px`,
    transition: `transform ${ms}ms cubic-bezier(.5,0,.75,.4), opacity ${ms}ms ease-in`,
  });
  layer.append(copy);
  const dx = t.left + t.width / 2 - (f.left + f.width / 2);
  const dy = t.top + t.height / 2 - (f.top + f.height / 2);
  requestAnimationFrame(() => {
    copy.style.transform = `translate(${dx}px, ${dy}px) scale(.18) rotate(${Math.random() * 30 - 15}deg)`;
    copy.style.opacity = '0.4';
  });
  setTimeout(() => copy.remove(), ms + 30);
}

/** Qui tient le curseur fantôme : la macro, ou le subordonné embauché. */
function ghostOwner(ctx: Ctx, id: StageId, ghost: Ghost): void {
  if (stageOf(ctx.s, id) === 'auto') ghost.owner(TASKS[id].staffName, '#0a7a2a');
  else ghost.owner('Macro', '#000080');
}

/** Ligne du bas de chaque tâche : progression vers l'automatisation. */
function autoLine(ctx: Ctx, id: StageId): { el: HTMLElement; update(): void } {
  const label = h('span');
  const fill = h('i');
  const el = h('div', { class: 'autoline' }, label, h('div', { class: 'prog sk' }, fill));
  return {
    el,
    update() {
      const t = ctx.s.tasks[id];
      const st = stageOf(ctx.s, id);
      if (st === 'manuel') {
        label.textContent = `Aide automatique : niveau ${t.level} / ${ASSIST_LEVEL} (menu Gestion)`;
        fill.style.width = `${(t.level / ASSIST_LEVEL) * 100}%`;
      } else if (st === 'assiste') {
        label.textContent = `Macro : ${fmtRate(autoRate(ctx.s, id, true))} /s. Lâchez l’écran pour la regarder travailler.`;
        fill.style.width = '100%';
      } else {
        label.textContent = `${TASKS[id].staffName} : ${fmtRate(autoRate(ctx.s, id, true))} /s, jour et nuit. Lâchez l’écran pour le regarder.`;
        fill.style.width = '100%';
      }
      el.dataset.stage = st;
    },
  };
}

/* ---------------------------------------------------------------- tri */

interface Letter {
  dest: number;
  odd: boolean;
  sender: string;
}

export function triView(ctx: Ctx): View {
  const layer = h('div', { class: 'task tri' });
  const sorted = h('b');
  const combo = h('span', { class: 'combo' });
  const pileCount = h('span');
  const from = h('span', { class: 'from' });
  const to = h('div', { class: 'to' });
  const letterEl = h('div', { class: 'env' }, h('span', { class: 'stamp' }, '0,46'), from, to);
  const peek = h('span', { class: 'peek' });
  const pileEl = h('div', { class: 'pile' }, peek, h('div', { class: 'env under2' }), h('div', { class: 'env under' }), letterEl);
  const bins = SORT_BINS.map((label, i) => h('button', { class: 'case', 'data-i': String(i) }, h('span', { class: 'slot' }), label));
  const auto = autoLine(ctx, 'tri');
  let pile = 24;

  layer.append(
    h('div', { class: 'stats' }, pileCount, combo, h('span', null, 'Triés : ', sorted)),
    h('div', { class: 'desk-wood' }, pileEl, h('div', { class: 'cases' }, ...bins)),
    auto.el,
  );
  const ghost = new Ghost(layer);

  let letter: Letter;
  const nextLetter = () => {
    const s = ctx.s;
    const odd = s.sortedCount >= 12 && Math.random() < 0.07;
    letter = odd ? { dest: SORT_BINS.length - 1, odd: true, sender: '' } : { dest: Math.floor(Math.random() * SORT_SERVICES.length), odd: false, sender: pick(SENDERS) };
    from.textContent = odd ? '' : `Exp. : ${letter.sender}`;
    if (odd) {
      to.replaceChildren(h('span', null, 'À l’attention de'), h('b', null, 'Niveau -1'), h('span', null, '(aucun expéditeur)'));
    } else {
      const svc = SORT_SERVICES[letter.dest];
      to.replaceChildren(h('span', null, 'À l’attention de'), h('b', null, `Service ${svc.to}`), h('span', null, `${svc.floor} · DeepCorp`));
    }
    letterEl.classList.toggle('odd', odd);
    peek.textContent = Math.random() < 0.2 ? '— sans expéditeur —' : '';
    pile = Math.max(8, pile + Math.floor(Math.random() * 3) - 1);
    letterEl.style.transition = 'none';
    letterEl.style.transform = '';
    retrigger(letterEl, 'flyin');
  };
  nextLetter();

  const landed = (bin: HTMLElement, soft: boolean) => {
    retrigger(bin, 'hit');
    sfx('paper', soft);
    sfx('drop', soft);
  };

  const sortInto = (i: number) => {
    const s = ctx.s;
    const target = bins[i];
    if (i !== letter.dest) {
      missAction(s);
      shake(letterEl);
      sfx('error');
      const p = relPos(layer, target);
      floatText(layer, 'Mauvais casier', p.x, p.y, 'bad');
      ctx.acted();
      return;
    }
    const before = s.credits;
    const units = manualAction(s, 'tri', ctx.now());
    s.sortedCount += 1;
    if (letter.odd) s.oddCount += 1;
    const p = relPos(layer, target);
    reward(ctx, layer, p.x, p.y, before, units, 'plis');
    flyCopy(layer, letterEl, target, 240);
    landed(target, false);
    vibrate();
    nextLetter();
    ctx.acted();
  };
  bins.forEach((b, i) => b.addEventListener('click', () => sortInto(i)));

  // glisser la lettre jusqu'au casier
  let drag: { x: number; y: number } | null = null;
  letterEl.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY };
    letterEl.setPointerCapture(e.pointerId);
    letterEl.style.transition = 'none';
    letterEl.classList.add('dragging');
    sfx('paper');
  });
  letterEl.addEventListener('pointermove', (e) => {
    if (!drag) return;
    letterEl.style.transform = `translate(${e.clientX - drag.x}px, ${e.clientY - drag.y}px) rotate(${(e.clientX - drag.x) / 30}deg)`;
  });
  const drop = (e: PointerEvent) => {
    if (!drag) return;
    drag = null;
    letterEl.classList.remove('dragging');
    letterEl.style.pointerEvents = 'none';
    const under = document.elementFromPoint(e.clientX, e.clientY)?.closest('.case');
    letterEl.style.pointerEvents = '';
    if (under instanceof HTMLElement && under.dataset.i) {
      sortInto(Number(under.dataset.i));
    } else {
      letterEl.style.transition = 'transform .2s';
      letterEl.style.transform = '';
    }
  };
  letterEl.addEventListener('pointerup', drop);
  letterEl.addEventListener('pointercancel', () => {
    drag = null;
    letterEl.classList.remove('dragging');
    letterEl.style.transform = '';
  });

  // la macro ou Leo trient tout seuls quand on lâche l'écran
  const watch = contemplation(layer, {
    canRun: () => stageOf(ctx.s, 'tri') !== 'manuel',
    rate: () => autoRate(ctx.s, 'tri', true),
    onStop: () => {
      ghost.hide();
      letterEl.style.transition = 'none';
      letterEl.style.transform = '';
    },
    step: async (token: Token, cycle: number) => {
      ghostOwner(ctx, 'tri', ghost);
      ghost.show();
      if (!(await ghost.moveTo(letterEl, cycle * 0.3, token))) return;
      ghost.press();
      sfx('paper', true);
      const bin = bins[letter.dest];
      const a = letterEl.getBoundingClientRect();
      const b = bin.getBoundingClientRect();
      const move = cycle * 0.38;
      letterEl.style.transition = `transform ${move}ms cubic-bezier(.45,.05,.3,1)`;
      letterEl.style.transform = `translate(${b.left + b.width / 2 - (a.left + a.width / 2)}px, ${b.top - a.top - a.height / 3}px) scale(.35) rotate(-6deg)`;
      void ghost.moveTo(bin, move, token);
      if (!(await wait(move, token))) return;
      landed(bin, true);
      const batch = Math.round(autoRate(ctx.s, 'tri', true) * (cycle / 1000));
      if (batch > 1) {
        const p = relPos(layer, bin);
        floatText(layer, `×${fmt(batch)}`, p.x, p.y, 'ghosty');
        // à haut débit, les plis pleuvent dans les casiers
        for (let k = 0; k < Math.min(6, batch - 1); k++) {
          setTimeout(() => !token.cancelled && flyCopy(layer, pileEl.querySelector('.under') as HTMLElement, pick(bins), 260, 'rain'), k * 60);
        }
      }
      nextLetter();
      await wait(cycle * 0.2, token);
    },
  });

  return {
    el: layer,
    update() {
      const s = ctx.s;
      sorted.textContent = fmt(s.sortedCount);
      pileCount.textContent = `Pile : ${pile} plis`;
      const c = comboLevel(s);
      combo.textContent = c > 1 ? `Combo ×${c}` : '';
      auto.update();
    },
    destroy: () => watch.destroy(),
  };
}

/* ------------------------------------------------------- affranchissement */

export function affranchirView(ctx: Ctx): View {
  const layer = h('div', { class: 'task affr' });
  const waiting = h('b');
  const dest = h('b');
  const num = h('span');
  const lcd = h('span');
  const combo = h('span', { class: 'combo' });
  const starving = h('div', { class: 'starving' }, 'En attente du tri…');
  const mark = h('span', { class: 'stampmark' }, 'AFFRANCHI');
  const parcel = h('div', { class: 'parcel' }, h('span', { class: 'label' }), mark);
  const scale = h('div', { class: 'scale' }, h('div', { class: 'lcd' }, lcd, h('small', null, 'kg')), h('div', { class: 'plate' }, parcel));
  const buttons = TARIFFS.map((t, i) =>
    h('button', { class: 'bv tariff', 'data-i': String(i) }, t.label, h('small', null, `jusqu’à ${t.max >= 1000 ? '1 kg' : `${t.max} g`}`)),
  );
  const auto = autoLine(ctx, 'affranchir');
  layer.append(
    h('div', { class: 'stats' }, h('span', null, 'À affranchir : ', waiting), combo),
    h('div', { class: 'item sk' }, h('span', null, 'Pli pour ', dest), num),
    scale,
    h('div', { class: 'tariffs' }, ...buttons),
    starving,
    auto.el,
  );
  const ghost = new Ghost(layer);

  let tariff = 0;
  let grams = 0;
  const nextParcel = () => {
    tariff = Math.floor(Math.random() * TARIFFS.length);
    const lo = tariff === 0 ? 1 : TARIFFS[tariff - 1].max + 1;
    grams = lo + Math.floor(Math.random() * (TARIFFS[tariff].max - lo));
    dest.textContent = pick(SORT_SERVICES).to;
    num.textContent = `n° ${String(Math.floor(Math.random() * 9000) + 1000)}`;
    lcd.textContent = (grams / 1000).toFixed(3).replace('.', ',');
    parcel.dataset.size = String(tariff);
    (parcel.firstChild as HTMLElement).textContent = tariff === 0 ? '' : 'FRAGILE';
    mark.classList.remove('on');
    parcel.classList.remove('out');
    retrigger(parcel, 'in');
  };
  nextParcel();

  /** Coup de tampon, puis le colis sort de la balance. */
  const stampIt = (soft: boolean, ms: number) => {
    mark.style.setProperty('--r', `${Math.random() * 16 - 8}deg`);
    retrigger(mark, 'on');
    retrigger(scale, 'thump');
    sfx('stamp', soft);
    setTimeout(() => parcel.classList.add('out'), ms * 0.45);
    setTimeout(nextParcel, ms);
  };

  buttons.forEach((b, i) =>
    b.addEventListener('click', () => {
      const s = ctx.s;
      const p = relPos(layer, b);
      if (s.buffers.tri < 1) {
        sfx('error');
        floatText(layer, 'Rien à affranchir', p.x, p.y, 'bad');
        return;
      }
      if (i !== tariff) {
        missAction(s);
        shake(b);
        sfx('error');
        floatText(layer, 'Mauvais tarif', p.x, p.y, 'bad');
        ctx.acted();
        return;
      }
      const before = s.credits;
      const units = manualAction(s, 'affranchir', ctx.now());
      reward(ctx, layer, p.x, p.y, before, units, 'plis');
      vibrate(12);
      stampIt(false, 260);
      ctx.acted();
    }),
  );

  const watch = contemplation(layer, {
    canRun: () => stageOf(ctx.s, 'affranchir') !== 'manuel' && ctx.s.buffers.tri >= 1,
    rate: () => autoRate(ctx.s, 'affranchir', true),
    onStop: () => ghost.hide(),
    step: async (token, cycle) => {
      ghostOwner(ctx, 'affranchir', ghost);
      ghost.show();
      const btn = buttons[tariff];
      if (!(await ghost.moveTo(btn, cycle * 0.35, token))) return;
      ghost.press();
      retrigger(btn, 'pressed');
      stampIt(true, cycle * 0.45);
      const batch = Math.round(autoRate(ctx.s, 'affranchir', true) * (cycle / 1000));
      if (batch > 1) {
        const p = relPos(layer, scale);
        floatText(layer, `×${fmt(batch)}`, p.x, p.y + 20, 'ghosty');
      }
      await wait(cycle * 0.65, token);
    },
  });

  return {
    el: layer,
    update() {
      const s = ctx.s;
      waiting.textContent = fmt(s.buffers.tri);
      starving.hidden = s.buffers.tri >= 1;
      const c = comboLevel(s);
      combo.textContent = c > 1 ? `Combo ×${c}` : '';
      auto.update();
    },
    destroy: () => watch.destroy(),
  };
}

/* --------------------------------------------------------------- tournées */

export function tourneesView(ctx: Ctx): View {
  const layer = h('div', { class: 'task tours' });
  const ready = h('b');
  const tray = h('div', { class: 'tray-bags' });
  const auto = autoLine(ctx, 'tournees');
  const busy: Record<string, number> = {};
  const busyLen: Record<string, number> = {};
  const bars: Record<string, HTMLElement> = {};
  const avatars: Record<string, HTMLElement> = {};
  const rows = COURIERS.map((c) => {
    const bar = h('i');
    bars[c.id] = bar;
    avatars[c.id] = h('span', { class: 'av', style: `background:${c.color}` }, c.name === 'Le nouveau' ? '?' : c.name[0]);
    return h('button', { class: 'courier', 'data-id': c.id }, avatars[c.id], h('span', { class: 'cname' }, c.name), h('span', { class: 'cbusy sk' }, bar));
  });
  layer.append(
    h('div', { class: 'stats' }, h('span', null, 'Sacs prêts : ', ready), h('span', null, `1 sac = ${BAG_SIZE} plis`)),
    h('p', { class: 'help' }, 'Touchez un sac, puis un coursier libre.'),
    tray,
    h('div', { class: 'couriers' }, ...rows),
    auto.el,
  );
  const ghost = new Ghost(layer);

  const bags: ('n' | 'odd')[] = [];
  let selected = -1;
  const chips: HTMLElement[] = [];
  const syncBags = () => {
    const s = ctx.s;
    const n = Math.min(8, Math.floor(s.buffers.affranchir / BAG_SIZE));
    while (bags.length < n) bags.push(s.poste >= 2 && Math.random() < 0.1 ? 'odd' : 'n');
    while (bags.length > n) bags.pop();
    if (selected >= bags.length) selected = -1;
    const key = bags.join(',') + '|' + selected;
    if (tray.dataset.key === key) return;
    tray.dataset.key = key;
    chips.length = 0;
    if (bags.length === 0) {
      tray.replaceChildren(h('span', { class: 'empty' }, 'En attente de l’affranchissement…'));
      return;
    }
    tray.replaceChildren(
      ...bags.map((b, i) => {
        const chip = h(
          'button',
          {
            class: `bagchip ${b === 'odd' ? 'odd' : ''} ${i === selected ? 'sel' : ''}`,
            onclick: () => {
              selected = selected === i ? -1 : i;
              sfx('click');
              syncBags();
            },
          },
          b === 'odd' ? 'Bureau 0-07' : `Sac ${i + 1}`,
        );
        chips.push(chip);
        return chip;
      }),
    );
  };

  const freeCourier = (now: number, odd: boolean) => COURIERS.find((c) => (busy[c.id] ?? 0) <= now && (!odd || c.id === 'nouveau'));

  rows.forEach((row) =>
    row.addEventListener('click', () => {
      const s = ctx.s;
      const id = row.dataset.id!;
      const now = ctx.now();
      const p = relPos(layer, row);
      if (bags.length === 0) return;
      const i = selected >= 0 ? selected : 0;
      const bag = bags[i];
      if ((busy[id] ?? 0) > now) {
        shake(row);
        sfx('error');
        floatText(layer, 'Déjà en tournée', p.x, p.y, 'bad');
        return;
      }
      if (bag === 'odd' && id !== 'nouveau') {
        missAction(s);
        shake(row);
        sfx('error');
        floatText(layer, 'Seul le nouveau prend ce sac', p.x, p.y, 'bad');
        ctx.acted();
        return;
      }
      const before = s.credits;
      const units = manualAction(s, 'tournees', now, BAG_SIZE);
      if (units <= 0) return;
      if (bag === 'odd') s.oddBagCount += 1;
      if (chips[i]) flyCopy(layer, chips[i], avatars[id], 260);
      busy[id] = now + 2500;
      busyLen[id] = 2500;
      bags.splice(i, 1);
      selected = -1;
      sfx('bag');
      vibrate(10);
      reward(ctx, layer, p.x, p.y, before, units, 'plis');
      syncBags();
      ctx.acted();
    }),
  );

  const watch = contemplation(layer, {
    canRun: () => stageOf(ctx.s, 'tournees') !== 'manuel' && bags.length > 0,
    rate: () => autoRate(ctx.s, 'tournees', true) / BAG_SIZE,
    onStop: () => {
      ghost.hide();
      selected = -1;
      syncBags();
    },
    step: async (token, cycle) => {
      ghostOwner(ctx, 'tournees', ghost);
      ghost.show();
      const i = 0;
      const chip = chips[i];
      const courier = freeCourier(ctx.now(), bags[i] === 'odd');
      if (!chip || !courier) {
        await wait(300, token);
        return;
      }
      if (!(await ghost.moveTo(chip, cycle * 0.3, token))) return;
      ghost.press();
      selected = i;
      syncBags();
      const row = rows.find((r) => r.dataset.id === courier.id)!;
      if (!(await ghost.moveTo(row, cycle * 0.35, token))) return;
      ghost.press();
      if (chips[i]) flyCopy(layer, chips[i], avatars[courier.id], 240);
      busy[courier.id] = ctx.now() + cycle * 2;
      busyLen[courier.id] = cycle * 2;
      selected = -1;
      bags.splice(i, 1);
      sfx('bag', true);
      syncBags();
      await wait(cycle * 0.35, token);
    },
  });

  return {
    el: layer,
    update(now) {
      const s = ctx.s;
      if (!isUnlocked(s, 'tournees')) return;
      ready.textContent = fmt(Math.floor(s.buffers.affranchir / BAG_SIZE));
      syncBags();
      for (const c of COURIERS) {
        const left = Math.max(0, (busy[c.id] ?? 0) - now);
        const len = busyLen[c.id] ?? 2500;
        bars[c.id].style.width = `${(1 - left / len) * 100}%`;
        bars[c.id].parentElement!.parentElement!.classList.toggle('busy', left > 0);
      }
      auto.update();
    },
    destroy: () => watch.destroy(),
  };
}

export const TASK_VIEWS: Record<StageId, (ctx: Ctx) => View> = {
  tri: triView,
  affranchir: affranchirView,
  tournees: tourneesView,
};
