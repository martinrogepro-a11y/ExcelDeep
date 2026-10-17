import { crtSound, sfx, startWhine, stopWhine } from '../audio/audio';
import type { Decor } from '../data/content';
import { filmLook, makeGrain } from './scene';

// Démarrage du poste : on voit le bureau dans la pénombre, l'écran peine à s'allumer,
// puis la caméra entre dans l'écran jusqu'à ce qu'il remplisse le téléphone.

interface ScreenRect {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
}

const SCREENS: Record<Decor, ScreenRect> = {
  p1: { x: -58, y: -54, w: 116, h: 88, r: 16 },
  p2: { x: -70, y: -60, w: 140, h: 104, r: 9 },
  p3: { x: -86, y: -60, w: 172, h: 108, r: 2 },
};
const BOOT_BG: Record<Decor, string> = { p1: '#008080', p2: '#1d3557', p3: '#2a3d34' };

type Phase = 'off' | 'line' | 'static' | 'collapse' | 'dark' | 'degauss' | 'boot';

interface Step {
  until: number;
  phase: Phase;
}

const FULL: Step[] = [
  { until: 1300, phase: 'off' },
  { until: 1800, phase: 'line' },
  { until: 2600, phase: 'static' },
  { until: 2900, phase: 'collapse' },
  { until: 3800, phase: 'dark' },
  { until: 4200, phase: 'line' },
  { until: 5000, phase: 'degauss' },
  { until: 9200, phase: 'boot' },
];
const SHORT: Step[] = [
  { until: 600, phase: 'off' },
  { until: 950, phase: 'line' },
  { until: 1250, phase: 'static' },
  { until: 3600, phase: 'boot' },
];

