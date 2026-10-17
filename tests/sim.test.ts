import { describe, expect, it } from 'vitest';
import { TASKS } from '../src/data/content';
import {
  autoRate,
  bottleneck,
  buyLevels,
  hire,
  incomeRate,
  levelCost,
  manualAction,
  maxAffordable,
  offlineProgress,
  promote,
  promotionStatus,
  taskMult,
  tick,
} from '../src/engine/sim';
import { newState, type GameState } from '../src/engine/state';

const NOW = 1_000_000;

function fresh(): GameState {
  const s = newState(NOW);
  s.phase = 'desk';
  return s;
}

describe('coûts et niveaux', () => {
  it('le coût de n niveaux est la somme géométrique des coûts unitaires', () => {
    const s = fresh();
    let sum = 0;
    for (let i = 0; i < 10; i++) sum += TASKS.tri.baseCost * 1.15 ** i;
    expect(levelCost(s, 'tri', 10)).toBeCloseTo(sum, 6);
  });

  it('maxAffordable ne dépasse jamais les crédits disponibles', () => {
    const s = fresh();
    s.credits = 12345;
    const n = maxAffordable(s, 'tri');
    expect(levelCost(s, 'tri', n)).toBeLessThanOrEqual(s.credits);
    expect(levelCost(s, 'tri', n + 1)).toBeGreaterThan(s.credits);
  });

  it('chaque palier double le multiplicateur de la tâche', () => {
    const s = fresh();
    s.tasks.tri.level = 9;
    expect(taskMult(s, 'tri')).toBe(1);
    s.tasks.tri.level = 10;
    expect(taskMult(s, 'tri')).toBe(2);
    s.tasks.tri.level = 25;
    expect(taskMult(s, 'tri')).toBe(4);
  });

  it('acheter refuse si les crédits manquent', () => {
    const s = fresh();
    expect(buyLevels(s, 'tri', 1)).toBe(false);
    s.credits = 5;
    expect(buyLevels(s, 'tri', 1)).toBe(true);
    expect(s.tasks.tri.level).toBe(1);
  });
});

describe('automatisation', () => {
  it('la macro ne tourne qu’à partir du niveau 10, et pas hors ligne', () => {
    const s = fresh();
    s.tasks.tri.level = 9;
    expect(autoRate(s, 'tri', true)).toBe(0);
    s.tasks.tri.level = 10;
    expect(autoRate(s, 'tri', true)).toBeGreaterThan(0);
    expect(autoRate(s, 'tri', false)).toBe(0);
  });

  it('un subordonné produit ×4 et travaille hors ligne', () => {
    const s = fresh();
    s.tasks.tri.level = 10;
    const assisted = autoRate(s, 'tri', true);
    s.credits = TASKS.tri.staffCost;
    expect(hire(s, 'tri')).toBe(true);
    expect(autoRate(s, 'tri', true)).toBeCloseTo(assisted * 4);
    expect(autoRate(s, 'tri', false)).toBeCloseTo(assisted * 4);
  });

  it('la production hors ligne est plafonnée', () => {
    const s = fresh();
    s.tasks.tri.level = 10;
    s.tasks.tri.staff = true;
    s.lastSeen = NOW;
    const { seconds, gained } = offlineProgress(s, NOW + 10 * 3600 * 1000);
    expect(seconds).toBe(2 * 3600);
    expect(gained).toBeCloseTo(autoRate(s, 'tri', false) * 2 * 3600, 3);
  });
});

describe('chaîne', () => {
  it('le geste manuel de tri rapporte quand le tri est la dernière étape', () => {
    const s = fresh();
    manualAction(s, 'tri', NOW);
    expect(s.credits).toBe(1);
  });

  it('une étape en aval ne peut pas traiter plus que son stock', () => {
    const s = fresh();
    s.poste = 1;
    expect(manualAction(s, 'affranchir', NOW)).toBe(0);
    s.buffers.tri = 3;
    s.tasks.affranchir.level = 40;
    const done = manualAction(s, 'affranchir', NOW);
    expect(done).toBe(3);
    expect(s.buffers.tri).toBe(0);
  });

  it('débloquer une étape ne fait pas chuter les revenus : le surplus est écoulé', () => {
    const s = fresh();
    s.tasks.tri.level = 30;
    s.tasks.tri.staff = true;
    const before = incomeRate(s, NOW);
    s.poste = 1; // l'affranchissement arrive, encore manuel
    expect(incomeRate(s, NOW)).toBeCloseTo(before);
    let gained = 0;
    for (let i = 0; i < 200; i++) gained += tick(s, 1, NOW, true);
    expect(gained / 200).toBeGreaterThan(before * 0.7);
  });

  it('le goulot est l’étape la plus lente', () => {
    const s = fresh();
    s.poste = 1;
    s.tasks.tri.level = 30;
    s.tasks.affranchir.level = 10;
    expect(bottleneck(s)).toBe('affranchir');
  });
});

describe('promotion', () => {
  it('exige toutes les conditions du poste', () => {
    const s = fresh();
    expect(promotionStatus(s)?.ready).toBe(false);
    s.earnedTotal = 1500;
    s.tasks.tri.level = 10;
    expect(promotionStatus(s)?.ready).toBe(true);
    expect(promote(s)).toBe(true);
    expect(s.poste).toBe(1);
  });

  it('le dernier poste marque la fin de la démo sans dépasser la liste', () => {
    const s = fresh();
    s.poste = 2;
    s.earnedTotal = 1e9;
    s.tasks.tournees.level = 10;
    s.tasks.affranchir.staff = true;
    expect(promote(s)).toBe(true);
    expect(s.poste).toBe(2);
    expect(s.demoDone).toBe(true);
  });
});

describe('radio', () => {
  it('le lecteur CD est livré avec son disque gratuit', async () => {
    const { buyDevice, buyTrack } = await import('../src/engine/sim');
    const s = fresh();
    s.credits = 400;
    expect(buyDevice(s, 'cd')).toBe(true);
    expect(s.radio.owned).toEqual(['attente']);
    expect(s.radio.current).toBe('attente');
    expect(buyTrack(s, 'dejeuner')).toBe(false);
    s.credits = 900;
    expect(buyTrack(s, 'dejeuner')).toBe(true);
  });

  it('les appareils des époques suivantes restent verrouillés', async () => {
    const { buyDevice } = await import('../src/engine/sim');
    const s = fresh();
    s.credits = 1e12;
    expect(buyDevice(s, 'media')).toBe(false);
  });
});
