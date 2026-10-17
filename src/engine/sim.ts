import {
  ASSIST_LEVEL,
  BASE_BUFFER,
  BASE_COMBO_MAX,
  BASE_OFFLINE_HOURS,
  CAFE_MINUTES,
  CHAIN,
  COMBO_STEP,
  COST_GROWTH,
  MAILS,
  MILESTONES,
  POSTES,
  STAFF_FACTOR,
  SUPPLIES,
  TASKS,
  type MailTrigger,
  type StageId,
  type SupplyDef,
} from '../data/content';
import type { GameState } from './state';

export type Stage = 'manuel' | 'assiste' | 'auto';

function ownedSupplies(s: GameState): SupplyDef[] {
  return SUPPLIES.filter((d) => s.supplies.includes(d.id));
}

export function isUnlocked(s: GameState, id: StageId): boolean {
  return POSTES.some((p) => p.id <= s.poste && p.unlocks.includes(id));
}

export function unlockedChain(s: GameState): StageId[] {
  return CHAIN.filter((id) => isUnlocked(s, id));
}

export function stageOf(s: GameState, id: StageId): Stage {
  const t = s.tasks[id];
  if (t.staff) return 'auto';
  return t.level >= ASSIST_LEVEL ? 'assiste' : 'manuel';
}

export function milestonesReached(level: number): number {
  return MILESTONES.filter((m) => level >= m).length;
}

export function nextMilestone(level: number): number | null {
  return MILESTONES.find((m) => m > level) ?? null;
}

export function taskMult(s: GameState, id: StageId): number {
  let m = 2 ** milestonesReached(s.tasks[id].level);
  for (const d of ownedSupplies(s)) {
    if (d.effect.kind === 'taskMult' && d.effect.task === id) m *= d.effect.factor;
  }
  return m;
}

export function globalMult(s: GameState, now: number): number {
  let m = 1;
  if (now < s.cafeUntil) m *= 2;
  if (now < s.frenzyUntil) m *= 7;
  for (const d of ownedSupplies(s)) if (d.effect.kind === 'global') m *= d.effect.factor;
  return m;
}

export function comboMax(s: GameState): number {
  let max = BASE_COMBO_MAX;
  for (const d of ownedSupplies(s)) if (d.effect.kind === 'combo') max += d.effect.add;
  return max;
}

export function comboLevel(s: GameState): number {
  return Math.min(comboMax(s), 1 + Math.floor(s.streak / COMBO_STEP));
}

export function offlineCapSeconds(s: GameState): number {
  let h = BASE_OFFLINE_HOURS;
  for (const d of ownedSupplies(s)) if (d.effect.kind === 'offline') h += d.effect.hours;
  return h * 3600;
}

export function bufferCap(s: GameState): number {
  let cap = BASE_BUFFER;
  for (const d of ownedSupplies(s)) if (d.effect.kind === 'buffer') cap += d.effect.add;
  return cap;
}

export function cafeDurationMs(s: GameState): number {
  let min = CAFE_MINUTES;
  for (const d of ownedSupplies(s)) if (d.effect.kind === 'cafe') min += d.effect.minutes;
  return min * 60_000;
}

/** Unités traitées par seconde. Hors ligne, seules les tâches tenues par un subordonné tournent. */
export function autoRate(s: GameState, id: StageId, online: boolean): number {
  if (!isUnlocked(s, id)) return 0;
  const t = s.tasks[id];
  if (t.level < ASSIST_LEVEL && !t.staff) return 0;
  if (!online && !t.staff) return 0;
  const base = TASKS[id].autoBase * Math.max(t.level, 1) * taskMult(s, id);
  return t.staff ? base * STAFF_FACTOR : base;
}

/** Unités traitées par un geste réussi, avant le combo. */
export function perAction(s: GameState, id: StageId): number {
  return (1 + s.tasks[id].level * 0.25) * taskMult(s, id);
}

export function levelCost(s: GameState, id: StageId, n: number): number {
  const base = TASKS[id].baseCost * COST_GROWTH ** s.tasks[id].level;
  return (base * (COST_GROWTH ** n - 1)) / (COST_GROWTH - 1);
}

