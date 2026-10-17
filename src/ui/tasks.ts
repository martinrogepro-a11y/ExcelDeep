import { sfx, vibrate } from '../audio/audio';
import { ASSIST_LEVEL, BAG_SIZE, SENDERS, SORT_RETURN, SORT_SERVICES, TARIFFS, TASKS, type StageId } from '../data/content';
import { fmt, fmtRate } from '../engine/format';
import { autoRate, comboLevel, isUnlocked, manualAction, missAction, stageOf } from '../engine/sim';
import type { GameState } from '../engine/state';
import { floatText, h, shake } from './dom';

// Le joueur ne touche jamais le courrier : il travaille dans des logiciels.
// Chaque tâche a un formulaire de saisie (pénible) et un module qui montre
// les machines au travail (le plaisir de l'automatisation).

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

/** Montre ce qu'un geste a rapporté : des crédits, ou des plis passés à l'étape suivante. */
function reward(ctx: Ctx, layer: HTMLElement, at: Element, before: number, units: number): void {
  const p = relPos(layer, at);
  const gained = ctx.s.credits - before;
  floatText(layer, gained > 0 ? `+${fmt(gained)}` : `+${fmt(units)} plis`, p.x, p.y);
}

/** Canvas qui suit la largeur de son conteneur, à hauteur fixe. */
function panelCanvas(height: number) {
  const el = h('canvas', { class: 'panel-canvas', style: `height:${height}px` });
  const g = el.getContext('2d')!;
  let w = 0;
  return {
    el,
    g,
    height,
    /** Renvoie la largeur utile, ou 0 si le canvas n'est pas encore à l'écran. */
    fit(): number {
      const r = el.getBoundingClientRect();
      if (r.width === 0) return 0;
      if (Math.round(r.width) !== w) {
        w = Math.round(r.width);
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        el.width = w * dpr;
        el.height = height * dpr;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      return w;
    },
  };
}

/** En-tête de module : nom de la machine et son état. */
function moduleHead(name: string): { el: HTMLElement; state: HTMLElement; info: HTMLElement } {
  const state = h('span', { class: 'mod-state' });
  const info = h('span', { class: 'mod-info' });
  return { el: h('div', { class: 'mod-head' }, h('b', null, name), info, state), state, info };
}

function setModuleState(ctx: Ctx, id: StageId, state: HTMLElement): void {
  const st = stageOf(ctx.s, id);
  state.dataset.stage = st;
  state.textContent = st === 'manuel' ? 'MANUEL' : st === 'assiste' ? 'MACRO' : TASKS[id].staffName.toUpperCase();
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
        label.textContent = `Module automatique : niveau ${t.level} / ${ASSIST_LEVEL} (menu Gestion)`;
        fill.style.width = `${(t.level / ASSIST_LEVEL) * 100}%`;
      } else if (st === 'assiste') {
        label.textContent = `Macro : ${fmtRate(autoRate(ctx.s, id, true))} plis/s. Embauchez ${TASKS[id].staffName} pour la nuit.`;
        fill.style.width = '100%';
      } else {
        label.textContent = `${TASKS[id].staffName} supervise : ${fmtRate(autoRate(ctx.s, id, true))} plis/s, jour et nuit.`;
        fill.style.width = '100%';
      }
      el.dataset.stage = st;
    },
  };
}

/** Taux d'animation : au-delà de `cap` événements/s, chaque événement représente plusieurs plis. */
function visualRate(rate: number, cap: number): { perSec: number; per: number } {
  if (rate <= cap) return { perSec: rate, per: 1 };
  const per = Math.ceil(rate / cap);
  return { perSec: rate / per, per };
}

/* =================================================================== TRI */

const COLS = 26;
const ROWS = 9;

/** Défragmenteur de courrier : des blocs en vrac se rangent par service, lot après lot. */
class Defrag {
  cells: number[] = [];
  sorted: boolean[] = [];
  flash: number[] = [];
  order: number[] = [];
  pointer = 0;
  batch = 1;
  doneAt = 0;

  constructor() {
    this.newBatch();
  }

