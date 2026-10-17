import { ASSIST_LEVEL, MAILS, MILESTONES, POSTES, TASKS, type StageId } from '../data/content';
import { fmt, fmtDuration, fmtRate } from '../engine/format';
import {
  autoRate,
  availableSupplies,
  buyLevels,
  buySupply,
  canHire,
  cafeDurationMs,
  drinkCafe,
  hire,
  levelCost,
  maxAffordable,
  nextMilestone,
  promotionStatus,
  stageOf,
  unlockedChain,
} from '../engine/sim';
import { h } from './dom';
import type { Ctx, View } from './tasks';

const STAGE_LABEL = { manuel: 'Manuel', assiste: 'Assisté', auto: 'Automatique' } as const;
const AD_COOLDOWN_MS = 5 * 60_000;

/* ---------------------------------------------------------------- gestion */

export function gestionView(ctx: Ctx, onPromote: () => void): View {
  const el = h('div', { class: 'panel gestion' });
  let updaters: ((now: number) => void)[] = [];
  let structure = '';

  const structureKey = () => {
    const s = ctx.s;
    return [s.poste, s.demoDone, s.supplies.join(','), unlockedChain(s).map((id) => `${id}:${s.tasks[id].staff}`).join(',')].join('|');
  };

  const build = () => {
    const s = ctx.s;
    updaters = [];
    const blocks: HTMLElement[] = [];

    // promotion
    const promo = promotionStatus(s);
    const next = POSTES[s.poste + 1];
    if (s.demoDone) {
      blocks.push(h('section', { class: 'card promo done' }, h('h3', null, 'Mutation validée'), h('p', null, 'L’étage 2 (Accueil et standard) arrive dans la prochaine version. Le service Courrier continue de tourner en attendant.')));
    } else if (promo) {
      const lines = h('ul', { class: 'checks' });
      const btn = h('button', { class: 'bv btn primary', onclick: onPromote }, 'Demander la promotion');
      blocks.push(h('section', { class: 'card promo' }, h('h3', null, next ? `Promotion : ${next.grade}` : 'Mutation : étage 2'), lines, btn));
      updaters.push(() => {
        const st = promotionStatus(ctx.s);
        if (!st) return;
        lines.replaceChildren(...st.lines.map((l) => h('li', { class: l.done ? 'ok' : '' }, l.label)));
        btn.disabled = !st.ready;
      });
    }

    // tâches
    for (const id of unlockedChain(s)) blocks.push(taskCard(id));

    // fournitures
    const supplies = availableSupplies(s);
    if (supplies.length) {
      const list = h('div', { class: 'supplies' });
      for (const d of supplies) {
        const btn = h('button', { class: 'bv btn small' }, fmt(d.cost));
        btn.addEventListener('click', () => {
          if (buySupply(ctx.s, d.id)) ctx.acted();
        });
        list.append(h('div', { class: 'supply' }, h('div', null, h('b', null, d.name), h('small', null, d.desc)), btn));
        updaters.push(() => (btn.disabled = ctx.s.credits < d.cost));
      }
      blocks.push(h('section', { class: 'card' }, h('h3', null, 'Fournitures'), list));
    }

    // pause café
    const cafes = h('b');
    const drink = h('button', { class: 'bv btn' }, 'Boire un café');
    const ad = h('button', { class: 'bv btn' });
    const timer = h('p', { class: 'muted' });
    drink.addEventListener('click', () => {
      if (drinkCafe(ctx.s, ctx.now())) ctx.acted();
    });
    ad.addEventListener('click', () => {
      const now = ctx.now();
      if (ctx.s.adReadyAt > now) return;
      ctx.s.adReadyAt = now + AD_COOLDOWN_MS;
      ctx.s.cafes += 1;
      ctx.acted();
    });
    blocks.push(
      h(
        'section',
        { class: 'card' },
        h('h3', null, 'Pause café'),
        h('p', null, 'Cafés en réserve : ', cafes, '. Un café double toute la production pendant ', String(Math.round(cafeDurationMs(s) / 60000)), ' min.'),
        h('div', { class: 'row' }, drink, ad),
        timer,
        h('p', { class: 'muted small' }, 'Prototype : la vidéo de formation est simulée. Dans le jeu, ce sera une vraie publicité, facultative et signalée comme telle.'),
      ),
    );
    updaters.push((now) => {
      const st = ctx.s;
      cafes.textContent = String(st.cafes);
      drink.disabled = st.cafes <= 0;
      const wait = st.adReadyAt - now;
      ad.disabled = wait > 0;
      ad.textContent = wait > 0 ? `Formation obligatoire (dans ${fmtDuration(wait / 1000)})` : 'Formation obligatoire (pub) : +1 café';
      timer.textContent = st.cafeUntil > now ? `Café en cours : encore ${fmtDuration((st.cafeUntil - now) / 1000)}` : '';
    });

    const scroll = el.scrollTop;
    el.replaceChildren(...blocks);
    el.scrollTop = scroll;
  };

  const taskCard = (id: StageId): HTMLElement => {
    const def = TASKS[id];
    const level = h('b');
    const stage = h('span', { class: 'pill' });
    const rate = h('span', { class: 'muted' });
    const mile = h('span', { class: 'muted' });
    const fill = h('i');
    const mk = (n: 1 | 10 | 'max') => {
      const b = h('button', { class: 'bv btn small' });
      b.addEventListener('click', () => {
        const qty = n === 'max' ? maxAffordable(ctx.s, id) : n;
        if (buyLevels(ctx.s, id, qty)) ctx.acted();
      });
      return b;
    };
    const b1 = mk(1);
    const b10 = mk(10);
    const bmax = mk('max');
    const hireBtn = h('button', { class: 'bv btn small hire' });
    hireBtn.addEventListener('click', () => {
      if (hire(ctx.s, id)) ctx.acted();
    });
    const card = h(
      'section',
      { class: 'card task-card' },
      h('div', { class: 'card-head' }, h('h3', null, def.name), stage),
      h('p', null, 'Niveau ', level, ' · ', rate),
      h('div', { class: 'prog sk' }, fill),
      mile,
      h('div', { class: 'row' }, b1, b10, bmax),
      hireBtn,
    );
    updaters.push((now) => {
      const s = ctx.s;
      const t = s.tasks[id];
      const st = stageOf(s, id);
      level.textContent = String(t.level);
      stage.textContent = STAGE_LABEL[st];
      stage.dataset.stage = st;
      const r = autoRate(s, id, true);
      rate.textContent = r > 0 ? `${fmtRate(r)} plis/s` : 'à la main';
      const nm = nextMilestone(t.level);
      const prev = [...MILESTONES].reverse().find((m) => m <= t.level) ?? 0;
      if (nm) {
        fill.style.width = `${((t.level - prev) / (nm - prev)) * 100}%`;
        mile.textContent = nm === ASSIST_LEVEL ? `Niveau ${nm} : la macro prend le relais, vitesse ×2` : `Palier ${nm} : vitesse et valeur ×2`;
      } else {
        fill.style.width = '100%';
        mile.textContent = 'Tous les paliers atteints';
      }
      b1.textContent = `+1 · ${fmt(levelCost(s, id, 1))}`;
      b1.disabled = s.credits < levelCost(s, id, 1);
      b10.textContent = `+10 · ${fmt(levelCost(s, id, 10))}`;
      b10.disabled = s.credits < levelCost(s, id, 10);
      const m = maxAffordable(s, id);
      bmax.textContent = m > 0 ? `Max +${m}` : 'Max';
      bmax.disabled = m <= 0;
      hireBtn.hidden = t.staff;
      hireBtn.textContent = t.level < ASSIST_LEVEL ? `Embaucher ${def.staffName} : niveau ${ASSIST_LEVEL} requis` : `Embaucher ${def.staffName} (×4, travaille la nuit) · ${fmt(def.staffCost)}`;
      hireBtn.disabled = !canHire(s, id);
      void now;
    });
    return card;
  };

  return {
    el,
    update(now) {
      const key = structureKey();
      if (key !== structure) {
        structure = key;
        build();
      }
      for (const u of updaters) u(now);
    },
  };
}

