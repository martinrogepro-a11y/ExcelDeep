import './style.css';
import { unlockAudio } from './audio/audio';
import { fmt, fmtDuration } from './engine/format';
import { deliverMails, offlineProgress, promote, tick } from './engine/sim';
import { clearSave, loadState, newState, saveState, type GameState } from './engine/state';
import { Desk } from './ui/desk';
import { h } from './ui/dom';
import { runIntro } from './ui/intro';
import { runPromotion } from './ui/promotion';
import { applyAudio } from './ui/radio';
import type { Ctx } from './ui/tasks';

const AUTOSAVE_MS = 10_000;
const OFFLINE_REPORT_S = 60;

const stage = document.getElementById('app')!;
let s: GameState = loadState(Date.now());
let desk: Desk | null = null;
let lastFrame = performance.now();
let lastSave = Date.now();

const ctx: Ctx = {
  get s() {
    return s;
  },
  now: () => Date.now(),
  acted: () => {
    const fresh = deliverMails(s, Date.now());
    if (fresh.length) desk?.notifyMail(fresh);
    desk?.update(Date.now());
  },
};

function save(): void {
  saveState(s, Date.now());
  lastSave = Date.now();
}

function mountDesk(): void {
  desk = new Desk(stage, ctx, {
    onPromote: () => {
      if (!desk) return;
      runPromotion(
        desk,
        stage,
        s,
        () => {
          promote(s);
          deliverMails(s, Date.now());
          save();
        },
        () => {
          mountDesk();
          if (s.demoDone) showDemoEnd();
        },
      );
    },
    onSave: save,
    onReset: () => {
      clearSave();
      s = newState(Date.now());
      start();
    },
  });
  desk.mount();
  applyAudio(s);
  deliverMails(s, Date.now());
  desk.update(Date.now());
}

function showDemoEnd(): void {
  desk?.dialog(
    'Note de service',
    h(
      'div',
      null,
      h('p', null, `${s.playerName || 'Stagiaire'}, votre mutation à l’étage 2 est validée.`),
      h('p', null, 'Fin du prototype : l’étage 2 (Accueil et standard) arrive dans la prochaine version. Le service Courrier continue de produire en attendant.'),
    ),
    [{ label: 'Retour au poste', primary: true, onClick: (close) => close() }],
  );
}

function reportOffline(seconds: number, gained: number): void {
  if (!desk || seconds < OFFLINE_REPORT_S || gained <= 0) return;
  desk.dialog(
    'Pendant votre absence',
    h('div', null, h('p', null, `Vos équipes ont travaillé ${fmtDuration(seconds)}.`), h('p', { class: 'big-num' }, `+${fmt(gained)} crédits`)),
    [
      {
        label: 'Heures sup (pub) : ×2',
        onClick: (close) => {
          s.credits += gained;
          s.earnedTotal += gained;
          close();
        },
      },
      { label: 'Encaisser', primary: true, onClick: (close) => close() },
    ],
  );
}

function start(): void {
  desk = null;
  if (s.phase === 'intro') {
    runIntro(stage, s, () => {
      s.phase = 'desk';
      s.lastSeen = Date.now();
      save();
      mountDesk();
    });
    return;
  }
  const off = offlineProgress(s, Date.now());
  mountDesk();
  reportOffline(off.seconds, off.gained);
  save();
}

function frame(t: number): void {
  const dt = Math.min(0.25, (t - lastFrame) / 1000);
  lastFrame = t;
  if (desk && s.phase === 'desk') {
    const now = Date.now();
    tick(s, dt, now, true);
    desk.update(now);
    if (now - lastSave > AUTOSAVE_MS) save();
  }
  requestAnimationFrame(frame);
}

// En arrière-plan le navigateur suspend la boucle : on rattrape au retour, comme hors ligne.
document.addEventListener('visibilitychange', () => {
  if (s.phase !== 'desk') return;
  if (document.hidden) {
    save();
  } else {
    const off = offlineProgress(s, Date.now());
    s.lastSeen = Date.now();
    lastFrame = performance.now();
    reportOffline(off.seconds, off.gained);
  }
});
window.addEventListener('pagehide', () => s.phase === 'desk' && save());

// les navigateurs n'autorisent le son qu'après un premier geste
document.addEventListener(
  'pointerdown',
  () => {
    unlockAudio();
    applyAudio(s);
  },
  { capture: true },
);

start();
requestAnimationFrame(frame);