  newBatch(): void {
    const n = COLS * ROWS;
    const filled = Math.floor(n * (0.72 + Math.random() * 0.12));
    this.cells = Array(n).fill(-1);
    this.sorted = Array(n).fill(false);
    this.flash = Array(n).fill(0);
    const kinds: number[] = [];
    for (let i = 0; i < filled; i++) kinds.push(Math.random() < 0.04 ? 5 : Math.floor(Math.random() * 5));
    // dispersés au hasard, comme un disque fragmenté
    const slots = [...Array(n).keys()].sort(() => Math.random() - 0.5).slice(0, filled);
    slots.forEach((slot, i) => (this.cells[slot] = kinds[i]));
    this.order = [...kinds].sort((a, b) => a - b);
    this.pointer = 0;
    this.doneAt = 0;
  }

  /** Range un bloc. Renvoie l'index touché, ou -1 si le lot est fini. */
  step(now: number): number {
    if (this.pointer >= this.order.length) {
      if (!this.doneAt) this.doneAt = now;
      return -1;
    }
    const p = this.pointer;
    const want = this.order[p];
    let from = -1;
    for (let i = p; i < this.cells.length; i++) {
      if (!this.sorted[i] && this.cells[i] === want) {
        from = i;
        break;
      }
    }
    if (from >= 0 && from !== p) {
      const tmp = this.cells[p];
      this.cells[p] = want;
      this.cells[from] = tmp;
      this.flash[from] = now;
    }
    this.sorted[p] = true;
    this.flash[p] = now;
    this.pointer++;
    return p;
  }
}

function serviceColor(kind: number): string {
  return kind === 5 ? SORT_RETURN.color : SORT_SERVICES[kind].color;
}

interface Letter {
  kind: number;
  code: string;
  odd: boolean;
}

