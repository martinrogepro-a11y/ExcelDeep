import type { MusicStyle } from '../data/content';

// Tout le son est synthétisé : aucun fichier, aucun droit à gérer pour le prototype.

export type Sfx = 'click' | 'paper' | 'drop' | 'stamp' | 'bag' | 'error' | 'cash' | 'notify' | 'bell' | 'fanfare' | 'sign';

let ctx: AudioContext | null = null;
let master: GainNode;
let sfxBus: GainNode;
let musicBus: GainNode;
let musicFilter: BiquadFilterNode;
let noiseBuf: AudioBuffer;
let sfxOn = true;
let musicOn = true;
const lastPlayed: Partial<Record<Sfx, number>> = {};

function ensure(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
  } catch {
    return null;
  }
  master = ctx.createGain();
  master.gain.value = 0.8;
  master.connect(ctx.destination);
  sfxBus = ctx.createGain();
  sfxBus.gain.value = sfxOn ? 0.55 : 0;
  sfxBus.connect(master);
  musicFilter = ctx.createBiquadFilter();
  musicFilter.type = 'lowpass';
  musicFilter.frequency.value = 5200;
  musicBus = ctx.createGain();
  musicBus.gain.value = musicOn ? 0.32 : 0;
  musicFilter.connect(musicBus);
  musicBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

/** À appeler sur le premier geste : les navigateurs bloquent le son avant. */
export function unlockAudio(): void {
  const c = ensure();
  if (c && c.state === 'suspended') void c.resume();
}

export function setSfx(on: boolean): void {
  sfxOn = on;
  if (ctx) sfxBus.gain.setTargetAtTime(on ? 0.55 : 0, ctx.currentTime, 0.05);
}

export function setMusic(on: boolean): void {
  musicOn = on;
  if (ctx) musicBus.gain.setTargetAtTime(on ? 0.32 : 0, ctx.currentTime, 0.2);
}

/* ------------------------------------------------------------ briques */

interface ToneOpts {
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  release?: number;
  to?: number;
  dest?: AudioNode;
  detune?: number;
}

function tone(freq: number, at: number, dur: number, o: ToneOpts = {}): void {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, at);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, at + dur);
  if (o.detune) osc.detune.value = o.detune;
  const peak = o.gain ?? 0.3;
  const a = o.attack ?? 0.005;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + a);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur + (o.release ?? 0.05));
  osc.connect(g);
  g.connect(o.dest ?? sfxBus);
  osc.start(at);
  osc.stop(at + dur + (o.release ?? 0.05) + 0.02);
}

function noise(at: number, dur: number, filter: BiquadFilterType, freq: number, gain: number, dest?: AudioNode, q = 1): void {
  if (!ctx) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f);
  f.connect(g);
  g.connect(dest ?? sfxBus);
  src.start(at, Math.random() * 0.5);
  src.stop(at + dur + 0.02);
}

/* ------------------------------------------------------------ bruitages */

