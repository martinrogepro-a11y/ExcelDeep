// Tout le contenu du jeu est décrit ici, sans logique.
// Ajouter un étage = ajouter des tâches, des postes, des fournitures et des mails.

export type StageId = 'tri' | 'affranchir' | 'tournees';
export type IconId = 'logo' | 'sort' | 'scale' | 'bag' | 'mail' | 'gear' | 'lock' | 'cup';

export interface TaskDef {
  id: StageId;
  name: string;
  app: string;
  icon: IconId;
  /** Valeur d'une unité quand la chaîne s'arrête à cette étape. */
  unitValue: number;
  baseCost: number;
  /** Unités par seconde et par niveau une fois la tâche assistée. */
  autoBase: number;
  staffCost: number;
  staffName: string;
}

/** Ordre de la chaîne de l'étage : chaque étape consomme la sortie de la précédente. */
export const CHAIN: StageId[] = ['tri', 'affranchir', 'tournees'];

export const TASKS: Record<StageId, TaskDef> = {
  tri: {
    id: 'tri',
    name: 'Tri',
    app: 'TriPost 1.0',
    icon: 'sort',
    unitValue: 1,
    baseCost: 5,
    autoBase: 0.08,
    staffCost: 600,
    staffName: 'Leo',
  },
  affranchir: {
    id: 'affranchir',
    name: 'Affranchissement',
    app: 'Affranchissement',
    icon: 'scale',
    unitValue: 4,
    baseCost: 60,
    autoBase: 0.06,
    staffCost: 9000,
    staffName: 'Nina',
  },
  tournees: {
    id: 'tournees',
    name: 'Tournées',
    app: 'Tournées',
    icon: 'bag',
    unitValue: 15,
    baseCost: 900,
    autoBase: 0.05,
    staffCost: 140000,
    staffName: 'Sam',
  },
};

export const COST_GROWTH = 1.15;
export const ASSIST_LEVEL = 10;
export const MILESTONES = [10, 25, 50, 100, 200, 400];
export const STAFF_FACTOR = 4;
export const BASE_OFFLINE_HOURS = 2;
export const BASE_BUFFER = 50;
export const BASE_COMBO_MAX = 3;
export const COMBO_STEP = 5;
export const CAFE_MINUTES = 10;
export const BAG_SIZE = 5;

export interface Requirement {
  earned: number;
  assisted: StageId[];
  staffed: StageId[];
}

export type Decor = 'p1' | 'p2' | 'p3';

export interface PosteDef {
  id: number;
  floor: number;
  service: string;
  grade: string;
  unlocks: StageId[];
  decor: Decor;
  screen: string;
  /** null : dernier poste disponible dans cette version. */
  requirement: Requirement | null;
  avenant: string;
}

export const POSTES: PosteDef[] = [
  {
    id: 0,
    floor: 1,
    service: 'Courrier',
    grade: 'Stagiaire',
    unlocks: ['tri'],
    decor: 'p1',
    screen: 'Cathodique 14"',
    requirement: { earned: 1500, assisted: ['tri'], staffed: [] },
    avenant:
      "Avenant n° 1. L'employé affranchit tout pli qui lui est confié, quel que soit son poids ou son contenu.",
  },
  {
    id: 1,
    floor: 1,
    service: 'Courrier',
    grade: 'Employé',
    unlocks: ['affranchir'],
    decor: 'p2',
    screen: 'Cathodique 15" + balance',
    requirement: { earned: 60000, assisted: ['affranchir'], staffed: ['tri'] },
    avenant:
      "Avenant n° 2. Le chef d'équipe répartit les tournées. Les plis destinés au bureau 0-07 ne figurent sur aucun registre.",
  },
  {
    id: 2,
    floor: 1,
    service: 'Courrier',
    grade: "Chef d'équipe",
    unlocks: ['tournees'],
    decor: 'p3',
    screen: 'Double écran',
    requirement: { earned: 1500000, assisted: ['tournees'], staffed: ['affranchir'] },
    avenant:
      "Avenant n° 3. L'employé est muté à l'étage 2. Il ne redescend au niveau -1 que sur convocation écrite.",
  },
];