export function triView(ctx: Ctx): View {
  const layer = h('div', { class: 'task tri' });
  const head = moduleHead('Défragmenteur de courrier');
  const canvas = panelCanvas(150);
  const legend = h(
    'div',
    { class: 'legend' },
    ...SORT_SERVICES.map((sv) => h('span', null, h('i', { style: `background:${sv.color}` }), `${sv.code} ${sv.to.split(' ')[0]}`)),
    h('span', null, h('i', { style: `background:${SORT_RETURN.color}` }), `${SORT_RETURN.code} Retour`),
  );
  const status = h('div', { class: 'mod-status' });

  const scanNo = h('span');
  const scanFrom = h('span', { class: 'sc-from' });
  const scanTo = h('div', { class: 'sc-to' });
  const scan = h('div', { class: 'scan' }, h('div', { class: 'sc-head' }, scanNo, h('span', null, 'SCAN 200 dpi')), scanFrom, scanTo, h('i', { class: 'blot' }));
  const input = h('div', { class: 'code-input sk' });
  const combo = h('span', { class: 'combo' });
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '99'].map((k) => h('button', { class: 'bv key', 'data-k': k }, k));
  const auto = autoLine(ctx, 'tri');
  layer.append(
    h('div', { class: 'module sk' }, head.el, canvas.el, legend, status),
    h('div', { class: 'form' }, h('div', { class: 'form-row' }, h('b', null, 'Saisie du pli'), combo), scan, h('div', { class: 'form-row' }, h('span', null, 'Code service :'), input), h('div', { class: 'keypad' }, ...keys)),
    auto.el,
  );

  const defrag = new Defrag();
  let typed = '';
  let letter: Letter;
  let number = 4500 + Math.floor(Math.random() * 500);

  const nextLetter = () => {
    const s = ctx.s;
    const odd = s.sortedCount >= 12 && Math.random() < 0.07;
    number++;
    scanNo.textContent = `PLI N° ${String(number).padStart(6, '0')}`;
    scan.classList.toggle('odd', odd);
    scan.classList.toggle('smudge', !odd && Math.random() < 0.25);
    scan.style.setProperty('--rot', `${(Math.random() * 3 - 1.5).toFixed(1)}deg`);
    if (odd) {
      letter = { kind: 5, code: SORT_RETURN.code, odd: true };
      scanFrom.textContent = 'Exp. : —';
      scanTo.replaceChildren(h('span', null, 'À l’attention de'), h('b', null, 'Niveau -1'));
    } else {
      const kind = Math.floor(Math.random() * SORT_SERVICES.length);
      const sv = SORT_SERVICES[kind];
      letter = { kind, code: sv.code, odd: false };
      scanFrom.textContent = `Exp. : ${pick(SENDERS)}`;
      scanTo.replaceChildren(h('span', null, 'À l’attention de'), h('b', null, pick(sv.spellings)), h('span', null, `${sv.floor} · DeepCorp`));
    }
    retrigger(scan, 'in');
  };
  nextLetter();

  const renderInput = () => {
    input.textContent = typed.padEnd(2, '_');
  };
  renderInput();

  let manualSteps = 0;
  const submit = () => {
    const s = ctx.s;
    if (typed !== letter.code) {
      missAction(s);
      sfx('error');
      retrigger(input, 'bad');
      shake(scan);
      floatText(layer, 'Code erroné', relPos(layer, input).x, relPos(layer, input).y, 'bad');
      typed = '';
      renderInput();
      ctx.acted();
      return;
    }
    const before = s.credits;
    const units = manualAction(s, 'tri', ctx.now());
    s.sortedCount += 1;
    if (letter.odd) s.oddCount += 1;
    // chaque pli trié à la main range aussi des blocs dans le défragmenteur
    manualSteps += Math.max(1, Math.round(units));
    sfx('ok');
    vibrate();
    reward(ctx, layer, input, before, units);
    retrigger(input, 'good');
    typed = '';
    renderInput();
    nextLetter();
    ctx.acted();
  };

  keys.forEach((b) =>
    b.addEventListener('click', () => {
      const k = b.dataset.k!;
      sfx('key');
      if (k === '⌫') typed = typed.slice(0, -1);
      else if (k === '99') typed = '99';
      else if (typed.length < 2) typed += k;
      renderInput();
      if (typed.length === 2) setTimeout(submit, 90);
    }),
  );

  let last = 0;
  let budget = 0;
  return {
    el: layer,
    update(now) {
      const s = ctx.s;
      const dt = last ? Math.min(0.25, (now - last) / 1000) : 0;
      last = now;
      setModuleState(ctx, 'tri', head.state);
      const c = comboLevel(s);
      combo.textContent = c > 1 ? `Combo ×${c}` : '';
      auto.update();

      // le module avance au rythme de la production
      const rate = autoRate(s, 'tri', true);
      const vr = visualRate(rate, 45);
      budget += vr.perSec * dt + manualSteps;
      manualSteps = 0;
      let moved = 0;
      while (budget >= 1 && moved < 12) {
        budget -= 1;
        if (defrag.step(now) >= 0) moved++;
      }
      if (moved) sfx('hdd', true);
      if (defrag.doneAt && now - defrag.doneAt > 700) {
        defrag.batch++;
        defrag.newBatch();
      }
      head.info.textContent = vr.per > 1 ? `1 bloc = ${fmt(vr.per)} plis` : '';
      const pct = Math.floor((defrag.pointer / defrag.order.length) * 100);
      status.textContent = defrag.doneAt ? `Lot ${defrag.batch} trié. Envoi aux étages…` : `Lot ${defrag.batch} · ${pct} % trié · secteur ${fmt(defrag.batch * 2048 + defrag.pointer)}`;

      const w = canvas.fit();
      if (!w) return;
      const g = canvas.g;
      const H = canvas.height;
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, w, H);
      const cw = (w - 4) / COLS;
      const ch = (H - 4) / ROWS;
      const sweep = defrag.doneAt ? Math.min(1, (now - defrag.doneAt) / 600) : 0;
      for (let i = 0; i < defrag.cells.length; i++) {
        const x = 2 + (i % COLS) * cw;
        const y = 2 + Math.floor(i / COLS) * ch;
        const kind = defrag.cells[i];
        if (kind < 0) {
          g.fillStyle = '#e8e8e8';
        } else if (defrag.sorted[i]) {
          g.fillStyle = serviceColor(kind);
        } else {
          // pas encore rangé : couleur délavée
          g.fillStyle = serviceColor(kind) + '66';
        }
        g.fillRect(x + 0.6, y + 0.6, cw - 1.2, ch - 1.2);
        const f = now - defrag.flash[i];
        if (f < 220) {
          g.fillStyle = `rgba(255,255,255,${0.8 * (1 - f / 220)})`;
          g.fillRect(x + 0.6, y + 0.6, cw - 1.2, ch - 1.2);
        }
      }
      if (!defrag.doneAt && defrag.pointer < defrag.cells.length) {
        const i = defrag.pointer;
        g.strokeStyle = '#000080';
        g.lineWidth = 1.5;
        g.strokeRect(2 + (i % COLS) * cw + 0.5, 2 + Math.floor(i / COLS) * ch + 0.5, cw - 1, ch - 1);
      }
      if (sweep > 0) {
        g.fillStyle = 'rgba(0,0,128,0.18)';
        g.fillRect(0, 0, w * sweep, H);
      }
    },
  };
}