/* --------------------------------------------------------------- courrier */

export function mailView(ctx: Ctx): View {
  const el = h('div', { class: 'panel mail' });
  let open: string | null = null;
  let shown = '';

  const render = () => {
    const s = ctx.s;
    if (open) {
      const m = MAILS.find((x) => x.id === open);
      if (!m) return;
      el.replaceChildren(
        h('button', { class: 'bv btn small', onclick: () => ((open = null), render()) }, '← Boîte de réception'),
        h('div', { class: 'mail-read sk' }, h('p', { class: 'muted' }, `De : ${m.from}`), h('h3', null, m.subject), ...m.body.split('\n\n').map((p) => h('p', null, p))),
      );
      return;
    }
    const items = [...s.mails].reverse();
    el.replaceChildren(
      h(
        'div',
        { class: 'mail-list sk' },
        ...items.map((st) => {
          const m = MAILS.find((x) => x.id === st.id)!;
          return h(
            'button',
            {
              class: `mail-row ${st.read ? '' : 'unread'}`,
              onclick: () => {
                st.read = true;
                open = st.id;
                render();
                ctx.acted();
              },
            },
            h('span', { class: 'mfrom' }, m.from),
            h('span', { class: 'msubj' }, m.subject),
          );
        }),
        items.length === 0 ? h('p', { class: 'muted' }, 'Aucun message.') : null,
      ),
    );
  };

  return {
    el,
    update() {
      const key = ctx.s.mails.map((m) => m.id + (m.read ? 'r' : 'u')).join(',') + (open ?? '');
      if (key !== shown) {
        shown = key;
        render();
      }
    },
  };
}
