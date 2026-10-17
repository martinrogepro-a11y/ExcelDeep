import type { GameState } from '../engine/state';
import { h, icon } from './dom';
import { playOrientation } from './orientation';
import { signaturePad } from './signature';

/** Lettre reçue chez soi → contrat signé au doigt → démarrage du PC du poste 117. */
export function runIntro(root: HTMLElement, s: GameState, done: () => void): void {
  root.replaceChildren();
  showLetter(root, () => showContract(root, s, () => playOrientation(root, s.playerName, () => showBoot(root, done))));
}

function showLetter(root: HTMLElement, next: () => void): void {
  const env = h(
    'div',
    { class: 'envelope', role: 'button', tabindex: '0', 'aria-label': 'Ouvrir la lettre' },
    h('div', { class: 'flap' }),
    h(
      'div',
      { class: 'env-face' },
      h('div', { class: 'env-logo' }, icon('logo', 'ico big'), h('b', null, 'DeepCorp')),
      h('span', { class: 'env-to' }, 'Remise en main propre'),
      h('span', { class: 'env-stamp' }, 'PRIORITAIRE'),
    ),
  );
  const hint = h('p', { class: 'hint' }, 'Glissez la lettre vers le haut pour l’ouvrir');
  root.append(h('div', { class: 'scene-home' }, h('div', { class: 'home-light' }), env, hint));

  let opened = false;
  const open = () => {
    if (opened) return;
    opened = true;
    env.style.transform = '';
    env.classList.add('open');
    hint.textContent = '';
    setTimeout(next, 900);
  };

  let startY: number | null = null;
  env.addEventListener('pointerdown', (e) => {
    startY = e.clientY;
    env.setPointerCapture(e.pointerId);
  });
  env.addEventListener('pointermove', (e) => {
    if (startY === null || opened) return;
    const dy = Math.min(0, e.clientY - startY);
    env.style.transform = `translateY(${dy * 0.4}px)`;
    if (dy < -70) open();
  });
  env.addEventListener('pointerup', () => {
    if (!opened) env.style.transform = '';
    startY = null;
  });
  env.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') open();
  });
}

function showContract(root: HTMLElement, s: GameState, next: () => void): void {
  const name = h('input', { id: 'player-name', class: 'field', maxlength: '24', autocomplete: 'off', placeholder: 'votre nom', 'aria-label': 'Votre nom' });
  const signBtn = h('button', { class: 'bv btn primary', disabled: true }, 'Signer');
  const clearBtn = h('button', { class: 'bv btn' }, 'Effacer');
  const stamp = h('div', { class: 'signed-stamp' }, 'SIGNÉ');
  const refresh = () => {
    signBtn.disabled = !(name.value.trim().length > 0 && pad.inked() > 60);
  };
  const pad = signaturePad('Signez avec le doigt', refresh);

  const paper = h(
    'div',
    { class: 'paper' },
    h('div', { class: 'lh' }, icon('logo', 'ico big'), h('b', null, 'DeepCorp'), h('small', null, 'Réf. RH-117')),
    h('h2', null, 'CONTRAT DE STAGE'),
    h('p', null, 'Entre DeepCorp, ci-après « l’Entreprise », et ', name, ', ci-après « le Stagiaire ».'),
    h('p', null, h('b', null, 'Art. 1. '), 'Le Stagiaire est affecté au service Courrier, poste 117.'),
    h('p', null, h('b', null, 'Art. 2. '), 'Les horaires sont fixés selon les besoins du service.'),
    h('p', null, h('b', null, 'Art. 3. '), 'Le café est fourni.'),
    h(
      'p',
      { class: 'fine' },
      'Art. 4 à 6 : dispositions usuelles. ',
      h('em', null, 'Art. 7 : le Stagiaire ne pose aucune question sur le niveau -1, ni sur le contenu des plis sans expéditeur.'),
      ' Art. 8 : le présent contrat est renouvelable tacitement.',
    ),
    h('div', { class: 'sig' }, h('span', null, 'Signature du Stagiaire :'), pad.el),
    stamp,
  );
  root.replaceChildren(h('div', { class: 'scene-contract' }, paper, h('div', { class: 'contract-btns' }, clearBtn, signBtn)));

  name.addEventListener('input', refresh);
  clearBtn.addEventListener('click', () => pad.clear());
  signBtn.addEventListener('click', () => {
    s.playerName = name.value.trim();
    name.disabled = true;
    signBtn.disabled = true;
    clearBtn.disabled = true;
    stamp.classList.add('on');
    setTimeout(next, 1100);
  });
}

function showBoot(root: HTMLElement, done: () => void): void {
  const bar = h('div', { class: 'boot-bar' }, h('i'));
  root.replaceChildren(
    h(
      'div',
      { class: 'scene-boot' },
      h('div', { class: 'boot-logo' }, icon('logo', 'ico huge'), h('b', null, 'DeepOS'), h('span', null, '95')),
      bar,
      h('p', { class: 'boot-text' }, 'Poste 117 · Service Courrier'),
    ),
  );
  setTimeout(() => bar.classList.add('go'), 50);
  setTimeout(done, 2600);
}
