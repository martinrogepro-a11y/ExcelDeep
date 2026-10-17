import { sfx, startDrone, stopDrone } from '../audio/audio';
import { PLAYER_ACCENT, drawPerson, filmLook, makeGrain } from './scene';

// Film d'accueil des nouveaux collaborateurs : ton institutionnel, images froides,
// tout est un peu trop calme et un peu trop synchronisé.

interface Shot {
  start: number;
  end: number;
  caption: string[];
  draw(g: CanvasRenderingContext2D, W: number, H: number, k: number, t: number): void;
}

const INK = 'rgb(28,32,35)';

function logo(g: CanvasRenderingContext2D, cx: number, cy: number, size: number, k: number): void {
  const cell = size / 3;
  const order = [0, 1, 2, 5, 4, 3, 6, 8, 7];
  order.forEach((idx, n) => {
    const a = Math.min(1, Math.max(0, k * 12 - n));
    if (a <= 0) return;
    const x = cx - size / 2 + (idx % 3) * cell;
    const y = cy - size / 2 + Math.floor(idx / 3) * cell;
    g.globalAlpha = a;
    g.fillStyle = idx === 7 ? '#f2c14e' : '#e6e8e3';
    g.fillRect(x + 2, y + 2, cell - 4, cell - 4);
  });
  g.globalAlpha = 1;
}

