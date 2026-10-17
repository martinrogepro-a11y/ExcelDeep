// Tout le contenu du jeu est décrit ici, sans logique.
// Ajouter un étage = ajouter des tâches, des postes, des fournitures et des mails.

export type StageId = 'tri' | 'affranchir' | 'tournees';
export type IconId = 'logo' | 'sort' | 'scale' | 'bag' | 'mail' | 'gear' | 'lock' | 'cup' | 'speaker' | 'cd';

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
    app: 'AffranchiPro 2.0',
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
    app: 'Console de supervision',
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
  { id: 'coupe-papier', name: 'Coupe-papier en laiton', desc: 'Tri ×2.', cost: 120, minPoste: 0, effect: { kind: 'taskMult', task: 'tri', factor: 2 } },
  { id: 'chaise', name: 'Chaise ergonomique', desc: 'Combo max +2.', cost: 350, minPoste: 0, effect: { kind: 'combo', add: 2 } },
  { id: 'casier-nuit', name: 'Casier de nuit', desc: 'Production hors ligne : +2 h de plafond.', cost: 800, minPoste: 0, effect: { kind: 'offline', hours: 2 } },
  { id: 'etiquettes', name: 'Casiers étiquetés', desc: 'Tri ×2.', cost: 1400, minPoste: 0, effect: { kind: 'taskMult', task: 'tri', factor: 2 } },
  { id: 'tampon', name: 'Tampon encreur neuf', desc: 'Affranchissement ×2.', cost: 2500, minPoste: 1, effect: { kind: 'taskMult', task: 'affranchir', factor: 2 } },
  { id: 'etagere', name: 'Étagère de transit', desc: 'Stock entre deux étapes : +150.', cost: 5000, minPoste: 1, effect: { kind: 'buffer', add: 150 } },
  { id: 'machine-cafe', name: 'Machine à café du service', desc: 'Les cafés durent 15 min au lieu de 10.', cost: 8000, minPoste: 1, effect: { kind: 'cafe', minutes: 5 } },
  { id: 'balance', name: 'Balance de précision', desc: 'Affranchissement ×2.', cost: 18000, minPoste: 1, effect: { kind: 'taskMult', task: 'affranchir', factor: 2 } },
  { id: 'plante', name: 'Plante verte', desc: 'Toute la production ×1,25.', cost: 30000, minPoste: 1, effect: { kind: 'global', factor: 1.25 } },
  { id: 'planning', name: 'Planning mural', desc: 'Tournées ×2.', cost: 70000, minPoste: 2, effect: { kind: 'taskMult', task: 'tournees', factor: 2 } },
  { id: 'casier-nuit-2', name: 'Grand casier de nuit', desc: 'Production hors ligne : +4 h de plafond.', cost: 120000, minPoste: 2, effect: { kind: 'offline', hours: 4 } },
  { id: 'chariot', name: 'Chariot à roulettes', desc: 'Tournées ×2.', cost: 300000, minPoste: 2, effect: { kind: 'taskMult', task: 'tournees', factor: 2 } },
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
      "Bienvenue chez DeepCorp.\n\nVotre travail : orienter le courrier entrant. Chaque pli est scanné ; lisez le service destinataire et saisissez son code (02 à 06) dans TriPost.\n\nLa pile ne doit jamais déborder.\n\nHale",
    trigger: { kind: 'start' },
  },
  {
    id: 'precision',
    from: 'Hale, chef de service',
    subject: 'Petite précision',
    body:
      "Si un pli n'a pas d'expéditeur, saisissez le code 99.\n\nNe l'ouvrez pas. Ne le mentionnez pas.\n\nHale",
    trigger: { kind: 'sorted', count: 12 },
  },
  {
    id: 'macro',
    from: 'Service informatique',
    subject: 'Macro de tri installée',
    body:
      "Le module de défragmentation du courrier est actif sur votre poste. Il travaille quand vous êtes là.\n\nPour que le tri continue quand vous n'êtes pas là, il faudra embaucher quelqu'un (menu Gestion).",
    trigger: { kind: 'assisted', task: 'tri' },
  },
  {
    id: 'leo',
    from: 'Ressources humaines',
    subject: 'Arrivée de Leo',
    body: "Leo rejoint le service Courrier à compter d'aujourd'hui. Il est affecté au tri, horaires de nuit compris.",
    trigger: { kind: 'staff', task: 'tri' },
  },
  {
    id: 'etrange',
    from: '(aucun expéditeur)',
    subject: '(sans objet)',
    body: 'Reçu.',
    trigger: { kind: 'odd' },
  },
  {
    id: 'employe',
    from: 'Hale, chef de service',
    subject: 'Vous passez employé',
    body:
      "Félicitations. Vous affranchissez désormais les plis triés avec AffranchiPro.\n\nChaque pli est pesé avant impression de l'étiquette, sans exception.\n\nHale",
    trigger: { kind: 'poste', id: 1 },
  },
  {
    id: 'nina',
    from: 'Ressources humaines',
    subject: 'Arrivée de Nina',
    body: "Nina rejoint le service Courrier et reprend l'affranchissement. Merci de lui transmettre vos consignes.",
    trigger: { kind: 'staff', task: 'affranchir' },
  },
  {
    id: 'chef',
    from: 'Hale, chef de service',
    subject: "Chef d'équipe",
    body:
      "Vous supervisez maintenant les tournées depuis la console.\n\nLes sacs noirs vont au bureau 0-07. Ils sont remis au nouveau et ne sont pas enregistrés.\n\nHale",
    trigger: { kind: 'poste', id: 2 },
  },
  {
    id: 'sac-noir',
    from: 'Bureau 0-07',
    subject: 'Accusé de réception',
    body: 'Sac réceptionné.',
    trigger: { kind: 'oddBag' },
  },
];

