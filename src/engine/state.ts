import { CHAIN, type StageId } from '../data/content';

export interface TaskState {
  level: number;
  staff: boolean;
}

export interface MailState {
  id: string;
  read: boolean;
  at: number;
}

export interface GameState {
  version: 1;
  phase: 'intro' | 'desk';
  playerName: string;
  poste: number;
  credits: number;
  earnedTotal: number;
  tasks: Record<StageId, TaskState>;
  /** Stock en sortie de chaque étape, en attente de l'étape suivante. */
  buffers: Record<StageId, number>;
  supplies: string[];
  cafes: number;
  cafeUntil: number;
  frenzyUntil: number;
  streak: number;
  mails: MailState[];
  sortedCount: number;
  oddCount: number;
  oddBagCount: number;
  lastSeen: number;
  adReadyAt: number;
  demoDone: boolean;
}

const SAVE_KEY = 'deepcorp-save-v1';

function perStage<T>(make: () => T): Record<StageId, T> {
  const out = {} as Record<StageId, T>;
  for (const id of CHAIN) out[id] = make();
  return out;
}

export function newState(now: number): GameState {
  return {
    version: 1,
    phase: 'intro',
    playerName: '',
    poste: 0,
    credits: 0,
    earnedTotal: 0,
    tasks: perStage(() => ({ level: 0, staff: false })),
    buffers: perStage(() => 0),
    supplies: [],
    cafes: 1,
    cafeUntil: 0,
    frenzyUntil: 0,
    streak: 0,
    mails: [],
    sortedCount: 0,
    oddCount: 0,
    oddBagCount: 0,
    lastSeen: now,
    adReadyAt: 0,
    demoDone: false,
  };
}

export function loadState(now: number): GameState {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return newState(now);
    const parsed = JSON.parse(raw) as Partial<GameState>;
    if (parsed.version !== 1) return newState(now);
    // On repart d'un état neuf pour combler les champs ajoutés depuis la sauvegarde.
    const base = newState(now);
    return {
      ...base,
      ...parsed,
      tasks: { ...base.tasks, ...parsed.tasks },
      buffers: { ...base.buffers, ...parsed.buffers },
    } as GameState;
  } catch {
    return newState(now);
  }
}

export function saveState(s: GameState, now: number): void {
  s.lastSeen = now;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {
    // stockage indisponible (navigation privée) : on continue sans sauvegarde
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // rien à faire
  }
}