/** `soft` : version discrète, pour ce que la macro fait toute seule. */
export function sfx(name: Sfx, soft = false): void {
  if (!sfxOn) return;
  const c = ensure();
  if (!c || c.state !== 'running') return;
  const t = c.currentTime;
  // pas de mitraillette quand la production s'accélère
  if ((lastPlayed[name] ?? 0) > t - (soft ? 0.12 : 0.03)) return;
  lastPlayed[name] = t;
  const v = soft ? 0.35 : 1;
  switch (name) {
    case 'click':
      tone(1800, t, 0.012, { type: 'square', gain: 0.05 * v });
      break;
    case 'paper':
      noise(t, 0.09, 'highpass', 3200, 0.22 * v);
      noise(t + 0.03, 0.06, 'bandpass', 1800, 0.12 * v);
      break;
    case 'drop':
      tone(180, t, 0.08, { to: 90, gain: 0.35 * v });
      noise(t, 0.05, 'lowpass', 900, 0.2 * v);
      break;
    case 'stamp':
      tone(120, t, 0.12, { to: 55, gain: 0.6 * v, type: 'triangle' });
      noise(t, 0.08, 'lowpass', 1400, 0.5 * v);
      noise(t + 0.01, 0.03, 'highpass', 4000, 0.15 * v);
      break;
    case 'bag':
      tone(95, t, 0.14, { to: 60, gain: 0.45 * v });
      noise(t, 0.12, 'lowpass', 600, 0.35 * v);
      break;
    case 'error':
      tone(140, t, 0.16, { type: 'square', gain: 0.08 });
      tone(132, t, 0.16, { type: 'square', gain: 0.08 });
      break;
    case 'cash':
      tone(1046, t, 0.06, { type: 'triangle', gain: 0.18 });
      tone(1568, t + 0.06, 0.18, { type: 'triangle', gain: 0.16 });
      break;
    case 'notify':
      // carillon maison : trois notes montantes
      [659, 880, 1175].forEach((f, i) => tone(f, t + i * 0.09, 0.22, { type: 'sine', gain: 0.16 }));
      break;
    case 'bell':
      tone(1980, t, 0.25, { gain: 0.12 });
      tone(2490, t + 0.1, 0.3, { gain: 0.1 });
      break;
    case 'fanfare':
      [523, 659, 784, 1046].forEach((f, i) => tone(f, t + i * 0.11, 0.3, { type: 'triangle', gain: 0.16 }));
      break;
    case 'sign':
      noise(t, 0.25, 'bandpass', 2600, 0.12, undefined, 2);
      break;
  }
}

export function vibrate(ms = 8): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // pas de vibreur
  }
}

/* ------------------------------------------------------------ ambiance du dézoom */

let drone: { stop(): void } | null = null;

/** Nappe grave et souffle, pour la cinématique de promotion. */
export function startDrone(): void {
  const c = ensure();
  if (!c || c.state !== 'running' || drone) return;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(sfxOn ? 0.5 : 0.0001, c.currentTime + 1.2);
  g.connect(master);
  const oscs = [55, 82.4, 110.5].map((f, i) => {
    const o = c.createOscillator();
    o.type = i === 2 ? 'triangle' : 'sine';
    o.frequency.value = f;
    o.detune.value = i * 4;
    const og = c.createGain();
    og.gain.value = i === 2 ? 0.05 : 0.14;
    o.connect(og);
    og.connect(g);
    o.start();
    return o;
  });
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 400;
  const ng = c.createGain();
  ng.gain.value = 0.06;
  src.connect(f);
  f.connect(ng);
  ng.connect(g);
  src.start();
  // la musique s'efface pendant la cinématique
  musicBus.gain.setTargetAtTime(0, c.currentTime, 0.4);
  drone = {
    stop() {
      const t = c.currentTime;
      g.gain.setTargetAtTime(0.0001, t, 0.4);
      oscs.forEach((o) => o.stop(t + 2));
      src.stop(t + 2);
      musicBus.gain.setTargetAtTime(musicOn ? 0.32 : 0, t + 0.5, 0.6);
      drone = null;
    },
  };
}

export function stopDrone(): void {
  drone?.stop();
}

/* ------------------------------------------------------------ musique */

interface Preset {
  bpm: number;
  swing: number;
  chords: number[][];
  bass: number[];
  lead: OscillatorType;
  pad: OscillatorType;
  drums: 'brush' | 'lofi' | 'synth';
  cutoff: number;
}

const N = (m: number) => 440 * 2 ** ((m - 69) / 12);

const PRESETS: Record<MusicStyle, Preset> = {
  ascenseur: { bpm: 96, swing: 0.08, chords: [[65, 69, 72, 76], [62, 65, 69, 72], [67, 70, 74, 77], [60, 64, 67, 70]], bass: [41, 38, 43, 36], lead: 'sine', pad: 'sine', drums: 'brush', cutoff: 4200 },
  lofi: { bpm: 76, swing: 0.16, chords: [[57, 60, 64, 67], [62, 65, 69, 72], [55, 59, 62, 65], [60, 64, 67, 71]], bass: [45, 38, 43, 36], lead: 'triangle', pad: 'triangle', drums: 'lofi', cutoff: 1900 },
  synth: { bpm: 118, swing: 0, chords: [[64, 67, 71], [60, 64, 67], [67, 71, 74], [62, 66, 69]], bass: [40, 36, 43, 38], lead: 'square', pad: 'sawtooth', drums: 'synth', cutoff: 3000 },
};

