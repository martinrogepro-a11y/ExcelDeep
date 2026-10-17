// Illustrations 2D partagées : silhouettes et postes de travail, vus de face.
// Unités « monde » : 1 = un centimètre environ ; y négatif vers le haut, 0 = le sol.

export type RGB = [number, number, number];
export const FOG_RGB: RGB = [118, 132, 138];

export function mix(c: RGB, k: number, to: RGB = FOG_RGB): string {
  const t = Math.max(0, Math.min(1, k));
  return `rgb(${c.map((v, i) => Math.round(v + (to[i] - v) * t)).join(',')})`;
}

export function rgba(c: RGB, a: number): string {
  return `rgba(${c.join(',')},${a})`;
}

/** Variation de silhouette : coupe de cheveux, carrure. */
export interface Look {
  hair: 0 | 1 | 2 | 3;
  width: number;
}

export function lookFor(seed: number): Look {
  const h = Math.abs(Math.sin(seed * 12.9898) * 43758.5453) % 1;
  return { hair: Math.floor(h * 4) as Look['hair'], width: 0.92 + ((h * 7) % 1) * 0.18 };
}

const BODY: RGB = [27, 31, 34];
const CHAIR: RGB = [38, 42, 46];
export const PLAYER: RGB = [226, 178, 60];

interface PersonOpts {
  look?: Look;
  fog?: number;
  alpha?: number;
  /** Couleur du joueur, sinon silhouette sombre. */
  accent?: RGB;
  grade?: number;
  /** Reflet de l'écran sur les épaules. */
  rim?: RGB;
}

function head(g: CanvasRenderingContext2D, cx: number, cy: number, look: Look, fill: string): void {
  g.fillStyle = fill;
  g.beginPath();
  g.arc(cx, cy, 5.6, 0, Math.PI * 2);
  g.fill();
  if (look.hair === 1) {
    // chignon
    g.beginPath();
    g.arc(cx, cy - 5.2, 2.6, 0, Math.PI * 2);
    g.fill();
  } else if (look.hair === 2) {
    // cheveux longs
    g.beginPath();
    g.roundRect(cx - 6, cy - 2, 12, 11, 3);
    g.fill();
  } else if (look.hair === 3) {
    // coupe en brosse
    g.fillRect(cx - 5, cy - 6.4, 10, 2.4);
  }
}

/** Assis de dos devant son écran, les bras vers le clavier. */
export function drawSeated(g: CanvasRenderingContext2D, x: number, y: number, s: number, time: number, o: PersonOpts = {}): void {
  const look = o.look ?? { hair: 0, width: 1 };
  const fog = o.fog ?? 0;
  if ((o.alpha ?? 1) <= 0.01) return;
  g.save();
  g.globalAlpha *= o.alpha ?? 1;
  g.translate(x, y);
  g.scale(s, s);
  const body = mix(BODY, fog);
  const chair = mix(CHAIR, fog);
  const torso = o.accent ? mix(o.accent, fog * 0.6) : body;
  const w = 9.5 * look.width;
  const type = Math.sin(time / 90) * 0.7;

  // pied de chaise : étoile et roulettes
  g.strokeStyle = chair;
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(-10, -1.5);
  g.lineTo(10, -1.5);
  g.moveTo(0, -1.5);
  g.lineTo(0, -16);
  g.stroke();
  g.fillStyle = chair;
  for (const wx of [-10, 0, 10]) {
    g.beginPath();
    g.arc(wx, -1.2, 1.4, 0, Math.PI * 2);
    g.fill();
  }
  g.fillRect(-11, -19, 22, 3.5);

  // bras le long du corps, les coudes qui bougent un peu en tapant
  g.strokeStyle = torso;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = 2.8;
  g.beginPath();
  g.moveTo(-w + 2.5, -45);
  g.lineTo(-w + 0.2 + type * 0.4, -33);
  g.lineTo(-5, -30.5 + type * 0.4);
  g.moveTo(w - 2.5, -45);
  g.lineTo(w - 0.2 - type * 0.4, -33);
  g.lineTo(5, -30.5 - type * 0.4);
  g.stroke();

  // buste : épaules rondes, flancs presque droits
  g.fillStyle = torso;
  g.beginPath();
  g.moveTo(-w + 1.5, -22);
  g.lineTo(-w + 0.5, -42);
  g.quadraticCurveTo(-w + 0.5, -48.5, -w + 6, -49);
  g.lineTo(w - 6, -49);
  g.quadraticCurveTo(w - 0.5, -48.5, w - 0.5, -42);
  g.lineTo(w - 1.5, -22);
  g.closePath();
  g.fill();
  if (o.accent && o.grade === 1) {
    // col de chemise
    g.fillStyle = mix([235, 232, 220], fog);
    g.fillRect(-3, -48.5, 6, 1.6);
  }
  if (o.accent && o.grade === 2) {
    // veste : couture et épaules sombres
    g.fillStyle = mix([40, 36, 30], fog);
    g.fillRect(-0.5, -47, 1, 22);
    g.fillRect(-w, -46, 3, 9);
    g.fillRect(w - 3, -46, 3, 9);
  }
  if (o.rim) {
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = rgba(o.rim, 0.35);
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(-w + 0.5, -42);
    g.quadraticCurveTo(-w + 0.5, -48.5, -w + 6, -49);
    g.lineTo(w - 6, -49);
    g.quadraticCurveTo(w - 0.5, -48.5, w - 0.5, -42);
    g.stroke();
    g.globalCompositeOperation = 'source-over';
  }
  g.fillStyle = body;
  g.fillRect(-1.8, -52, 3.6, 4.5);
  head(g, 0, -57, look, body);

  // dossier de chaise devant le bas du dos
  g.fillStyle = chair;
  g.beginPath();
  g.roundRect(-9, -36, 18, 15, 4);
  g.fill();
  g.restore();
}

