import { startDrone, stopDrone } from '../audio/audio';

// Cinématique de promotion : le bâtiment en coupe, vu de côté, dans le brouillard.
// Une caméra en perspective recule depuis l'écran du joueur, montre tout l'immeuble,
// puis revient sur l'étage où le personnage marche jusqu'à son nouveau poste.

type RGB = [number, number, number];

const FLOOR_H = 100;
const HALF_W = 320;
const BACK_Z = 70;
const DESK_X = [-200, 0, 200];
const MON = { y: 46, z: 30, w: 30, h: 20 };
const SEAT_Z = 12;
const ELEVATOR_X = 272;
const NEAR = 22;
const FOG: RGB = [118, 132, 138];
const SCREEN: RGB[] = [
  [0, 160, 160],
  [70, 110, 190],
  [70, 150, 110],
];
const PLAYER_ACCENT = '#e2b23c';

export interface DezoomOpts {
  from: number;
  to: number;
  /** Mutation vers l'étage suivant : le perso part vers l'ascenseur. */
  last: boolean;
  caption: string;
}

/* ------------------------------------------------------------ hasard déterministe */

function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Worker {
  floor: number;
  x: number;
  screen: RGB;
}

interface Tower {
  x: number;
  w: number;
  h: number;
  lit: { x: number; y: number }[];
}

function buildWorld() {
  const r = rng(117);
  const workers: Worker[] = [];
  const darkFloors = new Set<number>();
  for (let f = 2; f <= 10; f++) {
    if (r() < 0.25) darkFloors.add(f);
    for (const x of [-240, -120, 0, 120, 240]) {
      if (r() < 0.62) workers.push({ floor: f, x: x + (r() * 20 - 10), screen: r() < 0.5 ? [80, 130, 160] : [90, 150, 140] });
    }
  }
  const towers: Tower[] = [];
  for (let x = -3600; x < 3600; x += 120 + r() * 200) {
    const w = 90 + r() * 180;
    const h = 250 + r() * 1300;
    const lit: { x: number; y: number }[] = [];
    for (let i = 0; i < 6; i++) if (r() < 0.6) lit.push({ x: r() * (w - 20) + 6, y: r() * (h - 30) + 10 });
    towers.push({ x, w, h, lit });
  }
  return { workers, darkFloors, towers };
}

const WORLD = buildWorld();

/* ------------------------------------------------------------ caméra */

interface Cam {
  x: number;
  y: number;
  d: number;
}

interface Key extends Cam {
  t: number;
}

const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);

function camAt(keys: Key[], t: number): Cam {
  if (t <= keys[0].t) return keys[0];
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1];
    const b = keys[i];
    if (t <= b.t) {
      const k = ease((t - a.t) / (b.t - a.t));
      // la distance s'interpole en logarithme : le zoom paraît régulier
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, d: Math.exp(Math.log(a.d) + (Math.log(b.d) - Math.log(a.d)) * k) };
    }
  }
  return keys[keys.length - 1];
}

/* ------------------------------------------------------------ rendu */

