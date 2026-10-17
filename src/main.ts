import './style.css';
import { unlockAudio } from './audio/audio';
import { fmt, fmtDuration } from './engine/format';
import { ASSIST_LEVEL, CHAIN, POSTES } from './data/content';
import { deliverMails, offlineProgress, promote, tick } from './engine/sim';
import { clearSave, loadState, newState, saveState, type GameState } from './engine/state';
import { openBuilding } from './ui/building';
import { playCrtBoot } from './ui/crt';
import { Desk } from './ui/desk';
import { openDevMenu } from './ui/dev';
import { playDezoom } from './ui/dezoom';
import { h } from './ui/dom';
import { runIntro } from './ui/intro';
import { playOrientation } from './ui/orientation';
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
/** Poste où l'on est assis : le sien, ou un ancien poste revisité. */
let visit = s.poste;
/** Accélération du temps, réservée au menu développeur. */
let speed = 1;

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

function leaveDesk(): void {
  if (!desk) return;
  desk.element.classList.add('fading');
  openBuilding(stage, s, visit, (i) => {
    visit = i;
    mountDesk();
  });
}

function devMenu(): void {
  openDevMenu(stage, {
    previewPromotion: () => {
      if (!desk) return;
      const from = Math.min(visit, POSTES.length - 1);
      const last = from + 1 >= POSTES.length;
      desk.element.classList.add('fading');
      playDezoom(stage, { from, to: last ? from : from + 1, last, caption: 'APERÇU · AUCUN CHANGEMENT' }, () => {}, () => mountDesk());
    },
    openBuilding: leaveDesk,
    replayIntroFilm: () => playOrientation(stage, s.playerName, () => {}),
    replayCrt: () => playCrtBoot(stage, POSTES[visit].decor, 'full', () => {}),
    addCredits: (n) => {
      s.credits += n;
      s.earnedTotal += n;
    },
    setSpeed: (n) => (speed = n),
    speed: () => speed,
    gotoPoste: (i) => {
      s.poste = i;
      s.demoDone = false;
      // les postes précédents sont déjà tenus, comme dans une vraie partie
      for (const id of CHAIN) {
        const at = POSTES.findIndex((p) => p.unlocks.includes(id));
        if (at < i) s.tasks[id] = { level: Math.max(s.tasks[id].level, 25), staff: true };
        else if (at === i) s.tasks[id] = { level: Math.max(s.tasks[id].level, 0), staff: false };
      }
      s.earnedTotal = Math.max(s.earnedTotal, i > 0 ? (POSTES[i - 1].requirement?.earned ?? 0) : 0);
      visit = i;
      deliverMails(s, Date.now());
      save();
      mountDesk();
    },
    automateAll: () => {
      for (const id of CHAIN) if (POSTES.some((p) => p.id <= s.poste && p.unlocks.includes(id))) s.tasks[id] = { level: Math.max(s.tasks[id].level, ASSIST_LEVEL), staff: true };
      save();
      mountDesk();
    },
    reset: () => {
      clearSave();
      s = newState(Date.now());
      visit = 0;
      start();
    },
  });
}

function mountDesk(): void {
  desk = new Desk(stage, ctx, {
    onLeave: leaveDesk,
    onDev: devMenu,
    onPromote: () => {
      if (!desk) return;
      runPromotion(
        desk,
        stage,
        s,
        () => {
          promote(s);
          visit = s.poste;
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
      visit = 0;
      start();
    },
  }, visit);
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
  // à chaque lancement, l'écran du poste s'allume
  playCrtBoot(stage, POSTES[visit].decor, 'short', () => {});
  reportOffline(off.seconds, off.gained);
  save();
}

function frame(t: number): void {
  const dt = Math.min(0.25, (t - lastFrame) / 1000);
  lastFrame = t;
  if (desk && s.phase === 'desk') {
    const now = Date.now();
    tick(s, dt * speed, now, true);
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
if (location.hash === '#dev') setTimeout(devMenu, 500);