/** Debout, de profil, en train de marcher (phase en radians). */
export function drawWalker(g: CanvasRenderingContext2D, x: number, y: number, s: number, phase: number, facing: 1 | -1, o: PersonOpts = {}): void {
  const look = o.look ?? { hair: 0, width: 1 };
  const fog = o.fog ?? 0;
  if ((o.alpha ?? 1) <= 0.01) return;
  g.save();
  g.globalAlpha *= o.alpha ?? 1;
  g.translate(x, y - Math.abs(Math.sin(phase)) * 1.2);
  g.scale(s * facing, s);
  const body = mix(BODY, fog);
  const torso = o.accent ? mix(o.accent, fog * 0.6) : body;
  const leg = (a: number, back: boolean) => {
    const hx = 0;
    const hy = -34;
    const kx = hx + Math.sin(a) * 16;
    const ky = hy + Math.cos(a) * 16;
    const bend = back ? 0.6 : 0.1;
    const fx = kx + Math.sin(a - bend) * 16;
    const fy = ky + Math.cos(a - bend) * 16;
    g.beginPath();
    g.moveTo(hx, hy);
    g.lineTo(kx, ky);
    g.lineTo(fx, Math.min(0, fy));
    g.lineTo(fx + 3.5, Math.min(0, fy));
    g.stroke();
  };
  const a = Math.sin(phase) * 0.45;
  g.strokeStyle = body;
  g.lineWidth = 4;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  leg(a, a < 0);
  leg(-a, -a < 0);
  // bras arrière, buste, bras avant
  g.lineWidth = 3.2;
  g.strokeStyle = torso;
  g.beginPath();
  g.moveTo(0, -55);
  g.lineTo(-Math.sin(phase) * 7, -38);
  g.stroke();
  g.fillStyle = torso;
  g.beginPath();
  g.roundRect(-6.5 * look.width, -60, 13 * look.width, 27, 5);
  g.fill();
  if (o.accent && o.grade === 2) {
    g.fillStyle = mix([40, 36, 30], fog);
    g.fillRect(-5.5, -60, 3, 27);
  }
  g.beginPath();
  g.moveTo(0, -55);
  g.lineTo(Math.sin(phase) * 7, -38);
  g.stroke();
  g.fillStyle = body;
  g.fillRect(-1.6, -64, 3.2, 4.5);
  head(g, 0.8, -68.5, look, body);
  g.restore();
}

