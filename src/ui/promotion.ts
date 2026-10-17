import { sfx } from '../audio/audio';
import { POSTES } from '../data/content';
import type { GameState } from '../engine/state';
import type { Desk } from './desk';
import { playDezoom } from './dezoom';
import { h, icon } from './dom';
import { signaturePad } from './signature';

/** Avenant à signer, puis dézoom. `apply` change l'état, `after` remonte le bureau. */
export function runPromotion(desk: Desk, stage: HTMLElement, s: GameState, apply: () => void, after: () => void): void {
  const from = s.poste;
  const last = from + 1 >= POSTES.length;
  const sign = h('button', { class: 'bv btn primary', disabled: true }, 'Signer l’avenant');
  const pad = signaturePad('Signez ici', () => (sign.disabled = pad.inked() < 30));
  const body = h(
    'div',
    { class: 'avenant' },
    h('div', { class: 'lh' }, icon('logo', 'ico big'), h('b', null, 'DeepCorp'), h('small', null, 'Ressources humaines')),
    h('p', null, POSTES[from].avenant),
    pad.el,
    h('div', { class: 'row end' }, sign),
  );
  const close = desk.dialog('Avenant au contrat', body, []);
  sign.addEventListener('click', () => {
    sfx('sign');
    sfx('stamp');
    close();
    const next = POSTES[from + 1];
    const caption = last ? 'MUTATION · ÉTAGE 2' : `${next.grade.toUpperCase()} · SERVICE ${next.service.toUpperCase()}`;
    desk.element.classList.add('fading');
    playDezoom(stage, { from, to: last ? from : from + 1, last, caption }, apply, () => {
      after();
      sfx('fanfare');
    });
  });
}