export interface SortService {
  to: string;
  floor: string;
  /** Code à taper dans TriPost. */
  code: string;
  /** Façons dont le service est écrit sur les enveloppes. */
  spellings: string[];
  color: string;
}

export const SORT_SERVICES: SortService[] = [
  { to: 'Accueil', floor: 'Étage 2', code: '02', spellings: ['Service Accueil', 'Accueil / Standard', 'Serv. Accueil'], color: '#3c78d8' },
  { to: 'Archives', floor: 'Étage 3', code: '03', spellings: ['Service Archives', 'Saisie et archives', 'Archiv.'], color: '#9a7440' },
  { to: 'Comptabilité', floor: 'Étage 4', code: '04', spellings: ['Service Comptabilité', 'Compta.', 'Dpt Comptable'], color: '#3aa35a' },
  { to: 'Achats', floor: 'Étage 5', code: '05', spellings: ['Service Achats', 'Achats & logistique', 'Serv. Achats'], color: '#d08a2a' },
  { to: 'Ressources humaines', floor: 'Étage 6', code: '06', spellings: ['Ressources humaines', 'R.H.', 'Dir. du personnel'], color: '#b04a8a' },
];
/** Les plis sans expéditeur partent au code 99. */
export const SORT_RETURN = { code: '99', color: '#5a5f63' };

export const SENDERS = ['Fournitures Barel', 'Imprimerie Okto', 'Assurances Veld', 'Cabinet Moreau & Fils', 'Transports Lindqvist', 'Banque Arcan'];

export const TARIFFS = [
  { label: 'Lettre', max: 20 },
  { label: 'Lettre épaisse', max: 100 },
  { label: 'Petit colis', max: 250 },
  { label: 'Colis', max: 1000 },
];


/* ------------------------------------------------------------------ radio */

export type MusicStyle = 'ascenseur' | 'lofi' | 'synth';
export type DeviceId = 'cd' | 'media' | 'stream';

export interface DeviceDef {
  id: DeviceId;
  name: string;
  cost: number;
  minPoste: number;
}

/** Un appareil par époque : le lecteur CD d'abord, les suivants arrivent avec les étages. */
export const DEVICES: DeviceDef[] = [
  { id: 'cd', name: 'Lecteur CD portable', cost: 400, minPoste: 0 },
  { id: 'media', name: 'DeepMedia Player', cost: 250000, minPoste: 6 },
  { id: 'stream', name: 'Streamly', cost: 50_000_000, minPoste: 12 },
];

export interface TrackDef {
  id: string;
  title: string;
  artist: string;
  style: MusicStyle;
  device: DeviceId;
  cost: number;
}

export const TRACKS: TrackDef[] = [
  { id: 'attente', title: 'Musique d’attente, vol. 1', artist: 'Orchestre du standard', style: 'ascenseur', device: 'cd', cost: 0 },
  { id: 'dejeuner', title: 'Pause déjeuner', artist: 'Les Intérimaires', style: 'lofi', device: 'cd', cost: 900 },
  { id: 'disquette', title: 'Disquette', artist: 'Modem 56k', style: 'synth', device: 'cd', cost: 3500 },
];