/** Bureau vu de face : plateau, cathodique, clavier, quelques objets. */
export function drawStation(g: CanvasRenderingContext2D, x: number, y: number, s: number, o: { screen: RGB | null; fog: number; seed: number; time: number }): void {
  const f = o.fog;
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  // ombre au sol
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.beginPath();
  g.ellipse(0, -0.5, 42, 3, 0, 0, Math.PI * 2);
  g.fill();
  // pieds et façade
  g.fillStyle = mix([52, 44, 38], f);
  g.fillRect(-36, -28, 3, 28);
  g.fillRect(33, -28, 3, 28);
  g.fillStyle = mix([62, 52, 44], f);
  g.fillRect(-34, -27, 68, 17);
  // plateau, avec un liseré clair
  g.fillStyle = mix([96, 80, 64], f);
  g.fillRect(-38, -31, 76, 4);
  g.fillStyle = mix([128, 108, 86], f);
  g.fillRect(-38, -31, 76, 0.8);

  // objets, différents d'un bureau à l'autre
  const r = (k: number) => Math.abs(Math.sin(o.seed * 91.7 + k * 13.3)) % 1;
  if (r(1) < 0.55) {
    // tasse
    g.fillStyle = mix([214, 210, 198], f);
    g.fillRect(24, -36.5, 4.5, 5.5);
    g.strokeStyle = mix([214, 210, 198], f);
    g.lineWidth = 0.9;
    g.beginPath();
    g.arc(29, -34, 1.6, -Math.PI / 2, Math.PI / 2);
    g.stroke();
  }
  if (r(2) < 0.6) {
    // pile de papiers
    g.fillStyle = mix([226, 222, 206], f);
    g.fillRect(-31, -33.5, 12, 2.5);
    g.fillStyle = mix([206, 200, 182], f);
    g.fillRect(-30, -35, 11, 1.6);
  }
  if (r(3) < 0.35) {
    // plante
    g.fillStyle = mix([110, 70, 48], f);
    g.fillRect(-35, -37, 6, 6);
    g.fillStyle = mix([58, 92, 60], f);
    for (const [lx, ly, rr] of [
      [-32, -41, 3.4],
      [-35, -39, 2.6],
      [-29, -40, 2.8],
    ]) {
      g.beginPath();
      g.arc(lx, ly, rr, 0, Math.PI * 2);
      g.fill();
    }
  }

  // moniteur cathodique : boîtier, dalle, pied
  g.fillStyle = mix([150, 145, 128], f);
  g.beginPath();
  g.moveTo(-14, -65);
  g.lineTo(14, -65);
  g.lineTo(17, -63);
  g.lineTo(-17, -63);
  g.fill();
  g.fillStyle = mix([200, 194, 174], f);
  g.beginPath();
  g.roundRect(-17, -63, 34, 26, 2.5);
  g.fill();
  g.fillStyle = mix([170, 164, 146], f);
  g.fillRect(-4, -37, 8, 4);
  g.fillRect(-8, -33, 16, 2);
  if (o.screen) {
    const sc = o.screen;
    const grad = g.createRadialGradient(0, -50, 1, 0, -50, 17);
    grad.addColorStop(0, rgba(sc.map((v) => Math.min(255, v + 40)) as RGB, 1));
    grad.addColorStop(1, rgba(sc, 1));
    g.fillStyle = grad;
    g.beginPath();
    g.roundRect(-14, -60, 28, 20, 2.5);
    g.fill();
    // une fenêtre ouverte, des lignes qui défilent
    g.fillStyle = 'rgba(0,0,90,0.55)';
    g.fillRect(-11, -57.5, 22, 1.6);
    g.fillStyle = 'rgba(255,255,255,0.4)';
    const scroll = Math.floor(o.time / 400 + o.seed * 7) % 4;
    for (let i = 0; i < 4; i++) g.fillRect(-10, -54 + i * 3, i === scroll ? 12 : 18, 0.9);
  } else {
    g.fillStyle = mix([34, 38, 40], f);
    g.beginPath();
    g.roundRect(-14, -60, 28, 20, 2.5);
    g.fill();
  }
  g.fillStyle = o.screen ? '#46e05a' : mix([60, 60, 60], f);
  g.fillRect(12, -39.5, 1.2, 1.2);
  // clavier
  g.fillStyle = mix([186, 182, 166], f);
  g.fillRect(-12, -32.6, 24, 1.8);
  g.restore();
}