/* ======================================================= AFFRANCHISSEMENT */

interface Job {
  text: [string, string];
  progress: number;
}

/** Imprimante matricielle : la tête va et vient, le papier perforé défile vers le haut. */
class DotMatrix {
  queue: Job[] = [];
  printed: Job[] = [];
  current: Job | null = null;
  headX = 0;
  dir = 1;
  scroll = 0;

  add(text: [string, string]): void {
    if (this.queue.length < 40) this.queue.push({ text, progress: 0 });
  }

  /** Avance l'impression ; renvoie le nombre de passages de tête terminés. */
  tick(dt: number, speed: number): number {
    let passes = 0;
    if (!this.current && this.queue.length) this.current = this.queue.shift()!;
    if (this.current) {
      const before = Math.floor(this.current.progress * 4);
      this.current.progress += dt * speed;
      const after = Math.floor(Math.min(1, this.current.progress) * 4);
      passes = Math.max(0, after - before);
      this.headX += dt * speed * 4 * this.dir;
      if (this.headX > 1 || this.headX < 0) {
        this.dir *= -1;
        this.headX = Math.max(0, Math.min(1, this.headX));
      }
      if (this.current.progress >= 1) {
        this.printed.unshift(this.current);
        this.printed.length = Math.min(this.printed.length, 8);
        this.current = null;
        this.scroll = 1;
      }
    }
    this.scroll = Math.max(0, this.scroll - dt * Math.max(3, speed * 1.5));
    return passes;
  }
}

