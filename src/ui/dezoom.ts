import { startDrone, stopDrone } from '../audio/audio';
import { DESK_X, ELEVATOR_X, OfficeScene, PLAYER_ACCENT, SEAT_Z, camAt, type Actor, type Key } from './scene';

export interface DezoomOpts {
  from: number;
  to: number;
  /** Mutation vers l'étage suivant : le perso part vers l'ascenseur. */
  last: boolean;
  caption: string;
}

/**
 * Cinématique de promotion : la caméra recule depuis l'écran du joueur, s'élève dans le brouillard,
 * puis revient sur l'étage où le perso marche jusqu'à son nouveau poste.
 */
export function playDezoom(stage: HTMLElement, o: DezoomOpts, apply: () => void, done: () => void): void {
  const scene = new OfficeScene(stage);
  const wrap = document.createElement('div');
  wrap.className = 'dezoom';
  const skip = document.createElement('p');
  skip.className = 'skip';
  skip.textContent = 'Toucher pour passer';
  wrap.append(scene.canvas, skip);
  stage.append(wrap);

  const xA = DESK_X[o.from];
  const xB = o.last ? ELEVATOR_X : DESK_X[o.to];
  const wide = scene.wideCam();
  const keys: Key[] = [
    { t: 0, ...scene.monitorCam(o.from) },
    { t: 1700, ...scene.seatCam(xA) },
    { t: 3900, ...wide },
    { t: 5100, ...wide, x: 20, d: wide.d * 0.94 },
    { t: 6500, ...scene.floorCam(xA, xB) },
  ];
  const walkStart = 6900;
  const walkEnd = walkStart + Math.min(2200, Math.abs(xB - xA) * 9 + 600);
  if (o.last) {
    keys.push({ t: walkEnd + 300, x: xB - 40, y: 60, d: 300 }, { t: walkEnd + 1300, x: xB - 40, y: 60, d: 300 });
  } else {
    keys.push({ t: walkEnd + 300, ...scene.seatCam(xB) }, { t: walkEnd + 1400, ...scene.monitorCam(o.to) });
  }
  const total = keys[keys.length - 1].t + 150;

  const actorsAt = (t: number): Actor[] => {
    const out: Actor[] = [];
    for (let i = 0; i < o.from; i++) out.push({ x: DESK_X[i], z: SEAT_Z, pose: 'sit', seed: i + 1 });
    if (t > walkStart + 400) out.push({ x: xA, z: SEAT_Z, pose: 'sit', seed: 11, alpha: Math.min(1, (t - walkStart - 400) / 900) });
    if (t < walkStart) {
      out.push({ x: xA, z: SEAT_Z, pose: 'sit', accent: PLAYER_ACCENT, grade: o.from, seed: 7 });
    } else if (t >= walkEnd) {
      out.push({ x: xB, z: o.last ? 6 : SEAT_Z, pose: o.last ? 'stand' : 'sit', accent: PLAYER_ACCENT, grade: o.to, seed: 7 });
    } else {
      const k = (t - walkStart) / (walkEnd - walkStart);
      const kk = k < 0.1 ? 0 : k > 0.9 ? 1 : (k - 0.1) / 0.8;
      out.push({ x: xA + (xB - xA) * kk, z: 6, pose: 'stand', accent: PLAYER_ACCENT, grade: o.to, walk: (t - walkStart) / 95, facing: xB >= xA ? 1 : -1, seed: 7 });
    }
    return out;
  };

  let t0 = 0;
  let raf = 0;
  let finished = false;
  let applied = false;
  startDrone();
  const finish = () => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    if (!applied) apply();
    stopDrone();
    done();
    wrap.classList.add('out');
    setTimeout(() => wrap.remove(), 500);
  };
  const frame = (now: number) => {
    if (!t0) t0 = now;
    const t = now - t0;
    if (!applied && t >= keys[3].t) {
      applied = true;
      apply();
    }
    scene.cam = camAt(keys, t);
    const lit = t >= walkEnd && !o.last ? o.to + 1 : o.from + 1;
    scene.draw({ actors: actorsAt(t), litDesks: lit }, t, Math.min(1, t / 700, (total - t) / 500) * scene.H * 0.075);
    // carton du nouveau poste
    const cap = t < walkStart ? 0 : Math.min(1, (t - walkStart) / 600, Math.max(0, (walkEnd + 200 - t) / 600));
    if (cap > 0) {
      const g = scene.g;
      g.globalAlpha = cap;
      g.fillStyle = '#d9dcd6';
      g.font = '13px "Courier Prime", monospace';
      g.textAlign = 'center';
      g.fillText(o.caption, scene.W / 2, scene.H * 0.9);
      g.globalAlpha = 1;
    }
    if (t >= total) return finish();
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  wrap.addEventListener('click', finish);
}