export function playDezoom(stage: HTMLElement, o: DezoomOpts, apply: () => void, done: () => void): void {
  const W = stage.clientWidth;
  const H = stage.clientHeight;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const canvas = document.createElement('canvas');
  canvas.className = 'dezoom-canvas';
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const wrap = document.createElement('div');
  wrap.className = 'dezoom';
  const skip = document.createElement('p');
  skip.className = 'skip';
  skip.textContent = 'Toucher pour passer';
  wrap.append(canvas, skip);
  stage.append(wrap);
  const g = canvas.getContext('2d')!;
  g.scale(dpr, dpr);

  const F = H * 0.9;
  const xA = DESK_X[o.from];
  const xB = o.last ? ELEVATOR_X : DESK_X[o.to];
  // distance qui fait remplir l'écran par le moniteur
  const closeD = F / (W / (MON.w * 0.92)) - MON.z;
  // le bâtiment entier doit tenir en hauteur comme en largeur
  const wideD = F / Math.min((H * 0.74) / 1260, (W * 0.86) / (HALF_W * 2 + 40)) - 35;
  // plan de l'étage : les deux postes concernés et un peu d'air autour
  const floorD = F / (W / (Math.abs((o.last ? ELEVATOR_X : DESK_X[o.to]) - DESK_X[o.from]) + 300)) - 30;

  const keys: Key[] = [
    { t: 0, x: xA, y: MON.y, d: closeD },
    { t: 1700, x: xA, y: 52, d: 190 },
    { t: 3900, x: -15, y: 450, d: wideD },
    { t: 5100, x: 15, y: 470, d: wideD * 0.96 },
    { t: 6500, x: (xA + xB) / 2, y: 60, d: floorD },
  ];
  const walkStart = 6600;
  const walkEnd = walkStart + Math.min(2200, Math.abs(xB - xA) * 9 + 600);
  if (o.last) {
    keys.push({ t: walkEnd + 300, x: xB - 40, y: 60, d: 300 }, { t: walkEnd + 1300, x: xB - 40, y: 60, d: 300 });
  } else {
    keys.push({ t: walkEnd + 300, x: xB, y: 52, d: 190 }, { t: walkEnd + 1400, x: xB, y: MON.y, d: closeD });
  }
  const total = keys[keys.length - 1].t + 150;

  // grain de pellicule, généré une fois
  const grain = document.createElement('canvas');
  grain.width = grain.height = 128;
  const gg = grain.getContext('2d')!;
  const img = gg.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  gg.putImageData(img, 0, 0);

  let cam: Cam = keys[0];
  const proj = (x: number, y: number, z: number) => {
    const d = cam.d + z;
    const s = F / d;
    return { x: W / 2 + (x - cam.x) * s, y: H / 2 - (y - cam.y) * s, s, d };
  };
  const fogMix = (c: RGB, d: number, extra = 0): string => {
    const k = Math.min(0.9, Math.max(0, (d - 260) / 2600 + extra));
    return `rgb(${c.map((v, i) => Math.round(v + (FOG[i] - v) * k)).join(',')})`;
  };
  const quad = (pts: [number, number, number][], fill: string | CanvasGradient) => {
    const p = pts.map(([x, y, z]) => proj(x, y, z));
    if (p.some((q) => q.d < NEAR)) return;
    g.beginPath();
    g.moveTo(p[0].x, p[0].y);
    for (let i = 1; i < p.length; i++) g.lineTo(p[i].x, p[i].y);
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  };
  const rectZ = (x0: number, y0: number, x1: number, y1: number, z: number, fill: string | CanvasGradient) =>
    quad(
      [
        [x0, y0, z],
        [x1, y0, z],
        [x1, y1, z],
        [x0, y1, z],
      ],
      fill,
    );
  const glow = (x: number, y: number, z: number, radius: number, c: RGB, alpha: number) => {
    const p = proj(x, y, z);
    if (p.d < NEAR) return;
    const r = radius * p.s;
    const grad = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    grad.addColorStop(0, `rgba(${c.join(',')},${alpha})`);
    grad.addColorStop(1, `rgba(${c.join(',')},0)`);
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = grad;
    g.fillRect(p.x - r, p.y - r, r * 2, r * 2);
    g.globalCompositeOperation = 'source-over';
  };

  /** Silhouette assise (dos à la caméra) ou debout, avec un pas de marche. */
  const person = (x: number, baseY: number, z: number, pose: 'sit' | 'stand', opts: { accent?: string; grade?: number; walk?: number; alpha?: number }) => {
    const p = proj(x, baseY, z);
    // ce qui est trop près de la caméra disparaît en fondu, comme si on passait au travers
    const near = Math.min(1, Math.max(0, (p.d - 48) / 50));
    const alpha = (opts.alpha ?? 1) * near;
    if (alpha <= 0.01) return;
    const s = p.s;
    const body = fogMix([26, 30, 33], p.d);
    g.save();
    g.globalAlpha = alpha;
    g.translate(p.x, p.y);
    g.scale(s, s);
    g.fillStyle = body;
    if (pose === 'sit') {
      // dossier de chaise
      g.fillStyle = fogMix([40, 44, 48], p.d);
      g.fillRect(-9, -36, 18, 16);
      g.fillRect(-1.5, -20, 3, 20);
      g.fillStyle = opts.accent && opts.grade !== 2 ? opts.accent : body;
      g.beginPath();
      g.roundRect(-7, -42, 14, 22, 4);
      g.fill();
      if (opts.accent && opts.grade === 2) {
        g.fillStyle = opts.accent;
        g.fillRect(-1, -40, 2, 10);
      }
      g.fillStyle = body;
      g.beginPath();
      g.arc(0, -47, 5.2, 0, Math.PI * 2);
      g.fill();
    } else {
      const w = opts.walk ?? 0;
      const swing = Math.sin(w) * 9;
      g.strokeStyle = body;
      g.lineWidth = 4.2;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(0, -34);
      g.lineTo(swing, -2);
      g.moveTo(0, -34);
      g.lineTo(-swing, -2);
      g.stroke();
      g.fillStyle = opts.accent && opts.grade !== 2 ? opts.accent : body;
      g.beginPath();
      g.roundRect(-6.5, -60, 13, 28, 4);
      g.fill();
      if (opts.accent && opts.grade === 2) {
        g.fillStyle = opts.accent;
        g.fillRect(-1, -58, 2, 12);
      }
      g.strokeStyle = body;
      g.lineWidth = 3.2;
      g.beginPath();
      g.moveTo(-5, -56);
      g.lineTo(-6 - swing * 0.4, -38);
      g.stroke();
      g.fillStyle = body;
      g.beginPath();
      g.arc(0, -66, 5.4, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  };

  const desk = (x: number, baseY: number, screen: RGB, lit: boolean) => {
    const pd = proj(x, baseY, 30).d;
    // plateau et façade
    quad(
      [
        [x - 34, baseY + 30, 18],
        [x + 34, baseY + 30, 18],
        [x + 34, baseY + 30, 44],
        [x - 34, baseY + 30, 44],
      ],
      fogMix([74, 62, 52], pd),
    );
    rectZ(x - 34, baseY, x + 34, baseY + 30, 18, fogMix([46, 39, 33], pd));
    // moniteur : boîtier puis dalle
    rectZ(x - MON.w / 2 - 2, baseY + MON.y - MON.h / 2 - 2, x + MON.w / 2 + 2, baseY + MON.y + MON.h / 2 + 2, MON.z + 1, fogMix([196, 190, 170], pd));
    rectZ(x - MON.w / 2, baseY + MON.y - MON.h / 2, x + MON.w / 2, baseY + MON.y + MON.h / 2, MON.z, lit ? `rgb(${screen.join(',')})` : fogMix([30, 34, 36], pd));
    rectZ(x - 3, baseY + 30, x + 3, baseY + MON.y - MON.h / 2, MON.z + 2, fogMix([150, 146, 130], pd));
    if (lit) glow(x, baseY + MON.y, MON.z - 4, 70, screen, 0.22);
  };

  const floorBox = (n: number, baseY: number, wall: RGB, lightOn: boolean) => {
    const top = baseY + FLOOR_H;
    const pd = proj(0, baseY + 50, BACK_Z).d;
    // mur du fond, plus clair sous les néons
    const a = proj(0, top, BACK_Z);
    const b = proj(0, baseY, BACK_Z);
    if (a.d > NEAR) {
      const grad = g.createLinearGradient(0, a.y, 0, b.y);
      grad.addColorStop(0, fogMix(lightOn ? ([wall[0] + 30, wall[1] + 30, wall[2] + 26] as RGB) : wall, pd));
      grad.addColorStop(1, fogMix(wall.map((v) => v * 0.6) as RGB, pd));
      rectZ(-HALF_W, baseY, HALF_W, top, BACK_Z, grad);
    }
    // sol, plafond, cloisons latérales
    quad(
      [
        [-HALF_W, baseY, 0],
        [HALF_W, baseY, 0],
        [HALF_W, baseY, BACK_Z],
        [-HALF_W, baseY, BACK_Z],
      ],
      fogMix(lightOn ? [92, 88, 80] : [52, 54, 56], pd),
    );
    quad(
      [
        [-HALF_W, top, 0],
        [HALF_W, top, 0],
        [HALF_W, top, BACK_Z],
        [-HALF_W, top, BACK_Z],
      ],
      fogMix([40, 44, 47], pd),
    );
    for (const sx of [-HALF_W, HALF_W]) {
      quad(
        [
          [sx, baseY, 0],
          [sx, top, 0],
          [sx, top, BACK_Z],
          [sx, baseY, BACK_Z],
        ],
        fogMix([48, 53, 56], pd),
      );
    }
    // porte d'ascenseur
    rectZ(ELEVATOR_X - 20, baseY, ELEVATOR_X + 20, baseY + 72, BACK_Z - 1, fogMix([120, 126, 130], pd));
    rectZ(ELEVATOR_X - 0.6, baseY, ELEVATOR_X + 0.6, baseY + 72, BACK_Z - 1.5, fogMix([60, 64, 66], pd));
    // néons et leur halo
    if (lightOn) {
      for (const nx of [-200, 0, 200]) {
        rectZ(nx - 26, top - 4, nx + 26, top - 1, 36, 'rgb(235,240,236)');
        glow(nx, top - 30, 36, 90, [200, 215, 210], 0.07);
      }
    }
    void n;
  };

  const slab = (y: number) => {
    rectZ(-HALF_W - 8, y - 7, HALF_W + 8, y, 0, fogMix([30, 35, 38], proj(0, y, 0).d));
  };

  const draw = (t: number) => {
    cam = camAt(keys, t);
    // ciel froid
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#141b20');
    sky.addColorStop(0.6, '#3a474d');
    sky.addColorStop(1, '#55646a');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    // ville au loin
    for (const tw of WORLD.towers) {
      const d = cam.d + 1500;
      void d;
      rectZ(tw.x, 0, tw.x + tw.w, tw.h, 1500, '#2f393e');
      for (const l of tw.lit) rectZ(tw.x + l.x, l.y, tw.x + l.x + 8, l.y + 6, 1499, 'rgba(190,170,110,0.45)');
    }
    // sol
    quad(
      [
        [-5000, 0, -300],
        [5000, 0, -300],
        [5000, 0, 1500],
        [-5000, 0, 1500],
      ],
      '#20272b',
    );

    // sous-sol : une seule lueur
    floorBox(-1, -110, [24, 27, 29], false);
    glow(200, -70, BACK_Z - 5, 80, [242, 193, 78], 0.28);
    rectZ(186, -110, 214, -60, BACK_Z - 1, 'rgb(242,193,78)');

    // étages
    for (let n = 10; n >= 1; n--) {
      const base = (n - 1) * FLOOR_H;
      const lit = n === 1 || !WORLD.darkFloors.has(n);
      floorBox(n, base, n === 1 ? [150, 150, 140] : [104, 112, 116], lit);
      if (n === 1) {
        DESK_X.forEach((x, i) => desk(x, 0, SCREEN[i], i <= Math.max(o.from, playerAt(t).desk)));
      } else {
        for (const w of WORLD.workers.filter((x) => x.floor === n)) {
          desk(w.x, base, w.screen, lit);
          person(w.x, base, SEAT_Z, 'sit', {});
        }
      }
    }
    // collègues assis aux anciens postes du joueur
    for (let i = 0; i < o.from; i++) person(DESK_X[i], 0, SEAT_Z, 'sit', {});
    // le joueur, et son remplaçant qui arrive
    const pl = playerAt(t);
    if (t > walkStart + 400) person(xA, 0, SEAT_Z, 'sit', { alpha: Math.min(1, (t - walkStart - 400) / 900) });
    person(pl.x, 0, pl.sit ? SEAT_Z : 6, pl.sit ? 'sit' : 'stand', { accent: PLAYER_ACCENT, grade: pl.grade, walk: pl.walk });

    for (let n = 0; n <= 10; n++) slab(n * FLOOR_H);
    slab(-110);
    // façade : piliers en premier plan
    for (const px of [-HALF_W - 4, HALF_W + 4]) rectZ(px - 7, -110, px + 7, 10 * FLOOR_H + 6, -6, fogMix([22, 26, 28], proj(px, 400, -6).d));
    // toit et enseigne
    rectZ(-HALF_W - 8, 10 * FLOOR_H, HALF_W + 8, 10 * FLOOR_H + 26, 0, fogMix([28, 32, 35], cam.d));
    const sign = proj(0, 10 * FLOOR_H + 13, -1);
    if (sign.d > NEAR) {
      g.fillStyle = 'rgba(242,193,78,0.85)';
      g.font = `${Math.max(4, 16 * sign.s)}px "Pixelify Sans", monospace`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('D E E P C O R P', sign.x, sign.y);
    }

    // brume basse, grain, vignette
    const mist = g.createLinearGradient(0, H * 0.55, 0, H);
    mist.addColorStop(0, 'rgba(118,132,138,0)');
    mist.addColorStop(1, 'rgba(118,132,138,0.22)');
    g.fillStyle = mist;
    g.fillRect(0, 0, W, H);
    g.globalAlpha = 0.05;
    g.fillStyle = g.createPattern(grain, 'repeat')!;
    g.save();
    g.translate(Math.random() * 128, Math.random() * 128);
    g.fillRect(-128, -128, W + 256, H + 256);
    g.restore();
    g.globalAlpha = 1;
    const vig = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = vig;
    g.fillRect(0, 0, W, H);

    // bandes cinéma
    const bars = Math.min(1, t / 700, (total - t) / 500) * H * 0.075;
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, bars);
    g.fillRect(0, H - bars, W, bars);

    // carton du nouveau poste
    const cap = t < walkStart ? 0 : Math.min(1, (t - walkStart) / 600, Math.max(0, (walkEnd + 200 - t) / 600));
    if (cap > 0) {
      g.globalAlpha = cap;
      g.fillStyle = '#d9dcd6';
      g.font = '13px "Courier Prime", monospace';
      g.textAlign = 'center';
      g.fillText(o.caption, W / 2, H - bars - 22);
      g.globalAlpha = 1;
    }
  };

  /** Où est le joueur : assis, debout, en marche, et à quel poste. */
  function playerAt(t: number): { x: number; sit: boolean; walk: number; grade: number; desk: number } {
    if (t < walkStart) return { x: xA, sit: true, walk: 0, grade: o.from, desk: o.from };
    if (t >= walkEnd) return { x: xB, sit: !o.last, walk: 0, grade: o.to, desk: o.last ? o.from : o.to };
    const k = (t - walkStart) / (walkEnd - walkStart);
    const kk = k < 0.1 ? 0 : k > 0.9 ? 1 : (k - 0.1) / 0.8;
    return { x: xA + (xB - xA) * kk, sit: false, walk: (t - walkStart) / 95, grade: o.to, desk: o.from };
  }

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
    draw(t);
    if (t >= total) return finish();
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  wrap.addEventListener('click', finish);
}