export function maxAffordable(s: GameState, id: StageId): number {
  const base = TASKS[id].baseCost * COST_GROWTH ** s.tasks[id].level;
  const n = Math.floor(Math.log((s.credits * (COST_GROWTH - 1)) / base + 1) / Math.log(COST_GROWTH));
  return Math.max(0, n);
}

export function buyLevels(s: GameState, id: StageId, n: number): boolean {
  if (n <= 0 || !isUnlocked(s, id)) return false;
  const cost = levelCost(s, id, n);
  if (cost > s.credits) return false;
  s.credits -= cost;
  s.tasks[id].level += n;
  return true;
}

export function canHire(s: GameState, id: StageId): boolean {
  const t = s.tasks[id];
  return isUnlocked(s, id) && !t.staff && t.level >= ASSIST_LEVEL && s.credits >= TASKS[id].staffCost;
}

export function hire(s: GameState, id: StageId): boolean {
  if (!canHire(s, id)) return false;
  s.credits -= TASKS[id].staffCost;
  s.tasks[id].staff = true;
  return true;
}

export function availableSupplies(s: GameState): SupplyDef[] {
  return SUPPLIES.filter((d) => d.minPoste <= s.poste && !s.supplies.includes(d.id));
}

export function buySupply(s: GameState, id: string): boolean {
  const d = SUPPLIES.find((x) => x.id === id);
  if (!d || s.supplies.includes(id) || d.minPoste > s.poste || s.credits < d.cost) return false;
  s.credits -= d.cost;
  s.supplies.push(id);
  return true;
}

function earn(s: GameState, amount: number): void {
  s.credits += amount;
  s.earnedTotal += amount;
}

/**
 * Fait sortir des unités d'une étape. La dernière étape débloquée les vend ;
 * les autres les posent dans leur stock pour l'étape suivante.
 */
function emit(s: GameState, id: StageId, units: number, gm: number, chain: StageId[]): number {
  const last = chain[chain.length - 1];
  if (id === last) {
    const value = units * TASKS[id].unitValue * gm;
    earn(s, value);
    return value;
  }
  s.buffers[id] += units;
  return 0;
}

/** Ce qui dépasse le stock est écoulé au tarif de l'étape qui l'a produit. */
function overflow(s: GameState, gm: number, chain: StageId[]): number {
  const cap = bufferCap(s);
  let gained = 0;
  for (const id of chain.slice(0, -1)) {
    if (s.buffers[id] > cap) {
      const extra = s.buffers[id] - cap;
      s.buffers[id] = cap;
      const value = extra * TASKS[id].unitValue * gm;
      earn(s, value);
      gained += value;
    }
  }
  return gained;
}

/** Avance la simulation de dt secondes. Renvoie les crédits gagnés. */
export function tick(s: GameState, dt: number, now: number, online: boolean): number {
  const chain = unlockedChain(s);
  const gm = globalMult(s, now);
  let gained = 0;
  chain.forEach((id, i) => {
    let units = autoRate(s, id, online) * dt;
    if (i > 0) {
      const prev = chain[i - 1];
      units = Math.min(units, s.buffers[prev]);
      s.buffers[prev] -= units;
    }
    if (units > 0) gained += emit(s, id, units, gm, chain);
  });
  gained += overflow(s, gm, chain);
  return gained;
}

/**
 * Geste manuel réussi sur une étape. Renvoie les unités réellement traitées
 * (0 si l'étape attend la précédente).
 */
export function manualAction(s: GameState, id: StageId, now: number, units = 1): number {
  const chain = unlockedChain(s);
  const i = chain.indexOf(id);
  if (i < 0) return 0;
  let n = units * perAction(s, id) * comboLevel(s);
  if (i > 0) {
    const prev = chain[i - 1];
    n = Math.min(n, s.buffers[prev]);
    if (n <= 0) return 0;
    s.buffers[prev] -= n;
  }
  s.streak += 1;
  emit(s, id, n, globalMult(s, now), chain);
  overflow(s, globalMult(s, now), chain);
  return n;
}

export function missAction(s: GameState): void {
  s.streak = 0;
}

