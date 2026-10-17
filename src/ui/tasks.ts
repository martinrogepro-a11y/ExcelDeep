import { ASSIST_LEVEL, BAG_SIZE, COURIERS, SENDERS, SORT_BINS, SORT_SERVICES, TARIFFS, TASKS, type StageId } from '../data/content';
import { fmt, fmtRate } from '../engine/format';
import { autoRate, comboLevel, isUnlocked, manualAction, missAction, stageOf } from '../engine/sim';
import type { GameState } from '../engine/state';
import { floatText, h, shake } from './dom';

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
        label.textContent = `Macro active : ${fmtRate(autoRate(ctx.s, id, true))} /s. Embauchez ${TASKS[id].staffName} pour la nuit.`;
        fill.style.width = '100%';
      } else {
        label.textContent = `${TASKS[id].staffName} tient le poste : ${fmtRate(autoRate(ctx.s, id, true))} /s, jour et nuit`;
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
  const letterEl = h('div', { class: 'env', 'aria-live': 'polite' }, h('span', { class: 'stamp' }, '0,46'), from, to);
  const peek = h('span', { class: 'peek' });
  const bins = SORT_BINS.map((label, i) => h('button', { class: 'case', 'data-i': String(i) }, label));
  const auto = autoLine(ctx, 'tri');
  let pile = 24;

  layer.append(
    h('div', { class: 'stats' }, pileCount, combo, h('span', null, 'Triés : ', sorted)),
    h('div', { class: 'desk-wood' }, h('div', { class: 'pile' }, peek, h('div', { class: 'env under2' }), h('div', { class: 'env under' }), letterEl), h('div', { class: 'cases' }, ...bins)),
    auto.el,
  );

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
    peek.textContent = Math.random() < 0.25 ? '— sans expéditeur —' : '';
    pile = Math.max(8, pile + Math.floor(Math.random() * 3) - 1);
  };
  nextLetter();

  const sortInto = (i: number) => {
    const s = ctx.s;
    const target = bins[i];
    if (i !== letter.dest) {
      missAction(s);
      shake(letterEl);
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
    target.classList.remove('hit');
    void target.offsetWidth;
    target.classList.add('hit');
    letterEl.classList.remove('flyin');
    void letterEl.offsetWidth;
    letterEl.classList.add('flyin');
    nextLetter();
    ctx.acted();
  };
  bins.forEach((b, i) => b.addEventListener('click', () => sortInto(i)));

  // glisser la lettre jusqu'au casier
  let drag: { x: number; y: number; id: number } | null = null;
  letterEl.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
    letterEl.setPointerCapture(e.pointerId);
    letterEl.classList.add('dragging');
  });
  letterEl.addEventListener('pointermove', (e) => {
    if (!drag) return;
    letterEl.style.transform = `translate(${e.clientX - drag.x}px, ${e.clientY - drag.y}px) rotate(${(e.clientX - drag.x) / 30}deg)`;
  });
  const drop = (e: PointerEvent) => {
    if (!drag) return;
    drag = null;
    letterEl.classList.remove('dragging');
    letterEl.style.transform = '';
    letterEl.style.pointerEvents = 'none';
    const under = document.elementFromPoint(e.clientX, e.clientY)?.closest('.case');
    letterEl.style.pointerEvents = '';
    if (under instanceof HTMLElement && under.dataset.i) sortInto(Number(under.dataset.i));
  };
  letterEl.addEventListener('pointerup', drop);
  letterEl.addEventListener('pointercancel', () => {
    drag = null;
    letterEl.classList.remove('dragging');
    letterEl.style.transform = '';
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
  const buttons = TARIFFS.map((t, i) =>
    h('button', { class: 'bv tariff', 'data-i': String(i) }, t.label, h('small', null, `jusqu’à ${t.max >= 1000 ? '1 kg' : `${t.max} g`}`)),
  );
  const auto = autoLine(ctx, 'affranchir');
  layer.append(
    h('div', { class: 'stats' }, h('span', null, 'À affranchir : ', waiting), combo),
    h('div', { class: 'item sk' }, h('span', null, 'Pli pour ', dest), num),
    h('div', { class: 'scale' }, h('div', { class: 'lcd' }, lcd, h('small', null, 'kg')), h('div', { class: 'plate' }, h('div', { class: 'parcel' }, 'FRAGILE'))),
    h('div', { class: 'tariffs' }, ...buttons),
    starving,
    auto.el,
  );

  let tariff = 0;
  let grams = 0;
  const nextParcel = () => {
    tariff = Math.floor(Math.random() * TARIFFS.length);
    const lo = tariff === 0 ? 1 : TARIFFS[tariff - 1].max + 1;
    grams = lo + Math.floor(Math.random() * (TARIFFS[tariff].max - lo));
    dest.textContent = `${pick(SORT_SERVICES).to}`;
    num.textContent = `n° ${String(Math.floor(Math.random() * 9000) + 1000)}`;
    // de temps en temps la balance affiche un poids impossible, puis se reprend
    lcd.textContent = Math.random() < 0.04 ? '-0,007' : (grams / 1000).toFixed(3).replace('.', ',');
    setTimeout(() => (lcd.textContent = (grams / 1000).toFixed(3).replace('.', ',')), 500);
  };
  nextParcel();

  buttons.forEach((b, i) =>
    b.addEventListener('click', () => {
      const s = ctx.s;
      const p = relPos(layer, b);
      if (s.buffers.tri < 1) {
        floatText(layer, 'Rien à affranchir', p.x, p.y, 'bad');
        return;
      }
      if (i !== tariff) {
        missAction(s);
        shake(b);
        floatText(layer, 'Mauvais tarif', p.x, p.y, 'bad');
        ctx.acted();
        return;
      }
      const before = s.credits;
      const units = manualAction(s, 'affranchir', ctx.now());
      reward(ctx, layer, p.x, p.y, before, units, 'plis');
      nextParcel();
      ctx.acted();
    }),
  );

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
  };
}