let timer: number | null = null;
let style: MusicStyle | null = null;
let step = 0;
let nextTime = 0;
let melody: number[] = [];

function newMelody(p: Preset): number[] {
  // une phrase de 16 doubles-croches par mesure, sur les notes de l'accord
  const out: number[] = [];
  for (let bar = 0; bar < 4; bar++) {
    const chord = p.chords[bar];
    for (let i = 0; i < 16; i++) {
      const play = i % 4 === 0 ? Math.random() < 0.55 : Math.random() < 0.18;
      out.push(play ? chord[Math.floor(Math.random() * chord.length)] + 12 : 0);
    }
  }
  return out;
}

function schedule(): void {
  if (!ctx || !style) return;
  const p = PRESETS[style];
  const sixteenth = 60 / p.bpm / 4;
  while (nextTime < ctx.currentTime + 0.15) {
    const s = step % 64;
    const bar = Math.floor(s / 16);
    const i = s % 16;
    const at = nextTime + (i % 2 === 1 ? p.swing * sixteenth * 2 : 0);
    if (s === 0) melody = newMelody(p);
    const dest = musicFilter;
    // accord tenu en début de mesure
    if (i === 0) for (const m of p.chords[bar]) tone(N(m), at, sixteenth * 14, { type: p.pad, gain: p.pad === 'sawtooth' ? 0.025 : 0.05, attack: 0.08, release: 0.3, dest, detune: Math.random() * 6 - 3 });
    // basse
    const bassHits = p.drums === 'brush' ? [0, 6, 8, 14] : p.drums === 'synth' ? [0, 4, 8, 12] : [0, 10];
    if (bassHits.includes(i)) tone(N(p.bass[bar]), at, sixteenth * (p.drums === 'synth' ? 1.5 : 3), { type: 'triangle', gain: 0.22, dest });
    // mélodie
    const m = melody[s];
    if (m) tone(N(m), at, sixteenth * (p.lead === 'square' ? 1 : 2.5), { type: p.lead, gain: p.lead === 'square' ? 0.035 : 0.09, dest, release: 0.15 });
    // batterie
    if (p.drums === 'brush') {
      if (i % 2 === 0) noise(at, 0.06, 'highpass', 6000, i % 4 === 0 ? 0.05 : 0.03, dest);
    } else if (p.drums === 'lofi') {
      if (i === 0 || i === 7 || i === 10) tone(110, at, 0.12, { to: 45, gain: 0.4, dest });
      if (i === 4 || i === 12) noise(at, 0.14, 'bandpass', 1800, 0.18, dest);
      if (i % 2 === 0) noise(at, 0.03, 'highpass', 7000, 0.04, dest);
    } else {
      if (i % 4 === 0) tone(140, at, 0.1, { to: 50, gain: 0.35, dest });
      if (i === 4 || i === 12) noise(at, 0.1, 'highpass', 2500, 0.12, dest);
      noise(at, 0.02, 'highpass', 9000, 0.03, dest);
    }
    nextTime += sixteenth;
    step++;
  }
}

export function playMusic(next: MusicStyle): void {
  const c = ensure();
  if (!c) return;
  musicFilter.frequency.setTargetAtTime(PRESETS[next].cutoff, c.currentTime, 0.1);
  if (style === next && timer !== null) return;
  style = next;
  step = 0;
  nextTime = c.currentTime + 0.1;
  if (timer === null) timer = window.setInterval(schedule, 40);
}

export function stopMusic(): void {
  if (timer !== null) clearInterval(timer);
  timer = null;
  style = null;
}

export function isMusicPlaying(): boolean {
  return timer !== null;
}