/** Revenu théorique par seconde, pour l'affichage. */
export function incomeRate(s: GameState, now: number): number {
  const chain = unlockedChain(s);
  if (chain.length === 0) return 0;
  const gm = globalMult(s, now);
  let flow = Infinity;
  let income = 0;
  chain.forEach((id, i) => {
    const r = autoRate(s, id, true);
    const through = i === 0 ? r : Math.min(r, flow);
    if (i > 0) {
      // ce que l'étape suivante ne prend pas finit en débordement
      income += Math.max(0, flow - through) * TASKS[chain[i - 1]].unitValue * gm;
    }
    flow = through;
  });
  income += flow * TASKS[chain[chain.length - 1]].unitValue * gm;
  return income;
}

/** L'étape la plus lente de la chaîne, à améliorer en priorité. */
export function bottleneck(s: GameState): StageId | null {
  const chain = unlockedChain(s);
  if (chain.length < 2) return null;
  let worst: StageId | null = null;
  let worstRate = Infinity;
  for (const id of chain) {
    const r = autoRate(s, id, true);
    if (r < worstRate) {
      worstRate = r;
      worst = id;
    }
  }
  return worst;
}

export function offlineProgress(s: GameState, now: number): { seconds: number; gained: number } {
  const elapsed = Math.max(0, (now - s.lastSeen) / 1000);
  const seconds = Math.min(elapsed, offlineCapSeconds(s));
  let gained = 0;
  const step = 1;
  for (let t = 0; t < seconds; t += step) {
    gained += tick(s, Math.min(step, seconds - t), s.lastSeen + t * 1000, false);
  }
  return { seconds, gained };
}

export interface RequirementLine {
  label: string;
  done: boolean;
}

export function promotionStatus(s: GameState): { lines: RequirementLine[]; ready: boolean } | null {
  const req = POSTES[s.poste]?.requirement;
  if (!req) return null;
  const lines: RequirementLine[] = [
    { label: `Crédits gagnés au total : ${Math.floor(Math.min(s.earnedTotal, req.earned)).toLocaleString('fr-FR')} / ${req.earned.toLocaleString('fr-FR')}`, done: s.earnedTotal >= req.earned },
    ...req.assisted.map((id) => ({ label: `${TASKS[id].name} assisté (niveau ${ASSIST_LEVEL})`, done: s.tasks[id].level >= ASSIST_LEVEL || s.tasks[id].staff })),
    ...req.staffed.map((id) => ({ label: `${TASKS[id].name} tenu par ${TASKS[id].staffName}`, done: s.tasks[id].staff })),
  ];
  return { lines, ready: lines.every((l) => l.done) };
}

export function promote(s: GameState): boolean {
  const st = promotionStatus(s);
  if (!st?.ready) return false;
  if (s.poste + 1 >= POSTES.length) {
    s.demoDone = true;
    return true;
  }
  s.poste += 1;
  s.streak = 0;
  return true;
}

export function drinkCafe(s: GameState, now: number): boolean {
  if (s.cafes <= 0) return false;
  s.cafes -= 1;
  s.cafeUntil = Math.max(now, s.cafeUntil) + cafeDurationMs(s);
  return true;
}

function triggerMet(s: GameState, t: MailTrigger): boolean {
  switch (t.kind) {
    case 'start':
      return s.phase === 'desk';
    case 'sorted':
      return s.sortedCount >= t.count;
    case 'assisted':
      return s.tasks[t.task].level >= ASSIST_LEVEL;
    case 'staff':
      return s.tasks[t.task].staff;
    case 'poste':
      return s.poste >= t.id;
    case 'odd':
      return s.oddCount >= 1;
    case 'oddBag':
      return s.oddBagCount >= 1;
  }
}

/** Ajoute les mails dont la condition vient d'être remplie. Renvoie les nouveaux. */
export function deliverMails(s: GameState, now: number): string[] {
  const fresh: string[] = [];
  for (const m of MAILS) {
    if (s.mails.some((x) => x.id === m.id)) continue;
    if (triggerMet(s, m.trigger)) {
      s.mails.push({ id: m.id, read: false, at: now });
      fresh.push(m.id);
    }
  }
  return fresh;
}