function deskWithPerson(g: CanvasRenderingContext2D, x: number, y: number, s: number, accent: boolean, bob: number, alpha = 1, personAlpha = 1): void {
  const base = g.globalAlpha;
  g.globalAlpha = base * alpha;
  g.fillStyle = 'rgb(56,48,42)';
  g.fillRect(x - 34 * s, y - 30 * s, 68 * s, 30 * s);
  g.fillStyle = 'rgb(196,190,170)';
  g.fillRect(x - 17 * s, y - 58 * s, 34 * s, 24 * s);
  g.fillStyle = 'rgb(0,150,150)';
  g.fillRect(x - 15 * s, y - 56 * s, 30 * s, 20 * s);
  drawPerson(g, x, y + 4 * s + bob * s, s, { pose: 'sit', accent: accent ? PLAYER_ACCENT : undefined, grade: 0, alpha: personAlpha }, INK);
  g.globalAlpha = base;
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

  const shots: Shot[] = [
    {
      start: 0,
      end: 4500,
      caption: ['DEEPCORP', 'Programme d’accueil des nouveaux collaborateurs'],
      draw: (g, W, H, k) => logo(g, W / 2, H * 0.4, Math.min(W, H) * 0.32, k),
    },
    {
      start: 4500,
      end: 9500,
      caption: ['Votre poste a été préparé', 'avant votre arrivée.'],
      draw: (g, W, H, k) => {
        const s = 2.2 + k * 0.4;
        const glow = g.createRadialGradient(W / 2, H * 0.48, 0, W / 2, H * 0.48, 160 * s);
        glow.addColorStop(0, 'rgba(0,160,160,0.18)');
        glow.addColorStop(1, 'rgba(0,160,160,0)');
        g.fillStyle = glow;
        g.fillRect(0, 0, W, H);
        // le poste est vide, puis quelqu'un y est assis
        deskWithPerson(g, W / 2, H * 0.6, s, true, 0, 1, k > 0.45 ? Math.min(1, (k - 0.45) * 4) : 0);
      },
    },
    {
      start: 9500,
      end: 15000,
      caption: ['Chaque collaborateur', 'est à sa place.'],
      draw: (g, W, H, k, t) => {
        // rangées identiques, tout le monde tape au même rythme
        const bob = Math.sin(t / 160) > 0 ? 1 : 0;
        const pan = k * 40;
        for (let row = 0; row < 4; row++) {
          const s = 0.7 + row * 0.35;
          const y = H * (0.36 + row * 0.12);
          const gap = 92 * s;
          const fog = 1 - (3 - row) * 0.22;
          for (let x = -gap + ((pan * s) % gap); x < W + gap; x += gap) deskWithPerson(g, x, y, s, false, bob, fog);
        }
      },
    },
    {
      start: 15000,
      end: 20500,
      caption: ['Aujourd’hui,', 'vous en faites partie.'],
      draw: (g, W, H, k) => {
        const cols = 7;
        const rows = 5;
        const s = Math.min(W, H) / 470;
        const sx = W / (cols + 1);
        const sy = (H * 0.52) / rows;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const me = r === 3 && c === 4;
            if (me && k < 0.45) continue;
            drawPerson(g, sx * (c + 1), H * 0.18 + sy * (r + 1), s, { pose: 'stand', accent: me ? PLAYER_ACCENT : undefined, grade: 0 }, me ? INK : 'rgb(70,78,82)');
          }
        }
        g.fillStyle = '#e6e8e3';
        g.font = `600 ${Math.round(26 * s + 6)}px "Courier Prime", monospace`;
        g.textAlign = 'center';
        g.fillText(`EFFECTIF : ${k < 0.45 ? '4 112' : '4 113'}`, W / 2, H * 0.16);
      },
    },
    {
      start: 20500,
      end: 28500,
      caption: [],
      draw: (g, W, H, k) => {
        const rules = ['1. Traitez ce qui vous est confié.', '2. Ne laissez rien s’accumuler.', '3. Les niveaux inférieurs', '    ne vous concernent pas.'];
        g.fillStyle = 'rgba(230,232,227,0.08)';
        g.fillRect(W * 0.06, H * 0.3, W * 0.88, H * 0.34);
        g.fillStyle = '#e6e8e3';
        g.font = '600 14px "Courier Prime", monospace';
        g.textAlign = 'left';
        g.fillText('RÈGLES DU POSTE', W * 0.11, H * 0.36);
        g.font = '13.5px "Courier Prime", monospace';
        rules.forEach((r, i) => {
          const at = [0.08, 0.3, 0.55, 0.55][i];
          if (k < at) return;
          g.globalAlpha = Math.min(1, (k - at) * 8);
          g.fillText(r, W * 0.11, H * (0.43 + i * 0.05 + (i === 3 ? -0.015 : 0)));
          g.globalAlpha = 1;
        });
      },
    },
    {
      start: 28500,
      end: 32500,
      caption: ['Bonne première journée,', `${name}.`],
      draw: (g, W, H, k) => logo(g, W / 2, H * 0.4, Math.min(W, H) * 0.2, 1 - Math.max(0, k - 0.7) * 3),
    },
  ];
  const total = shots[shots.length - 1].end;
  const ruleTimes = [20500 + 0.08 * 8000, 20500 + 0.3 * 8000, 20500 + 0.55 * 8000];
  const played = new Set<number>();

  let t0 = 0;
  let raf = 0;
  let finished = false;
  startDrone();
  sfx('notify');
  const finish = () => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    stopDrone();
    wrap.classList.add('out');
    setTimeout(() => wrap.remove(), 500);
    done();
  };

  const frame = (now: number) => {
    if (!t0) t0 = now;
    const t = now - t0;
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#11171a');
    bg.addColorStop(1, '#3a474d');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    const shot = shots.find((s) => t >= s.start && t < s.end);
    if (shot) {
      const k = (t - shot.start) / (shot.end - shot.start);
      const fade = Math.min(1, (t - shot.start) / 500, (shot.end - t) / 500);
      g.globalAlpha = fade;
      shot.draw(g, W, H, k, t);
      g.globalAlpha = fade;
      g.fillStyle = '#e6e8e3';
      g.textAlign = 'center';
      shot.caption.forEach((line, i) => {
        g.font = i === 0 && shot.start === 0 ? '600 22px "Pixelify Sans", monospace' : '15px "Courier Prime", monospace';
        g.fillText(line, W / 2, H * 0.78 + i * 24);
      });
      g.globalAlpha = 1;
    }
    ruleTimes.forEach((rt, i) => {
      if (t >= rt && !played.has(i)) {
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
