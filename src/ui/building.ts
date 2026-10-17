import { sfx, startDrone, stopDrone } from '../audio/audio';
import { POSTES, TASKS } from '../data/content';
import type { GameState } from '../engine/state';
import { h } from './dom';
import { DESK_X, OfficeScene, PLAYER_ACCENT, SEAT_Z, camAt, type Actor, type Cam, type Key } from './scene';

/** Qui occupe un ancien poste : le subordonné embauché, sinon la macro. */
function occupant(s: GameState, i: number): string {
  const task = POSTES[i].unlocks[0];
  return s.tasks[task].staff ? TASKS[task].staffName : 'la macro';
}

/**
 * Le joueur se lève : la caméra recule jusqu'à l'étage. On touche un poste déjà occupé
 * pour s'y installer, ou on retourne à son bureau.
 */
export function openBuilding(stage: HTMLElement, s: GameState, current: number, onPick: (i: number) => void): void {
  const scene = new OfficeScene(stage);
  const labels = h('div', { class: 'desk-labels' });
  const back = h('button', { class: 'bv btn building-back' }, 'Retourner à mon poste');
  const wrap = h('div', { class: 'dezoom building' }, scene.canvas, labels, back);
  stage.append(wrap);

  const floor = { ...scene.floorCam(DESK_X[0], DESK_X[2], 150), y: 70 };
  let keys: Key[] = [
    { t: 0, ...scene.monitorCam(current) },
    { t: 1500, ...floor },
  ];
  let t0 = performance.now();
  let walk: { from: number; to: number; start: number; end: number } | null = null;
  let seat = current;
  let closing = false;
  let raf = 0;
  startDrone();

  const playerX = (t: number) => {
    if (!walk) return DESK_X[seat];
    const k = Math.min(1, Math.max(0, (t - walk.start) / (walk.end - walk.start)));
    return DESK_X[walk.from] + (DESK_X[walk.to] - DESK_X[walk.from]) * k;
  };

  const actors = (t: number): Actor[] => {
    const out: Actor[] = [];
    // les autres postes déjà tenus restent occupés
    for (let i = 0; i <= s.poste; i++) if (i !== current && i !== seat) out.push({ x: DESK_X[i], z: SEAT_Z, pose: 'sit', seed: i + 1 });
    const standing = !closing || (walk && t < walk.end);
    out.push({ x: playerX(t), z: standing ? 6 : SEAT_Z, pose: standing ? 'stand' : 'sit', accent: PLAYER_ACCENT, grade: s.poste, walk: walk && t < walk.end ? t / 95 : 0, facing: walk && walk.to < walk.from ? -1 : 1, seed: 7 });
    return out;
  };

  const placeLabels = (show: boolean) => {
    labels.hidden = !show;
    if (!show) return;
    labels.querySelectorAll<HTMLElement>('[data-i]').forEach((el) => {
      const p = scene.deskOnScreen(Number(el.dataset.i));
      // l'étiquette reste dans l'écran, même pour les postes au bord
      const half = el.offsetWidth / 2;
      const x = Math.min(Math.max(p.x, half + 6), scene.W - half - 6);
      el.style.transform = `translate(${x}px, ${p.y - p.r * 0.9}px) translate(-50%, -100%)`;
      el.style.setProperty('--tail', `${p.x - x}px`);
    });
  };

  labels.append(
    ...POSTES.map((p, i) => {
      const open = i <= s.poste;
      const sub = i === current ? 'Votre poste actuel' : i < s.poste ? `Tenu par ${occupant(s, i)}` : 'Accès réservé';
      return h(
        'button',
        { class: `desk-label ${open ? '' : 'locked'} ${i === current ? 'here' : ''}`, 'data-i': String(i), disabled: !open, onclick: () => pick(i) },
        h('span', { class: 'dl-ref' }, `POSTE 117-${'ABC'[i]}`),
        h('b', null, open ? p.grade : 'Accès réservé'),
        h('small', null, open ? sub : 'Badge insuffisant'),
      );
    }),
  );

  const zoomInto = (i: number, at: number) => {
    const t = performance.now() - t0;
    const cam: Cam = scene.cam;
    keys = [
      { t, ...cam },
      { t: t + at, ...cam },
      { t: t + at + 500, ...scene.seatCam(DESK_X[i]) },
      { t: t + at + 1500, ...scene.monitorCam(i) },
    ];
    setTimeout(() => {
      cancelAnimationFrame(raf);
      stopDrone();
      onPick(i);
      wrap.classList.add('out');
      setTimeout(() => wrap.remove(), 500);
    }, at + 1500);
  };

  function pick(i: number): void {
    if (closing) return;
    closing = true;
    sfx('click');
    placeLabels(false);
    back.hidden = true;
    const t = performance.now() - t0;
    const dur = i === seat ? 0 : Math.abs(DESK_X[i] - DESK_X[seat]) * 7 + 400;
    if (dur) walk = { from: seat, to: i, start: t, end: t + dur };
    seat = i;
    zoomInto(i, dur);
  }
  back.addEventListener('click', () => pick(current));

  const frame = (now: number) => {
    const t = now - t0;
    scene.cam = camAt(keys, t);
    scene.draw({ actors: actors(t), litDesks: s.poste + 1, highlight: closing ? [] : [...Array(s.poste + 1).keys()] }, t, scene.H * 0.075);
    placeLabels(!closing && t > 1500);
    raf = requestAnimationFrame(frame);
  };
  t0 = performance.now();
  raf = requestAnimationFrame(frame);
}