/* --------------------------------------------------------------- tournées */

export function tourneesView(ctx: Ctx): View {
  const layer = h('div', { class: 'task tours' });
  const ready = h('b');
  const tray = h('div', { class: 'tray-bags' });
  const auto = autoLine(ctx, 'tournees');
  const busy: Record<string, number> = {};
  const bars: Record<string, HTMLElement> = {};
  const rows = COURIERS.map((c) => {
    const bar = h('i');
    bars[c.id] = bar;
    const row = h(
      'button',
      { class: 'courier', 'data-id': c.id },
      h('span', { class: 'av', style: `background:${c.color}` }, c.name === 'Le nouveau' ? '?' : c.name[0]),
      h('span', { class: 'cname' }, c.name),
      h('span', { class: 'cbusy sk' }, bar),
    );
    return row;
  });
  layer.append(
    h('div', { class: 'stats' }, h('span', null, 'Sacs prêts : ', ready), h('span', null, `1 sac = ${BAG_SIZE} plis`)),
    h('p', { class: 'help' }, 'Touchez un sac, puis un coursier libre.'),
    tray,
    h('div', { class: 'couriers' }, ...rows),
    auto.el,
  );

  const bags: ('n' | 'odd')[] = [];
  let selected = -1;
  const syncBags = () => {
    const s = ctx.s;
    const n = Math.min(8, Math.floor(s.buffers.affranchir / BAG_SIZE));
    while (bags.length < n) bags.push(s.poste >= 2 && Math.random() < 0.1 ? 'odd' : 'n');
    while (bags.length > n) bags.pop();
    if (selected >= bags.length) selected = -1;
    const key = bags.join(',') + '|' + selected;
    if (tray.dataset.key === key) return;
    tray.dataset.key = key;
    if (bags.length === 0) {
      tray.replaceChildren(h('span', { class: 'empty' }, 'En attente de l’affranchissement…'));
      return;
    }
    tray.replaceChildren(
      ...bags.map((b, i) =>
        h(
          'button',
          {
            class: `bagchip ${b === 'odd' ? 'odd' : ''} ${i === selected ? 'sel' : ''}`,
            onclick: () => {
              selected = selected === i ? -1 : i;
              syncBags();
            },
          },
          b === 'odd' ? 'Bureau 0-07' : `Sac ${i + 1}`,
        ),
      ),
    );
  };

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
        floatText(layer, 'Déjà en tournée', p.x, p.y, 'bad');
        return;
      }
      if (bag === 'odd' && id !== 'nouveau') {
        missAction(s);
        shake(row);
        floatText(layer, 'Seul le nouveau prend ce sac', p.x, p.y, 'bad');
        ctx.acted();
        return;
      }
      const before = s.credits;
      const units = manualAction(s, 'tournees', now, BAG_SIZE);
      if (units <= 0) return;
      if (bag === 'odd') s.oddBagCount += 1;
      busy[id] = now + 2500;
      bags.splice(i, 1);
      selected = -1;
      reward(ctx, layer, p.x, p.y, before, units, 'plis');
      syncBags();
      ctx.acted();
    }),
  );

  return {
    el: layer,
    update(now) {
      const s = ctx.s;
      if (!isUnlocked(s, 'tournees')) return;
      ready.textContent = fmt(Math.floor(s.buffers.affranchir / BAG_SIZE));
      syncBags();
      for (const c of COURIERS) {
        const left = Math.max(0, (busy[c.id] ?? 0) - now);
        bars[c.id].style.width = `${(1 - left / 2500) * 100}%`;
        bars[c.id].parentElement!.parentElement!.classList.toggle('busy', left > 0);
      }
      auto.update();
    },
  };
}

export const TASK_VIEWS: Record<StageId, (ctx: Ctx) => View> = {
  tri: triView,
  affranchir: affranchirView,
  tournees: tourneesView,
};