export function playCrtBoot(stage: HTMLElement, decor: Decor, mode: 'full' | 'short', done: () => void): void {
  const W = stage.clientWidth;
  const H = stage.clientHeight;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const canvas = document.createElement('canvas');
  canvas.className = 'dezoom-canvas';
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const g = canvas.getContext('2d')!;
  g.scale(dpr, dpr);
  const wrap = document.createElement('div');
  wrap.className = 'dezoom crt-boot';
  wrap.append(canvas);
  stage.append(wrap);
  const grain = makeGrain();

  const steps = mode === 'full' ? FULL : SHORT;
  const zoomStart = mode === 'full' ? 7400 : 2100;
  const total = steps[steps.length - 1].until;
  const sc = SCREENS[decor];
  const k0 = (W * 0.6) / (decor === 'p3' ? 180 : decor === 'p2' ? 168 : 156);
  const kEnd = Math.max(W / sc.w, H / sc.h) * 1.04;
  const cx = W / 2;
  const cy = H * 0.42;
  const sx = sc.x + sc.w / 2;
  const sy = sc.y + sc.h / 2;
  const fired = new Set<string>();
  const once = (key: string, fn: () => void) => {
    if (!fired.has(key)) {
      fired.add(key);
      fn();
    }
  };

  const phaseAt = (t: number): { phase: Phase; k: number; i: number } => {
    let start = 0;
    for (let i = 0; i < steps.length; i++) {
      if (t < steps[i].until) return { phase: steps[i].phase, k: (t - start) / (steps[i].until - start), i };
      start = steps[i].until;
    }
    return { phase: 'boot', k: 1, i: steps.length - 1 };
  };

  /* --------------------------------------------------- la pièce */

  const room = (t: number, ledColor: string) => {
    // mur, store et rai de lumière
    const wall = g.createLinearGradient(0, -400, 0, 200);
    wall.addColorStop(0, '#151b1e');
    wall.addColorStop(1, '#283135');
    g.fillStyle = wall;
    g.fillRect(-900, -900, 1800, 1100);
    for (let y = -250; y < 40; y += 11) {
      g.fillStyle = `rgba(214,196,150,${0.16 + (y % 3) * 0.01})`;
      g.fillRect(-340, y, 150, 6);
    }
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = 'rgba(214,196,150,0.05)';
    g.beginPath();
    g.moveTo(-340, -250);
    g.lineTo(-190, -250);
    g.lineTo(120, 260);
    g.lineTo(-420, 260);
    g.fill();
    g.globalCompositeOperation = 'source-over';
    // plateau du bureau en perspective
    const desk = g.createLinearGradient(0, 86, 0, 420);
    desk.addColorStop(0, '#5b4635');
    desk.addColorStop(1, '#2c2119');
    g.fillStyle = desk;
    g.beginPath();
    g.moveTo(-420, 86);
    g.lineTo(420, 86);
    g.lineTo(560, 420);
    g.lineTo(-560, 420);
    g.fill();
    g.fillStyle = '#7a614a';
    g.fillRect(-420, 84, 840, 3);
    // lampe de bureau et sa lumière chaude
    const lampOn = true;
    g.strokeStyle = '#1d2326';
    g.lineWidth = 5;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-128, 96);
    g.lineTo(-150, 20);
    g.lineTo(-108, -24);
    g.stroke();
    g.fillStyle = '#1d2326';
    g.beginPath();
    g.ellipse(-128, 98, 20, 5, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(-122, -36);
    g.lineTo(-88, -20);
    g.lineTo(-100, 0);
    g.lineTo(-134, -16);
    g.fill();
    if (lampOn) {
      g.globalCompositeOperation = 'lighter';
      const lg = g.createRadialGradient(-96, 110, 0, -96, 110, 150);
      lg.addColorStop(0, 'rgba(255,200,120,0.22)');
      lg.addColorStop(1, 'rgba(255,200,120,0)');
      g.fillStyle = lg;
      g.fillRect(-340, -80, 380, 360);
      g.globalCompositeOperation = 'source-over';
    }
    // papiers et tasse
    g.fillStyle = '#d9d3c0';
    g.save();
    g.translate(-150, 140);
    g.rotate(-0.12);
    g.fillRect(-40, -12, 80, 50);
    g.fillStyle = '#e8e3d2';
    g.fillRect(-34, -18, 76, 50);
    g.restore();
    g.fillStyle = '#d6d2c4';
    g.fillRect(100, 92, 24, 30);
    g.strokeStyle = '#d6d2c4';
    g.lineWidth = 4;
    g.beginPath();
    g.arc(126, 105, 7, -Math.PI / 2, Math.PI / 2);
    g.stroke();
    g.strokeStyle = 'rgba(220,220,220,0.18)';
    g.lineWidth = 2;
    for (let i = 0; i < 2; i++) {
      g.beginPath();
      const ox = 108 + i * 9;
      g.moveTo(ox, 88);
      g.bezierCurveTo(ox + Math.sin(t / 400 + i) * 8, 70, ox - 6, 58, ox + Math.sin(t / 500 + i) * 6, 40);
      g.stroke();
    }
    // clavier
    g.fillStyle = decor === 'p3' ? '#2a2d30' : '#cfc8b0';
    g.beginPath();
    g.moveTo(-100, 118);
    g.lineTo(100, 118);
    g.lineTo(116, 160);
    g.lineTo(-116, 160);
    g.fill();
    g.strokeStyle = decor === 'p3' ? '#3c4044' : '#ada68e';
    g.lineWidth = 1;
    for (let r = 0; r < 4; r++) {
      const y = 124 + r * 9;
      g.beginPath();
      g.moveTo(-100 - r * 4, y);
      g.lineTo(100 + r * 4, y);
      g.stroke();
    }

    monitor(ledColor);
  };

  const monitor = (ledColor: string) => {
    if (decor === 'p1') {
      g.fillStyle = '#b8af93';
      g.beginPath();
      g.moveTo(-66, -70);
      g.lineTo(-54, -84);
      g.lineTo(54, -84);
      g.lineTo(66, -70);
      g.fill();
      const body = g.createLinearGradient(-78, -70, 78, 80);
      body.addColorStop(0, '#ece6d2');
      body.addColorStop(1, '#c8bfa2');
      g.fillStyle = body;
      g.beginPath();
      g.roundRect(-78, -70, 156, 150, 14);
      g.fill();
      g.fillStyle = '#b5ac90';
      g.fillRect(-26, 80, 52, 8);
      g.beginPath();
      g.ellipse(0, 90, 46, 6, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#9b9277';
      g.font = '600 8px "Pixelify Sans", monospace';
      g.textAlign = 'left';
      g.fillText('D E E P C O R P', -56, 62);
      g.fillStyle = '#a49b80';
      g.beginPath();
      g.arc(60, 59, 5, 0, Math.PI * 2);
      g.fill();
      ledAt(46, 59, ledColor);
      // le post-it
      g.save();
      g.translate(52, -64);
      g.rotate(0.12);
      g.fillStyle = '#ffe866';
      g.fillRect(-20, -16, 42, 36);
      g.fillStyle = '#3a3a3a';
      g.font = '700 7px "Courier Prime", monospace';
      g.textAlign = 'center';
      g.fillText('NE PAS', 1, -2);
      g.fillText('ÉTEINDRE', 1, 8);
      g.restore();
    } else if (decor === 'p2') {
      g.fillStyle = '#a7aaa5';
      g.beginPath();
      g.moveTo(-74, -70);
      g.lineTo(-62, -80);
      g.lineTo(62, -80);
      g.lineTo(74, -70);
      g.fill();
      const body = g.createLinearGradient(-84, -70, 84, 78);
      body.addColorStop(0, '#dcddd8');
      body.addColorStop(1, '#b4b6b0');
      g.fillStyle = body;
      g.beginPath();
      g.roundRect(-84, -70, 168, 148, 8);
      g.fill();
      g.fillStyle = '#9fa29c';
      g.fillRect(-20, 78, 40, 8);
      g.beginPath();
      g.ellipse(0, 88, 40, 5, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#f4f4ef';
      g.fillRect(-70, 52, 58, 10);
      g.fillStyle = '#444';
      g.font = '6px "Courier Prime", monospace';
      g.textAlign = 'left';
      g.fillText('INV. 4471 · P117', -67, 59);
      ledAt(70, 60, ledColor);
    } else {
      // écran plat noir, et un second écran sur la droite
      g.fillStyle = '#121416';
      g.beginPath();
      g.roundRect(150, -58, 150, 104, 3);
      g.fill();
      g.fillStyle = '#1f2e28';
      g.fillRect(154, -54, 142, 96);
      g.fillStyle = '#121416';
      g.beginPath();
      g.roundRect(-90, -64, 180, 118, 3);
      g.fill();
      g.fillRect(-6, 54, 12, 26);
      g.beginPath();
      g.ellipse(0, 84, 34, 5, 0, 0, Math.PI * 2);
      g.fill();
      ledAt(84, 50, ledColor);
      g.save();
      g.translate(-60, 58);
      g.rotate(-0.05);
      g.fillStyle = '#ffe866';
      g.fillRect(-26, -8, 64, 16);
      g.fillStyle = '#3a3a3a';
      g.font = '700 7px "Courier Prime", monospace';
      g.textAlign = 'left';
      g.fillText('0-07 → le nouveau', -22, 3);
      g.restore();
    }
  };

  const ledAt = (x: number, y: number, color: string) => {
    g.fillStyle = color;
    g.beginPath();
    g.arc(x, y, 2.2, 0, Math.PI * 2);
    g.fill();
    if (color !== '#555') {
      g.globalCompositeOperation = 'lighter';
      const lg = g.createRadialGradient(x, y, 0, x, y, 10);
      lg.addColorStop(0, color);
      lg.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = 0.5;
      g.fillStyle = lg;
      g.fillRect(x - 10, y - 10, 20, 20);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
  };

  /* --------------------------------------------------- ce qu'affiche l'écran */

  const bootContent = (k: number) => {
    g.fillStyle = BOOT_BG[decor];
    g.fillRect(sc.x, sc.y, sc.w, sc.h);
    const logoA = Math.min(1, k * 4);
    g.globalAlpha = logoA;
    const cell = sc.w * 0.06;
    const lx = sx - cell * 1.5;
    const ly = sy - cell * 2.4;
    for (let i = 0; i < 9; i++) {
      g.fillStyle = i === 7 ? '#f2c14e' : '#ffffff';
      g.fillRect(lx + (i % 3) * cell + 0.6, ly + Math.floor(i / 3) * cell + 0.6, cell - 1.2, cell - 1.2);
    }
    g.fillStyle = '#ffffff';
    g.font = `600 ${Math.round(sc.w * 0.085)}px "Pixelify Sans", monospace`;
    g.textAlign = 'center';
    g.fillText(decor === 'p1' ? 'DeepOS 95' : decor === 'p2' ? 'DeepOS 2000' : 'DeepOS Horizon', sx, sy + cell * 1.9);
    const bw = sc.w * 0.46;
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    g.lineWidth = 0.8;
    g.strokeRect(sx - bw / 2, sy + cell * 2.6, bw, cell * 0.6);
    g.fillStyle = '#ffffff';
    const p = Math.min(1, k * 1.6);
    for (let i = 0; i < Math.floor(p * 12); i++) g.fillRect(sx - bw / 2 + 1 + i * (bw / 12), sy + cell * 2.6 + 1, bw / 12 - 1.2, cell * 0.6 - 2);
    g.globalAlpha = 1;
  };

  const screen = (phase: Phase, k: number, t: number) => {
    g.save();
    g.beginPath();
    g.roundRect(sc.x, sc.y, sc.w, sc.h, sc.r);
    g.clip();
    // verre éteint
    const glass = g.createLinearGradient(sc.x, sc.y, sc.x + sc.w, sc.y + sc.h);
    glass.addColorStop(0, '#2b3236');
    glass.addColorStop(1, '#161b1d');
    g.fillStyle = glass;
    g.fillRect(sc.x, sc.y, sc.w, sc.h);
    if (phase === 'line') {
      const h = Math.max(1.5, sc.h * Math.min(1, k * k * 1.2));
      g.fillStyle = k < 0.5 ? '#e8f4f2' : BOOT_BG[decor];
      g.fillRect(sc.x, sy - h / 2, sc.w, h);
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.fillRect(sc.x, sy - 1, sc.w, 2);
    } else if (phase === 'static') {
      for (let i = 0; i < 420; i++) {
        const v = Math.floor(Math.random() * 200 + 40);
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.fillRect(sc.x + Math.random() * sc.w, sc.y + Math.random() * sc.h, 2 + Math.random() * 4, 1.5);
      }
      const bar = sc.y + ((t / 3) % sc.h);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(sc.x, bar, sc.w, 12);
    } else if (phase === 'collapse') {
      const r = Math.max(1, (1 - k) * sc.w * 0.5);
      g.fillStyle = '#f2f6f4';
      g.fillRect(sx - r, sy - Math.max(1, (1 - k) * 4), r * 2, Math.max(2, (1 - k) * 8));
    } else if (phase === 'dark') {
      g.globalAlpha = Math.max(0, 1 - k * 1.5);
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(sx, sy, 1.6, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
    } else if (phase === 'degauss') {
      bootContent(0);
      // l'image ondule et se colore pendant la démagnétisation
      const amp = (1 - k) * 10;
      for (let y = sc.y; y < sc.y + sc.h; y += 4) {
        const off = Math.sin(y * 0.12 + t * 0.03) * amp;
        g.fillStyle = `hsla(${(y * 3 + t / 3) % 360},80%,60%,${0.22 * (1 - k)})`;
        g.fillRect(sc.x + off, y, sc.w, 4);
      }
    } else if (phase === 'boot') {
      bootContent(k);
    }
    // reflet de vitre et lignes de balayage
    if (decor !== 'p3') {
      g.fillStyle = 'rgba(0,0,0,0.12)';
      for (let y = sc.y; y < sc.y + sc.h; y += 2) g.fillRect(sc.x, y, sc.w, 0.7);
      const curve = g.createRadialGradient(sx, sy, sc.w * 0.25, sx, sy, sc.w * 0.75);
      curve.addColorStop(0, 'rgba(0,0,0,0)');
      curve.addColorStop(1, 'rgba(0,0,0,0.45)');
      g.fillStyle = curve;
      g.fillRect(sc.x, sc.y, sc.w, sc.h);
    }
    g.fillStyle = 'rgba(255,255,255,0.06)';
    g.beginPath();
    g.moveTo(sc.x, sc.y);
    g.lineTo(sc.x + sc.w * 0.5, sc.y);
    g.lineTo(sc.x + sc.w * 0.2, sc.y + sc.h);
    g.lineTo(sc.x, sc.y + sc.h);
    g.fill();
    g.restore();
    // halo de l'écran allumé sur la pièce
    if (phase !== 'off' && phase !== 'dark') {
      g.globalCompositeOperation = 'lighter';
      const halo = g.createRadialGradient(sx, sy, sc.w * 0.3, sx, sy, sc.w * 1.6);
      halo.addColorStop(0, phase === 'static' ? 'rgba(200,210,210,0.12)' : 'rgba(0,160,160,0.12)');
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = halo;
      g.fillRect(sx - sc.w * 2, sy - sc.w * 2, sc.w * 4, sc.w * 4);
      g.globalCompositeOperation = 'source-over';
    }
  };

  /* --------------------------------------------------- boucle */

  let t0 = 0;
  let raf = 0;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    stopWhine();
    wrap.classList.add('out');
    setTimeout(() => wrap.remove(), 500);
    done();
  };

  const frame = (now: number) => {
    if (!t0) t0 = now;
    const t = now - t0;
    const { phase, k, i } = phaseAt(t);
    // sons, une seule fois par étape
    if (phase === 'line') once(`line${i}`, () => (crtSound('power'), startWhine()));
    if (phase === 'static') once(`static${i}`, () => crtSound('static', mode === 'full' ? 0.8 : 0.3));
    if (phase === 'collapse') once('collapse', () => (crtSound('pop'), stopWhine()));
    if (phase === 'degauss') once('degauss', () => crtSound('degauss'));
    if (phase === 'boot') once('boot', () => sfx('notify'));

    const z = t < zoomStart ? 0 : Math.min(1, (t - zoomStart) / (total - zoomStart));
    const ez = z < 0.5 ? 4 * z * z * z : 1 - (-2 * z + 2) ** 3 / 2;
    const push = mode === 'full' ? Math.min(1, t / zoomStart) * 0.08 : 0;
    const kk = Math.exp(Math.log(k0 * (1 + push)) + (Math.log(kEnd) - Math.log(k0 * (1 + push))) * ez);
    // la caméra glisse du cadrage du bureau vers le centre de l'écran
    const fx = cx;
    const fy = cy + (H / 2 - cy) * ez;

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#0c1012';
    g.fillRect(0, 0, W, H);
    g.save();
    g.translate(fx, fy);
    g.scale(kk, kk);
    g.translate(-sx, -sy);
    const led = phase === 'off' ? '#555' : phase === 'boot' ? '#46e05a' : '#f0a020';
    room(t, phase === 'dark' && Math.floor(t / 250) % 2 === 0 ? '#555' : led);
    screen(phase, k, t);
    g.restore();
    filmLook(g, W, H, grain, 0);
    if (t >= total) return finish();
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  wrap.addEventListener('click', finish);
}
