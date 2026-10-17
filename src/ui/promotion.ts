import { POSTES, type Decor } from '../data/content';
import type { GameState } from '../engine/state';
import type { Desk } from './desk';
import { h, icon } from './dom';
import { signaturePad } from './signature';

const SERVICES = ['Courrier', 'Accueil et standard', 'Saisie et archives', 'Comptabilité', 'Achats et logistique', 'Ressources humaines', 'Informatique', 'Juridique', 'Sécurité', 'Direction'];
const SCREEN_COLOR: Record<Decor, string> = { p1: '#008080', p2: '#1d3557', p3: '#2a3d34' };

// géométrie du bâtiment, en pixels de scène
const BW = 300;
const FH = 56;
const FLOORS = 10;
const ROOF = 24;
const DESK_X = [46, 136, 226];
const DESK_W = 54;
const MON_W = 18;
const MON_H = 13;

function floorTop(n: number): number {
  return ROOF + (FLOORS - n) * FH;
}

/** Avenant à signer, puis dézoom. `apply` change l'état, `after` remonte le bureau. */
export function runPromotion(desk: Desk, stage: HTMLElement, s: GameState, apply: () => void, after: () => void): void {
  const from = s.poste;
  const last = from + 1 >= POSTES.length;
  const clause = POSTES[from].avenant;
  const sign = h('button', { class: 'bv btn primary', disabled: true }, 'Signer l’avenant');
  const pad = signaturePad('Signez ici', () => (sign.disabled = pad.inked() < 30));
  const body = h('div', { class: 'avenant' }, h('div', { class: 'lh' }, icon('logo', 'ico big'), h('b', null, 'DeepCorp'), h('small', null, 'Ressources humaines')), h('p', null, clause), pad.el, h('div', { class: 'row end' }, sign));
  const close = desk.dialog('Avenant au contrat', body, []);
  sign.addEventListener('click', () => {
    close();
    dezoom(desk, stage, from, last, apply, after);
  });
}

function person(grade: number, me: boolean): HTMLElement {
  return h('div', { class: `person g${grade} ${me ? 'me' : ''}` }, h('i', { class: 'head' }), h('i', { class: 'body' }));
}

function dezoom(desk: Desk, stage: HTMLElement, from: number, last: boolean, apply: () => void, after: () => void): void {
  const to = last ? from : from + 1;
  const W = stage.clientWidth;
  const H = stage.clientHeight;

  // bâtiment en coupe
  const floors: HTMLElement[] = [];
  for (let n = FLOORS; n >= 1; n--) {
    floors.push(
      h(
        'div',
        { class: `floor ${n === 1 ? 'lit' : ''}`, style: `top:${floorTop(n)}px;height:${FH}px` },
        h('span', { class: 'flabel' }, `${n} · ${SERVICES[n - 1]}`),
      ),
    );
  }
  const desks = DESK_X.map((x, i) => {
    const mon = h('i', { class: 'mon', style: `background:${SCREEN_COLOR[POSTES[i].decor]}` });
    return h('div', { class: 'mini-desk', style: `left:${x - DESK_W / 2}px;top:${floorTop(1) + FH - 22}px;width:${DESK_W}px` }, mon, h('i', { class: 'table' }));
  });
  // les anciens postes sont tenus par des subordonnés
  const colleagues = DESK_X.slice(0, from).map((x) => h('div', { class: 'seat', style: `left:${x - 6}px;top:${floorTop(1) + FH - 26}px` }, person(0, false)));
  const meWrap = h('div', { class: 'seat walker', style: `left:${DESK_X[from] - 6}px;top:${floorTop(1) + FH - 26}px` }, person(from, true));
  const bldg = h(
    'div',
    { class: 'bldg', style: `width:${BW}px;height:${floorTop(0) + FH}px` },
    h('div', { class: 'roof', style: `height:${ROOF}px` }, icon('logo'), 'DEEPCORP'),
    ...floors,
    h('div', { class: 'ground', style: `top:${floorTop(0)}px` }),
    h('div', { class: 'floor basement', style: `top:${floorTop(0) + 8}px;height:${FH - 16}px` }, h('span', { class: 'flabel' }, '-1 · ?')),
    ...desks,
    ...colleagues,
    meWrap,
  );
  const cam = h('div', { class: 'cam' }, bldg);
  const skip = h('p', { class: 'skip' }, 'Toucher pour passer');
  const overlay = h('div', { class: 'dezoom' }, cam, skip);
  stage.append(overlay);

  const monCenter = (i: number) => ({ x: DESK_X[i], y: floorTop(1) + FH - 22 + MON_H / 2, s: W / MON_W });
  const floorShot = { x: BW / 2, y: floorTop(1) + FH / 2, s: (W / BW) * 0.94 };
  const wide = { x: BW / 2, y: (floorTop(0) + FH) / 2, s: Math.min((W * 0.86) / BW, (H * 0.86) / (floorTop(0) + FH)) };
  const shoot = (p: { x: number; y: number; s: number }, ms: number) => {
    cam.style.transition = ms ? `transform ${ms}ms cubic-bezier(.6,0,.3,1)` : 'none';
    cam.style.transform = `translate(${W / 2 - p.x * p.s}px, ${H / 2 - p.y * p.s}px) scale(${p.s})`;
  };

  shoot(monCenter(from), 0);
  desk.element.classList.add('fading');

  let finished = false;
  let applied = false;
  const timers: number[] = [];
  const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
  const finish = () => {
    if (finished) return;
    finished = true;
    timers.forEach(clearTimeout);
    if (!applied) apply();
    after();
    overlay.classList.add('out');
    setTimeout(() => overlay.remove(), 450);
  };

  at(600, () => shoot(floorShot, 1100));
  at(1900, () => shoot(wide, 1200));
  at(3300, () => {
    apply();
    applied = true;
    shoot(floorShot, 1000);
  });
  if (!last) {
    at(4400, () => {
      meWrap.style.left = `${DESK_X[to] - 6}px`;
      meWrap.replaceChildren(person(to, true));
      const prev = h('div', { class: 'seat arrive', style: `left:${DESK_X[from] - 6}px;top:${floorTop(1) + FH - 26}px` }, person(0, false));
      bldg.append(prev);
    });
    at(5500, () => shoot(monCenter(to), 1000));
    at(6600, finish);
  } else {
    at(4400, () => shoot(wide, 1000));
    at(5800, finish);
  }
  overlay.addEventListener('click', finish);
}
