// Le bâtiment DeepCorp en coupe, vu de côté dans le brouillard, avec une caméra en perspective.
// Utilisé par la cinématique de promotion et par la vue « se lever du poste ».

export type RGB = [number, number, number];

export const FLOOR_H = 100;
export const HALF_W = 320;
export const BACK_Z = 70;
export const DESK_X = [-200, 0, 200];
export const MON = { y: 46, z: 30, w: 30, h: 20 };
export const SEAT_Z = 12;
export const ELEVATOR_X = 272;
export const PLAYER_ACCENT = '#e2b23c';
const NEAR = 22;
const FOG: RGB = [118, 132, 138];
export const SCREEN: RGB[] = [
  [0, 160, 160],
  [70, 110, 190],
  [70, 150, 110],
];

export interface Cam {
  x: number;
  y: number;
  d: number;
}

export interface Key extends Cam {
  t: number;
}

const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);

export function camAt(keys: Key[], t: number): Cam {
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

function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Lueurs derrière les stores des étages fermés, et la ville au loin. */
const WORLD = (() => {
  const r = rng(117);
  const glows: { floor: number; x: number; c: RGB; flicker: number }[] = [];
  const shadows: { floor: number; x: number }[] = [];
  for (let f = 2; f <= 10; f++) {
    for (const x of [-240, -120, 0, 120, 240]) {
      if (r() < 0.45) glows.push({ floor: f, x: x + (r() * 30 - 15), c: r() < 0.5 ? [80, 130, 160] : [90, 150, 140], flicker: r() });
    }
    if (r() < 0.35) shadows.push({ floor: f, x: r() * 500 - 250 });
  }
  const towers: { x: number; w: number; h: number; lit: { x: number; y: number }[] }[] = [];
  for (let x = -3600; x < 3600; x += 120 + r() * 200) {
    const w = 90 + r() * 180;
    const h = 250 + r() * 1300;
    const lit: { x: number; y: number }[] = [];
    for (let i = 0; i < 5; i++) if (r() < 0.5) lit.push({ x: r() * (w - 20) + 6, y: r() * (h - 30) + 10 });
    towers.push({ x, w, h, lit });
  }
  return { glows, shadows, towers };
})();

export interface Actor {
  x: number;
  z: number;
  pose: 'sit' | 'stand';
  accent?: string;
  grade?: number;
  walk?: number;
  alpha?: number;
}

/** Ce que la scène montre à l'instant t : qui est où, quels écrans sont allumés. */
export interface SceneState {
  actors: Actor[];
  /** Nombre de postes de l'étage 1 allumés (de gauche à droite). */
  litDesks: number;
  /** Bureaux de l'étage 1 à mettre en évidence (vue « se lever »). */
  highlight?: number[];
}

/** Silhouette plate façon film d'entreprise : assise de dos, ou debout avec un pas. */
export function drawPerson(g: CanvasRenderingContext2D, sx: number, sy: number, scale: number, a: Omit<Actor, 'x' | 'z'>, body: string): void {
  if ((a.alpha ?? 1) <= 0.01) return;
  g.save();
  g.globalAlpha *= a.alpha ?? 1;
  g.translate(sx, sy);
  g.scale(scale, scale);
  const accent = a.accent;
  const torso = accent && a.grade !== 2 ? accent : body;
  if (a.pose === 'sit') {
    g.fillStyle = 'rgba(40,44,48,0.95)';
    g.fillRect(-9, -36, 18, 16);
    g.fillRect(-1.5, -20, 3, 20);
    g.fillStyle = torso;
    g.beginPath();
    g.roundRect(-7, -42, 14, 22, 4);
    g.fill();
    if (accent && a.grade === 2) {
      g.fillStyle = accent;
      g.fillRect(-1, -40, 2, 10);
    }
    g.fillStyle = body;
    g.beginPath();
    g.arc(0, -47, 5.2, 0, Math.PI * 2);
    g.fill();
  } else {
    const swing = Math.sin(a.walk ?? 0) * 9;
    g.strokeStyle = body;
    g.lineWidth = 4.2;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(0, -34);
    g.lineTo(swing, -2);
    g.moveTo(0, -34);
    g.lineTo(-swing, -2);
    g.stroke();
    g.fillStyle = torso;
    g.beginPath();
    g.roundRect(-6.5, -60, 13, 28, 4);
    g.fill();
    if (accent && a.grade === 2) {
      g.fillStyle = accent;
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
}

export function makeGrain(): HTMLCanvasElement {
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
  return grain;
}

/** Grain, vignette et bandes cinéma : la touche « film d'entreprise ». */
export function filmLook(g: CanvasRenderingContext2D, W: number, H: number, grain: HTMLCanvasElement, bars: number): void {
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
  if (bars > 0) {
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, bars);
    g.fillRect(0, H - bars, W, bars);
  }
}

export class OfficeScene {
  readonly canvas: HTMLCanvasElement;
  readonly g: CanvasRenderingContext2D;
  readonly W: number;
  readonly H: number;
  readonly F: number;
  cam: Cam = { x: 0, y: 50, d: 400 };
  private grain = makeGrain();

  constructor(stage: HTMLElement) {
    this.W = stage.clientWidth;
    this.H = stage.clientHeight;
    this.F = this.H * 0.9;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'dezoom-canvas';
    this.canvas.width = Math.round(this.W * dpr);
    this.canvas.height = Math.round(this.H * dpr);
    this.g = this.canvas.getContext('2d')!;
    this.g.scale(dpr, dpr);
  }

  /* ---------------------------------------------------- cadrages tout prêts */

  /** Le moniteur du poste i remplit l'écran. */
  monitorCam(i: number): Cam {
    return { x: DESK_X[i], y: MON.y, d: this.F / (this.W / (MON.w * 0.92)) - MON.z };
  }

  /** Plan rapproché sur un poste, le perso de dos. */
  seatCam(x: number): Cam {
    return { x, y: 52, d: 190 };
  }

  /** L'étage 1 entier, avec de l'air autour de la largeur demandée. */
  floorCam(x0: number, x1: number, pad = 300): Cam {
    return { x: (x0 + x1) / 2, y: 60, d: this.F / (this.W / (Math.abs(x1 - x0) + pad)) - 30 };
  }

  /** Recul maximal : les premiers étages, le reste se perd dans le noir. */
  wideCam(): Cam {
    return { x: 0, y: 210, d: this.F / Math.min((this.H * 0.8) / 600, (this.W * 0.9) / (HALF_W * 2 + 40)) - 35 };
  }

  /* ---------------------------------------------------- projection */

  project(x: number, y: number, z: number): { x: number; y: number; s: number; d: number } {
    const d = this.cam.d + z;
    const s = this.F / d;
    return { x: this.W / 2 + (x - this.cam.x) * s, y: this.H / 2 - (y - this.cam.y) * s, s, d };
  }

  private fogMix(c: RGB, d: number, extra = 0): string {
    const k = Math.min(0.9, Math.max(0, (d - 260) / 2600 + extra));
    return `rgb(${c.map((v, i) => Math.round(v + (FOG[i] - v) * k)).join(',')})`;
  }

  private quad(pts: [number, number, number][], fill: string | CanvasGradient): void {
    const p = pts.map(([x, y, z]) => this.project(x, y, z));
    if (p.some((q) => q.d < NEAR)) return;
    const g = this.g;
    g.beginPath();
    g.moveTo(p[0].x, p[0].y);
    for (let i = 1; i < p.length; i++) g.lineTo(p[i].x, p[i].y);
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  }

  private rectZ(x0: number, y0: number, x1: number, y1: number, z: number, fill: string | CanvasGradient): void {
    this.quad(
      [
        [x0, y0, z],
        [x1, y0, z],
        [x1, y1, z],
        [x0, y1, z],
      ],
      fill,
    );
  }

  private glow(x: number, y: number, z: number, radius: number, c: RGB, alpha: number): void {
    const p = this.project(x, y, z);
    if (p.d < NEAR) return;
    const r = radius * p.s;
    const g = this.g;
    const grad = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    grad.addColorStop(0, `rgba(${c.join(',')},${alpha})`);
    grad.addColorStop(1, `rgba(${c.join(',')},0)`);
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = grad;
    g.fillRect(p.x - r, p.y - r, r * 2, r * 2);
    g.globalCompositeOperation = 'source-over';
  }

  private actor(a: Actor, baseY = 0): void {
    const p = this.project(a.x, baseY, a.z);
    // ce qui est trop près de la caméra disparaît en fondu, comme si on passait au travers
    const near = Math.min(1, Math.max(0, (p.d - 48) / 50));
    drawPerson(this.g, p.x, p.y, p.s, { ...a, alpha: (a.alpha ?? 1) * near }, this.fogMix([26, 30, 33], p.d));
  }

  private desk(x: number, baseY: number, screen: RGB, lit: boolean, highlight: boolean): void {
    const pd = this.project(x, baseY, 30).d;
    this.quad(
      [
        [x - 34, baseY + 30, 18],
        [x + 34, baseY + 30, 18],
        [x + 34, baseY + 30, 44],
        [x - 34, baseY + 30, 44],
      ],
      this.fogMix([74, 62, 52], pd),
    );
    this.rectZ(x - 34, baseY, x + 34, baseY + 30, 18, this.fogMix([46, 39, 33], pd));
    this.rectZ(x - MON.w / 2 - 2, baseY + MON.y - MON.h / 2 - 2, x + MON.w / 2 + 2, baseY + MON.y + MON.h / 2 + 2, MON.z + 1, this.fogMix([196, 190, 170], pd));
    this.rectZ(x - MON.w / 2, baseY + MON.y - MON.h / 2, x + MON.w / 2, baseY + MON.y + MON.h / 2, MON.z, lit ? `rgb(${screen.join(',')})` : this.fogMix([30, 34, 36], pd));
    this.rectZ(x - 3, baseY + 30, x + 3, baseY + MON.y - MON.h / 2, MON.z + 2, this.fogMix([150, 146, 130], pd));
    if (lit) this.glow(x, baseY + MON.y, MON.z - 4, 70, screen, highlight ? 0.38 : 0.22);
    if (highlight) this.glow(x, baseY + 20, 10, 60, [226, 178, 60], 0.12);
  }

  private room(baseY: number, wall: RGB, lightOn: boolean): void {
    const top = baseY + FLOOR_H;
    const pd = this.project(0, baseY + 50, BACK_Z).d;
    const a = this.project(0, top, BACK_Z);
    const b = this.project(0, baseY, BACK_Z);
    if (a.d > NEAR) {
      const grad = this.g.createLinearGradient(0, a.y, 0, b.y);
      grad.addColorStop(0, this.fogMix(lightOn ? ([wall[0] + 30, wall[1] + 30, wall[2] + 26] as RGB) : wall, pd));
      grad.addColorStop(1, this.fogMix(wall.map((v) => v * 0.6) as RGB, pd));
      this.rectZ(-HALF_W, baseY, HALF_W, top, BACK_Z, grad);
    }
    this.quad(
      [
        [-HALF_W, baseY, 0],
        [HALF_W, baseY, 0],
        [HALF_W, baseY, BACK_Z],
        [-HALF_W, baseY, BACK_Z],
      ],
      this.fogMix(lightOn ? [92, 88, 80] : [44, 46, 48], pd),
    );
    this.quad(
      [
        [-HALF_W, top, 0],
        [HALF_W, top, 0],
        [HALF_W, top, BACK_Z],
        [-HALF_W, top, BACK_Z],
      ],
      this.fogMix([40, 44, 47], pd),
    );
    for (const sx of [-HALF_W, HALF_W]) {
      this.quad(
        [
          [sx, baseY, 0],
          [sx, top, 0],
          [sx, top, BACK_Z],
          [sx, baseY, BACK_Z],
        ],
        this.fogMix([48, 53, 56], pd),
      );
    }
    this.rectZ(ELEVATOR_X - 20, baseY, ELEVATOR_X + 20, baseY + 72, BACK_Z - 1, this.fogMix([120, 126, 130], pd));
    this.rectZ(ELEVATOR_X - 0.6, baseY, ELEVATOR_X + 0.6, baseY + 72, BACK_Z - 1.5, this.fogMix([60, 64, 66], pd));
    if (lightOn) {
      for (const nx of [-200, 0, 200]) {
        this.rectZ(nx - 26, top - 4, nx + 26, top - 1, 36, 'rgb(235,240,236)');
        this.glow(nx, top - 30, 36, 90, [200, 215, 210], 0.07);
      }
    }
  }

  /** Étage fermé : stores baissés, quelques lueurs, une ombre qui passe parfois. */
  private closedFloor(n: number, time: number): void {
    const base = (n - 1) * FLOOR_H;
    const depth = Math.min(1, (n - 2) / 4);
    this.room(base, [70, 76, 80], false);
    for (const gl of WORLD.glows.filter((x) => x.floor === n)) {
      const on = Math.sin(time / 900 + gl.flicker * 40) > -0.85 || gl.flicker > 0.3;
      if (on) this.glow(gl.x, base + 46, 30, 55, gl.c, 0.16 * (1 - depth * 0.6));
    }
    for (const sh of WORLD.shadows.filter((x) => x.floor === n)) {
      const x = sh.x + Math.sin(time / 2600 + sh.x) * 60;
      const p = this.project(x, base, 40);
      if (p.d > NEAR) drawPerson(this.g, p.x, p.y, p.s, { pose: 'stand', walk: time / 300, alpha: 0.35 }, 'rgb(30,34,37)');
    }
    // vitre dépolie et stores en façade ; la lumière filtre à travers
    const pd = this.project(0, base + 50, 0).d;
    this.rectZ(-HALF_W, base, HALF_W, base + FLOOR_H, -1, `rgba(${[88, 100, 106].join(',')},${0.6 + depth * 0.3})`);
    for (let y = base + 6; y < base + FLOOR_H; y += 7) this.rectZ(-HALF_W, y, HALF_W, y + 1.2, -1.2, this.fogMix([60, 68, 72], pd));
    for (const gl of WORLD.glows.filter((x) => x.floor === n)) this.glow(gl.x, base + 46, -2, 40, gl.c, 0.07 * (1 - depth * 0.7));
  }

  private slab(y: number): void {
    this.rectZ(-HALF_W - 8, y - 7, HALF_W + 8, y, 0, this.fogMix([30, 35, 38], this.project(0, y, 0).d));
  }

  draw(st: SceneState, time: number, bars: number): void {
    const { g, W, H } = this;
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#0d1215');
    sky.addColorStop(0.6, '#2f3b41');
    sky.addColorStop(1, '#4b5a60');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    for (const tw of WORLD.towers) {
      this.rectZ(tw.x, 0, tw.x + tw.w, tw.h, 1500, '#273035');
      for (const l of tw.lit) this.rectZ(tw.x + l.x, l.y, tw.x + l.x + 8, l.y + 6, 1499, 'rgba(190,170,110,0.35)');
    }
    this.quad(
      [
        [-5000, 0, -300],
        [5000, 0, -300],
        [5000, 0, 1500],
        [-5000, 0, 1500],
      ],
      '#1b2125',
    );

    // sous-sol : une seule lueur, pas plus
    this.room(-110, [22, 25, 27], false);
    this.glow(200, -70, BACK_Z - 5, 70, [242, 193, 78], 0.2 + Math.sin(time / 700) * 0.04);
    this.rectZ(188, -110, 212, -62, BACK_Z - 1, 'rgb(150,120,52)');

    for (let n = 10; n >= 2; n--) this.closedFloor(n, time);

    // l'étage du joueur, ouvert
    this.room(0, [150, 150, 140], true);
    DESK_X.forEach((x, i) => this.desk(x, 0, SCREEN[i], i < st.litDesks, !!st.highlight?.includes(i)));
    for (const a of st.actors) this.actor(a);

    for (let n = 0; n <= 10; n++) this.slab(n * FLOOR_H);
    this.slab(-110);
    for (const px of [-HALF_W - 4, HALF_W + 4]) this.rectZ(px - 7, -110, px + 7, 10 * FLOOR_H + 6, -6, this.fogMix([22, 26, 28], this.project(px, 400, -6).d));

    // les étages supérieurs se perdent dans le noir
    const top = this.project(0, 4 * FLOOR_H, 0).y;
    const dark = g.createLinearGradient(0, top - H * 0.3, 0, top + H * 0.05);
    dark.addColorStop(0, 'rgba(8,11,13,0.97)');
    dark.addColorStop(1, 'rgba(8,11,13,0)');
    g.fillStyle = dark;
    g.fillRect(0, 0, W, Math.max(0, top + H * 0.05));

    const mist = g.createLinearGradient(0, H * 0.55, 0, H);
    mist.addColorStop(0, 'rgba(118,132,138,0)');
    mist.addColorStop(1, 'rgba(118,132,138,0.2)');
    g.fillStyle = mist;
    g.fillRect(0, 0, W, H);
    filmLook(g, W, H, this.grain, bars);
  }

  /** Point écran d'un bureau de l'étage 1, pour poser une étiquette ou tester un toucher. */
  deskOnScreen(i: number): { x: number; y: number; r: number } {
    const p = this.project(DESK_X[i], MON.y, MON.z);
    return { x: p.x, y: p.y, r: 45 * p.s };
  }
}
