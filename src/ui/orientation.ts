import { playJingle, sfx, startPad, stopPad } from '../audio/audio';
import { PLAYER, drawSeated, drawStation, drawWalker, lookFor, type RGB } from './art';
import { filmLook, makeGrain } from './scene';

// Film d'accueil des nouveaux collaborateurs : ton institutionnel, images froides,
// tout est un peu trop calme et un peu trop synchronisé.

interface Shot {
  start: number;
  end: number;
  caption: string[];
  draw(g: CanvasRenderingContext2D, W: number, H: number, k: number, t: number): void;
}

const TEAL: RGB = [0, 160, 160];
const PAPER = '#e6e8e3';

function logo(g: CanvasRenderingContext2D, cx: number, cy: number, size: number, k: number): void {
  const cell = size / 3;
  const order = [0, 1, 2, 5, 4, 3, 6, 8, 7];
  const base = g.globalAlpha;
  order.forEach((idx, n) => {
    const a = Math.min(1, Math.max(0, k * 14 - n));
    if (a <= 0) return;
    const x = cx - size / 2 + (idx % 3) * cell;
    const y = cy - size / 2 + Math.floor(idx / 3) * cell;
    const grow = 0.6 + a * 0.4;
    g.globalAlpha = base * a;
    g.fillStyle = idx === 7 ? '#f2c14e' : PAPER;
    g.fillRect(x + cell / 2 - (cell / 2 - 2) * grow, y + cell / 2 - (cell / 2 - 2) * grow, (cell - 4) * grow, (cell - 4) * grow);
  });
  g.globalAlpha = base;
  if (k > 0.7) {
    // la case jaune brille un instant
    g.globalCompositeOperation = 'lighter';
    const gl = g.createRadialGradient(cx, cy + cell, 0, cx, cy + cell, size);
    gl.addColorStop(0, `rgba(242,193,78,${0.18 * Math.min(1, (k - 0.7) * 5)})`);
    gl.addColorStop(1, 'rgba(242,193,78,0)');
    g.fillStyle = gl;
    g.fillRect(cx - size, cy - size, size * 2, size * 2);
    g.globalCompositeOperation = 'source-over';
  }
}