export function affranchirView(ctx: Ctx): View {
  const layer = h('div', { class: 'task affr' });
  const head = moduleHead('Imprimante DP-24 · file d’impression');
  const canvas = panelCanvas(170);
  const status = h('div', { class: 'mod-status' });
  const waiting = h('b');
  const dest = h('b');
  const num = h('span');
  const lcd = h('span');
  const combo = h('span', { class: 'combo' });
  const starving = h('div', { class: 'starving' }, 'En attente du tri…');
  let choice = -1;
  const radios = TARIFFS.map((t, i) =>
    h(
      'button',
      { class: 'tarif', 'data-i': String(i) },
      h('i', { class: 'radio' }),
      h('span', null, t.label),
      h('small', null, `≤ ${t.max >= 1000 ? '1 kg' : `${t.max} g`}`),
    ),
  );
  const print = h('button', { class: 'bv btn primary print-btn' }, 'Imprimer l’étiquette');
  const auto = autoLine(ctx, 'affranchir');
  layer.append(
    h('div', { class: 'module sk dark' }, head.el, canvas.el, status),
    h(
      'div',
      { class: 'form' },
      h('div', { class: 'form-row' }, h('span', null, 'À affranchir : ', waiting), combo),
      h('div', { class: 'item sk' }, h('span', null, 'Pli pour ', dest), num),
      h('div', { class: 'form-row' }, h('span', null, 'Balance connectée :'), h('span', { class: 'lcd' }, lcd, h('small', null, ' kg'))),
      h('div', { class: 'tarifs' }, ...radios),
      print,
      starving,
    ),
    auto.el,
  );

  const printer = new DotMatrix();
  let tariff = 0;
  let destText = '';
  const nextParcel = () => {
    tariff = Math.floor(Math.random() * TARIFFS.length);
    const lo = tariff === 0 ? 1 : TARIFFS[tariff - 1].max + 1;
    const grams = lo + Math.floor(Math.random() * (TARIFFS[tariff].max - lo));
    const sv = pick(SORT_SERVICES);
    destText = `${sv.to.toUpperCase().slice(0, 10)} · ${sv.floor.replace('Étage', 'ÉT.')}`;
    dest.textContent = sv.to;
    num.textContent = `n° ${String(Math.floor(Math.random() * 9000) + 1000)}`;
    lcd.textContent = (grams / 1000).toFixed(3).replace('.', ',');
    choice = -1;
    radios.forEach((r) => r.classList.remove('on'));
  };
  nextParcel();

  radios.forEach((r, i) =>
    r.addEventListener('click', () => {
      choice = i;
      sfx('key');
      radios.forEach((x) => x.classList.toggle('on', x === r));
    }),
  );
  print.addEventListener('click', () => {
    const s = ctx.s;
    if (s.buffers.tri < 1) {
      sfx('error');
      floatText(layer, 'Rien à affranchir', relPos(layer, print).x, relPos(layer, print).y, 'bad');
      return;
    }
    if (choice !== tariff) {
      missAction(s);
      sfx('error');
      shake(print);
      floatText(layer, choice < 0 ? 'Choisissez un tarif' : 'Mauvais tarif', relPos(layer, print).x, relPos(layer, print).y, 'bad');
      ctx.acted();
      return;
    }
    const before = s.credits;
    const units = manualAction(s, 'affranchir', ctx.now());
    printer.add([`AFFRANCHI ${['0,46', '0,92', '1,84', '3,10'][tariff]} €`, `→ ${destText}`]);
    vibrate(12);
    reward(ctx, layer, print, before, units);
    nextParcel();
    ctx.acted();
  });

  let last = 0;
  let budget = 0;
  return {
    el: layer,
    update(now) {
      const s = ctx.s;
      const dt = last ? Math.min(0.25, (now - last) / 1000) : 0;
      last = now;
      setModuleState(ctx, 'affranchir', head.state);
      waiting.textContent = fmt(s.buffers.tri);
      starving.hidden = s.buffers.tri >= 1;
      const c = comboLevel(s);
      combo.textContent = c > 1 ? `Combo ×${c}` : '';
      auto.update();

      const rate = autoRate(s, 'affranchir', true);
      const vr = visualRate(rate, 3);
      budget += vr.perSec * dt;
      while (budget >= 1) {
        budget -= 1;
        const sv = pick(SORT_SERVICES);
        printer.add([vr.per > 1 ? `LOT DE ${fmt(vr.per)} PLIS` : `AFFRANCHI ${pick(['0,46', '0,92', '1,84'])} €`, `→ ${sv.to.toUpperCase().slice(0, 10)} · ${sv.floor.replace('Étage', 'ÉT.')}`]);
      }
      const speed = Math.max(1.4, Math.min(6, vr.perSec * 1.3 + printer.queue.length * 0.15));
      const passes = printer.tick(dt, speed);
      if (passes) sfx('print', stageOf(s, 'affranchir') !== 'manuel');
      head.info.textContent = vr.per > 1 ? `1 étiquette = ${fmt(vr.per)} plis` : '';
      status.textContent = printer.current || printer.queue.length ? `Impression… ${printer.queue.length} travail(s) en attente` : 'Prête.';

      const w = canvas.fit();
      if (!w) return;
      const g = canvas.g;
      const H = canvas.height;
      g.fillStyle = '#1a1d1f';
      g.fillRect(0, 0, w, H);
      // papier listing avec bandes perforées
      const px = w * 0.12;
      const pw = w * 0.76;
      const labelH = 40;
      const printerTop = H - 46;
      g.save();
      g.beginPath();
      g.rect(px, 0, pw, printerTop + 6);
      g.clip();
      g.fillStyle = '#f4f2e6';
      g.fillRect(px, 0, pw, printerTop + 6);
      g.fillStyle = 'rgba(120,160,120,0.12)';
      for (let y = -labelH; y < printerTop; y += 14) g.fillRect(px + 14, y + (printer.scroll * labelH) % 14, pw - 28, 7);
      const off = printer.scroll * labelH;
      g.fillStyle = '#1a1d1f';
      for (let y = ((off % 12) + 12) % 12 - 12; y < printerTop + 6; y += 12) {
        g.beginPath();
        g.arc(px + 6, y, 2.4, 0, Math.PI * 2);
        g.arc(px + pw - 6, y, 2.4, 0, Math.PI * 2);
        g.fill();
      }
      // étiquettes déjà imprimées, qui montent
      const drawLabel = (job: Job, y: number, part: number) => {
        g.strokeStyle = 'rgba(0,0,0,0.25)';
        g.setLineDash([3, 3]);
        g.strokeRect(px + 18, y + 4, pw - 36, labelH - 8);
        g.setLineDash([]);
        g.fillStyle = '#26282a';
        g.font = '11px "Courier Prime", monospace';
        g.textAlign = 'left';
        const lines = job.text;
        lines.forEach((line, li) => {
          const shown = Math.max(0, Math.min(1, part * 2 - li));
          if (shown <= 0) return;
          g.fillText(line.slice(0, Math.ceil(line.length * shown)), px + 26, y + 18 + li * 13);
        });
      };
      if (printer.current) drawLabel(printer.current, printerTop - labelH + off, Math.min(1, printer.current.progress));
      printer.printed.forEach((job, i) => drawLabel(job, printerTop - labelH * (i + 2) + off, 1));
      g.restore();
      // corps de l'imprimante et sa tête
      g.fillStyle = '#c9c4b2';
      g.fillRect(px - 10, printerTop, pw + 20, H - printerTop);
      g.fillStyle = '#a9a492';
      g.fillRect(px - 10, printerTop, pw + 20, 5);
      g.fillStyle = '#2b2e30';
      g.fillRect(px + 6, printerTop + 12, pw - 12, 4);
      const hx = px + 14 + printer.headX * (pw - 48);
      g.fillStyle = '#3a3e41';
      g.fillRect(hx, printerTop + 6, 20, 16);
      g.fillStyle = printer.current ? '#46e05a' : '#555';
      g.fillRect(px + pw - 4, printerTop + 26, 5, 5);
      g.fillStyle = '#6d6858';
      g.font = '9px "DotGothic16", monospace';
      g.fillText('DEEPCORP DP-24', px + 2, H - 8);
    },
  };
}

