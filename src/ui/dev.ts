import { POSTES } from '../data/content';
import { h, win } from './dom';

export interface DevApi {
  previewPromotion(): void;
  openBuilding(): void;
  replayIntroFilm(): void;
  replayCrt(): void;
  addCredits(n: number): void;
  setSpeed(n: number): void;
  speed(): number;
  gotoPoste(i: number): void;
  automateAll(): void;
  reset(): void;
}

/** Outils de test : cinématiques à la demande, postes, crédits, vitesse du temps. */
export function openDevMenu(stage: HTMLElement, api: DevApi): void {
  stage.querySelector('.devmenu')?.remove();
  const close = () => wrap.remove();
  const btn = (label: string, fn: () => void, keepOpen = false) =>
    h(
      'button',
      {
        class: 'bv btn small',
        onclick: () => {
          fn();
          if (!keepOpen) close();
        },
      },
      label,
    );
  const speedLabel = h('span');
  const refreshSpeed = () => (speedLabel.textContent = `Vitesse actuelle : ×${api.speed()}`);
  refreshSpeed();
  const speedBtn = (n: number) =>
    btn(
      `×${n}`,
      () => {
        api.setSpeed(n);
        refreshSpeed();
      },
      true,
    );
  const body = h(
    'div',
    { class: 'dev-body' },
    h('h3', null, 'Cinématiques'),
    h('div', { class: 'row' }, btn('Dézoom de promotion', api.previewPromotion), btn('Se lever du poste', api.openBuilding), btn('Film d’accueil', api.replayIntroFilm), btn('Allumage de l’écran', api.replayCrt)),
    h('h3', null, 'Aller au poste'),
    h('div', { class: 'row' }, ...POSTES.map((p, i) => btn(`${i + 1}. ${p.grade}`, () => api.gotoPoste(i)))),
    h('h3', null, 'Crédits'),
    h('div', { class: 'row' }, ...[1e3, 1e5, 1e7].map((n) => btn(`+${n.toLocaleString('fr-FR')}`, () => api.addCredits(n), true))),
    h('h3', null, 'Temps'),
    speedLabel,
    h('div', { class: 'row' }, speedBtn(1), speedBtn(10), speedBtn(100)),
    h('h3', null, 'Divers'),
    h('div', { class: 'row' }, btn('Tout automatiser', api.automateAll), btn('Effacer la partie', api.reset)),
  );
  const wrap = h('div', { class: 'modal devmenu' }, win('Outils développeur', body, { cls: 'dlg', onClose: close }));
  stage.append(wrap);
}