/** Néon au plafond et son cône de lumière, avec de la poussière dedans. */
function neon(g: CanvasRenderingContext2D, x: number, top: number, floor: number, w: number, t: number): void {
  g.fillStyle = 'rgba(235,240,236,0.9)';
  g.fillRect(x - w / 2, top, w, 4);
  g.globalCompositeOperation = 'lighter';
  const grad = g.createLinearGradient(0, top, 0, floor);
  grad.addColorStop(0, 'rgba(220,232,226,0.12)');
  grad.addColorStop(1, 'rgba(220,232,226,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(x - w / 2, top);
  g.lineTo(x + w / 2, top);
  g.lineTo(x + w * 1.4, floor);
  g.lineTo(x - w * 1.4, floor);
  g.fill();
  const span = floor - top;
  for (let i = 0; i < 24; i++) {
    const px = x + Math.sin(i * 77.1) * w * 0.9 + Math.sin(t / 1400 + i) * 6;
    const py = top + ((Math.abs(Math.sin(i * 13.7)) * span + t * 0.01 * (0.4 + (i % 5) / 5)) % span);
    g.fillStyle = `rgba(230,236,230,${0.25 + Math.sin(t / 700 + i) * 0.1})`;
    g.fillRect(px, py, 1.4, 1.4);
  }
  g.globalCompositeOperation = 'source-over';
}

function screenGlow(g: CanvasRenderingContext2D, x: number, y: number, r: number, a: number): void {
  g.globalCompositeOperation = 'lighter';
  const gl = g.createRadialGradient(x, y, 0, x, y, r);
  gl.addColorStop(0, `rgba(0,160,160,${a})`);
  gl.addColorStop(1, 'rgba(0,160,160,0)');
  g.fillStyle = gl;
  g.fillRect(x - r, y - r, r * 2, r * 2);
  g.globalCompositeOperation = 'source-over';
}

export function playOrientation(stage: HTMLElement, playerName: string, done: () => void): void {
  const W = stage.clientWidth;
  const H = stage.clientHeight;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const canvas = document.createElement('canvas');
  canvas.className = 'dezoom-canvas';
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const g = canvas.getContext('2d')!;
  g.scale(dpr, dpr);
  const skip = document.createElement('button');
  skip.className = 'film-skip';
  skip.textContent = 'Passer';
  const wrap = document.createElement('div');
  wrap.className = 'dezoom film';
  wrap.append(canvas, skip);
  stage.append(wrap);
  const grain = makeGrain();
  const name = playerName || 'nouveau collaborateur';
  const u = Math.min(W, H) / 390;

  const shots: Shot[] = [
    {
      start: 0,
      end: 4800,
      caption: ['D E E P C O R P', 'Programme d’accueil des nouveaux collaborateurs'],
      draw: (g, W, H, k) => logo(g, W / 2, H * 0.4, 120 * u, k),
    },
    {
      start: 4800,
      end: 10000,
      caption: ['Votre poste a été préparé', 'avant votre arrivée.'],
      draw: (g, W, H, k, t) => {
        // un poste vide sous un néon ; puis quelqu'un y est assis
        const s = (3.2 + k * 0.35) * u;
        const fx = W / 2;
        const fy = H * 0.66;
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.fillRect(0, fy, W, H - fy);
        neon(g, fx, H * 0.14, fy, 90 * u, t);
        screenGlow(g, fx, fy - 50 * s, 60 * s, 0.22);
        drawStation(g, fx, fy, s, { screen: TEAL, fog: 0, seed: 3, time: t });
        drawSeated(g, fx, fy + 10 * s, s * 1.12, t, { accent: PLAYER, grade: 0, alpha: k > 0.42 ? Math.min(1, (k - 0.42) * 4) : 0, rim: TEAL });
      },
    },
    {
      start: 10000,
      end: 15800,
      caption: ['Chaque collaborateur', 'est à sa place.'],
      draw: (g, W, H, k, t) => {
        // rangées identiques ; tout le monde tape exactement au même rythme
        const sync = Math.floor(t / 180) * 180;
        const pan = k * 60 * u;
        for (let row = 0; row < 5; row++) {
          const s = (0.75 + row * 0.42) * u;
          const y = H * (0.34 + row * 0.1);
          const gap = 96 * s;
          const fog = Math.max(0, 0.7 - row * 0.17);
          for (let x = -gap + ((pan * (row + 1)) % gap); x < W + gap; x += gap) {
            screenGlow(g, x, y - 50 * s, 34 * s, 0.1 * (1 - fog));
            drawStation(g, x, y, s, { screen: TEAL, fog, seed: 5, time: sync });
            drawSeated(g, x, y + 9 * s, s * 1.12, sync, { fog, look: lookFor(1), rim: TEAL });
          }
        }
      },
    },
    {
      start: 15800,
      end: 21300,
      caption: ['Aujourd’hui,', 'vous en faites partie.'],
      draw: (g, W, H, k) => {
        const cols = 7;
        const rows = 5;
        const s = 1.15 * u;
        const sx = W / (cols + 1);
        const sy = (H * 0.5) / rows;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const me = r === 3 && c === 4;
            if (me && k < 0.45) continue;
            drawWalker(g, sx * (c + 1), H * 0.22 + sy * (r + 1), s, 0, 1, { fog: me ? 0 : 0.45, accent: me ? PLAYER : undefined, look: lookFor(me ? 9 : 1) });
          }
        }
        g.fillStyle = PAPER;
        g.font = `600 ${Math.round(24 * u)}px "Courier Prime", monospace`;
        g.textAlign = 'center';
        g.fillText(`EFFECTIF : ${k < 0.45 ? '4 112' : '4 113'}`, W / 2, H * 0.17);
      },
    },
    {
      start: 21300,
      end: 29300,
      caption: [],
      draw: (g, W, H, k) => {
        const rules = [['Traitez ce qui vous est confié.'], ['Ne laissez rien s’accumuler.'], ['Les niveaux inférieurs', 'ne vous concernent pas.']];
        const x0 = W * 0.08;
        const y0 = H * 0.27;
        const w = W * 0.84;
        const h = H * 0.4;
        g.fillStyle = 'rgba(230,232,227,0.06)';
        g.fillRect(x0, y0, w, h);
        g.strokeStyle = 'rgba(230,232,227,0.35)';
        g.lineWidth = 1;
        g.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
        g.fillStyle = 'rgba(230,232,227,0.12)';
        g.fillRect(x0, y0, w, 34 * u);
        logo(g, x0 + 20 * u, y0 + 17 * u, 18 * u, 1);
        g.fillStyle = PAPER;
        g.font = `600 ${Math.round(12 * u)}px "Courier Prime", monospace`;
        g.textAlign = 'left';
        g.fillText('RÈGLES DU POSTE · DOCUMENT RH-01', x0 + 38 * u, y0 + 21 * u);
        g.font = `${Math.round(14 * u)}px "Courier Prime", monospace`;
        rules.forEach((lines, i) => {
          const at = [0.08, 0.3, 0.55][i];
          if (k < at) return;
          g.globalAlpha = Math.min(1, (k - at) * 8);
          const ry = y0 + (70 + i * 60) * u;
          g.strokeStyle = PAPER;
          g.strokeRect(x0 + 18 * u, ry - 11 * u, 12 * u, 12 * u);
          g.fillText('✓', x0 + 19.5 * u, ry - 0.5 * u);
          lines.forEach((l, j) => g.fillText(l, x0 + 40 * u, ry + j * 18 * u));
          g.globalAlpha = 1;
        });
      },
    },
    {
      start: 29300,
      end: 33500,
      caption: ['Bonne première journée,', `${name}.`],
      draw: (g, W, H, k) => logo(g, W / 2, H * 0.4, 70 * u, 1 - Math.max(0, k - 0.75) * 4),
    },
  ];
  const total = shots[shots.length - 1].end;
  const stamps = [21300 + 0.08 * 8000, 21300 + 0.3 * 8000, 21300 + 0.55 * 8000];
  const played = new Set<number>();

  let t0 = 0;
  let raf = 0;
  let finished = false;
  startPad();
  playJingle();
  const finish = () => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    stopPad();
    wrap.classList.add('out');
    setTimeout(() => wrap.remove(), 500);
    done();
  };

  const frame = (now: number) => {
    if (!t0) t0 = now;
    const t = now - t0;
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0f1518');
    bg.addColorStop(1, '#36434a');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    const shot = shots.find((s) => t >= s.start && t < s.end);
    if (shot) {
      const k = (t - shot.start) / (shot.end - shot.start);
      const fade = Math.min(1, (t - shot.start) / 600, (shot.end - t) / 600);
      g.globalAlpha = fade;
      shot.draw(g, W, H, k, t);
      g.globalAlpha = fade;
      g.fillStyle = PAPER;
      g.textAlign = 'center';
      shot.caption.forEach((line, i) => {
        g.font = i === 0 && shot.start === 0 ? `600 ${Math.round(20 * u)}px "Pixelify Sans", monospace` : `${Math.round(15 * u)}px "Courier Prime", monospace`;
        g.fillText(line, W / 2, H * 0.8 + i * 24 * u);
      });
      g.globalAlpha = 1;
    }
    stamps.forEach((st, i) => {
      if (t >= st && !played.has(i)) {
        played.add(i);
        sfx('stamp', true);
      }
    });
    filmLook(g, W, H, grain, H * 0.075);
    if (t >= total) return finish();
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  skip.addEventListener('click', finish);
}