/* =============================================================== TOURNÉES */

interface Run {
  floor: number;
  x: number;
  t: number;
  dur: number;
  manual: boolean;
}

export function tourneesView(ctx: Ctx): View {
  const layer = h('div', { class: 'task tours' });
  const head = moduleHead('Supervision des tournées');
  const canvas = panelCanvas(230);
  const log = h('div', { class: 'mod-log' });
  const ready = h('b');
  const tray = h('div', { class: 'tray-bags' });
  const auto = autoLine(ctx, 'tournees');
  layer.append(
    h('div', { class: 'module sk scada' }, head.el, canvas.el, log),
    h('div', { class: 'form' }, h('div', { class: 'form-row' }, h('span', null, 'Sacs prêts : ', ready), h('span', null, `1 sac = ${BAG_SIZE} plis`)), h('p', { class: 'help' }, 'Touchez un sac, puis l’étage de destination sur le plan.'), tray),
    auto.el,
  );

  interface Bag {
    floor: number;
    odd: boolean;
  }
  const bags: Bag[] = [];
  let selected = -1;
  const runs: Run[] = [];
  const lines: string[] = [];
  const addLog = (text: string) => {
    const t = new Date(ctx.now());
    lines.unshift(`${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')} · ${text}`);
    lines.length = Math.min(lines.length, 3);
    log.replaceChildren(...lines.map((l) => h('div', null, l)));
  };

  const syncBags = () => {
    const s = ctx.s;
    const n = Math.min(6, Math.floor(s.buffers.affranchir / BAG_SIZE));
    while (bags.length < n) bags.push(s.poste >= 2 && Math.random() < 0.1 ? { floor: -1, odd: true } : { floor: 2 + Math.floor(Math.random() * 9), odd: false });
    while (bags.length > n) bags.pop();
    if (selected >= bags.length) selected = -1;
    const key = bags.map((b) => b.floor).join(',') + '|' + selected;
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
            class: `bagchip ${b.odd ? 'odd' : ''} ${i === selected ? 'sel' : ''}`,
            onclick: () => {
              selected = selected === i ? -1 : i;
              sfx('key');
              syncBags();
            },
          },
          b.odd ? 'Bureau 0-07' : `Ét. ${b.floor}`,
        ),
      ),
    );
  };

  // géométrie du plan : étages 1 à 10 de bas en haut, et le -1 en pointillés
  const geo = (w: number) => {
    const top = 12;
    const bottom = canvas.height - 22;
    const fh = (bottom - top) / 10;
    return {
      fh,
      floorY: (f: number) => (f === -1 ? bottom + 12 : bottom - (f - 1) * fh),
      left: 34,
      right: w - 40,
      shaft: w - 26,
    };
  };

  canvas.el.addEventListener('click', (e) => {
    const s = ctx.s;
    if (selected < 0) {
      if (bags.length) floatText(layer, 'Choisissez d’abord un sac', 120, 40, 'bad');
      return;
    }
    const r = canvas.el.getBoundingClientRect();
    const y = e.clientY - r.top;
    const gm = geo(r.width);
    // étage le plus proche du toucher
    let floor = 1;
    let best = Infinity;
    for (const f of [-1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const d = Math.abs(gm.floorY(f) - (y + gm.fh / 2));
      if (d < best) {
        best = d;
        floor = f;
      }
    }
    const bag = bags[selected];
    if (floor !== bag.floor) {
      missAction(s);
      sfx('error');
      floatText(layer, 'Mauvais étage', relPos(layer, canvas.el).x, 60, 'bad');
      ctx.acted();
      return;
    }
    const before = s.credits;
    const units = manualAction(s, 'tournees', ctx.now(), BAG_SIZE);
    if (units <= 0) return;
    if (bag.odd) s.oddBagCount += 1;
    runs.push({ floor, x: 0.2 + Math.random() * 0.6, t: 0, dur: 3.2, manual: true });
    addLog(bag.odd ? 'Sac 0-07 → niveau -1 · remis' : `Sac → Ét. ${floor} · en route`);
    bags.splice(selected, 1);
    selected = -1;
    sfx('bag');
    vibrate(10);
    reward(ctx, layer, canvas.el, before, units);
    syncBags();
    ctx.acted();
  });

  let last = 0;
  let budget = 0;
  return {
    el: layer,
    update(now) {
      const s = ctx.s;
      if (!isUnlocked(s, 'tournees')) return;
      const dt = last ? Math.min(0.25, (now - last) / 1000) : 0;
      last = now;
      setModuleState(ctx, 'tournees', head.state);
      ready.textContent = fmt(Math.floor(s.buffers.affranchir / BAG_SIZE));
      syncBags();
      auto.update();

      const rate = autoRate(s, 'tournees', true) / BAG_SIZE;
      const vr = visualRate(rate, 5);
      budget += vr.perSec * dt;
      while (budget >= 1 && runs.length < 40) {
        budget -= 1;
        const odd = s.poste >= 2 && Math.random() < 0.04;
        const floor = odd ? -1 : 2 + Math.floor(Math.random() * 9);
        runs.push({ floor, x: 0.15 + Math.random() * 0.7, t: 0, dur: 2.6 + Math.random(), manual: false });
        if (odd) addLog('Sac 0-07 → niveau -1');
      }
      head.info.textContent = vr.per > 1 ? `1 point = ${fmt(vr.per)} sacs` : `${runs.length} coursier(s) en route`;

      const w = canvas.fit();
      if (!w) return;
      const g = canvas.g;
      const H = canvas.height;
      const gm = geo(w);
      g.fillStyle = '#04120a';
      g.fillRect(0, 0, w, H);
      // grille de fond
      g.strokeStyle = 'rgba(60,200,110,0.08)';
      g.lineWidth = 1;
      for (let x = 0; x < w; x += 16) {
        g.beginPath();
        g.moveTo(x + 0.5, 0);
        g.lineTo(x + 0.5, H);
        g.stroke();
      }
      g.font = '10px "DotGothic16", monospace';
      g.textAlign = 'right';
      for (let f = 1; f <= 10; f++) {
        const y = gm.floorY(f);
        g.strokeStyle = f === 1 ? 'rgba(90,255,150,0.9)' : 'rgba(70,220,120,0.55)';
        g.beginPath();
        g.moveTo(gm.left, y + 0.5);
        g.lineTo(gm.right, y + 0.5);
        g.stroke();
        g.fillStyle = 'rgba(90,255,150,0.75)';
        g.fillText(String(f), gm.left - 8, y + 3);
      }
      // le -1 n'apparaît que lorsqu'un sac doit y aller
      const needBasement = bags.some((b) => b.odd) || runs.some((r) => r.floor === -1);
      if (needBasement) {
        const y = gm.floorY(-1);
        g.strokeStyle = 'rgba(242,193,78,0.7)';
        g.setLineDash([4, 4]);
        g.beginPath();
        g.moveTo(gm.left, y + 0.5);
        g.lineTo(gm.right, y + 0.5);
        g.stroke();
        g.setLineDash([]);
        g.fillStyle = 'rgba(242,193,78,0.85)';
        g.fillText('-1', gm.left - 8, y + 3);
      }
      // cage d'ascenseur
      g.strokeStyle = 'rgba(90,255,150,0.5)';
      g.strokeRect(gm.shaft - 5, gm.floorY(10) - 4, 10, gm.floorY(needBasement ? -1 : 1) - gm.floorY(10) + 8);
      g.fillStyle = 'rgba(90,255,150,0.8)';
      g.textAlign = 'left';
      g.fillText('COURRIER', gm.left + 2, gm.floorY(1) - 4);

      // les coursiers : vers l'ascenseur, montée, livraison, retour
      for (let i = runs.length - 1; i >= 0; i--) {
        const r = runs[i];
        r.t += dt / r.dur;
        if (r.t >= 1) {
          runs.splice(i, 1);
          continue;
        }
        const y1 = gm.floorY(1);
        const yf = gm.floorY(r.floor);
        const xd = gm.left + r.x * (gm.right - gm.left);
        let x: number;
        let y: number;
        const k = r.t < 0.5 ? r.t * 2 : (1 - r.t) * 2;
        if (k < 0.3) {
          x = gm.left + 8 + ((gm.shaft - gm.left - 8) * k) / 0.3;
          y = y1;
        } else if (k < 0.6) {
          x = gm.shaft;
          y = y1 + ((yf - y1) * (k - 0.3)) / 0.3;
        } else {
          x = gm.shaft + ((xd - gm.shaft) * (k - 0.6)) / 0.4;
          y = yf;
        }
        if (Math.abs(r.t - 0.5) < dt / r.dur) {
          sfx('blip', !r.manual);
          if (r.floor === -1) addLog('Niveau -1 · signal perdu');
        }
        const color = r.floor === -1 ? '242,193,78' : r.manual ? '255,230,120' : '120,255,170';
        if (r.floor === -1 && r.t > 0.5) continue;
        g.fillStyle = `rgba(${color},0.25)`;
        g.beginPath();
        g.arc(x, y, 6, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = `rgb(${color})`;
        g.beginPath();
        g.arc(x, y, 2.6, 0, Math.PI * 2);
        g.fill();
        // impulsion à la livraison
        if (Math.abs(r.t - 0.5) < 0.06) {
          g.strokeStyle = `rgba(${color},${1 - Math.abs(r.t - 0.5) / 0.06})`;
          g.beginPath();
          g.arc(xd, yf, 12 * (1 - Math.abs(r.t - 0.5) / 0.06) + 3, 0, Math.PI * 2);
          g.stroke();
        }
      }
      // étage choisi en surbrillance quand un sac est sélectionné
      if (selected >= 0) {
        const y = gm.floorY(bags[selected].floor);
        g.fillStyle = 'rgba(255,230,120,0.07)';
        g.fillRect(gm.left, y - gm.fh, gm.right - gm.left, gm.fh);
      }
      // balayage de l'écran
      const sweep = (now / 2400) % 1;
      g.fillStyle = 'rgba(90,255,150,0.05)';
      g.fillRect(0, sweep * H - 20, w, 20);
    },
  };
}

export const TASK_VIEWS: Record<StageId, (ctx: Ctx) => View> = {
  tri: triView,
  affranchir: affranchirView,
  tournees: tourneesView,
};