export type SupplyEffect =
  | { kind: 'taskMult'; task: StageId; factor: number }
  | { kind: 'global'; factor: number }
  | { kind: 'combo'; add: number }
  | { kind: 'offline'; hours: number }
  | { kind: 'buffer'; add: number }
  | { kind: 'cafe'; minutes: number };

export interface SupplyDef {
  id: string;
  name: string;
  desc: string;
  cost: number;
  minPoste: number;
  effect: SupplyEffect;
}

export const SUPPLIES: SupplyDef[] = [
  { id: 'coupe-papier', name: 'Coupe-papier en laiton', desc: 'Tri ×2. Il coupe aussi les doutes.', cost: 120, minPoste: 0, effect: { kind: 'taskMult', task: 'tri', factor: 2 } },
  { id: 'chaise', name: 'Chaise qui ne grince plus', desc: 'Combo max +2.', cost: 350, minPoste: 0, effect: { kind: 'combo', add: 2 } },
  { id: 'casier-nuit', name: 'Casier de nuit', desc: 'Production hors ligne : +2 h de plafond.', cost: 800, minPoste: 0, effect: { kind: 'offline', hours: 2 } },
  { id: 'etiquettes', name: 'Casiers étiquetés', desc: 'Tri ×2. Quelqu’un a déjà étiqueté le casier « -1 ».', cost: 1400, minPoste: 0, effect: { kind: 'taskMult', task: 'tri', factor: 2 } },
  { id: 'tampon', name: 'Tampon encreur neuf', desc: 'Affranchissement ×2.', cost: 2500, minPoste: 1, effect: { kind: 'taskMult', task: 'affranchir', factor: 2 } },
  { id: 'etagere', name: 'Étagère de transit', desc: 'Stock entre deux étapes : +150.', cost: 5000, minPoste: 1, effect: { kind: 'buffer', add: 150 } },
  { id: 'machine-cafe', name: 'Machine à café du service', desc: 'Les cafés durent 15 min au lieu de 10.', cost: 8000, minPoste: 1, effect: { kind: 'cafe', minutes: 5 } },
  { id: 'balance', name: 'Balance de précision', desc: 'Affranchissement ×2. Elle affiche parfois un poids négatif.', cost: 18000, minPoste: 1, effect: { kind: 'taskMult', task: 'affranchir', factor: 2 } },
  { id: 'plante', name: 'Plante verte', desc: 'Toute la production ×1,25. Personne ne sait qui l’arrose.', cost: 30000, minPoste: 1, effect: { kind: 'global', factor: 1.25 } },
  { id: 'planning', name: 'Planning mural', desc: 'Tournées ×2.', cost: 70000, minPoste: 2, effect: { kind: 'taskMult', task: 'tournees', factor: 2 } },
  { id: 'casier-nuit-2', name: 'Grand casier de nuit', desc: 'Production hors ligne : +4 h de plafond.', cost: 120000, minPoste: 2, effect: { kind: 'offline', hours: 4 } },
  { id: 'chariot', name: 'Chariot à roulettes', desc: 'Tournées ×2. Une roue tourne toute seule.', cost: 300000, minPoste: 2, effect: { kind: 'taskMult', task: 'tournees', factor: 2 } },
];

export type MailTrigger =
  | { kind: 'start' }
  | { kind: 'sorted'; count: number }
  | { kind: 'assisted'; task: StageId }
  | { kind: 'staff'; task: StageId }
  | { kind: 'poste'; id: number }
  | { kind: 'odd' }
  | { kind: 'oddBag' };

export interface MailDef {
  id: string;
  from: string;
  subject: string;
  body: string;
  trigger: MailTrigger;
}

export const MAILS: MailDef[] = [
  {
    id: 'bienvenue',
    from: 'Hale, chef de service',
    subject: 'Bienvenue au poste 117',
    body:
      "Bienvenue chez DeepCorp.\n\nVotre travail : trier le courrier entrant vers les bons services. Glissez chaque pli dans son casier, ou touchez le casier.\n\nLa pile ne doit jamais déborder.\n\nHale",
    trigger: { kind: 'start' },
  },
  {
    id: 'precision',
    from: 'Hale, chef de service',
    subject: 'Petite précision',
    body:
      "Si un pli n'a pas d'expéditeur, placez-le dans le casier Retour.\n\nNe l'ouvrez pas. Ne le mentionnez pas.\n\nHale",
    trigger: { kind: 'sorted', count: 12 },
  },
  {
    id: 'macro',
    from: 'Service informatique',
    subject: 'Macro de tri installée',
    body:
      "Une macro de tri a été installée sur votre poste. Elle travaille quand vous êtes là.\n\nPour que le tri continue quand vous n'êtes pas là, il faudra embaucher quelqu'un (menu Gestion).",
    trigger: { kind: 'assisted', task: 'tri' },
  },
  {
    id: 'leo',
    from: 'Ressources humaines',
    subject: 'Arrivée de Leo',
    body: "Leo rejoint le service Courrier. Il tiendra le tri, même la nuit.\n\nSurtout la nuit.",
    trigger: { kind: 'staff', task: 'tri' },
  },
  {
    id: 'etrange',
    from: '(aucun expéditeur)',
    subject: '(sans objet)',
    body: 'Bien reçu.',
    trigger: { kind: 'odd' },
  },
  {
    id: 'employe',
    from: 'Hale, chef de service',
    subject: 'Vous passez employé',
    body:
      "Félicitations. Vous affranchissez désormais les plis triés.\n\nPesez bien. Certains colis pèsent plus lourd qu'ils ne devraient.\n\nHale",
    trigger: { kind: 'poste', id: 1 },
  },
  {
    id: 'nina',
    from: 'Ressources humaines',
    subject: 'Arrivée de Nina',
    body: "Nina rejoint le service Courrier et prend l'affranchissement. Elle a demandé à ne pas avoir de fenêtre.",
    trigger: { kind: 'staff', task: 'affranchir' },
  },
  {
    id: 'chef',
    from: 'Hale, chef de service',
    subject: "Chef d'équipe",
    body:
      "Vous répartissez maintenant les tournées entre les coursiers.\n\nLes sacs noirs vont au bureau 0-07. Seul le nouveau les prend. Ne lui demandez pas où se trouve ce bureau.\n\nHale",
    trigger: { kind: 'poste', id: 2 },
  },
  {
    id: 'sac-noir',
    from: 'Bureau 0-07',
    subject: 'Accusé de réception',
    body: 'Le sac a été reçu. Merci de ne pas compter les sacs.',
    trigger: { kind: 'oddBag' },
  },
];

/** Destinations du tri. Le dernier casier reçoit les plis sans expéditeur. */
export const SORT_BINS = ['Accueil · 2', 'Archives · 3', 'Compta · 4', 'Achats · 5', 'RH · 6', 'Retour'];
export const SORT_SERVICES = [
  { to: 'Accueil', floor: 'Étage 2' },
  { to: 'Archives', floor: 'Étage 3' },
  { to: 'Comptabilité', floor: 'Étage 4' },
  { to: 'Achats', floor: 'Étage 5' },
  { to: 'Ressources humaines', floor: 'Étage 6' },
];
export const SENDERS = ['Fournitures Barel', 'Imprimerie Okto', 'Assurances Veld', 'Cabinet Moreau & Fils', 'Transports Lindqvist', 'Banque Arcan'];

export const TARIFFS = [
  { label: 'Lettre', max: 20 },
  { label: 'Lettre épaisse', max: 100 },
  { label: 'Petit colis', max: 250 },
  { label: 'Colis', max: 1000 },
];

export const COURIERS = [
  { id: 'owen', name: 'Owen', color: '#c8742b' },
  { id: 'marta', name: 'Marta', color: '#3f6fc0' },
  { id: 'nouveau', name: 'Le nouveau', color: '#5d5d5d' },
];
